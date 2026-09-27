import { readFile } from 'node:fs/promises';
import { hash } from '../src/feeds/usgs-pilot.js';
import { URLS } from '../src/feeds/morris.js';
import { urlsFor } from '../src/feeds/eje.js';
export const MORRIS_NOW='2026-09-26T13:30:00.000Z';
export const EJE_NOW='2026-09-26T17:17:56.000Z';
async function fixture(folder,names,urls,now) {
 return {sources:Object.fromEntries(await Promise.all(Object.entries(names).map(async([k,name])=>{
  const body=await readFile(new URL(`fixtures/${folder}/${name}.json`,import.meta.url),'utf8');
  return [k,{url:urls[k],body,sha256:hash(body),httpStatus:200,contentType:'application/json',receivedAt:now}];
 })))};
}
const morris=await fixture('morris',{stage:'usgs-latest',series:'usgs-series',gauge:'nwps-gauge',forecast:'nwps-forecast'},URLS,MORRIS_NOW);
const eje={...await fixture('eje',{stage:'cwms-tailwater',gauge:'cwms-location',noaaGauge:'nwps-gauge'},urlsFor(EJE_NOW),EJE_NOW),queryAt:EJE_NOW};
export const makeMorrisSnapshot=()=>structuredClone(morris);
export const makeEjeSnapshot=()=>structuredClone(eje);
export function change(s,key,fn){const d=JSON.parse(s.sources[key].body);fn(d);s.sources[key].body=JSON.stringify(d);s.sources[key].sha256=hash(s.sources[key].body);}
