import { Q, feet, sha256, stableStringify } from './exact.js';

export const FORMULA_VERSION = 'prototype-0.1.1';
export const LATE_AFTER_SECONDS = 86400;
const ZERO = Q.parse('0');
const failure = (code, detail) => { const error = new Error(detail); error.code = code; throw error; };
const requireValue = (ok, code, detail) => { if (!ok) failure(code, detail); };
const positiveInteger = x => Number.isSafeInteger(x) && x > 0;

export function instant(value) {
  requireValue(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value),
    'INVALID_TIME', 'Time must be explicit UTC, including milliseconds.');
  const result = Date.parse(value);
  requireValue(Number.isFinite(result) && new Date(result).toISOString() === value, 'INVALID_TIME', 'Invalid UTC time.');
  return result;
}

function active(record, time) {
  return instant(record.validFrom) <= time && (record.validTo === null || time < instant(record.validTo));
}

function provenance(record, input) {
  requireValue(typeof record?.revisionId === 'string' && record.revisionId.length > 0,
    'SOURCE_UNRESOLVED', 'A versioned input is missing its revision ID.');
  const source = input.sources.find(s => s.id === record.sourceId);
  requireValue(source && /^[a-f0-9]{64}$/.test(source.sha256), 'SOURCE_UNRESOLVED', 'An input is missing its source artifact hash.');
}

function canonical(quantity, datum, entityId, transformId, time, input, trace) {
  requireValue(typeof datum === 'string' && datum.length > 0, 'DATUM_UNRESOLVED', `Missing datum for ${entityId}.`);
  const value = feet(quantity);
  if (datum === 'NAVD88') return value;
  const matches = input.transforms.filter(t => t.id === transformId);
  requireValue(matches.length === 1, 'DATUM_UNRESOLVED', `No unique datum transformation for ${entityId}.`);
  const t = matches[0];
  provenance(t, input);
  requireValue(t.approved === true && t.from === datum && t.to === 'NAVD88' &&
    t.entityId === entityId && active(t, time), 'DATUM_UNRESOLVED', `Datum transformation does not apply to ${entityId}.`);
  trace.transforms.push({ id: t.id, revisionId: t.revisionId, entityId, offsetFt: feet(t.offset).toJSON() });
  return value.add(feet(t.offset));
}

export function freshness(observedAt, asOf) {
  const ageSeconds = (instant(asOf) - instant(observedAt)) / 1000;
  return { ageSeconds, label: ageSeconds < 0 ? 'FUTURE' : ageSeconds > LATE_AFTER_SECONDS ? 'LATE' : 'ON_TIME' };
}

