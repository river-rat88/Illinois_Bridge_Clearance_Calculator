import { readFileSync } from 'node:fs';
import { Q, stableStringify } from '../exact.js';
import { hash, check, parseExact, utc } from './usgs-pilot.js';
export const EJE_REFERENCE = JSON.parse(readFileSync(new URL('../../data/eje-bridge-reference.json',import.meta.url),'utf8'));
export const SERIES = 'IL04.Elev-Tail.Inst.30Minutes.0.rev';
export const ADAPTER_VERSION = 'eje-tailwater-pilot-2';
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
  let clearance;
  try {
    check(reference.bridgeId==='il-eje' && reference.verticalDatum==='NAVD88' && reference.openingPosition==='FULLY_OPEN' && reference.lowSteelPosition==='FULLY_OPEN','REFERENCE_ID_MISMATCH');
    check(Q.parse(reference.lowSteelElevationFt).sub(reference.referenceSurface.elevationFt).cmp(reference.publishedClearanceFt)===0,'REFERENCE_ARITHMETIC_CONFLICT');
    check(reference.pilotEstimateEnabled===true,'PILOT_ESTIMATE_DISABLED');
    check(stage.status==='AVAILABLE',stage.status);
    const gauge=reference.gaugeReference,transform=gauge?.navd88Transform,model=reference.bridgeWaterModel;
    check(gauge?.gaugeId==='IL04' && gauge.seriesId===SERIES && gauge.valueKind==='ABSOLUTE_ELEVATION' && gauge.verticalDatum==='NGVD29' && gauge.unit==='ft' && stage.verticalDatum==='NGVD29','GAUGE_REFERENCE_UNRESOLVED');
    check(gauge.status==='OWNER_REPORTED_TRANSFORM_PILOT' && transform?.id==='eje-owner-chart-ngvd29-to-navd88-1' &&
      transform.fromDatum==='NGVD29' && transform.toDatum==='NAVD88' && transform.operation==='ADD_OFFSET_TO_SOURCE_ELEVATION' && transform.offsetFt==='-0.21' &&
      transform.scope?.bridgeId==='il-eje' && transform.scope.gaugeId==='IL04' && transform.scope.seriesId===SERIES &&
      transform.basis==='OWNER_REPORTED_ECHART' && transform.directionConfirmedDateUtc==='2026-09-27' && transform.independentlyVerified===false,
      'DATUM_TRANSFORM_UNRESOLVED');
    check(model?.bridgeId==='il-eje' && model.gaugeId==='IL04' && model.requiredSide==='TAILWATER' && model.type==='DIRECT' &&
      model.basis==='OWNER_ASSUMPTION' && model.validated===false && model.offsetFt==='0' && model.assumedMaxDifferenceInches==='2','MODEL_UNRESOLVED');
    const waterNgvd29=cwmsDecimal(stage.valueFt),waterNavd88=waterNgvd29.add(transform.offsetFt);
    const exact=Q.parse(reference.lowSteelElevationFt).sub(waterNavd88),display=exact.floor(1);
    clearance={status:'ESTIMATED',valueFt:display,validAt:stage.observedAt,timeBasis:'AT_OBSERVATION_TIME',
      historical:stage.delayed,late:stage.late,accuracyStatus:'UNVERIFIED',productionEligible:false,
      method:'LOW_STEEL_NAVD88_MINUS_CONVERTED_TAILWATER_NAVD88',openingPosition:'FULLY_OPEN',positionVerified:false,
      trace:{tailwaterNgvd29Ft:waterNgvd29.toJSON(),datumTransformId:transform.id,datumOffsetFt:transform.offsetFt,
        waterElevationNavd88Ft:waterNavd88.toJSON(),lowSteelNavd88Ft:reference.lowSteelElevationFt,
        unroundedClearanceFt:exact.toJSON(),displayRoundingFt:exact.sub(display).toJSON(),
        modelId:model.id,bridgeMinusGaugeFt:model.offsetFt,
        assumedTransferDifferenceFt:Q.parse(model.assumedMaxDifferenceInches).div('12').toJSON(),
        sourceHash:stage.sourceHash,uncertaintyDeducted:false},
      assumptions:['The owner reports that adding -0.21 ft converts Dresden NGVD29 tailwater to NAVD88 at EJE; chart edition, effective epoch and foot realization are not independently verified.',
        'Bridge water elevation equals Dresden tailwater; owner assumes a difference within two inches.',
        'The lift span is fully open; its actual position and the overall six-inch accuracy target have not been verified.']};
  } catch(e) { clearance={status:e.code||'INVALID_REFERENCE',valueFt:null,productionEligible:false}; }
  return {adapterVersion:ADAPTER_VERSION,asOf,bridgeId:'il-eje',stage,
    bridgeReference:{...reference,recordSha256:hash(stableStringify(reference))},
    clearance,
    forecast:{status:'NO_VERIFIED_FORECAST',direction:'UNAVAILABLE',valueFt:null,reason:'No verified Dresden tailwater forecast is configured; Morris forecasts are not substituted.'}};
}
