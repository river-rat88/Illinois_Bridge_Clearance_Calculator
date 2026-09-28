import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evaluateMorris } from '../src/feeds/morris.js';
import { evaluateEje } from '../src/feeds/eje.js';
import { createMorrisService } from '../src/morris-service.js';
import { createEjeService } from '../src/eje-service.js';
import { makeServer } from '../server.mjs';
import { MORRIS_NOW, EJE_NOW, makeMorrisSnapshot, makeEjeSnapshot, change } from './pilot-fixtures.mjs';
const morris=s=>evaluateMorris(s,MORRIS_NOW),eje=s=>evaluateEje(s,EJE_NOW);
test('Morris uses its NAVD88 zero and exact elevations; forecast remains independent',()=>{
 const r=morris(makeMorrisSnapshot());
 assert.equal(r.stage.valueFt,'5.67');assert.equal(r.clearance.valueFt,'49.0');
 assert.equal(r.clearance.pocRange.halfWidthFt,'3');assert.equal(r.clearance.pocRange.measuredErrorBound,false);
 assert.deepEqual(r.clearance.trace.unroundedClearanceFt,{numerator:'2453',denominator:'50',unit:'ft'});
 assert.equal(r.clearance.trace.gaugeZeroNavd88Ft,'478.17');assert.equal(r.forecast.status,'AVAILABLE');
 assert.equal(r.clearance.trace.uncertaintyDeducted,false);
 const s=makeMorrisSnapshot();change(s,'stage',d=>d.features[0].properties.value='4.33');assert.equal(morris(s).clearance.valueFt,'50.4');
 change(s,'stage',d=>d.features[0].properties.value='5.33');assert.equal(morris(s).clearance.valueFt,'49.4');
});
test('forecast issue age has an exact 18-hour boundary without affecting observed clearance',()=>{
 const s=makeMorrisSnapshot();
 change(s,'forecast',d=>{d.issuedTime='2026-09-25T19:30:00Z';for(const p of d.data)p.generatedTime='2026-09-25T19:40:00Z';});
 assert.equal(morris(s).forecast.status,'AVAILABLE');
 const later=evaluateMorris(s,'2026-09-26T13:30:00.001Z');
 assert.equal(later.forecast.status,'FORECAST_STALE');assert.equal(later.clearance.valueFt,'49.0');
});
test('Morris rejects wrong datum, site, source semantics and range instead of borrowing Henry inputs',()=>{
 for(const [key,fn] of [
  ['gauge',d=>d.lid='HNYI2'],['gauge',d=>d.datums.vertical.value[0].abbrev='NGVD29'],['gauge',d=>d.datums.vertical.value[0].value=478.5],
  ['stage',d=>d.features[0].properties.time_series_id='2368ad8cb32f4cc4bcd1068c0faab837'],['stage',d=>d.features[0].properties.value='0.99'],['stage',d=>d.features[0].properties.value='30.01'],['stage',d=>d.features[0].properties.qualifier='Ice']
 ]){const s=makeMorrisSnapshot();change(s,key,fn);assert.equal(morris(s).clearance.valueFt,null);}
});
test('Morris forecast uses LOT product and correct gauge when a fresh run is present',()=>{
 const s=makeMorrisSnapshot();change(s,'forecast',d=>{d.issuedTime='2026-09-26T12:00:00Z';for(const p of d.data)p.generatedTime='2026-09-26T12:10:00Z';});
 const r=morris(s);assert.equal(r.forecast.status,'AVAILABLE');assert.equal(r.forecast.direction,'STEADY');assert.equal(r.forecast.gaugeId,'MORI2');
 change(s,'forecast',d=>d.wfo='ILX');assert.notEqual(morris(s).forecast.status,'AVAILABLE');assert.equal(morris(s).clearance.valueFt,'49.0');
});
test('EJE verifies NOAA CDII2 NAVD88 zero and applies the local datum tie exactly to Dresden tailwater',()=>{
 const s=makeEjeSnapshot(),r=eje(s);
 assert.equal(r.stage.status,'AVAILABLE');assert.equal(r.stage.valueKind,'ABSOLUTE_ELEVATION');assert.equal(r.stage.verticalDatum,'NGVD29');
 assert.equal(r.stage.gaugeZeroAdded,false);assert.equal(r.stage.displayValueFt,'485.01');assert.equal(r.stage.approvalStatus,'Unscreened USACE data');
 assert.equal(r.stage.delayed,true);assert.equal(r.clearance.status,'ESTIMATED');assert.equal(r.clearance.valueFt,'58.6');
 assert.equal(r.clearance.historical,true);assert.equal(r.clearance.accuracyStatus,'UNVERIFIED');assert.equal(r.clearance.productionEligible,false);
 assert.equal(r.clearance.trace.datumOffsetFt,'-0.21');
 assert.equal(r.clearance.trace.noaaGaugeId,'CDII2');assert.equal(r.clearance.trace.noaaMetadataSourceHash,s.sources.noaaGauge.sha256);
 assert.deepEqual(r.clearance.trace.waterElevationNavd88Ft,{numerator:'1212021605781',denominator:'2500000000',unit:'ft'});
 assert.deepEqual(r.clearance.trace.unroundedClearanceFt,{numerator:'146728394219',denominator:'2500000000',unit:'ft'});
 assert.equal(r.clearance.trace.uncertaintyDeducted,false);assert.equal(r.clearance.openingPosition,'FULLY_OPEN');
 assert.equal(r.forecast.status,'NO_VERIFIED_FORECAST');assert.deepEqual(eje(s),r);
});
test('EJE normal pool and one-foot rise calibrate to listed fully open clearance',()=>{
 const s=makeEjeSnapshot();change(s,'stage',d=>d.values.at(-1)[1]=482.71);
 assert.equal(eje(s).clearance.valueFt,'61.0');
 change(s,'stage',d=>d.values.at(-1)[1]=483.71);
 assert.equal(eje(s).clearance.valueFt,'60.0');
});
test('EJE withholds clearance when the chart transform direction, scope, or model changes',()=>{
 for(const mutate of [
   r=>r.gaugeReference.navd88Transform.offsetFt='0.21',
   r=>r.gaugeReference.navd88Transform.fromDatum='NAVD88',
   r=>r.gaugeReference.navd88Transform.scope.gaugeId='OTHER',
   r=>r.gaugeReference.navd88Transform.independentlyVerified=true,
   r=>r.bridgeWaterModel.requiredSide='POOL',
   r=>r.openingPosition='CLOSED',
   r=>r.pilotEstimateEnabled=false
 ]){const s=makeEjeSnapshot();s.bridgeReference=structuredClone(eje(s).bridgeReference);mutate(s.bridgeReference);
   assert.equal(eje(s).clearance.valueFt,null);assert.equal(eje(s).stage.status,'AVAILABLE');}
 });
