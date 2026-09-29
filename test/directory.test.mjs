import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { buildDirectory, orderBridges } from '../src/directory.js';
import { Q } from '../src/exact.js';
const read = async p => JSON.parse(await readFile(new URL(`../${p}`,import.meta.url),'utf8'));
const [inventory,extension,henry,morris,eje,lincoln,central,lasalle,peru,utica,springValley,hennepin,manifest,coverage] = await Promise.all(['data/research/bridge-inventory.json','data/research/scope-extension.json','data/henry-bridge-reference.json','data/morris-bridge-reference.json','data/eje-bridge-reference.json','data/lincoln-bridge-reference.json','data/il-illinois-central-lasalle-bridge-reference.json','data/il-lasalle-bridge-reference.json','data/il-peru-bridge-reference.json','data/il-utica-bridge-reference.json','data/il-spring-valley-bridge-reference.json','data/il-hennepin-i180-bridge-reference.json','data/research/sources.json','data/bridge-coverage-plan.json'].map(read));
const references=[henry,morris,eje,lincoln,central,lasalle,peru,utica,springValley,hennepin];
const directory=()=>buildDirectory(inventory,extension,references,manifest,coverage);
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
  for (const [id,mile,steel,clearance] of [['il-illinois-central-lasalle','225.5','502.0','62.2'],['il-lasalle','224.7','503.8','64.0'],['il-peru','222.8','504.3','64.5']]) {
    const b=rows.find(b=>b.id===id);
    assert.equal(b.riverMile,mile);assert.equal(b.selectedReference.lowSteelElevationFt,steel);
    assert.equal(b.selectedReference.publishedClearanceFt,clearance);
    assert.equal(b.selectedReference.consistency,'INTERNALLY_CONSISTENT');
    assert.equal(b.coverage.gaugeId,'LSLI2');
    assert.equal(b.selectedReference.historicalAlternatives.some(a=>a.sourceId==='noaa-cp6-20260920'),false);
    assert.equal(b.coverage.researchFlags.includes('UNRECONCILED_PUBLISHED_CLEARANCE_DIFFERENCE'),false);
  }
  for (const [id,mile,steel,pool,clearance,phase] of [['il-utica','229.6','505.6','439.8','65.8','PILOT'],['il-spring-valley','218.4','502.6','439.7','62.9','PILOT'],['il-hennepin-i180','207.8','499.7','439.8','59.9','PILOT']]) {
    const b=rows.find(b=>b.id===id);
    assert.equal(b.riverMile,mile);assert.equal(b.selectedReference.lowSteelElevationFt,steel);
    assert.equal(b.selectedReference.referenceSurface.elevationFt,pool);
    assert.equal(b.selectedReference.publishedClearanceFt,clearance);
    assert.equal(b.selectedReference.consistency,'INTERNALLY_CONSISTENT');
    assert.equal(b.coverage.phase,phase);
    assert.equal(b.coverage.researchFlags.includes('UNRECONCILED_PUBLISHED_CLEARANCE_DIFFERENCE'),false);
    assert.equal(b.coverage.gaugeId,'LSLI2');
  }
  assert.equal(rows.find(b=>b.id==='il-spring-valley').name,'Illinois Valley Veterans Memorial Bridge');
  for(const id of ['il-spring-valley','il-hennepin-i180'])
    assert.ok(rows.find(b=>b.id===id).coverage.blockers.includes('CORPS_TABLE_CROSSCHECK_UNRESOLVED'));
});
test('directory rejects duplicate IDs and miles beyond the inclusive 0–279 range',()=>{
  const copy=structuredClone(extension);copy.bridges[0].id=inventory.bridges[0].id;
  assert.throws(()=>buildDirectory(inventory,copy,references,manifest,coverage),/DUPLICATE_BRIDGE_ID/);
  copy.bridges[0].id='test-boundary';
  const c=structuredClone(coverage);c.entries.find(e=>e.bridgeId==='il-i55-desplaines').bridgeId='test-boundary';
  for(const mile of ['0','279']){copy.bridges[0].derivedRiverMile=mile;assert.doesNotThrow(()=>buildDirectory(inventory,copy,references,manifest,c));}
  for(const mile of ['-0.1','279.1']){copy.bridges[0].derivedRiverMile=mile;assert.throws(()=>buildDirectory(inventory,copy,references,manifest,c),/MILE_OUT_OF_SCOPE/);}
});
test('every source crossing has an explicit phase and research values cannot become clearance inputs',()=>{
  const d=directory();assert.equal(d.bridges.length,38);assert.equal(d.pilots.length,10);
  assert.equal(d.coveragePolicyVersion,'coverage-2026-09-29-2');
  for(const b of d.bridges){
    assert.equal(b.coverage.productionEligible,false);
    if(b.coverage.phase==='REFERENCE_PENDING'){
      assert.equal(b.selectedReference,null);assert.equal(b.coverage.gaugeId,null);
      assert.equal(b.coverage.estimateEligible,false);
      assert.ok(b.coverage.blockers.includes('SELECTED_NAVD88_REFERENCE_REQUIRED'));
    }
  }
  assert.equal(d.bridges.filter(b=>b.coverage.phase==='REFERENCE_PENDING').length,27);
  assert.equal(d.bridges.find(b=>b.id==='il-atsf-removed').coverage.phase,'HISTORICAL');
  assert.ok(d.bridges.find(b=>b.id==='il-peoria-pekin-rr').coverage.blockers.includes('FULLY_OPEN_GEOMETRY_REQUIRED'));
  assert.match(d.bridges.find(b=>b.id==='il-mcclugage').coverage.nextEvidence,/physical channel span/);
  assert.deepEqual(d.pilots.map(p=>p.bridgeId).sort(),['il-abraham-lincoln','il-eje','il-hennepin-i180','il-henry','il-illinois-central-lasalle','il-lasalle','il-morris','il-peru','il-spring-valley','il-utica']);
});
test('activation plan rejects missing, duplicate and unauthorized gauge bindings',()=>{
  const run=(edit,refs=references)=>{const p=structuredClone(coverage);edit(p);return ()=>buildDirectory(inventory,extension,refs,manifest,p);};
  assert.throws(run(p=>p.entries.pop()),/COVERAGE_INCOMPLETE/);
  assert.throws(run(p=>p.entries.push(structuredClone(p.entries[0]))),/DUPLICATE_COVERAGE_BRIDGE/);
  assert.throws(run(p=>p.entries[0].bridgeId='made-up'),/UNKNOWN_COVERAGE_BRIDGE/);
  assert.throws(run(p=>{p.entries.find(x=>x.bridgeId==='il-sr26-unresolved').gaugeId='LSLI2';}),/UNAPPROVED_GAUGE_BINDING/);
  assert.throws(run(p=>{const e=p.entries.find(x=>x.bridgeId==='il-sr26-unresolved');Object.assign(e,{phase:'PILOT',gaugeId:'LSLI2',endpoint:'/api/sr26',stageLabel:'Hennepin'});}),/COVERAGE_REFERENCE_CONFLICT/);
  assert.throws(run(p=>{p.entries.find(x=>x.bridgeId==='il-henry').endpoint='/api/eje';}),/COVERAGE_ENDPOINT_CONFLICT/);
  assert.throws(run(()=>{},[henry,morris,eje]),/COVERAGE_REFERENCE_CONFLICT/);
});
test('Corps table cross-check records chart mismatch and exact same-water proxy without calibrating an offset',async()=>{
  const comparison=await read('data/research/lasalle-corps-clearance-table-2026-09-28.json');
  const rows=new Map(comparison.rows.map(r=>[r.id,r]));
  assert.equal(comparison.source.gaugeMappingVisible,false);
  assert.equal(comparison.source.capturedTime,'UNKNOWN');
  const proxy=Q.parse(rows.get('il-lasalle').selectedChartLowSteelNavd88).sub(rows.get('il-lasalle').corpsCurrentClearance);
  assert.equal(proxy.cmp(comparison.comparison.laSalleProxyWaterNavd88Ft),0);
  for(const [id,caseData] of Object.entries(comparison.comparison.predictedFromSameWater)) {
    const predicted=Q.parse(rows.get(id).selectedChartLowSteelNavd88).sub(proxy);
    assert.equal(predicted.cmp(caseData.valueFt),0);
    assert.equal(predicted.sub(rows.get(id).corpsCurrentClearance).cmp(caseData.minusCorpsCurrentFt),0);
    if (['il-spring-valley','il-hennepin-i180'].includes(id)) {
      const crosscheck=directory().bridges.find(b=>b.id===id).selectedReference.corpsCalculatorCrosscheck;
      assert.equal(crosscheck.recordId,comparison.id);
      assert.equal(crosscheck.screenshotSha256,comparison.source.sha256);
      assert.equal(crosscheck.tableListedClearanceFt,rows.get(id).corpsLowWaterClearance);
      assert.equal(crosscheck.tableCurrentClearanceFt,rows.get(id).corpsCurrentClearance);
      assert.equal(crosscheck.sameWaterProxyClearanceFt,caseData.valueFt);
      assert.equal(crosscheck.proxyMinusTableCurrentFt,caseData.minusCorpsCurrentFt);
    }
  }
  assert.equal(Q.parse(rows.get('il-spring-valley').selectedChartClearance).sub(rows.get('il-spring-valley').corpsLowWaterClearance).cmp('1.30'),0);
});
test('scope-extension evidence is intact and derives the added crossing mile exactly',async()=>{
  const body=await readFile(new URL(`../data/research/${extension.source.evidencePath}`,import.meta.url));
  assert.equal(createHash('sha256').update(body).digest('hex'),extension.source.evidenceSha256);
  for(const b of extension.bridges)assert.equal(Q.parse('327.2').sub(b.coastPilot.milesFromChicagoLock).cmp(b.derivedRiverMile),0);
  assert.match(body.toString(),/I-55 Bridges/);
});
