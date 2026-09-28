import { Q, stableStringify } from '../exact.js';
import { hash, check, parseExact, utc } from './usgs-pilot.js';
import { readFileSync } from 'node:fs';

export const ADAPTER_VERSION = 'lincoln-noaa-stage-review-4';
export const URLS = Object.freeze({
  gauge: 'https://api.water.noaa.gov/nwps/v1/gauges/lsli2',
  stage: 'https://api.water.noaa.gov/nwps/v1/gauges/lsli2/stageflow/observed',
  forecast: 'https://api.water.noaa.gov/nwps/v1/gauges/lsli2/stageflow/forecast'
});
export const LINCOLN_REFERENCE = JSON.parse(readFileSync(new URL('../../data/lincoln-bridge-reference.json',import.meta.url),'utf8'));
const millis = value => Date.parse(utc(value));
const attempt = fn => { try { return fn(); } catch(e) { return { status: e.code || 'INVALID_SOURCE', valueFt: null }; } };
function source(snapshot, key, asOf) {
  const s = snapshot?.sources?.[key];
  check(s?.url === URLS[key], 'SOURCE_MISSING');
  check(s.httpStatus === 200 && !s.error, 'SOURCE_UNAVAILABLE');
  check(typeof s.body === 'string' && hash(s.body) === s.sha256, 'SOURCE_HASH_MISMATCH');
  check(millis(s.receivedAt) <= millis(asOf), 'SOURCE_AFTER_CUTOFF');
  check(/application\/json/i.test(s.contentType), 'CONTENT_TYPE_CHANGED');
  return { document: parseExact(s.body), source: s };
}
function gauge(snapshot, asOf) {
  const { document: g, source: s } = source(snapshot, 'gauge', asOf);
  check(g.lid === 'LSLI2' && g.usgsId === '411925089063901' && g.name === 'Illinois River near La Salle' &&
    g.wfo?.abbreviation === 'LOT' && g.pedts?.observed === 'HGIRG' && g.pedts?.forecast === 'HGIFF', 'GAUGE_IDENTITY_CHANGED');
  const zeros = g.datums?.vertical?.value?.filter(d => d.abbrev === 'NGVD29');
  check(zeros?.length === 1 && typeof zeros[0].value === 'string' && Q.parse(zeros[0].value).cmp('430.00') === 0, 'GAUGE_ZERO_CHANGED');
  // NOAA publishes only the NGVD29 zero here; an owner-reported NGS conversion is
  // retained as research and is not used without location/model/error evidence.
  return { sourceHash: s.sha256, zeroNgvd29Ft: zeros[0].value };
}
const stageValue = value => {
  check(typeof value === 'string', 'INVALID_VALUE');
  const q = Q.parse(value);
  check(q.cmp('0') >= 0 && q.cmp('45') <= 0, 'OUT_OF_RANGE');
  return q;
};
export function observedStage(snapshot, asOf) {
  const zero = gauge(snapshot, asOf), { document: d, source: s } = source(snapshot, 'stage', asOf);
  check(d.pedts === 'HGIRG' && d.wfo === 'LOT' && d.timeZone === 'CST6CDT' &&
    d.primaryName === 'Stage' && d.primaryUnits === 'ft', 'WRONG_SERIES');
  check(Array.isArray(d.data) && d.data.length > 0, 'OBSERVATION_MISSING');
  const rows = d.data.map(p => {
    const validTime = utc(p.validTime), generatedTime = utc(p.generatedTime);
    check(millis(validTime) <= millis(generatedTime) && millis(generatedTime) <= millis(s.receivedAt), 'FUTURE_OBSERVATION');
    stageValue(p.primary);
    return { t: millis(validTime), validTime, generatedTime, value: p.primary };
  });
  check(rows.every((p, i) => !i || p.t > rows[i-1].t), 'SOURCE_CONFLICT');
  const latest = rows.at(-1), observedAt = latest.validTime;
  check(utc(d.issuedTime) === observedAt, 'OBSERVATION_RUN_CHANGED');
  const previous = snapshot.previousAcceptedStage;
  if (previous) {
    check(latest.t >= millis(previous.observedAt), 'SOURCE_REGRESSED');
    if (observedAt === utc(previous.observedAt)) {
      check(millis(latest.generatedTime) >= millis(previous.sourceGeneratedTime), 'REVISION_REGRESSED');
      if (latest.generatedTime === utc(previous.sourceGeneratedTime)) check(latest.value === previous.valueFt, 'REVISION_CONFLICT');
    }
  }
  const ageSeconds = (millis(asOf) - latest.t) / 1000;
  return { status: 'AVAILABLE', siteId: 'LSLI2', seriesId: 'HGIRG', valueFt: latest.value,
    valueKind: 'STAGE_ABOVE_GAUGE_ZERO', gaugeZeroFt: zero.zeroNgvd29Ft, verticalDatum: 'NGVD29',
    observedAt, sourceGeneratedTime: latest.generatedTime, receivedAt: s.receivedAt, ageSeconds,
    late: ageSeconds > 86400, delayed: ageSeconds > 4320, approvalStatus: 'NOAA feed; point quality not independently verified',
    sourceHash: s.sha256, gaugeMetadataHash: zero.sourceHash };
}
export function stationForecast(snapshot, asOf) {
  gauge(snapshot, asOf);
  const { document: d, source: s } = source(snapshot, 'forecast', asOf);
  check(d.pedts === 'HGIFF' && d.wfo === 'LOT' && d.timeZone === 'CST6CDT' &&
    d.primaryName === 'Stage' && d.primaryUnits === 'ft', 'FORECAST_SCHEMA_CHANGED');
  const issuedAt = utc(d.issuedTime), now = millis(asOf);
  check(millis(issuedAt) <= millis(s.receivedAt) && now - millis(issuedAt) <= 64800000, 'FORECAST_STALE');
  check(Array.isArray(d.data) && d.data.length >= 2, 'FORECAST_MISSING');
  const points = d.data.map(p => {
    const generatedTime = utc(p.generatedTime), validTime = utc(p.validTime);
    check(millis(generatedTime) >= millis(issuedAt) && millis(generatedTime) <= millis(s.receivedAt), 'FORECAST_RUN_INVALID');
    return { t: millis(validTime), v: stageValue(p.primary), generatedTime };
  });
  check(new Set(points.map(p => p.generatedTime)).size === 1, 'FORECAST_MIXED_RUN');
  check(points.every((p, i) => !i || p.t > points[i-1].t), 'FORECAST_DUPLICATE_TIME');
  const start = Math.max(now, points[0].t), end = start + 86400000;
  check(start - now <= 21600000 && points.at(-1).t >= end, 'FORECAST_COVERAGE');
  const interpolate = t => {
    const exact = points.find(p => p.t === t); if (exact) return exact.v;
    const i = points.findIndex(p => p.t > t), a = points[i-1], b = points[i];
    check(a && b && b.t-a.t <= 21600000, 'FORECAST_GAP');
    return a.v.add(b.v.sub(a.v).mul(new Q(BigInt(t-a.t), BigInt(b.t-a.t))));
  };
  const inside = points.filter(p => p.t > start && p.t < end);
  const times = [start, ...inside.map(p => p.t), end];
  check(times.every((t, i) => !i || t-times[i-1] <= 21600000), 'FORECAST_GAP');
  const path = [interpolate(start), ...inside.map(p => p.v), interpolate(end)];
  let min = path[0], max = path[0], rises = false, falls = false;
  for (const v of path) {
    if (v.sub(min).cmp('0.1') > 0) rises = true;
    if (max.sub(v).cmp('0.1') > 0) falls = true;
    if (v.cmp(min) < 0) min = v;
    if (v.cmp(max) > 0) max = v;
  }
  const delta = path.at(-1).sub(path[0]);
  return { status: 'AVAILABLE', direction: rises && falls ? 'VARIABLE' : delta.cmp('0.1') > 0 ? 'RISING' : delta.cmp('-0.1') < 0 ? 'FALLING' : 'STEADY',
    scope: 'AT_GAUGE_ONLY', gaugeId: 'LSLI2', issuedAt, windowStart: new Date(start).toISOString(),
    windowEnd: new Date(end).toISOString(), deltaFt: delta.toJSON(), deadbandFt: '0.1',
    bridgeAssociationApproved: false, sourceHash: s.sha256 };
}
export function evaluateLincoln(snapshot, asOf) {
  utc(asOf);
  const reference = structuredClone(snapshot.bridgeReference ?? LINCOLN_REFERENCE);
  const consistency = attempt(() => {
    check(reference.bridgeId === 'il-abraham-lincoln' && reference.openingPosition === 'FIXED' &&
      reference.verticalDatum === 'NAVD88' && reference.referenceSurface?.label === 'NORMAL_POOL', 'REFERENCE_ID_MISMATCH');
    check(Q.parse(reference.lowSteelElevationFt).sub(reference.referenceSurface.elevationFt).cmp(reference.publishedClearanceFt) === 0,
      'REFERENCE_ARITHMETIC_CONFLICT');
    return { status: 'INTERNALLY_CONSISTENT' };
  }).status;
  const model = attempt(() => {
    const m = reference.bridgeWaterModel, g = reference.gaugeCandidate;
    check(reference.gaugeAssociationApproved === true && g?.gaugeId === 'LSLI2' &&
      g.associationStatus === 'OWNER_APPROVED_DIRECT_WATER_ASSUMPTION_NOT_FIELD_VALIDATED' &&
      g.bridgeMinusGaugeFt === '0' && m?.id === 'lincoln-lsli2-owner-direct-1' &&
      m.bridgeId === 'il-abraham-lincoln' && m.gaugeId === 'LSLI2' && m.type === 'DIRECT' &&
      m.basis === 'OWNER_ASSUMPTION' && m.offsetFt === '0' && m.validated === false &&
      m.ownerClaimedDifferenceInchesLessThan === '1' && m.errorBoundVerified === false &&
      m.appliesTo === 'ASSUMPTION_LABELED_PILOT_ONLY', 'MODEL_UNRESOLVED');
    return { status: 'OWNER_ASSUMPTION_RECORDED' };
  }).status;
  // The direct-water assumption is owner approved. Independent NCAT and owner-reported
  // NAVD88 zeros disagree, so neither becomes an active conversion in this pilot.
  const status = consistency !== 'INTERNALLY_CONSISTENT' ? consistency :
    model !== 'OWNER_ASSUMPTION_RECORDED' ? model : 'DATUM_CONVERSION_REVIEW';
  return { adapterVersion: ADAPTER_VERSION, asOf, bridgeId: reference.bridgeId,
    stage: attempt(() => observedStage(snapshot, asOf)),
    forecast: attempt(() => stationForecast(snapshot, asOf)),
    bridgeReference: { ...reference, consistency, modelStatus: model, recordSha256: hash(stableStringify(reference)) },
    clearance: { status,
      valueFt: null, productionEligible: false,
      reason: status === 'DATUM_CONVERSION_REVIEW'
        ? 'Owner assumes La Salle water equals bridge water. NCAT at published station coordinates gives about 429.78 ft NAVD88, while the owner reports 429.88 ft; conversion settings and source output need review before a numerical pilot.'
        : status === 'MODEL_UNRESOLVED' ? 'Bridge-to-gauge owner assumption is missing or changed.'
        : 'Bridge chart reference failed identity, datum, or arithmetic validation.' } };
}
