import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Q } from '../src/exact.js';

const base = new URL('../data/research/', import.meta.url);
const read = async path => JSON.parse(await readFile(new URL(path, base), 'utf8'));
const inventory = await read('bridge-inventory.json');
const manifest = await read('sources.json');
const pilotData = await read('pilot-candidates.json');
const sources = new Map(manifest.sources.map(s => [s.id, s]));
assert.equal(sources.size, manifest.sources.length, 'Duplicate source ID');
assert.equal(inventory.sourceCount, sources.size);
for (const source of sources.values()) {
  assert.match(source.originalSha256, /^[a-f0-9]{64}$/);
  assert.match(source.evidencePath, /^evidence\/[a-z0-9-]+\.txt$/);
  const evidence = await readFile(new URL(source.evidencePath, base));
  assert.ok(evidence.length > 100, `Empty/error payload: ${source.id}`);
  assert.equal(createHash('sha256').update(evidence).digest('hex'), source.evidenceSha256, `Evidence changed: ${source.id}`);
}
assert.equal(inventory.datasetKind, 'RESEARCH_ONLY');
assert.equal(inventory.bridges.length, 37, 'Incomplete Coast Pilot transcription');
const rows = new Map(inventory.bridges.map(b => [b.id, b]));
assert.equal(rows.size, 37, 'Duplicate bridge record');
assert.equal(new Set(inventory.bridges.map(b => b.sourceRow)).size, 37);
for (const b of rows.values()) {
  const cp = b.coastPilot;
  assert.ok(sources.has(cp.sourceId));
  assert.equal(Q.parse('327.2').sub(cp.milesFromChicagoLock).cmp(b.derivedRiverMile), 0);
  assert.ok(Q.parse(b.derivedRiverMile).cmp('0') >= 0 && Q.parse(b.derivedRiverMile).cmp('273') <= 0);
  assert.equal(cp.referenceSurfaceLabel, 'POOL_LEVEL');
  assert.equal(cp.poolElevation, null);
  assert.equal(cp.verticalDatum, null);
  for (const key of ['horizontalClearanceFt', 'poolClearanceFt', 'highWaterClearanceFt', 'liftTravelFt']) {
    if (cp[key] !== null) assert.ok(Q.parse(cp[key]).cmp('0') >= 0, `${b.id}: ${key}`);
  }
  assert.equal(b.productionEligible, false);
  assert.equal(b.approvedGaugeAssociation, null);
  assert.ok(b.issues.length > 0);
  if (b.coastPilotScenarioCandidateFt !== null) {
    const expected = cp.type === 'fixed' ? Q.parse(cp.poolClearanceFt) : Q.parse(cp.poolClearanceFt).add(cp.liftTravelFt);
    assert.equal(expected.cmp(b.coastPilotScenarioCandidateFt), 0, `Scenario arithmetic: ${b.id}`);
  }
  const ll = b.historicalLightList;
  if (ll) {
    assert.ok(sources.has(ll.sourceId));
    assert.equal(ll.status, 'HISTORICAL_RECONCILIATION_ONLY');
    assert.ok(ll.sourceText.startsWith(ll.llnr));
    assert.equal(ll.position, ll.fullyOpenClearanceFt ? 'CLOSED' : 'FIXED');
    if (b.candidateDifferenceFromHistoricalFt !== null) {
      const delta = Q.parse(b.coastPilotScenarioCandidateFt).sub(ll.fullyOpenClearanceFt ?? ll.publishedClearanceFt);
      assert.equal(delta.cmp(b.candidateDifferenceFromHistoricalFt), 0);
      if (delta.cmp('0') !== 0) assert.ok(b.issues.includes('UNRECONCILED_PUBLISHED_CLEARANCE_DIFFERENCE'));
    }
  }
}
assert.equal(rows.get('il-atsf-removed').lifecycle, 'REMOVED_SPAN_RETAINED_FOR_AUDIT');
assert.equal(rows.get('il-beardstown-rr').coastPilotScenarioCandidateFt, null);
assert.equal(rows.get('il-valley-city-rr').coastPilotScenarioCandidateFt, null);
assert.ok(rows.get('il-peoria-pekin-rr').coastPilot.liftTravelApproximate);
assert.ok(rows.get('il-mcclugage').issues.includes('REPLACEMENT_REQUIRES_NEW_GEOMETRY'));
assert.equal(pilotData.pilots.length, 3);
assert.equal(pilotData.associationApproved, false);
assert.deepEqual(pilotData.liveObservations, []);
assert.deepEqual(pilotData.datumTransforms, []);
const gauges = new Map(pilotData.gauges.map(g => [g.id, g]));
assert.equal(gauges.size, 3);
for (const g of gauges.values()) {
  assert.ok(sources.has(g.sourceId));
  assert.equal(g.approved, false);
  assert.equal(g.validFrom, null);
  assert.equal(g.parameterSeriesId, null);
  assert.equal(g.unitRealization, null);
  if (g.flatPoolStageFt) assert.equal(Q.parse(g.gaugeZeroFt).add(g.flatPoolStageFt).cmp(g.flatPoolElevationDerivedFt), 0);
}
for (const p of pilotData.pilots) {
  assert.ok(rows.has(p.bridgeId));
  assert.ok(gauges.has(p.gaugeId));
  assert.ok(p.blockers.length > 0);
}
assert.equal(gauges.get('IL04').requiredSeries, 'TAILWATER');
console.log(`Inventory checks passed: ${rows.size} source crossing rows, ${sources.size} hashed excerpts, 3 unapproved pilots.`);
