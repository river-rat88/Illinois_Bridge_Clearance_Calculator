import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { buildDirectory, orderBridges } from '../src/directory.js';
import { Q } from '../src/exact.js';
const read = async p => JSON.parse(await readFile(new URL(`../${p}`,import.meta.url),'utf8'));
const [inventory,extension,henry,morris,eje,lincoln,manifest] = await Promise.all(['data/research/bridge-inventory.json','data/research/scope-extension.json','data/henry-bridge-reference.json','data/morris-bridge-reference.json','data/eje-bridge-reference.json','data/lincoln-bridge-reference.json','data/research/sources.json'].map(read));
const directory=()=>buildDirectory(inventory,extension,[henry,morris,eje,lincoln],manifest);
test('directory keeps pending bridges, orders numeric miles and separates removed spans',()=>{
  const d=directory(), rows=orderBridges(d.bridges);
  assert.equal(d.scope.maximumRiverMile,'279');assert.equal(rows.length,37);
  assert.equal(rows[0].id,'il-hardin');assert.equal(rows.at(-1).id,'il-i55-desplaines');
  assert.equal(rows.at(-1).riverMile,'277.9');
  for(let i=1;i<rows.length;i++)assert.ok(Q.parse(rows[i-1].riverMile).cmp(rows[i].riverMile)<=0);
  assert.equal(orderBridges(d.bridges,{includeHistorical:true}).length,38);
  assert.equal(orderBridges(d.bridges,{query:'Morris'})[0].riverMile,'263.5');
  assert.equal(orderBridges(d.bridges,{query:'270.6'})[0].id,'il-eje');
  assert.equal(orderBridges(d.bridges,{query:'does not exist'}).length,0);
  assert.deepEqual(orderBridges(d.bridges,{direction:'down'}),rows.toReversed());
  const ties=orderBridges(d.bridges,{query:'Valley City bridge'});assert.equal(ties.length,2);assert.equal(ties[0].id,'il-valley-city-a');
});
test('owner locations and exact chart references preserve source differences with explicit pilot eligibility',()=>{
  const rows=directory().bridges, m=rows.find(b=>b.id==='il-morris'), e=rows.find(b=>b.id==='il-eje');
  assert.equal(m.riverMile,'263.5');assert.equal(m.derivedRiverMile,'263.4');assert.equal(m.mileStatus,'OWNER_CONFIRMED');assert.equal(m.mileConflict,true);
  assert.equal(m.selectedReference.consistency,'INTERNALLY_CONSISTENT');assert.equal(m.selectedReference.publishedClearanceFt,'50.4');
  assert.equal(e.selectedReference.consistency,'INTERNALLY_CONSISTENT');
  assert.equal(Q.parse(e.selectedReference.lowSteelElevationFt).sub(e.selectedReference.referenceSurface.elevationFt).cmp('61'),0);
  assert.equal(e.selectedReference.publishedClearanceFt,'61');assert.equal(e.selectedReference.lowSteelElevationFt,'543.5');
  assert.equal(m.selectedReference.pilotEstimateEnabled,true);assert.equal(e.selectedReference.pilotEstimateEnabled,true);
  assert.equal(e.selectedReference.gaugeReference.navd88Transform.offsetFt,'-0.21');
  const l=rows.find(b=>b.id==='il-abraham-lincoln');
  assert.equal(l.riverMile,'225.7');assert.equal(l.mileStatus,'OWNER_CONFIRMED');
  assert.equal(l.selectedReference.consistency,'INTERNALLY_CONSISTENT');
  assert.equal(Q.parse(l.selectedReference.lowSteelElevationFt).sub(l.selectedReference.referenceSurface.elevationFt).cmp('66.0'),0);
  assert.equal(l.selectedReference.pilotEstimateEnabled,true);
});
test('directory rejects duplicate IDs and miles beyond the inclusive 0–279 range',()=>{
  const copy=structuredClone(extension);copy.bridges[0].id=inventory.bridges[0].id;
  assert.throws(()=>buildDirectory(inventory,copy,[],manifest),/DUPLICATE_BRIDGE_ID/);
  copy.bridges[0].id='test-boundary';
  for(const mile of ['0','279']){copy.bridges[0].derivedRiverMile=mile;assert.doesNotThrow(()=>buildDirectory(inventory,copy,[],manifest));}
  for(const mile of ['-0.1','279.1']){copy.bridges[0].derivedRiverMile=mile;assert.throws(()=>buildDirectory(inventory,copy,[],manifest),/MILE_OUT_OF_SCOPE/);}
});
test('scope-extension evidence is intact and derives the added crossing mile exactly',async()=>{
  const body=await readFile(new URL(`../data/research/${extension.source.evidencePath}`,import.meta.url));
  assert.equal(createHash('sha256').update(body).digest('hex'),extension.source.evidenceSha256);
  for(const b of extension.bridges)assert.equal(Q.parse('327.2').sub(b.coastPilot.milesFromChicagoLock).cmp(b.derivedRiverMile),0);
  assert.match(body.toString(),/I-55 Bridges/);
});
