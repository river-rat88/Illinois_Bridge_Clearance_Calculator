import { Q, sha256, stableStringify } from '../src/exact.js';

export const DEMO_AS_OF = '2026-09-25T18:00:00.000Z';
const validity = { validFrom: '2026-01-01T00:00:00.000Z', validTo: null };
const version = { revisionId: 'synthetic-v1', sourceId: 'synthetic-source' };
const ft = value => ({ value, unit: 'ft' });

export function fixture() {
  return {
    datasetKind: 'SYNTHETIC', asOf: DEMO_AS_OF, regime: 'FIXED_POOL', sources: [], transforms: [],
    bridge: { id: 'sample-a', name: 'Sample A · Fixed span', type: 'FIXED', riverMile: '40.0', reachId: 'demo-reach', ...version,
      opening: { id: 'sample-opening', position: 'FIXED', fullOpeningRestricted: false, ...version, ...validity,
        listedClearance: ft('65.0'), referenceSurface: { id: 'sample-reference', bridgeId: 'sample-a', type: 'POOL_LEVEL',
          elevation: ft('500.0'), datum: 'NAVD88', transformId: null, ...version, ...validity } } },
    model: { id: 'model-a', ...version, ...validity, bridgeId: 'sample-a', reachId: 'demo-reach', approved: true,
      type: 'DIRECT', gaugeIds: ['gauge-a'], validRegimes: ['FIXED_POOL'], waterRanges: { 'gauge-a': { minFt: '490', maxFt: '525' } },
      rationale: 'Synthetic co-located gauge; no real-world hydraulic validation is implied.' },
    gauges: [{ id: 'gauge-a', name: 'Demo gauge A', riverMile: '40.0', reachId: 'demo-reach', ...version,
      seriesId: 'demo-stage', parameter: 'STAGE_ABOVE_GAUGE_ZERO', unit: 'ft', minValueFt: '-10', maxValueFt: '25',
      stopAfterSeconds: 7200, epochs: [{ id: 'zero-a', zero: ft('500.0'), datum: 'NAVD88', transformId: null, ...version, ...validity }] }],
    observations: [{ id: 'observation-a', revision: 1, gaugeId: 'gauge-a', seriesId: 'demo-stage', ...version,
      observedAt: '2026-09-25T17:45:00.000Z', receivedAt: '2026-09-25T17:46:00.000Z', parameter: 'STAGE_ABOVE_GAUGE_ZERO',
      value: '7.25', unit: 'ft', quality: 'ACCEPTED', conflict: false }],
    errorBudget: { reviewed: true, evidence: 'Synthetic engineering bounds for software tests only; not field accuracy evidence.',
      bridgeReferenceFt: '0.05', sensorFt: '0.02', gaugeZeroFt: '0.02', datumTransformFt: '0.01', hydraulicModelFt: '0.04',
      timeMismatchFt: '0', maxWaterChangeFtPerHour: '0.04', rateBoundValidated: true },
    forecast: { id: 'demo-forecast-run', ...version, ...validity, bridgeId: 'sample-a', reachId: 'demo-reach', gaugeId: 'gauge-a',
      associationApproved: true, issuedAt: '2026-09-25T17:00:00.000Z', receivedAt: '2026-09-25T17:01:00.000Z',
      datum: 'LOCAL_GAUGE_ZERO', epochId: 'zero-a', unit: 'ft', horizonSeconds: 86400, maxIssueAgeSeconds: 21600, deadbandFt: '0.1',
      points: [{ validAt: DEMO_AS_OF, value: '7.25' }, { validAt: '2026-09-26T06:00:00.000Z', value: '7.50' },
        { validAt: '2026-09-26T18:00:00.000Z', value: '7.85' }] }
  };
}

export async function sealFixture(input) {
  const clone = structuredClone(input);
  delete clone.sources;
  const payload = stableStringify(clone);
  input.sources = [{ id: 'synthetic-source', label: 'Generated sample fixture; no real bridge or agency observation',
    payload, sha256: await sha256(payload) }];
  return input;
}

function rename(input, letter, name, mile) {
  input.bridge.id = `sample-${letter}`;
  input.bridge.name = `Sample ${letter.toUpperCase()} · ${name}`;
  input.bridge.riverMile = mile;
  input.bridge.opening.referenceSurface.bridgeId = input.bridge.id;
  input.model.bridgeId = input.bridge.id;
  input.model.id = `model-${letter}`;
  input.forecast.bridgeId = input.bridge.id;
  input.gauges[0].riverMile = mile;
}

export async function demoCases({ shiftTenths = 0, scenario = 'baseline' } = {}) {
  if (!Number.isInteger(shiftTenths) || Math.abs(shiftTenths) > 20) throw new Error('Invalid demonstration stage adjustment');
  if (!['baseline', 'late', 'outage', 'datum'].includes(scenario)) throw new Error('Invalid demonstration scenario');
  const a = fixture();
  const b = fixture(); rename(b, 'b', 'Lift span', '88.0');
  b.bridge.type = 'LIFT'; b.bridge.opening.position = 'FULLY_OPEN'; b.bridge.opening.listedClearance = ft('75.0');
  b.model.type = 'FIXED_OFFSET'; b.model.offset = ft('0.25');
  b.forecast.points[1].value = '7.0'; b.forecast.points[2].value = '6.65';
  const c = fixture(); rename(c, 'c', 'Two-gauge model', '145.0');
  c.model.type = 'BRACKETED_LINEAR'; c.gauges[0].riverMile = '140.0';
  const g = structuredClone(c.gauges[0]); g.id = 'gauge-b'; g.name = 'Demo gauge B'; g.riverMile = '150.0';
  c.gauges.push(g); c.model.gaugeIds.push(g.id); c.model.waterRanges[g.id] = { minFt: '490', maxFt: '525' };
  const o = structuredClone(c.observations[0]); o.gaugeId = g.id; o.id = 'observation-b'; o.value = '8.25'; c.observations.push(o);
  c.forecast.points[1].value = '8.0'; c.forecast.points[2].value = '7.3';
  const d = fixture(); rename(d, 'd', 'Late observation', '185.0');
  d.observations[0].observedAt = '2026-09-24T17:00:00.000Z'; d.observations[0].receivedAt = '2026-09-24T17:01:00.000Z';
  const e = fixture(); rename(e, 'e', 'Gauge unavailable', '220.0'); e.observations = []; e.forecast = null;
  const f = fixture(); rename(f, 'f', 'Datum unresolved', '260.0'); f.gauges[0].epochs[0].datum = 'NGVD29'; f.forecast = null;
  const cases = [a, b, c, d, e, f];
  for (const input of cases) {
    for (const o of input.observations) {
      o.value = Q.parse(o.value).add(new Q(BigInt(shiftTenths), 10n)).floor(3);
      if (scenario === 'late') {
        o.observedAt = '2026-09-24T17:00:00.000Z'; o.receivedAt = '2026-09-24T17:01:00.000Z';
      }
    }
    if (scenario === 'outage') input.observations = [];
    if (scenario === 'datum') input.gauges[0].epochs[0].datum = 'UNRESOLVED_LOCAL_DATUM';
    await sealFixture(input);
  }
  return cases;
}
