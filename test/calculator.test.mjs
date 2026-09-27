import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, sealFixture, demoCases, DEMO_AS_OF } from '../data/demo.js';
import { calculate, freshness, createReceipt, forecastDirection } from '../src/calculator.js';
import { Q, feet, stableStringify, sha256 } from '../src/exact.js';

const sample = () => sealFixture(fixture());
const result = async change => { const i = await sample(); change?.(i); return calculate(i); };
const eq = (q, value) => assert.equal(new Q(BigInt(q.numerator), BigInt(q.denominator)).cmp(value), 0);

test('exact decimals and international/survey foot conversions', () => {
  assert.equal(Q.parse('0.1').add('0.2').cmp('0.3'), 0);
  assert.equal(feet({ value: '0.3048', unit: 'm' }).cmp('1'), 0);
  assert.equal(feet({ value: '499999', unit: 'us_survey_ft' }).cmp('500000'), 0);
  assert.equal(Q.parse('-0.01').floor(1), '-0.1');
  for (const x of [1, '', 'NaN', 'Infinity', '1e3']) assert.throws(() => Q.parse(x));
  assert.throws(() => feet({ value: '1', unit: 'unknown' }));
});

test('known independent arithmetic: 500 + 65 - (500 + 7.25) = 57.75', async () => {
  const r = await result(); assert.equal(r.status, 'AVAILABLE'); assert.equal(r.clearanceFt, '57.7');
  eq(r.trace.unroundedClearanceFt, '57.75'); eq(r.trace.errorBudget.totalFt, '0.20');
});

test('one-foot water rise causes exactly one-foot clearance reduction across 41 stages', async () => {
  for (let n = -20; n <= 20; n++) {
    const i = await sample(); i.observations[0].value = new Q(BigInt(n), 10n).add('7.25').floor(3);
    const a = calculate(i); i.observations[0].value = Q.parse(i.observations[0].value).add('1').floor(3);
    const b = calculate(i);
    assert.equal(a.status, 'AVAILABLE'); assert.equal(b.status, 'AVAILABLE');
    eq(new Q(BigInt(a.trace.unroundedClearanceFt.numerator), BigInt(a.trace.unroundedClearanceFt.denominator))
      .sub(new Q(BigInt(b.trace.unroundedClearanceFt.numerator), BigInt(b.trace.unroundedClearanceFt.denominator))).toJSON(), '1');
  }
});

test('late boundary uses observation time with strict greater than 24 hours', () => {
  for (const seconds of [86399, 86400, 86401]) {
    const at = new Date(Date.parse(DEMO_AS_OF) - seconds * 1000).toISOString();
    assert.equal(freshness(at, DEMO_AS_OF).label, seconds === 86401 ? 'LATE' : 'ON_TIME');
  }
});

test('recent download cannot reset age; late flag survives withheld calculation', async () => {
  const r = await result(i => { i.observations[0].observedAt = '2026-09-24T17:00:00.000Z'; i.observations[0].receivedAt = DEMO_AS_OF; });
  assert.equal(r.status, 'STALE_OBSERVATION'); assert.equal(r.observations[0].label, 'LATE'); assert.equal(r.clearanceFt, null);
});

test('age eligibility can fail before late label and forecast cannot rescue it', async () => {
  const r = await result(i => { i.observations[0].observedAt = '2026-09-25T15:00:00.000Z'; });
  assert.equal(r.status, 'STALE_OBSERVATION'); assert.equal(r.observations[0].label, 'ON_TIME');
  assert.equal(r.forecast.direction, 'RISING'); assert.equal(r.clearanceFt, null);
});

test('missing, rejected, conflicting, future, and malformed readings fail closed', async () => {
  const cases = [
    [i => { i.observations = []; }, 'MISSING_OBSERVATION'],
    [i => { i.observations[0].quality = 'REJECTED'; }, 'INVALID_OBSERVATION'],
    [i => { i.observations[0].conflict = true; }, 'SOURCE_CONFLICT'],
    [i => { i.observations[0].observedAt = '2026-09-26T18:00:00.000Z'; }, 'FUTURE_OBSERVATION'],
    [i => { i.observations[0].unit = 'm'; }, 'INVALID_OBSERVATION'],
    [i => { i.observations[0].seriesId = 'wrong-series'; }, 'INVALID_OBSERVATION'],
    [i => { i.observations[0].observedAt = '2026-09-25'; }, 'INVALID_TIME'],
    [i => { i.observations[0].value = '999'; }, 'OUT_OF_RANGE'],
    [i => { i.observations[0].value = 'NaN'; }, 'INVALID_INPUT']
  ];
  for (const [change, expected] of cases) { const r = await result(change); assert.equal(r.status, expected); assert.equal(r.clearanceFt, null); }
});

