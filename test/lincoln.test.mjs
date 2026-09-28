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
const ncatRaw=readFileSync(new URL('../data/research/lincoln-ncat-raw-response.json',import.meta.url),'utf8');
test('NCAT archive preserves meter inputs, local error and the separate owner cross-check',()=>{
  assert.equal(hash(ncatRaw),ncatReview.rawResponseSha256);
  assert.equal(ncatReview.input.zeroNgvd29Meters,'131.064');
  assert.equal(Q.parse(ncatReview.input.zeroNgvd29Ft).mul(ncatReview.input.metersPerFoot).cmp(ncatReview.input.zeroNgvd29Meters),0);
  assert.equal(ncatReview.responseFields.srcOrthoht,ncatReview.input.zeroNgvd29Meters);
  assert.equal(ncatReview.responseFields.heightUnits,'m');
  assert.equal(ncatReview.responseFields.vertconVersion,'3.0');
  assert.equal(ncatReview.responseFields.sigOrthoht,'0.053');
  const converted=Q.parse(ncatReview.responseFields.destOrthoht).div(ncatReview.input.metersPerFoot);
  assert.ok(converted.sub(ncatReview.derived.zeroNavd88FtApprox).cmp('-0.005')>0);
  assert.ok(converted.sub(ncatReview.derived.zeroNavd88FtApprox).cmp('0.005')<0);
  assert.equal(ncatReview.derived.ownerScreenshotZeroNavd88Ft,'429.790');
  assert.ok(Q.parse(ncatReview.derived.ownerScreenshotZeroNavd88Ft).cmp(converted)>0);
  assert.equal(ncatReview.ownerCrosscheck.screenshotNotInPublicRepository,true);
  assert.notEqual(ncatReview.ownerCrosscheck.latitude,ncatReview.input.latitude);
  assert.equal(ncatReview.captureStatus,'RAW_RESPONSE_ARCHIVED_AFTER_REPEAT_HTTP_200');
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

test('Lincoln uses NCAT gauge-location zero and owner direct-water assumption for an unverified pilot',()=>{
  const r=evaluateLincoln(snapshot(),now);
  assert.equal(r.stage.status,'AVAILABLE');assert.equal(r.stage.valueFt,'14.11');
  assert.equal(r.stage.gaugeZeroFt,'430');assert.equal(r.stage.verticalDatum,'NGVD29');
  assert.equal(r.stage.late,false);assert.equal(r.forecast.status,'AVAILABLE');
  assert.equal(r.forecast.direction,'FALLING');assert.equal(r.forecast.bridgeAssociationApproved,false);
  assert.equal(r.clearance.status,'ESTIMATED');assert.equal(r.clearance.valueFt,'61.9');
  assert.equal(r.clearance.trace.ncatRawResponseSha256,ncatReview.rawResponseSha256);
  assert.equal(r.clearance.trace.ncatZeroNavd88Meters,'130.997');
  assert.equal(r.clearance.trace.bridgeMinusGaugeFt,'0');
  assert.equal(r.clearance.accuracyStatus,'UNVERIFIED');
  assert.equal(r.bridgeReference.lowSteelElevationFt,'505.8');
  assert.equal(r.bridgeReference.referenceSurface.elevationFt,'439.8');
  assert.equal(r.bridgeReference.publishedClearanceFt,'66.0');
  assert.equal(r.bridgeReference.consistency,'INTERNALLY_CONSISTENT');
  assert.equal(r.bridgeReference.gaugeCandidate.ownerReportedConversion.convertedZeroNavd88Ft,'429.88');
  assert.equal(r.bridgeReference.gaugeCandidate.ownerReportedConversion.supersededByOwnerScreenshot,true);
  assert.equal(r.bridgeReference.gaugeAssociationApproved,true);
  assert.equal(r.bridgeReference.bridgeWaterModel.offsetFt,'0');
  assert.equal(r.bridgeReference.bridgeWaterModel.errorBoundVerified,false);
  assert.equal(r.bridgeReference.modelStatus,'OWNER_ASSUMPTION_RECORDED');
  assert.equal(r.bridgeReference.gaugeCandidate.ownerNcatCrosscheck.zeroNavd88Ft,'429.790');
  assert.equal(Q.parse('130.997').div('0.3048').add('10.20').sub(r.bridgeReference.referenceSurface.elevationFt).floor(3),'0.180');
  assert.equal(r.clearance.productionEligible,false);assert.deepEqual(evaluateLincoln(snapshot(),now),r);
});
test('a one-foot stage rise reduces the unrounded Lincoln estimate by exactly one foot',()=>{
  const before=evaluateLincoln(snapshot(),now);
  const s=snapshot();change(s,'stage',d=>d.data[1].primary=15.11);
  const after=evaluateLincoln(s,now);
  assert.equal(after.clearance.status,'ESTIMATED');assert.equal(after.clearance.valueFt,'60.9');
  const q=o=>new Q(BigInt(o.numerator),BigInt(o.denominator));
  assert.equal(q(before.clearance.trace.unroundedClearanceFt).sub(q(after.clearance.trace.unroundedClearanceFt)).cmp('1'),0);
});
test('unapproved or altered NCAT conversion cannot produce a bridge estimate',()=>{
  for(const edit of [r=>r.pilotEstimateEnabled=false,r=>r.gaugeCandidate.ncatApiCandidate.active=false,
    r=>r.gaugeCandidate.ncatApiCandidate.rawResponseSha256='0'.repeat(64),
    r=>r.gaugeCandidate.ncatApiCandidate.outputZeroNavd88Meters='131.000']){
    const s=snapshot();s.bridgeReference=structuredClone(evaluateLincoln(s,now).bridgeReference);edit(s.bridgeReference);
    const r=evaluateLincoln(s,now);assert.equal(r.clearance.valueFt,null);
  }
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
test('late is strictly after 24 hours and estimates retain observation-time labeling',()=>{
  for (const [elapsed,late] of [[86400000,false],[86400001,true]]) {
    const asOf=new Date(Date.parse('2026-09-27T17:45:00Z')+elapsed).toISOString();
    const r=evaluateLincoln(snapshot(),asOf);
    assert.equal(r.stage.late,late);assert.equal(r.stage.observedAt,'2026-09-27T17:45:00.000Z');
    assert.equal(r.forecast.status,'FORECAST_STALE');assert.equal(r.clearance.status,'ESTIMATED');
    assert.equal(r.clearance.validAt,r.stage.observedAt);
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
    assert.equal(r.forecast.status,status);assert.equal(r.stage.status,'AVAILABLE');assert.equal(r.clearance.status,'ESTIMATED');}
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
