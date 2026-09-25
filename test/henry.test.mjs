import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { URLS, hash, parseExact, utc, evaluateHenry } from '../src/feeds/henry.js';
import { createHenryService } from '../src/henry-service.js';
import { makeServer } from '../server.mjs';
import { stableStringify } from '../src/exact.js';
const NOW = '2026-09-25T20:25:00.000Z';
const names = { stage:'usgs-latest', series:'usgs-series', forecast:'nwps-forecast', gauge:'nwps-gauge' };
const bodies = Object.fromEntries(await Promise.all(Object.entries(names).map(async ([k,n]) => [k, await readFile(new URL(`fixtures/henry/${n}.json`,import.meta.url),'utf8')])));
function snapshot() { return { sources: Object.fromEntries(Object.entries(bodies).map(([k,body]) => [k,{ url:URLS[k],body,sha256:hash(body),httpStatus:200,contentType:'application/json',receivedAt:NOW }])) }; }
function change(s,k,fn) { const d = JSON.parse(s.sources[k].body);fn(d);s.sources[k].body=JSON.stringify(d);s.sources[k].sha256=hash(s.sources[k].body); }
const result = s => evaluateHenry(s,NOW);

test('archived official Henry payload parses exact stage and independent station forecast', () => {
  const s=snapshot(),r=result(s);
  assert.equal(r.stage.valueFt,'16.78');assert.equal(r.stage.approvalStatus,'Provisional');
  assert.equal(r.stage.ageSeconds,2400);assert.equal(r.forecast.direction,'FALLING');
  assert.deepEqual(r.forecast.deltaFt,{numerator:'-3',denominator:'10',unit:'ft'});
  assert.equal(r.forecast.bridgeAssociationApproved,false);assert.equal(r.clearance.valueFt,null);
  assert.equal(parseExact('{"primary":16.780000000000001}').primary,'16.780000000000001');
  assert.deepEqual(result(s),result(s));
});
test('Henry lateness uses observation time, strict 24 hours, and flags delay independently', () => {
  const s=snapshot();
  for (const [date,late] of [['2026-09-26T19:45:00.000Z',false],['2026-09-26T19:45:00.001Z',true]]) {
    const r=evaluateHenry(s,date);assert.equal(r.stage.late,late);assert.equal(r.stage.delayed,true);assert.equal(r.clearance.valueFt,null);
  }
  s.sources.stage.receivedAt='2026-09-26T19:45:00.001Z';
  assert.equal(evaluateHenry(s,s.sources.stage.receivedAt).stage.late,true);
  assert.equal(utc('2026-09-25T13:45:00-06:00'),'2026-09-25T19:45:00.000Z');
  for (const t of ['2026-09-25 19:45:00','2026-02-30T19:45:00Z','2026-09-25T24:45:00Z']) assert.throws(()=>utc(t));
});
test('Henry parser rejects wrong series, mixed results, qualifiers, missing values and future observations', () => {
  for (const mutation of [p=>p.unit_of_measure='m',p=>p.parameter_code='00060',p=>p.statistic_id='00003',p=>p.time_series_id='different',p=>p.monitoring_location_id='USGS-00000000',p=>p.qualifier='Ice',p=>p.value=null,p=>p.value='-999999',p=>p.value='41',p=>p.approval_status='Unknown',p=>p.time='2026-09-25T21:00:00Z']) {
    const s=snapshot();change(s,'stage',d=>mutation(d.features[0].properties));assert.notEqual(result(s).stage.status,'AVAILABLE');assert.equal(result(s).clearance.valueFt,null);
  }
  const duplicate=snapshot();change(duplicate,'stage',d=>{d.features.push(structuredClone(d.features[0]));d.numberReturned=2;});assert.equal(result(duplicate).stage.status,'SOURCE_CONFLICT');
  const missing=snapshot();change(missing,'stage',d=>{d.features=[];d.numberReturned=0;});assert.equal(result(missing).stage.status,'OBSERVATION_MISSING');
  const partial=snapshot();change(partial,'stage',d=>d.links.push({rel:'next',href:'https://example.com'}));assert.equal(result(partial).stage.status,'INCOMPLETE_PAGE');
});
test('Henry metadata drift, corrupt payload and failed sources cannot turn into stage readings', () => {
  const s=snapshot();change(s,'series',d=>d.features.find(f=>f.properties.computation_period_identifier==='Points').properties.thresholds[0].Periods[0].ReferenceValue=50);
  assert.equal(result(s).stage.status,'METADATA_CHANGED');
  const c=snapshot();c.sources.stage.body+=' ';assert.equal(result(c).stage.status,'SOURCE_HASH_MISMATCH');
  const h=snapshot();h.sources.stage.httpStatus=429;assert.equal(result(h).stage.status,'SOURCE_UNAVAILABLE');
  assert.equal(result(h).forecast.status,'AVAILABLE');
});
test('Henry forecast rejects stale, wrong gauge, mixed runs, missing coverage and sentinels', () => {
  for (const [key,fn] of [['gauge',d=>d.usgsId='00000000'],['forecast',d=>d.issuedTime='2026-09-24T16:04:00Z'],['forecast',d=>d.primaryUnits='m'],['forecast',d=>d.data[0].primary=-9999],['forecast',d=>d.data[0].generatedTime='2026-09-25T16:11:00Z'],['forecast',d=>d.data=d.data.slice(2)],['forecast',d=>d.data.splice(2,3)]]) {
    const s=snapshot();change(s,key,fn);const r=result(s);assert.notEqual(r.forecast.status,'AVAILABLE');assert.equal(r.stage.status,'AVAILABLE');
  }
});
test('Henry forecast detects reversals within the window and exact deadband', () => {
  const s=snapshot();
  const make=values=>change(s,'forecast',d=>{d.data=values.map((primary,i)=>({primary,validTime:new Date(Date.parse(NOW)+i*21600000).toISOString(),generatedTime:'2026-09-25T16:10:20Z'}));});
  make([16,16.2,16.1,16,16]);assert.equal(result(s).forecast.direction,'VARIABLE');
  make([16,16.025,16.05,16.075,16.1]);assert.equal(result(s).forecast.direction,'STEADY');
});
async function setup(t) {
  const directory=await mkdtemp(join(tmpdir(),'henry-test-'));t.after(()=>rm(directory,{recursive:true,force:true}));return directory;
}
test('Henry service coalesces requests, persists snapshots, survives restart and labels failed-refresh history', async t => {
  const directory=await setup(t);let calls=0,failed=false,now=NOW;
  const fetchImpl=async url=>{calls++;if(failed)throw new Error('offline');const key=Object.keys(URLS).find(k=>URLS[k]===url);return new Response(bodies[key],{headers:{'content-type':'application/json'}});};
  const settings={directory,fetchImpl,clock:()=>now};const service=createHenryService(settings);
  const [a,b]=await Promise.all([service.get(),service.get()]);assert.equal(calls,4);assert.equal(a.receiptId,b.receiptId);
  const {receiptId,...body}=a;assert.equal(receiptId,`sha256:${hash(stableStringify(body))}`);
  assert.equal((await readdir(join(directory,'raw'))).length,4);
  assert.equal((await createHenryService(settings).get()).snapshotId,a.snapshotId);assert.equal(calls,4);
  failed=true;now='2026-09-26T20:25:00.000Z';const r=await service.get();
  assert.equal(r.result.stage.status,'SOURCE_UNAVAILABLE');assert.equal(r.result.historicalStage.valueFt,'16.78');
  assert.equal(r.result.historicalStage.status,'HISTORICAL_ONLY');assert.equal(r.result.historicalStage.late,true);
  assert.equal(r.result.historicalStage.receivedAt,NOW);assert.equal(r.result.clearance.valueFt,null);
  assert.equal((await readdir(join(directory,'snapshots'))).length,2);
});
test('Henry service rejects corrupt persisted snapshots', async t => {
  const directory=await setup(t);const settings={directory,clock:()=>NOW,fetchImpl:async url=>new Response(bodies[Object.keys(URLS).find(k=>URLS[k]===url)],{headers:{'content-type':'application/json'}})};
  const receipt=await createHenryService(settings).get();await writeFile(join(directory,'snapshots',`${receipt.snapshotId}.json`),'{}');
  await assert.rejects(()=>createHenryService(settings).get(),/STORAGE_HASH_MISMATCH/);
});
test('Henry HTTP endpoint returns an auditable stage-only record and protects storage files', async t => {
  const server=makeServer({henryService:{get:async()=>({result:result(snapshot())})}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const url=`http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(url+'/henry')).status,200);
  const r=await (await fetch(url+'/api/henry')).json();assert.equal(r.result.stage.valueFt,'16.78');assert.equal(r.result.clearance.valueFt,null);
  for(const p of ['/var/henry/current.json','/src/henry-service.js','/data/henry-feed-contract.json'])assert.equal((await fetch(url+p)).status,404);
});
test('Henry fetch pipeline quarantines HTTP errors, HTML bodies, oversized responses and timeout failures', async t => {
  for (const mode of ['http','html','oversize','timeout']) {
    const directory=await setup(t);
    const fetchImpl=async (url,{signal})=>{
      if(mode==='timeout') { await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,100);signal.addEventListener('abort',()=>{clearTimeout(timer);reject(signal.reason);},{once:true});});throw new Error('timeout'); }
      return new Response(mode==='oversize'?'x'.repeat(1048577):mode==='html'?'<html>error</html>':'{}',{status:mode==='http'?503:200,headers:{'content-type':mode==='html'?'text/html':'application/json'}});
    };
    const r=await createHenryService({directory,fetchImpl,clock:()=>NOW,timeoutMs:5}).get();
    assert.notEqual(r.result.stage.status,'AVAILABLE');assert.notEqual(r.result.forecast.status,'AVAILABLE');assert.equal(r.result.clearance.valueFt,null);
  }
});
test('Henry source cannot silently regress or replace equal-revision values between polls', () => {
  for(const [mutation,expected] of [[p=>p.time='2026-09-25T19:30:00Z','SOURCE_REGRESSED'],[p=>p.last_modified='2026-09-25T19:50:00Z','REVISION_REGRESSED'],[p=>p.value='16.77','REVISION_CONFLICT']]){
    const s=snapshot();s.previousAcceptedStage=result(s).stage;change(s,'stage',d=>mutation(d.features[0].properties));assert.equal(result(s).stage.status,expected);
  }
});
