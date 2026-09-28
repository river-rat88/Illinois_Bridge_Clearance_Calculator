import { Q, stableStringify } from '../exact.js';
import { withPocRange } from '../poc-range.js';
import { createHash } from 'node:crypto';
export const hash = value => createHash('sha256').update(value).digest('hex');
export const check = (ok, code) => { if (!ok) throw Object.assign(new Error(code), { code }); };
// Node 22+ reviver source preserves JSON numeric tokens before binary arithmetic.
export const parseExact = text => JSON.parse(text, (key, value, context) => typeof value === 'number' ? context.source : value);

export function utc(value) {
  check(typeof value === 'string', 'INVALID_TIME');
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.(\d{1,7}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  check(m, 'INVALID_TIME');
  const local = `${m[1]}T${m[2]}.${(m[3] || '').padEnd(3, '0').slice(0, 3)}Z`;
  const localMs = Date.parse(local);
  check(Number.isFinite(localMs) && new Date(localMs).toISOString() === local, 'INVALID_TIME');
  if (m[4] !== 'Z') check(Number(m[4].slice(1,3)) <= 23 && Number(m[4].slice(4)) <= 59, 'INVALID_TIME');
  const ms = Date.parse(`${local.slice(0,-1)}${m[4]}`);
  check(Number.isFinite(ms), 'INVALID_TIME');
  return new Date(ms).toISOString();
}
const millis = s => Date.parse(utc(s));
const keys = ['id', 'monitoring_location_id', 'parameter_code', 'unit_of_measure', 'statistic_id', 'computation_period_identifier', 'computation_identifier', 'primary', 'sublocation_identifier', 'thresholds', 'data_gap_interval'];
export const seriesSignature = p => Object.fromEntries(keys.map(k => [k, p[k]]));

export function createUsgsPilot({adapterVersion,bridgeReference,bridgeId,gaugeId,siteId,usgsId,wfo,seriesId:SERIES,urls:URLS,contract,minFt,maxFt}) {
function source(snapshot, key, asOf) {
  const s = snapshot?.sources?.[key];
  check(s && s.url === URLS[key], 'SOURCE_MISSING');
  check(s.httpStatus === 200 && !s.error, 'SOURCE_UNAVAILABLE');
  check(typeof s.body === 'string' && hash(s.body) === s.sha256, 'SOURCE_HASH_MISMATCH');
  check(millis(s.receivedAt) <= millis(asOf), 'SOURCE_AFTER_CUTOFF');
  check(/(?:application\/json|application\/geo\+json)/i.test(s.contentType), 'CONTENT_TYPE_CHANGED');
  return { document: parseExact(s.body), receivedAt: s.receivedAt, sha256: s.sha256 };
}
function features(doc) {
  check(doc?.type === 'FeatureCollection' && Array.isArray(doc.features), 'SCHEMA_CHANGED');
  check(Array.isArray(doc.links) && !doc.links.some(l => l.rel === 'next'), 'INCOMPLETE_PAGE');
  check(String(doc.numberReturned) === String(doc.features.length), 'INCOMPLETE_PAGE');
  return doc.features;
}
function observedStage(snapshot, asOf) {
  const stageSource = source(snapshot, 'stage', asOf), metadata = source(snapshot, 'series', asOf);
  const records = features(metadata.document);
  check(records.every(f => f.type === 'Feature' && f.properties?.monitoring_location_id === siteId && f.properties.parameter_code === '00065'), 'WRONG_SERIES');
  const candidates = records.filter(f => f.properties.computation_period_identifier === 'Points' && f.properties.primary === 'Primary');
  check(candidates.length === 1 && candidates[0].id === SERIES, 'SERIES_CHANGED');
  check(stableStringify(seriesSignature(candidates[0].properties)) === stableStringify(contract.series), 'METADATA_CHANGED');
  const values = features(stageSource.document);
  check(values.length === 1, values.length ? 'SOURCE_CONFLICT' : 'OBSERVATION_MISSING');
  const f = values[0], p = f.properties;
  check(f.type === 'Feature' && typeof f.id === 'string' && p?.time_series_id === SERIES && p.monitoring_location_id === siteId && p.parameter_code === '00065' && p.statistic_id === '00011' && p.unit_of_measure === 'ft', 'WRONG_SERIES');
  check(p.qualifier === null && ['Provisional', 'Approved'].includes(p.approval_status), 'QUALITY_REJECTED');
  check(typeof p.value === 'string', 'INVALID_VALUE');
  const value = Q.parse(p.value);
  // Pinned agency public-suppression bounds; metadata drift blocks before use.
  check(value.cmp(minFt) >= 0 && value.cmp(maxFt) <= 0, 'OUT_OF_RANGE');
  const observedAt = utc(p.time), modifiedAt = utc(p.last_modified);
  check(millis(observedAt) <= millis(stageSource.receivedAt) && millis(modifiedAt) <= millis(stageSource.receivedAt), 'FUTURE_OBSERVATION');
  const previous = snapshot.previousAcceptedStage;
  if (previous) {
    check(millis(observedAt) >= millis(previous.observedAt), 'SOURCE_REGRESSED');
    if (observedAt === previous.observedAt) {
      check(millis(modifiedAt) >= millis(previous.sourceLastModified), 'REVISION_REGRESSED');
      if (modifiedAt === utc(previous.sourceLastModified)) check(p.value === previous.valueFt && p.approval_status === previous.approvalStatus, 'REVISION_CONFLICT');
    }
  }
  const ageSeconds = (millis(asOf) - millis(observedAt)) / 1000;
  return { status: 'AVAILABLE', siteId, seriesId: SERIES, observationId: f.id,
    valueFt: p.value, observedAt, sourceTime: p.time, sourceLastModified: p.last_modified, receivedAt: stageSource.receivedAt,
    approvalStatus: p.approval_status, qualifier: p.qualifier, ageSeconds,
    late: ageSeconds > 86400, delayed: ageSeconds > 4320, valueKind: 'STAGE_ABOVE_GAUGE_ZERO',
    datumEpoch: null, unitRealization: null, sourceHash: stageSource.sha256 };
}
function stationForecast(snapshot, asOf) {
  const s = source(snapshot, 'forecast', asOf), g = source(snapshot, 'gauge', asOf).document, f = s.document;
  check(g.lid === gaugeId && g.usgsId === usgsId && g.pedts?.forecast === 'HGIFF', 'FORECAST_SITE_CHANGED');
  check(f.pedts === 'HGIFF' && f.primaryName === 'Stage' && f.primaryUnits === 'ft' && f.wfo === wfo, 'FORECAST_SCHEMA_CHANGED');
  const issuedAt = utc(f.issuedTime), now = millis(asOf);
  // Pilot policy allows for the interval between official runs; stage freshness remains independent.
  check(millis(issuedAt) <= millis(s.receivedAt) && now - millis(issuedAt) <= 64800000, 'FORECAST_STALE');
  check(Array.isArray(f.data) && f.data.length >= 2, 'FORECAST_MISSING');
  const points = f.data.map(p => {
    check(millis(p.generatedTime) <= millis(s.receivedAt) && millis(p.generatedTime) >= millis(issuedAt), 'FORECAST_RUN_INVALID');
    const v = Q.parse(p.primary); check(v.cmp(minFt) >= 0 && v.cmp(maxFt) <= 0, 'FORECAST_VALUE_INVALID');
    return { t: millis(p.validTime), v, generatedTime: p.generatedTime };
  }).sort((a,b) => a.t-b.t);
  check(new Set(points.map(p => p.generatedTime)).size === 1, 'FORECAST_MIXED_RUN');
  check(points.every((p,i) => !i || p.t > points[i-1].t), 'FORECAST_DUPLICATE_TIME');
  // Some official runs begin at the next forecast time. Shift the labeled window, never extrapolate backward.
  const start = Math.max(now, points[0].t), end = start + 86400000;
  check(start - now <= 21600000 && points.at(-1).t >= end, 'FORECAST_COVERAGE');
  const interpolate = t => {
    const exact = points.find(p => p.t === t); if (exact) return exact.v;
    const i = points.findIndex(p => p.t > t), a = points[i-1], b = points[i];
    check(b.t-a.t <= 21600000, 'FORECAST_GAP');
    return a.v.add(b.v.sub(a.v).mul(new Q(BigInt(t-a.t), BigInt(b.t-a.t))));
  };
  const within = points.filter(p => p.t > start && p.t < end);
  const relevant = [start,...within.map(p => p.t),end];
  check(relevant.every((t,i) => !i || t-relevant[i-1] <= 21600000), 'FORECAST_GAP');
  const path = [interpolate(start),...within.map(p => p.v),interpolate(end)];
  let min = path[0], max = path[0], rises = false, falls = false;
  for (const v of path) {
    if (v.sub(min).cmp('0.1') > 0) rises = true;
    if (max.sub(v).cmp('0.1') > 0) falls = true;
    if (v.cmp(min) < 0) min = v;
    if (v.cmp(max) > 0) max = v;
  }
  const delta = path.at(-1).sub(path[0]);
  return { status: 'AVAILABLE', direction: rises && falls ? 'VARIABLE' : delta.cmp('0.1') > 0 ? 'RISING' : delta.cmp('-0.1') < 0 ? 'FALLING' : 'STEADY',
    scope: 'AT_GAUGE_ONLY', gaugeId, issuedAt, windowStart: new Date(start).toISOString(), windowEnd: new Date(end).toISOString(),
    deadbandFt: '0.1', deltaFt: delta.toJSON(), sourceHash: s.sha256, bridgeAssociationApproved: false };
}
const attempt = fn => { try { return fn(); } catch(e) { return { status: e.code || 'INVALID_SOURCE', valueFt: null }; } };
function evaluate(snapshot, asOf) {
  utc(asOf);
  const reference = structuredClone(snapshot.bridgeReference ?? bridgeReference);
  const referenceCheck = attempt(() => {
    check(reference.bridgeId === bridgeId && reference.openingPosition === 'FIXED', 'REFERENCE_ID_MISMATCH');
    check(Q.parse(reference.lowSteelElevationFt).sub(reference.referenceSurface.elevationFt).cmp(reference.publishedClearanceFt) === 0, 'REFERENCE_ARITHMETIC_CONFLICT');
    return { status: 'INTERNALLY_CONSISTENT' };
  });
  const stage = attempt(() => observedStage(snapshot, asOf));
  const calculation = attempt(() => {
    check(referenceCheck.status === 'INTERNALLY_CONSISTENT', referenceCheck.status);
    check(reference.verticalDatum === 'NAVD88', 'DATUM_UNRESOLVED');
    check(reference.pilotEstimateEnabled === true, 'PILOT_ESTIMATE_DISABLED');
    check(stage.status === 'AVAILABLE', stage.status);
    const g = source(snapshot, 'gauge', asOf), metadata = g.document;
    const gaugeReference = reference.gaugeReference, model = reference.bridgeWaterModel;
    check(metadata.lid === gaugeId && metadata.usgsId === usgsId && metadata.pedts?.observed === 'HGIRG', 'GAUGE_IDENTITY_CHANGED');
    check(gaugeReference?.gaugeId === gaugeId && gaugeReference.usgsId === usgsId && gaugeReference.verticalDatum === 'NAVD88' && gaugeReference.unit === 'ft', 'GAUGE_REFERENCE_UNRESOLVED');
    const datums = metadata.datums?.vertical?.value;
    check(Array.isArray(datums), 'GAUGE_DATUM_MISSING');
    const matches = datums.filter(d => d.abbrev === 'NAVD88');
    check(matches.length === 1 && typeof matches[0].value === 'string', 'GAUGE_DATUM_MISSING');
    const zero = Q.parse(matches[0].value);
    check(zero.cmp(gaugeReference.zeroElevationFt) === 0, 'GAUGE_ZERO_CHANGED');
    check(model?.bridgeId === bridgeId && model.gaugeId === gaugeId && model.type === 'DIRECT' && model.basis === 'OWNER_ASSUMPTION' && model.validated === false && model.offsetFt === '0' && model.assumedMaxDifferenceInches === '2', 'MODEL_UNRESOLVED');
    const water = zero.add(stage.valueFt), lowSteel = Q.parse(reference.lowSteelElevationFt);
    const clearance = lowSteel.sub(water), display = clearance.floor(1);
    return { status: 'ESTIMATED', valueFt: display, validAt: stage.observedAt,
      timeBasis: 'AT_OBSERVATION_TIME', historical: stage.delayed, late: stage.late,
      accuracyStatus: 'UNVERIFIED', method: 'LOW_STEEL_MINUS_WATER_NAVD88',
      trace: { stageFt: stage.valueFt, gaugeZeroNavd88Ft: gaugeReference.zeroElevationFt,
        waterElevationNavd88Ft: water.toJSON(), lowSteelNavd88Ft: reference.lowSteelElevationFt,
        unroundedClearanceFt: clearance.toJSON(), displayRoundingFt: clearance.sub(display).toJSON(),
        modelId: model.id, bridgeMinusGaugeFt: model.offsetFt,
        assumedTransferDifferenceFt: Q.parse(model.assumedMaxDifferenceInches).div('12').toJSON(),
        metadataSourceHash: g.sha256, uncertaintyDeducted: false },
      assumptions: ['Bridge water elevation equals gauge water elevation; owner assumes differences within two inches.', `Published ${gaugeReference.zeroElevationFt}-ft NAVD88 gauge zero applies to this observation; effective epoch and exact foot realization are not independently verified.`, 'The overall six-inch accuracy target has not been demonstrated.'] };
  });
  return { adapterVersion, asOf, bridgeId, stage,
    forecast: attempt(() => stationForecast(snapshot, asOf)),
    bridgeReference: { ...reference, consistency: referenceCheck.status, recordSha256: hash(stableStringify(reference)) },
    clearance: withPocRange({ ...calculation, productionEligible: false }) };
}

return {observedStage,stationForecast,evaluate};
}
