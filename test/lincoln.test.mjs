import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { URLS, evaluateLincoln } from '../src/feeds/lincoln.js';
import { createLincolnService } from '../src/lincoln-service.js';
import { hash } from '../src/feeds/usgs-pilot.js';
import { makeServer } from '../server.mjs';
import { Q } from '../src/exact.js';
import { readFileSync } from 'node:fs';

const ncatReview=JSON.parse(readFileSync(new URL('../data/research/lincoln-ncat-api-review.json',import.meta.url),'utf8'));
test('NCAT research transcript preserves meter inputs, local error and the unresolved zero difference',()=>{
  assert.equal(ncatReview.input.zeroNgvd29Meters,'131.064');
  assert.equal(Q.parse(ncatReview.input.zeroNgvd29Ft).mul(ncatReview.input.metersPerFoot).cmp(ncatReview.input.zeroNgvd29Meters),0);
  assert.equal(ncatReview.responseFields.srcOrthoht,ncatReview.input.zeroNgvd29Meters);
  assert.equal(ncatReview.responseFields.heightUnits,'m');
  assert.equal(ncatReview.responseFields.vertconVersion,'3.0');
  assert.equal(ncatReview.responseFields.sigOrthoht,'0.053');
  const converted=Q.parse(ncatReview.responseFields.destOrthoht).div(ncatReview.input.metersPerFoot);
  assert.ok(converted.sub(ncatReview.derived.zeroNavd88FtApprox).cmp('-0.005')>0);
  assert.ok(converted.sub(ncatReview.derived.zeroNavd88FtApprox).cmp('0.005')<0);
  assert.ok(Q.parse(ncatReview.derived.ownerReportedZeroNavd88Ft).cmp(converted)>0);
  assert.match(ncatReview.captureStatus,/RAW_BYTES_NOT_ARCHIVED/);
});

const now = '2026-09-27T18:30:00.000Z';
const gauge = {lid:'LSLI2',usgsId:'411925089063901',name:'Illinois River near La Salle',
  wfo:{abbreviation:'LOT'},pedts:{observed:'HGIRG',forecast:'HGIFF'},
  datums:{vertical:{value:[{abbrev:'NGVD29',value:430}]}}};
const observed = {pedts:'HGIRG',wfo:'LOT',timeZone:'CST6CDT',primaryName:'Stage',primaryUnits:'ft',
  issuedTime:'2026-09-27T17:45:00Z',data:[
    {validTime:'2026-09-27T17:30:00Z',generatedTime:'2026-09-27T18:10:07Z',primary:14.10},
    {validTime:'2026-09-27T17:45:00Z',generatedTime:'2026-09-27T18:10:07Z',primary:14.11}]};
const forecast = {pedts:'HGIFF',wfo:'LOT',timeZone:'CST6CDT',primaryName:'Stage',primaryUnits:'ft',
  issuedTime:'2026-09-27T16:15:00Z',data:Array.from({length:7},(_,i)=>({
    validTime:new Date(Date.parse('2026-09-27T18:00:00Z')+i*21600000).toISOString(),
    generatedTime:'2026-09-27T16:25:12Z',primary:[14.1,13.9,13.7,13.5,13.3,13.1,12.9][i]}))};
function snapshot() {
  return {sources:Object.fromEntries(Object.entries({gauge,stage:observed,forecast}).map(([key,doc])=>{
    const body=JSON.stringify(doc);return [key,{url:URLS[key],body,sha256:hash(body),httpStatus:200,
      contentType:'application/json',receivedAt:now}];
  }))};
}
function change(s,key,fn) {const doc=JSON.parse(s.sources[key].body);fn(doc);
  s.sources[key].body=JSON.stringify(doc);s.sources[key].sha256=hash(s.sources[key].body);}