test('EJE withholds clearance when NOAA metadata is missing, changed, or unaudited',()=>{
 for(const fn of [d=>d.lid='OTHER',d=>d.datums.vertical.value[0].value=-0.2,
   d=>d.datums.vertical.value[0].abbrev='NGVD29',d=>d.latitude=40]){
  const s=makeEjeSnapshot();change(s,'noaaGauge',fn);
  assert.notEqual(eje(s).clearance.status,'ESTIMATED');assert.equal(eje(s).clearance.valueFt,null);
  assert.equal(eje(s).stage.status,'AVAILABLE');
 }
 const s=makeEjeSnapshot();s.sources.noaaGauge.httpStatus=503;
 assert.equal(eje(s).clearance.status,'SOURCE_UNAVAILABLE');assert.equal(eje(s).stage.status,'AVAILABLE');
 const bad=makeEjeSnapshot();bad.sources.noaaGauge.body+=' ';
 assert.equal(eje(bad).clearance.status,'SOURCE_HASH_MISMATCH');
});
test('Dresden rejects pool substitution, schema changes, incomplete windows, duplicate times and invalid latest points',()=>{
 for(const [key,fn] of [
  ['stage',d=>d.name=d.name.replace('Tail','Pool')],['stage',d=>d.units='m'],['gauge',d=>d['vertical-datum']='NAVD88'],['gauge',d=>d.name='OTHER'],
  ['stage',d=>d.total++],['stage',d=>{d.values.push(d.values.at(-1));d.total++;}],['stage',d=>d.values.at(-1)[1]=null],['stage',d=>d.values.at(-1)[1]=-9999],['stage',d=>d.values.at(-1)[2]=5],['stage',d=>d.values.at(-1)[0]=Date.parse('2026-09-27T00:00:00Z')]
 ]){const s=makeEjeSnapshot();change(s,key,fn);assert.notEqual(eje(s).stage.status,'AVAILABLE');assert.equal(eje(s).clearance.valueFt,null);}
 const s=makeEjeSnapshot();s.sources.stage.body+=' ';assert.equal(eje(s).stage.status,'SOURCE_HASH_MISMATCH');
 const t=makeEjeSnapshot();t.previousAcceptedStage={...eje(t).stage,valueFt:'486'};assert.equal(eje(t).stage.status,'REVISION_CONFLICT');
});
test('both new gauges mark late strictly after 24 hours without replacing observation time',()=>{
 for(const [snapshot,evaluate,observedAt] of [[makeMorrisSnapshot(),evaluateMorris,'2026-09-26T12:45:00.000Z'],[makeEjeSnapshot(),evaluateEje,'2026-09-26T11:00:00.000Z']]){
  for(const [delta,late] of [[86400000,false],[86400001,true]]){
   const r=evaluate(snapshot,new Date(Date.parse(observedAt)+delta).toISOString());assert.equal(r.stage.late,late);assert.equal(r.stage.observedAt,observedAt);
  }
 }
});
test('new services archive distinct sources, replay receipts, coalesce fetches and preserve outage history',async t=>{
 for(const [create,snapshot,now,evaluate] of [[createMorrisService,makeMorrisSnapshot(),MORRIS_NOW,evaluateMorris],[createEjeService,makeEjeSnapshot(),EJE_NOW,evaluateEje]]){
  const directory=await mkdtemp(join(tmpdir(),'pilot-'));t.after(()=>rm(directory,{recursive:true,force:true}));let calls=0,failed=false,clock=now;
  const service=create({directory,clock:()=>clock,fetchImpl:async url=>{
   calls++;if(failed)throw Error('offline');const s=Object.values(snapshot.sources).find(s=>s.url===url);assert.ok(s,url);return new Response(s.body,{headers:{'content-type':'application/json'}});
  }});
  const [a,b]=await Promise.all([service.get(),service.get()]);assert.equal(a.receiptId,b.receiptId);assert.equal(calls,Object.keys(snapshot.sources).length);
  assert.deepEqual(evaluate(a.input,a.result.asOf),a.result);assert.equal((await readdir(join(directory,'raw'))).length,calls);
  failed=true;clock=new Date(Date.parse(now)+86400000).toISOString();const r=await service.get();
  assert.equal(r.result.stage.status,'SOURCE_UNAVAILABLE');assert.equal(r.result.historicalStage.status,'HISTORICAL_ONLY');assert.equal(r.result.clearance.valueFt,null);
 }
});
test('pilot HTTP endpoints isolate failures and retain the full bridge directory',async t=>{
 const server=makeServer({henryService:{get:async()=>{throw Error('offline');}},morrisService:{get:async()=>({result:morris(makeMorrisSnapshot())})},ejeService:{get:async()=>({result:eje(makeEjeSnapshot())})}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const root=`http://127.0.0.1:${server.address().port}`;
 assert.equal((await fetch(root+'/api/henry')).status,503);
 assert.equal((await (await fetch(root+'/api/morris')).json()).result.clearance.valueFt,'49.0');
 assert.equal((await (await fetch(root+'/api/eje')).json()).result.clearance.valueFt,'58.6');
 assert.equal((await (await fetch(root+'/api/bridges')).json()).bridges.length,38);
 for(const path of ['/var/eje/current.json','/var/morris/current.json','/src/feeds/eje.js'])assert.equal((await fetch(root+path)).status,404);
});

test('forecast beginning at the next scheduled time uses a labeled window without extrapolation',()=>{
 const s=makeMorrisSnapshot();change(s,'forecast',d=>{d.issuedTime='2026-09-26T12:00:00Z';d.data=d.data.slice(2);for(const p of d.data)p.generatedTime='2026-09-26T12:10:00Z';});
 const r=morris(s);assert.equal(r.forecast.status,'AVAILABLE');assert.equal(r.forecast.windowStart,'2026-09-26T18:00:00.000Z');assert.equal(r.forecast.windowEnd,'2026-09-27T18:00:00.000Z');
 assert.equal(r.clearance.valueFt,'49.0');
 change(s,'forecast',d=>d.data=d.data.slice(1));assert.equal(morris(s).forecast.status,'FORECAST_COVERAGE');
});