// Input observations are candidates, not preselected "latest" values. Never fall
// back to an older accepted reading when the newest reading has invalid quality.
function selectObservation(gauge, input) {
  const cutoff = instant(input.asOf);
  const records = input.observations.filter(o => o.gaugeId === gauge.id);
  const known = records.filter(o => instant(o.receivedAt) <= cutoff);
  const usableTimes = known.filter(o => instant(o.observedAt) <= cutoff);
  requireValue(usableTimes.length > 0, known.length ? 'FUTURE_OBSERVATION' : 'MISSING_OBSERVATION',
    known.length ? `Only future observations for ${gauge.id}.` : `No observation available for ${gauge.id}.`);
  for (const o of usableTimes) requireValue(Number.isSafeInteger(o.revision) && o.revision >= 0,
    'INVALID_OBSERVATION', 'Observation revision must be a nonnegative integer.');
  usableTimes.sort((a, b) => instant(b.observedAt) - instant(a.observedAt) || b.revision - a.revision || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const selected = usableTimes[0];
  const peers = usableTimes.filter(o => o.observedAt === selected.observedAt && o.revision === selected.revision);
  const signatures = new Set(peers.map(o => stableStringify({ value: o.value, unit: o.unit, parameter: o.parameter,
    seriesId: o.seriesId, datum: o.datum ?? null, quality: o.quality, conflict: o.conflict })));
  requireValue(signatures.size === 1 && selected.conflict === false, 'SOURCE_CONFLICT', `Conflicting readings for ${gauge.id}.`);
  return selected;
}

function observationWater(gauge, observation, input, trace) {
  provenance(gauge, input);
  provenance(observation, input);
  requireValue(observation.seriesId === gauge.seriesId && observation.parameter === gauge.parameter && observation.unit === gauge.unit,
    'INVALID_OBSERVATION', `Series, parameter or unit mismatch for ${gauge.id}.`);
  requireValue(observation.quality === 'ACCEPTED', 'INVALID_OBSERVATION', `Observation quality is not accepted for ${gauge.id}.`);
  requireValue(instant(observation.receivedAt) >= instant(observation.observedAt), 'INVALID_TIME', 'Observation was received before it was measured.');
  requireValue(positiveInteger(gauge.stopAfterSeconds), 'POLICY_UNRESOLVED', 'Missing observation stop policy.');
  const age = freshness(observation.observedAt, input.asOf);
  requireValue(age.ageSeconds <= gauge.stopAfterSeconds, 'STALE_OBSERVATION', `Observation exceeds the configured calculation age limit for ${gauge.id}.`);
  const observedValue = feet(observation);
  requireValue(observedValue.cmp(gauge.minValueFt) >= 0 && observedValue.cmp(gauge.maxValueFt) <= 0,
    'OUT_OF_RANGE', `Observation outside the station range for ${gauge.id}.`);
  const time = instant(observation.observedAt);
  let water;
  if (gauge.parameter === 'STAGE_ABOVE_GAUGE_ZERO') {
    const epochs = gauge.epochs.filter(e => active(e, time));
    requireValue(epochs.length === 1, 'DATUM_UNRESOLVED', `No unique gauge-zero epoch for ${gauge.id}.`);
    const epoch = epochs[0];
    provenance(epoch, input);
    water = observedValue.add(canonical(epoch.zero, epoch.datum, gauge.id, epoch.transformId, time, input, trace));
    trace.epochs.push({ gaugeId: gauge.id, epochId: epoch.id, revisionId: epoch.revisionId });
  } else if (gauge.parameter === 'WATER_SURFACE_ELEVATION') {
    requireValue(observation.datum === gauge.datum, 'DATUM_UNRESOLVED', 'Elevation observation datum mismatch.');
    water = canonical(observation, gauge.datum, gauge.id, gauge.transformId, time, input, trace);
  } else failure('INVALID_OBSERVATION', 'Unsupported water-level parameter.');
  trace.gauges.push({ gaugeId: gauge.id, observationId: observation.id, ageSeconds: age.ageSeconds, waterNavd88Ft: water.toJSON() });
  return water;
}

function bridgeWater(model, waters, input, trace) {
  const { bridge, gauges } = input;
  provenance(model, input);
  requireValue(model.approved === true && model.bridgeId === bridge.id && model.reachId === bridge.reachId &&
    model.validRegimes.includes(input.regime) && active(model, instant(input.asOf)),
    'MODEL_UNAPPROVED', 'Bridge model is not approved for this reach, time and hydraulic regime.');
  for (let i = 0; i < model.gaugeIds.length; i++) {
    const g = gauges.find(g => g.id === model.gaugeIds[i]);
    requireValue(g.reachId === model.reachId, 'HYDRAULIC_BOUNDARY', 'Gauge crosses an unmodeled hydraulic boundary.');
    const range = model.waterRanges[g.id];
    requireValue(range && waters[i].cmp(range.minFt) >= 0 && waters[i].cmp(range.maxFt) <= 0,
      'OUT_OF_RANGE', 'Water elevation outside the model validation range.');
  }
  if (model.type === 'DIRECT' || model.type === 'FIXED_OFFSET') {
    requireValue(waters.length === 1, 'MODEL_UNAPPROVED', 'Single-gauge model requires exactly one gauge.');
    const offset = model.type === 'DIRECT' ? ZERO : feet(model.offset);
    trace.offsetFt = offset.toJSON();
    return waters[0].add(offset);
  }
  if (model.type === 'BRACKETED_LINEAR') {
    requireValue(waters.length === 2, 'MODEL_UNAPPROVED', 'Bracketed model requires two gauges.');
    const [down, up] = model.gaugeIds.map(id => gauges.find(g => g.id === id));
    const span = Q.parse(up.riverMile).sub(down.riverMile);
    requireValue(span.cmp('0') > 0, 'MODEL_UNAPPROVED', 'Gauge order must be downstream then upstream.');
    const weight = Q.parse(bridge.riverMile).sub(down.riverMile).div(span);
    requireValue(weight.cmp('0') >= 0 && weight.cmp('1') <= 0, 'OUT_OF_RANGE', 'Bridge is outside the bracketing gauges.');
    trace.weight = { numerator: weight.n.toString(), denominator: weight.d.toString() };
    return waters[0].add(waters[1].sub(waters[0]).mul(weight));
  }
  failure('MODEL_UNSUPPORTED', 'This prototype supports direct, fixed-offset and bracketed models only.');
}

function accuracy(input, trace, clearance, displayed) {
  const budget = input.errorBudget;
  requireValue(budget?.reviewed === true && typeof budget.evidence === 'string' && budget.evidence.length > 0,
    'ACCURACY_UNVERIFIED', 'No reviewed total-error evidence.');
  const required = ['bridgeReferenceFt', 'sensorFt', 'gaugeZeroFt', 'datumTransformFt', 'hydraulicModelFt', 'timeMismatchFt'];
  let total = ZERO;
  const components = {};
  for (const name of required) {
    requireValue(typeof budget[name] === 'string', 'ACCURACY_UNVERIFIED', `Missing error component: ${name}.`);
    const value = Q.parse(budget[name]);
    requireValue(value.cmp('0') >= 0, 'ACCURACY_UNVERIFIED', 'Negative error bound.');
    components[name] = value.toJSON();
    total = total.add(value);
  }
  const rate = Q.parse(budget.maxWaterChangeFtPerHour);
  requireValue(rate.cmp('0') >= 0 && budget.rateBoundValidated === true,
    'ACCURACY_UNVERIFIED', 'Missing validated bound on change since observation.');
  const oldestMs = Math.max(...trace.gauges.map(g => Math.round(g.ageSeconds * 1000)));
  const age = rate.mul(new Q(BigInt(oldestMs), 3600000n));
  const rounding = clearance.sub(displayed);
  total = total.add(age).add(rounding);
  trace.errorBudget = { evidence: budget.evidence, components, ageFt: age.toJSON(), roundingFt: rounding.toJSON(), totalFt: total.toJSON() };
  requireValue(total.cmp('0.5') < 0, 'ACCURACY_LIMIT_EXCEEDED', 'Total error allowance reaches or exceeds 0.5 ft.');
}

export function forecastDirection(input) {
  try {
    const f = input.forecast;
    requireValue(f, 'FORECAST_MISSING', 'No forecast provided.');
    provenance(f, input);
    const now = instant(input.asOf), issue = instant(f.issuedAt), received = instant(f.receivedAt);
    requireValue(positiveInteger(f.horizonSeconds) && positiveInteger(f.maxIssueAgeSeconds), 'FORECAST_INVALID', 'Invalid forecast policy.');
    requireValue(issue <= now && received <= now && received >= issue && now - issue <= f.maxIssueAgeSeconds * 1000,
      'FORECAST_STALE', 'Forecast is stale or was not available at the cutoff.');
    requireValue(f.associationApproved === true && f.bridgeId === input.bridge.id && f.reachId === input.bridge.reachId &&
      typeof f.gaugeId === 'string' && f.gaugeId.length > 0 && f.datum && f.epochId && active(f, now),
      'FORECAST_INVALID', 'Forecast association or datum is unresolved.');
    const points = f.points.map(p => ({ t: instant(p.validAt), v: feet({ value: p.value, unit: f.unit }) })).sort((a, b) => a.t - b.t);
    requireValue(points.length >= 2 && points.every((p, i) => !i || p.t > points[i - 1].t), 'FORECAST_INVALID', 'Duplicate or missing forecast times.');
    const end = now + f.horizonSeconds * 1000;
    requireValue(points[0].t <= now && points.at(-1).t >= end, 'FORECAST_COVERAGE', 'Forecast does not cover both endpoints.');
    const interpolate = time => {
      const exact = points.find(p => p.t === time);
      if (exact) return exact.v;
      const index = points.findIndex(p => p.t > time);
      const a = points[index - 1], b = points[index];
      return a.v.add(b.v.sub(a.v).mul(new Q(BigInt(time - a.t), BigInt(b.t - a.t))));
    };
    const path = [interpolate(now), ...points.filter(p => p.t > now && p.t < end).map(p => p.v), interpolate(end)];
    const deadband = Q.parse(f.deadbandFt);
    requireValue(deadband.cmp('0') >= 0, 'FORECAST_INVALID', 'Negative forecast deadband.');
    let min = path[0], max = path[0], rises = false, falls = false;
    for (const v of path) {
      if (v.sub(min).cmp(deadband) > 0) rises = true;
      if (max.sub(v).cmp(deadband) > 0) falls = true;
      if (v.cmp(min) < 0) min = v;
      if (v.cmp(max) > 0) max = v;
    }
    const delta = path.at(-1).sub(path[0]);
    const direction = rises && falls ? 'VARIABLE' : delta.cmp(deadband) > 0 ? 'RISING' : delta.cmp(deadband.mul('-1')) < 0 ? 'FALLING' : 'STEADY';
    return { direction, status: 'AVAILABLE', runId: f.id, gaugeId: f.gaugeId, issuedAt: f.issuedAt,
      windowStart: input.asOf, windowEnd: new Date(end).toISOString(), deltaFt: delta.toJSON(),
      startFt: path[0].toJSON(), endFt: path.at(-1).toJSON(), deadbandFt: f.deadbandFt };
  } catch (e) { return { direction: 'UNAVAILABLE', status: e.code || 'FORECAST_INVALID', reason: e.message }; }
}

export function calculate(input) {
  const result = { formulaVersion: FORMULA_VERSION, demo: true, asOf: input?.asOf ?? null,
    bridgeId: input?.bridge?.id ?? null, status: 'INVALID_INPUT', reason: '', clearanceFt: null,
    observations: [], trace: { transforms: [], epochs: [], gauges: [] }, forecast: forecastDirection(input ?? {}) };
  try {
    requireValue(input.datasetKind === 'SYNTHETIC', 'PRODUCTION_DISABLED', 'This prototype accepts synthetic fixtures only.');
    const time = instant(input.asOf);
    requireValue(Array.isArray(input.sources) && new Set(input.sources.map(s => s.id)).size === input.sources.length,
      'SOURCE_UNRESOLVED', 'Source IDs must be unique.');
    const { bridge, model } = input;
    provenance(bridge, input);
    requireValue(Q.parse(bridge.riverMile).cmp('0') >= 0 && Q.parse(bridge.riverMile).cmp('279') <= 0,
      'OUT_OF_SCOPE', 'Bridge is outside Illinois Waterway miles 0–279.');
    requireValue(['FIXED', 'LIFT'].includes(bridge.type), 'GEOMETRY_UNSUPPORTED', 'Unsupported bridge type in this prototype.');
    const opening = bridge.opening;
    requireValue(opening && (bridge.type !== 'LIFT' || opening.position === 'FULLY_OPEN'), 'OPEN_GEOMETRY_UNRESOLVED', 'Fully open lift-bridge geometry is required.');
    requireValue(bridge.type !== 'FIXED' || opening.position === 'FIXED', 'OPEN_GEOMETRY_UNRESOLVED', 'Fixed-span position mismatch.');
    requireValue(opening.fullOpeningRestricted === false, 'OPENING_RESTRICTED', 'Opening restriction is unresolved or prohibits the assumed position.');
    provenance(opening, input);
    requireValue(active(opening, time), 'GEOMETRY_EXPIRED', 'Clearance reference is not effective at the cutoff.');
    const surface = opening.referenceSurface;
    provenance(surface, input);
    requireValue(surface.bridgeId === bridge.id && active(surface, time), 'DATUM_UNRESOLVED', 'Reference surface must be valid at this bridge.');
    const listed = feet(opening.listedClearance);
    requireValue(listed.cmp('0') >= 0, 'INVALID_INPUT', 'Listed clearance cannot be negative.');
    requireValue(model && Array.isArray(model.gaugeIds) && model.gaugeIds.length > 0 &&
      new Set(model.gaugeIds).size === model.gaugeIds.length, 'MODEL_UNAPPROVED', 'Missing or duplicate gauge association.');
    requireValue(new Set(input.gauges.map(g => g.id)).size === input.gauges.length, 'MODEL_UNAPPROVED', 'Duplicate gauge definitions.');
    const selected = model.gaugeIds.map(id => {
      const gauge = input.gauges.find(g => g.id === id);
      requireValue(gauge, 'MODEL_UNAPPROVED', `Gauge ${id} is undefined.`);
      const observation = selectObservation(gauge, input);
      result.observations.push({ gaugeId: id, gaugeName: gauge.name, observationId: observation.id,
        value: observation.value, unit: observation.unit, parameter: observation.parameter, observedAt: observation.observedAt,
        ...freshness(observation.observedAt, input.asOf) });
      return { gauge, observation };
    });
    const waters = selected.map(({ gauge, observation }) => observationWater(gauge, observation, input, result.trace));
    const ref = canonical(surface.elevation, surface.datum, surface.id, surface.transformId, time, input, result.trace);
    const water = bridgeWater(model, waters, input, result.trace);
    const steel = ref.add(listed), clearance = steel.sub(water), displayed = clearance.floor(1);
    Object.assign(result.trace, { referenceNavd88Ft: ref.toJSON(), lowSteelNavd88Ft: steel.toJSON(),
      waterNavd88Ft: water.toJSON(), unroundedClearanceFt: clearance.toJSON(), scenario: opening.position,
      positionVerified: false, modelId: model.id, modelRevision: model.revisionId });
    accuracy(input, result.trace, clearance, displayed);
    result.status = 'AVAILABLE';
    result.clearanceFt = displayed;
    result.reason = bridge.type === 'LIFT' ? 'Fully open assumption—position not verified.' : 'Synthetic calculation passed the configured checks.';
  } catch (e) { result.status = e.code || 'INVALID_INPUT'; result.reason = e.message; }
  return result;
}

// Receipt identity covers both the complete snapshot and the calculation result.
// No Date.now(), network requests, locale formatting or random IDs enter it.
export async function createReceipt(input) {
  const snapshot = JSON.parse(JSON.stringify(input));
  const body = { schemaVersion: 1, input: snapshot, result: calculate(snapshot) };
  for (const source of snapshot.sources ?? []) {
    if (typeof source.payload !== 'string' || await sha256(source.payload) !== source.sha256) {
      body.result.status = 'SOURCE_HASH_MISMATCH';
      body.result.reason = 'Source payload failed SHA-256 integrity verification.';
      body.result.clearanceFt = null;
      body.result.forecast = { direction: 'UNAVAILABLE', status: 'SOURCE_HASH_MISMATCH' };
      break;
    }
  }
  return { receiptId: `sha256:${await sha256(body)}`, ...body };
}
