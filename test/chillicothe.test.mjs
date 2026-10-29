import test from 'node:test';
import { gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Q } from '../src/exact.js';
import { hash } from '../src/feeds/usgs-pilot.js';
import { URLS, evaluateChillicothe, TRANSFORM_EVIDENCE } from '../src/feeds/chillicothe.js';
import { evaluateHenry, evaluateLacon, URLS as HENRY_URLS } from '../src/feeds/henry.js';
import { createChillicotheService } from '../src/chillicothe-service.js';
import { createHenryService } from '../src/henry-service.js';
import { createLaconService } from '../src/lacon-service.js';
import { makeServer } from '../server.mjs';

const now='2026-09-30T12:40:00.000Z';
const bodies=Object.fromEntries(Object.keys(URLS).map(k=>[k,k==='stage'
  ? gunzipSync(readFileSync(new URL('fixtures/chillicothe/stage.json.gz',import.meta.url))).toString('utf8')
  : readFileSync(new URL(`fixtures/chillicothe/${k}.json`,import.meta.url),'utf8')]));
const make=(bodies,urls,receivedAt)=>({sources:Object.fromEntries(Object.entries(bodies).map(([k,body])=>[k,
  {url:urls[k],body,sha256:hash(body),httpStatus:200,contentType:'application/json',receivedAt}]))});
const snapshot=()=>make(bodies,URLS,now);
function change(s,key,fn) {const d=JSON.parse(s.sources[key].body);fn(d);const body=JSON.stringify(d);Object.assign(s.sources[key],{body,sha256:hash(body)});}
const rational=r=>new Q(BigInt(r.numerator),BigInt(r.denominator));