test('owner direct-water assumption cannot resolve conflicting gauge-zero conversions',()=>{
  const r=evaluateLincoln(snapshot(),now);
  assert.equal(r.stage.status,'AVAILABLE');assert.equal(r.stage.valueFt,'14.11');
  assert.equal(r.stage.gaugeZeroFt,'430');assert.equal(r.stage.verticalDatum,'NGVD29');
  assert.equal(r.stage.late,false);assert.equal(r.forecast.status,'AVAILABLE');
  assert.equal(r.forecast.direction,'FALLING');assert.equal(r.forecast.bridgeAssociationApproved,false);
  assert.equal(r.clearance.status,'DATUM_CONVERSION_REVIEW');assert.equal(r.clearance.valueFt,null);
  assert.equal(r.bridgeReference.lowSteelElevationFt,'505.8');
  assert.equal(r.bridgeReference.referenceSurface.elevationFt,'439.8');
  assert.equal(r.bridgeReference.publishedClearanceFt,'66.0');
  assert.equal(r.bridgeReference.consistency,'INTERNALLY_CONSISTENT');
  assert.equal(r.bridgeReference.gaugeCandidate.ownerReportedConversion.convertedZeroNavd88Ft,'429.88');
  assert.equal(r.bridgeReference.gaugeCandidate.ownerReportedConversion.verified,false);
  assert.equal(r.bridgeReference.gaugeAssociationApproved,true);
  assert.equal(r.bridgeReference.bridgeWaterModel.offsetFt,'0');
  assert.equal(r.bridgeReference.bridgeWaterModel.errorBoundVerified,false);
  assert.equal(r.bridgeReference.modelStatus,'OWNER_ASSUMPTION_RECORDED');
  assert.equal(Q.parse('429.88').add('10.20').sub(r.bridgeReference.referenceSurface.elevationFt).cmp('0.28'),0);
  assert.equal(r.clearance.productionEligible,false);assert.deepEqual(evaluateLincoln(snapshot(),now),r);
});
test('owner-reported converter value and optimistic flags cannot enable a bridge estimate',()=>{
  const s=snapshot();s.bridgeReference=structuredClone(evaluateLincoln(s,now).bridgeReference);
  s.bridgeReference.pilotEstimateEnabled=true;
  s.bridgeReference.gaugeAssociationApproved=true;
  s.bridgeReference.gaugeCandidate.ownerReportedConversion.verified=true;
  const r=evaluateLincoln(s,now);
  assert.equal(r.stage.status,'AVAILABLE');assert.equal(r.clearance.status,'DATUM_CONVERSION_REVIEW');
  assert.equal(r.clearance.valueFt,null);
});
test('changed bridge-water association blocks even the owner assumption',()=>{
  for (const edit of [r=>r.bridgeWaterModel.offsetFt='0.1',r=>r.bridgeWaterModel.validated=true,
    r=>r.bridgeWaterModel.errorBoundVerified=true,r=>r.gaugeCandidate.gaugeId='OTHER']) {
    const s=snapshot();s.bridgeReference=structuredClone(evaluateLincoln(s,now).bridgeReference);edit(s.bridgeReference);
    const r=evaluateLincoln(s,now);
    assert.equal(r.bridgeReference.modelStatus,'MODEL_UNRESOLVED');
    assert.equal(r.clearance.status,'MODEL_UNRESOLVED');assert.equal(r.clearance.valueFt,null);
  }
});
test('altered chart arithmetic or datum blocks even the reference consistency label',()=>{
  for (const edit of [r=>r.lowSteelElevationFt='505.7',r=>r.verticalDatum='NGVD29',r=>r.bridgeId='OTHER']) {
    const s=snapshot();s.bridgeReference=structuredClone(evaluateLincoln(s,now).bridgeReference);edit(s.bridgeReference);
    const r=evaluateLincoln(s,now);
    assert.notEqual(r.bridgeReference.consistency,'INTERNALLY_CONSISTENT');
    assert.equal(r.clearance.valueFt,null);
  }
});
test('late is strictly after 24 hours, and does not turn stage into current bridge clearance',()=>{
  for (const [elapsed,late] of [[86400000,false],[86400001,true]]) {
    const asOf=new Date(Date.parse('2026-09-27T17:45:00Z')+elapsed).toISOString();
    const r=evaluateLincoln(snapshot(),asOf);
    assert.equal(r.stage.late,late);assert.equal(r.stage.observedAt,'2026-09-27T17:45:00.000Z');
    assert.equal(r.forecast.status,'FORECAST_STALE');assert.equal(r.clearance.valueFt,null);
  }
});
test('wrong source identity, datum zero, series, time and integrity reject the observation',()=>{
  for (const [key,edit,status] of [
    ['gauge',d=>d.lid='OTHER','GAUGE_IDENTITY_CHANGED'],
    ['gauge',d=>d.datums.vertical.value[0].value=429.5,'GAUGE_ZERO_CHANGED'],
    ['stage',d=>d.pedts='HTIRG','WRONG_SERIES'],
    ['stage',d=>d.primaryUnits='m','WRONG_SERIES'],
    ['stage',d=>d.data[1].primary=-9999,'OUT_OF_RANGE'],
    ['stage',d=>d.data.push(d.data[1]),'SOURCE_CONFLICT'],
    ['stage',d=>d.data[1].generatedTime='2026-09-28T00:00:00Z','FUTURE_OBSERVATION']
  ]) { const s=snapshot();change(s,key,edit);const r=evaluateLincoln(s,now);
    assert.equal(r.stage.status,status);assert.equal(r.clearance.valueFt,null); }
  const s=snapshot();s.sources.stage.body+=' ';
  assert.equal(evaluateLincoln(s,now).stage.status,'SOURCE_HASH_MISMATCH');
  const other=snapshot();other.previousAcceptedStage={...evaluateLincoln(other,now).stage,valueFt:'15'};
  assert.equal(evaluateLincoln(other,now).stage.status,'REVISION_CONFLICT');
});
test('forecast rejects wrong run and gaps independently of current observation',()=>{
  for (const [edit,status] of [
    [d=>d.wfo='ILX','FORECAST_SCHEMA_CHANGED'],
    [d=>d.data[1].generatedTime='2026-09-27T16:26:00Z','FORECAST_MIXED_RUN'],
    [d=>d.data.splice(2,1),'FORECAST_GAP'],
    [d=>d.data[1].primary=999,'OUT_OF_RANGE']
  ]) {const s=snapshot();change(s,'forecast',edit);const r=evaluateLincoln(s,now);
    assert.equal(r.forecast.status,status);assert.equal(r.stage.status,'AVAILABLE');assert.equal(r.clearance.valueFt,null);}
});
test('La Salle service archives inputs and retains only historical stage after outage',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'lincoln-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const fixture=snapshot();let clock=now,fail=false,calls=0;
  const service=createLincolnService({directory:dir,clock:()=>clock,fetchImpl:async url=>{
    calls++;if(fail)throw Error('offline');const s=Object.values(fixture.sources).find(s=>s.url===url);
    assert.ok(s);return new Response(s.body,{headers:{'content-type':'application/json'}});
  }});
  const [a,b]=await Promise.all([service.get(),service.get()]);
  assert.equal(a.receiptId,b.receiptId);assert.equal(calls,3);
  assert.deepEqual(evaluateLincoln(a.input,a.result.asOf),a.result);
  assert.equal((await readdir(join(dir,'raw'))).length,3);
  fail=true;clock='2026-09-28T18:30:00.000Z';const r=await service.get();
  assert.equal(r.result.stage.status,'SOURCE_UNAVAILABLE');
  assert.equal(r.result.historicalStage.status,'HISTORICAL_ONLY');
  assert.equal(r.result.historicalStage.late,true);assert.equal(r.result.clearance.valueFt,null);
});
test('HTTP exposes Lincoln audit receipt and keeps source files private',async t=>{
  const r=evaluateLincoln(snapshot(),now);
  const server=makeServer({lincolnService:{get:async()=>({result:r,receiptId:'fixture'})}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`;
  assert.equal((await (await fetch(base+'/api/lincoln')).json()).result.stage.valueFt,'14.11');
  assert.equal((await (await fetch(base+'/api/bridges')).json()).bridges.find(b=>b.id==='il-abraham-lincoln').riverMile,'225.7');
  assert.equal((await fetch(base+'/var/lincoln/current.json')).status,404);
});