test('observation revisions deterministic; conflicting equal revisions block', async () => {
  const i = await sample(), revised = { ...i.observations[0], id: 'revised', revision: 2, value: '8.25' };
  i.observations.push(revised); assert.equal(calculate(i).clearanceFt, '56.7');
  i.observations.reverse(); assert.equal(calculate(i).clearanceFt, '56.7');
  i.observations.push({ ...revised, id: 'conflict', value: '9.25' }); assert.equal(calculate(i).status, 'SOURCE_CONFLICT');
});

test('datum conversion must be scoped, approved, and effective', async () => {
  const i = await sample(); i.gauges[0].epochs[0].datum = 'NGVD29';
  assert.equal(calculate(i).status, 'DATUM_UNRESOLVED');
  i.gauges[0].epochs[0].transformId = 't1';
  i.transforms = [{ id: 't1', revisionId: 'v1', sourceId: 'synthetic-source', entityId: 'gauge-a', from: 'NGVD29', to: 'NAVD88',
    offset: { value: '-0.5', unit: 'ft' }, approved: true, validFrom: '2026-01-01T00:00:00.000Z', validTo: null }];
  assert.equal(calculate(i).clearanceFt, '58.2');
  i.transforms[0].entityId = 'another-gauge'; assert.equal(calculate(i).status, 'DATUM_UNRESOLVED');
  i.transforms[0].entityId = 'gauge-a'; i.transforms[0].approved = false; assert.equal(calculate(i).status, 'DATUM_UNRESOLVED');
});

test('gauge zero epoch boundary uses observation time; overlap is rejected', async () => {
  const i = await sample(), old = i.gauges[0].epochs[0]; old.validTo = i.observations[0].observedAt;
  const next = { ...old, id: 'zero-next', validFrom: old.validTo, validTo: null, zero: { value: '501', unit: 'ft' } };
  i.gauges[0].epochs.push(next); assert.equal(calculate(i).clearanceFt, '56.7');
  assert.equal(calculate(i).trace.epochs[0].epochId, 'zero-next');
  old.validTo = null; assert.equal(calculate(i).status, 'DATUM_UNRESOLVED');
});

test('absolute water elevation never adds gauge zero', async () => {
  const r = await result(i => {
    i.gauges[0].parameter = i.observations[0].parameter = 'WATER_SURFACE_ELEVATION';
    i.gauges[0].datum = i.observations[0].datum = 'NAVD88';
    i.gauges[0].minValueFt = '490'; i.gauges[0].maxValueFt = '525'; i.observations[0].value = '507.25';
  }); assert.equal(r.clearanceFt, '57.7'); assert.equal(r.trace.epochs.length, 0);
});

test('LWRP remains a local reference surface and is not treated as a datum', async () => {
  const i = await sample(); i.bridge.opening.referenceSurface.type = 'LWRP';
  assert.equal(calculate(i).clearanceFt, '57.7');
  i.bridge.opening.referenceSurface.datum = 'LWRP'; assert.equal(calculate(i).status, 'DATUM_UNRESOLVED');
});

test('fully open lift geometry is mandatory and opening restrictions block', async () => {
  const i = (await demoCases())[1]; assert.equal(calculate(i).clearanceFt, '67.5');
  i.bridge.opening.position = 'CLOSED'; assert.equal(calculate(i).status, 'OPEN_GEOMETRY_UNRESOLVED');
  i.bridge.opening.position = 'FULLY_OPEN'; i.bridge.opening.fullOpeningRestricted = true;
  assert.equal(calculate(i).status, 'OPENING_RESTRICTED');
});

test('bracketed elevations interpolate exactly; no extrapolation or one-sided fallback', async () => {
  const i = (await demoCases())[2]; assert.equal(calculate(i).clearanceFt, '57.2');
  eq(calculate(i).trace.waterNavd88Ft, '507.75');
  i.bridge.riverMile = '151'; assert.equal(calculate(i).status, 'OUT_OF_RANGE');
  i.bridge.riverMile = '145'; i.observations.pop(); assert.equal(calculate(i).status, 'MISSING_OBSERVATION');
});

test('reach, regime, scope, and validated model range are enforced', async () => {
  for (const [change, status] of [
    [i => { i.gauges[0].reachId = 'across-dam'; }, 'HYDRAULIC_BOUNDARY'],
    [i => { i.regime = 'OPEN_PASS'; }, 'MODEL_UNAPPROVED'],
    [i => { i.bridge.riverMile = '279.001'; }, 'OUT_OF_SCOPE'],
    [i => { i.model.waterRanges['gauge-a'].maxFt = '505'; }, 'OUT_OF_RANGE'],
    [i => { i.model.approved = false; }, 'MODEL_UNAPPROVED']
  ]) assert.equal((await result(change)).status, status);
});