test('Chillicothe official capture uses absolute elevation and a locally pinned exact NCAT conversion',()=>{
  const s=snapshot(),r=evaluateChillicothe(s,now);
  assert.equal(r.stage.status,'AVAILABLE');assert.equal(r.stage.valueFt,'441.11');
  assert.equal(r.stage.valueKind,'ABSOLUTE_ELEVATION');assert.equal(r.stage.gaugeZeroAdded,false);
  assert.equal(r.clearance.valueFt,'57.6');assert.equal(r.clearance.productionEligible,false);
  assert.equal(r.clearance.pocRange.lowerFt,'54.6');assert.equal(r.clearance.pocRange.measuredErrorBound,false);
  assert.equal(r.forecast.status,'NO_VERIFIED_FORECAST');
  const offset=Q.parse('-0.075').div('0.3048'),water=Q.parse('441.11').add(offset);
  assert.equal(rational(r.clearance.trace.waterElevationNavd88Ft).cmp(water),0);
  assert.equal(rational(r.clearance.trace.unroundedClearanceFt).cmp(Q.parse('498.5').sub(water)),0);
  assert.equal(hash(TRANSFORM_EVIDENCE.rawBody),TRANSFORM_EVIDENCE.review.rawResponseSha256);
  assert.deepEqual(evaluateChillicothe(s,now),r);
  change(s,'stage',d=>d.data.at(-1).primary=442.11);
  const next=evaluateChillicothe(s,now);
  assert.equal(rational(r.clearance.trace.unroundedClearanceFt).sub(rational(next.clearance.trace.unroundedClearanceFt)).cmp('1'),0);
});
test('historical sentinels do not replace latest observations, and a missing latest reading blocks clearance',()=>{
  const s=snapshot();assert.ok(JSON.parse(s.sources.stage.body).data.some(p=>p.primary===-9999));
  change(s,'stage',d=>d.data.at(-1).primary=-9999);
  const r=evaluateChillicothe(s,now);assert.equal(r.stage.status,'OUT_OF_RANGE');assert.equal(r.clearance.valueFt,null);
  const empty=snapshot();change(empty,'stage',d=>d.data=[]);
  assert.equal(evaluateChillicothe(empty,now).stage.status,'OBSERVATION_MISSING');
});
test('Chillicothe rejects changed location, zero, datum, units, ordering and future timestamps',()=>{
  for(const [key,edit,code] of [
    ['gauge',d=>d.latitude=41,'GAUGE_LOCATION_CHANGED'],
    ['gauge',d=>d.datums.vertical.value[0].abbrev='NAVD88','GAUGE_ZERO_CHANGED'],
    ['gauge',d=>d.datums.vertical.value[0].value=400,'GAUGE_ZERO_CHANGED'],
    ['stage',d=>d.primaryUnits='m','WRONG_SERIES'],
    ['stage',d=>d.data.push(d.data.at(-1)),'SOURCE_CONFLICT'],
    ['stage',d=>d.data.at(-1).validTime='2026-10-01T12:00:00Z','FUTURE_OBSERVATION']
  ]) {const s=snapshot();change(s,key,edit);const r=evaluateChillicothe(s,now);assert.equal(r.stage.status,code);assert.equal(r.clearance.valueFt,null);}
  const s=snapshot();s.sources.stage.body+=' ';
  assert.equal(evaluateChillicothe(s,now).stage.status,'SOURCE_HASH_MISMATCH');
});
test('altered NCAT evidence or bridge association blocks estimates without hiding gauge observations',()=>{
  for(const edit of [s=>s.datumTransformEvidence.rawBody+=' ',s=>s.datumTransformEvidence.review.input.latitude='41',
    s=>s.bridgeReference.gaugeReference.navd88Transform.offsetMeters='-0.03',s=>s.bridgeReference.bridgeWaterModel.gaugeId='HNYI2',
    s=>s.bridgeReference.lowSteelElevationFt='500',s=>s.bridgeReference.pilotEstimateEnabled=false]) {
    const s=snapshot(),base=evaluateChillicothe(s,now);
    s.datumTransformEvidence=structuredClone(TRANSFORM_EVIDENCE);s.bridgeReference=structuredClone(base.bridgeReference);edit(s);
    const r=evaluateChillicothe(s,now);assert.equal(r.stage.status,'AVAILABLE');assert.equal(r.clearance.valueFt,null);
  }
});
test('strict late boundary and observation/regression rules survive repeat polls',()=>{
  const s=snapshot(),base=evaluateChillicothe(s,now);
  for(const [elapsed,late] of [[86400000,false],[86400001,true]]) {
    const r=evaluateChillicothe(s,new Date(Date.parse(base.stage.observedAt)+elapsed).toISOString());
    assert.equal(r.stage.late,late);assert.equal(r.clearance.historical,true);assert.equal(r.clearance.validAt,base.stage.observedAt);
  }
  s.previousAcceptedStage={...base.stage,valueFt:'442'};
  assert.equal(evaluateChillicothe(s,now).stage.status,'REVISION_CONFLICT');
  s.previousAcceptedStage={...base.stage,observedAt:'2026-09-30T12:15:00Z'};
  assert.equal(evaluateChillicothe(s,now).stage.status,'SOURCE_REGRESSED');
  const f=snapshot();change(f,'forecast',d=>d.pedts='HGIFF');
  const r=evaluateChillicothe(f,now);assert.equal(r.forecast.status,'FORECAST_CONFIGURATION_CHANGED');assert.equal(r.clearance.status,'ESTIMATED');
});
test('Chillicothe service archives transform evidence, replays receipts and withholds clearance on outage',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'chillicothe-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  let calls=0,fail=false,clock=now;
  const service=createChillicotheService({directory:dir,clock:()=>clock,fetchImpl:async url=>{
    calls++;if(fail)throw Error('offline');const k=Object.keys(URLS).find(k=>URLS[k]===url);
    return new Response(bodies[k],{headers:{'content-type':'application/json'}});
  }});
  const [a,b]=await Promise.all([service.get(),service.get()]);
  assert.equal(calls,3);assert.equal(a.receiptId,b.receiptId);
  assert.equal(a.input.datumTransformEvidence.rawBody,TRANSFORM_EVIDENCE.rawBody);
  assert.deepEqual(evaluateChillicothe(a.input,a.result.asOf),a.result);
  fail=true;clock='2026-10-01T13:00:00.000Z';const r=await service.get();
  assert.equal(r.result.clearance.valueFt,null);assert.equal(r.result.historicalStage.status,'HISTORICAL_ONLY');assert.equal(r.result.historicalStage.late,true);
  const server=makeServer({chillicotheService:{get:async()=>a}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const url=`http://127.0.0.1:${server.address().port}`;
  assert.equal((await(await fetch(url+'/api/chillicothe-rr')).json()).receiptId,a.receiptId);
});
test('Lacon reuses Henry snapshot and stage but calculates its own chart low steel with a distinct receipt',async t=>{
  const receivedAt='2026-09-25T20:25:00.000Z';
  const names={stage:'usgs-latest',series:'usgs-series',forecast:'nwps-forecast',gauge:'nwps-gauge'};
  const hb=Object.fromEntries(Object.entries(names).map(([k,n])=>[k,readFileSync(new URL(`fixtures/henry/${n}.json`,import.meta.url),'utf8')]));
  const s=make(hb,HENRY_URLS,receivedAt),h=evaluateHenry(s,receivedAt),l=evaluateLacon(s,receivedAt);
  assert.deepEqual(l.stage,h.stage);assert.deepEqual(l.forecast,h.forecast);
  assert.equal(l.clearance.valueFt,'56.2');
  assert.equal(rational(h.clearance.trace.unroundedClearanceFt).sub(rational(l.clearance.trace.unroundedClearanceFt)).cmp('0.7'),0);
  const dir=await mkdtemp(join(tmpdir(),'lacon-'));t.after(()=>rm(dir,{recursive:true,force:true}));let calls=0;
  const hs=createHenryService({directory:dir,clock:()=>receivedAt,fetchImpl:async url=>{
    calls++;const key=Object.keys(HENRY_URLS).find(k=>HENRY_URLS[k]===url);
    return new Response(hb[key],{headers:{'content-type':'application/json'}});
  }});
  const ls=createLaconService(hs),[hr,lr]=await Promise.all([hs.get(),ls.get()]);
  assert.equal(calls,4);assert.equal(hr.snapshotId,lr.snapshotId);assert.notEqual(hr.receiptId,lr.receiptId);
  assert.deepEqual(evaluateLacon(lr.input,lr.result.asOf),lr.result);
  const server=makeServer({henryService:hs});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  assert.equal((await(await fetch(`http://127.0.0.1:${server.address().port}/api/lacon`)).json()).result.clearance.valueFt,'56.2');
});
