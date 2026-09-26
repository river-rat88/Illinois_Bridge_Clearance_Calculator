import { readFileSync } from 'node:fs';
import { Q, stableStringify } from '../exact.js';
import { hash, check, parseExact, utc } from './usgs-pilot.js';
export const EJE_REFERENCE = JSON.parse(readFileSync(new URL('../../data/eje-bridge-reference.json',import.meta.url),'utf8'));
export const SERIES = 'IL04.Elev-Tail.Inst.30Minutes.0.rev';
export const ADAPTER_VERSION = 'eje-tailwater-pilot-1';
// CWMS unit conversion can return more than nine decimal places. Preserve its literal digits.
function cwmsDecimal(value) {
  check(typeof value==='string' && /^-?\d{1,9}(?:\.\d{1,18})?$/.test(value),'INVALID_VALUE');
  return new Q(BigInt(value.replace('.','')),10n**BigInt((value.split('.')[1]??'').length));
}
const millis = value => Date.parse(utc(value));
export function urlsFor(queryAt) {
  const end=utc(queryAt),begin=new Date(millis(queryAt)-172800000).toISOString();
  const query=new URLSearchParams({name:SERIES,office:'MVR',unit:'ft',datum:'NATIVE',begin,end,'page-size':'500'});
  return {stage:`https://cwms-data.usace.army.mil/cwms-data/timeseries?${query}`,gauge:'https://cwms-data.usace.army.mil/cwms-data/locations/IL04?office=MVR&unit=EN'};
}
function source(snapshot,key,asOf) {
  const s=snapshot.sources?.[key];
  check(s && s.url===urlsFor(snapshot.queryAt)[key],'SOURCE_MISSING');
  check(s.httpStatus===200 && !s.error,'SOURCE_UNAVAILABLE');
  check(typeof s.body==='string' && hash(s.body)===s.sha256,'SOURCE_HASH_MISMATCH');
  check(millis(snapshot.queryAt)<=millis(s.receivedAt) && millis(s.receivedAt)<=millis(asOf),'SOURCE_AFTER_CUTOFF');
  check(/application\/json/i.test(s.contentType),'CONTENT_TYPE_CHANGED');
  return {document:parseExact(s.body),source:s};
}
export function observedTailwater(snapshot,asOf) {
  const {document:d,source:s}=source(snapshot,'stage',asOf),{document:g}=source(snapshot,'gauge',asOf);
  check(g.name==='IL04' && g['office-id']==='MVR' && g.active===true && g['elevation-units']==='ft','GAUGE_IDENTITY_CHANGED');
  check(g['vertical-datum']==='NGVD29','GAUGE_DATUM_CHANGED');
  check(d.name===SERIES && d['office-id']==='MVR' && d.units==='ft' && d.interval==='PT30M' && d['date-version-type']==='UNVERSIONED','WRONG_SERIES');
  check(stableStringify(d['value-columns'])===stableStringify([
    {name:'date-time',ordinal:'1',datatype:'java.sql.Timestamp'},
    {name:'value',ordinal:'2',datatype:'java.lang.Double'},
    {name:'quality-code',ordinal:'3',datatype:'int'}]),'SCHEMA_CHANGED');
  check(Array.isArray(d.values) && String(d.values.length)===d.total && !d['next-page'],'INCOMPLETE_PAGE');
  check(d.values.length>0,'OBSERVATION_MISSING');
  const rows=d.values.map(row=>{
    check(Array.isArray(row) && row.length===3 && /^\d{13}$/.test(row[0]),'INVALID_TIME');
    const t=Number(row[0]);
    check(Number.isSafeInteger(t) && t<=millis(snapshot.queryAt) && t>=millis(snapshot.queryAt)-172800000,'OBSERVATION_OUTSIDE_QUERY');
    return {t,value:row[1],quality:row[2]};
  }).sort((a,b)=>a.t-b.t);
  check(rows.every((r,i)=>!i||r.t>rows[i-1].t),'SOURCE_CONFLICT');
  const latest=rows.at(-1);
  // Code 0 is unscreened, not an approval. Preserve that qualification explicitly.
  check(latest.quality==='0','QUALITY_REJECTED');
  const value=cwmsDecimal(latest.value);check(value.cmp('0')>0 && value.cmp('1000')<0,'OUT_OF_RANGE');
  const observedAt=new Date(latest.t).toISOString(),previous=snapshot.previousAcceptedStage;
  if(previous){
    check(latest.t>=millis(previous.observedAt),'SOURCE_REGRESSED');
    if(observedAt===previous.observedAt)check(value.cmp(cwmsDecimal(previous.valueFt))===0,'REVISION_CONFLICT');
  }
  const ageSeconds=(millis(asOf)-latest.t)/1000;
  return {status:'AVAILABLE',siteId:'IL04',seriesId:SERIES,valueFt:latest.value,displayValueFt:value.floor(2),
    valueKind:'ABSOLUTE_ELEVATION',verticalDatum:'NGVD29',gaugeZeroAdded:false,
    observedAt,receivedAt:s.receivedAt,ageSeconds,late:ageSeconds>86400,delayed:ageSeconds>4320,
    approvalStatus:'Unscreened USACE data',qualityCode:latest.quality,datumEpoch:null,unitRealization:null,sourceHash:s.sha256};
}
export function evaluateEje(snapshot,asOf) {
  utc(asOf);let stage;
  try{stage=observedTailwater(snapshot,asOf);}catch(e){stage={status:e.code||'INVALID_SOURCE',valueFt:null};}
  const reference=structuredClone(snapshot.bridgeReference??EJE_REFERENCE);
  return {adapterVersion:ADAPTER_VERSION,asOf,bridgeId:'il-eje',stage,
    bridgeReference:{...reference,recordSha256:hash(stableStringify(reference))},
    clearance:{status:stage.status==='AVAILABLE'?'DATUM_CONVERSION_REQUIRED':stage.status,valueFt:null,productionEligible:false,
      reason:'Dresden tailwater is NGVD29; bridge low steel is NAVD88. A documented local transformation is required.',
      openingPosition:'FULLY_OPEN',positionVerified:false},
    forecast:{status:'NO_VERIFIED_FORECAST',direction:'UNAVAILABLE',valueFt:null,reason:'No verified Dresden tailwater forecast is configured; Morris forecasts are not substituted.'}};
}