test('six-inch strict gate includes age and display rounding without deducting error', async () => {
  const i = await sample(); i.observations[0].value = '7.2';
  Object.assign(i.errorBudget, { bridgeReferenceFt: '0.499', sensorFt: '0', gaugeZeroFt: '0', datumTransformFt: '0', hydraulicModelFt: '0', timeMismatchFt: '0', maxWaterChangeFtPerHour: '0' });
  assert.equal(calculate(i).clearanceFt, '57.8');
  i.errorBudget.bridgeReferenceFt = '0.500'; assert.equal(calculate(i).status, 'ACCURACY_LIMIT_EXCEEDED');
  i.errorBudget.bridgeReferenceFt = '0.499'; i.observations[0].value = '7.25';
  assert.equal(calculate(i).status, 'ACCURACY_LIMIT_EXCEEDED');
  i.observations[0].value = '7.2'; i.errorBudget.maxWaterChangeFtPerHour = '0.004';
  assert.equal(calculate(i).status, 'ACCURACY_LIMIT_EXCEEDED');
  i.errorBudget.reviewed = false; assert.equal(calculate(i).status, 'ACCURACY_UNVERIFIED');
});

test('forecast rise/fall/steady/variable and deadband boundaries', async () => {
  for (const [middle, end, expected] of [['7.5','7.85','RISING'],['7','6.5','FALLING'],['7.3','7.35','STEADY'],['8','7.3','VARIABLE'],['7.2','7.15','STEADY']]) {
    const i = await sample(); i.forecast.points[1].value = middle; i.forecast.points[2].value = end;
    assert.equal(forecastDirection(i).direction, expected);
  }
});

test('forecast endpoint interpolation and cumulative reversal are deterministic', async () => {
  const i = await sample(); i.forecast.points = [
    { validAt: '2026-09-25T17:00:00.000Z', value: '7' }, { validAt: '2026-09-25T19:00:00.000Z', value: '7.5' },
    { validAt: '2026-09-26T17:00:00.000Z', value: '8' }, { validAt: '2026-09-26T19:00:00.000Z', value: '7' }];
  const r = forecastDirection(i); eq(r.startFt, '7.25'); eq(r.endFt, '7.5'); assert.equal(r.direction, 'VARIABLE');
});

test('unavailable/stale/unassociated forecast never substitutes for observed clearance', async () => {
  for (const change of [i => { i.forecast = null; }, i => { i.forecast.points.pop(); },
    i => { i.forecast.issuedAt = '2026-09-24T17:00:00.000Z'; }, i => { i.forecast.associationApproved = false; }]) {
    const i = await sample(); change(i); const r = calculate(i);
    assert.equal(r.forecast.direction, 'UNAVAILABLE'); assert.equal(r.clearanceFt, '57.7');
  }
});

test('receipts replay byte for byte without mutating input; hash changes with input', async () => {
  const i = await sample(), before = stableStringify(i), a = await createReceipt(i), b = await createReceipt(i);
  assert.equal(stableStringify(a), stableStringify(b)); assert.equal(stableStringify(i), before);
  const { receiptId, ...body } = a; assert.equal(receiptId, `sha256:${await sha256(body)}`);
  assert.equal(stableStringify((await createReceipt(a.input)).result), stableStringify(a.result));
  i.observations[0].value = '8.25'; assert.notEqual((await createReceipt(i)).receiptId, a.receiptId);
});

test('unapproved real input cannot become a production result', async () => {
  assert.equal((await result(i => { i.datasetKind = 'REAL'; })).status, 'PRODUCTION_DISABLED');
});

test('source-payload corruption blocks a downloadable numeric receipt', async () => {
  const i = await sample(); i.sources[0].payload += 'tampered';
  const r = await createReceipt(i);
  assert.equal(r.result.status, 'SOURCE_HASH_MISMATCH'); assert.equal(r.result.clearanceFt, null);
  assert.equal(r.result.forecast.direction, 'UNAVAILABLE');
});

test('expanded waterway scope includes mile 279 and rejects values beyond either endpoint', async () => {
  for (const mile of ['0','277.9','279']) assert.equal((await result(i=>i.bridge.riverMile=mile)).status,'AVAILABLE');
  for (const mile of ['-0.1','279.1']) assert.equal((await result(i=>i.bridge.riverMile=mile)).status,'OUT_OF_SCOPE');
});
