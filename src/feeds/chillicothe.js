import { readFileSync } from 'node:fs';
import { Q, stableStringify } from '../exact.js';
import { withPocRange } from '../poc-range.js';
import { hash, check, parseExact, utc } from './usgs-pilot.js';

export const ADAPTER_VERSION = 'chillicothe-noaa-ncat-pilot-1';
export const URLS = Object.freeze({
  gauge:'https://api.water.noaa.gov/nwps/v1/gauges/chli2',
  stage:'https://api.water.noaa.gov/nwps/v1/gauges/chli2/stageflow/observed',
  forecast:'https://api.water.noaa.gov/nwps/v1/gauges/chli2/stageflow/forecast'
});
export const CHILLICOTHE_REFERENCE = JSON.parse(readFileSync(new URL('../../data/il-chillicothe-rr-bridge-reference.json',import.meta.url),'utf8'));
export const TRANSFORM_EVIDENCE = Object.freeze({
  review:JSON.parse(readFileSync(new URL('../../data/research/chillicothe-ncat-api-review.json',import.meta.url),'utf8')),
  rawBody:readFileSync(new URL('../../data/research/chillicothe-ncat-raw-response.json',import.meta.url),'utf8')
});
const millis = value => Date.parse(utc(value));
const attempt = fn => { try { return fn(); } catch(e) { return {status:e.code || 'INVALID_SOURCE',valueFt:null}; } };

function source(snapshot,key,asOf) {
  const s=snapshot.sources?.[key];
  check(s?.url===URLS[key],'SOURCE_MISSING');
  check(s.httpStatus===200 && !s.error,'SOURCE_UNAVAILABLE');
  check(typeof s.body==='string' && hash(s.body)===s.sha256,'SOURCE_HASH_MISMATCH');
  check(millis(s.receivedAt)<=millis(asOf),'SOURCE_AFTER_CUTOFF');
  check(/application\/json/i.test(s.contentType),'CONTENT_TYPE_CHANGED');
  return {document:parseExact(s.body),record:s};
}
function gauge(snapshot,asOf) {
  const {document:g,record}=source(snapshot,'gauge',asOf);
  check(g.lid==='CHLI2' && g.name==='Illinois River at Chillicothe' && g.usgsId==='' &&
    g.wfo?.abbreviation==='ILX' && g.pedts?.observed==='HGIRG' && g.timeZone==='CST6CDT', 'GAUGE_IDENTITY_CHANGED');
  check(Q.parse(g.latitude).cmp('40.9172')===0 && Q.parse(g.longitude).cmp('-89.4814')===0,'GAUGE_LOCATION_CHANGED');
  const zeros=g.datums?.vertical?.value?.filter(d=>d.abbrev==='NGVD29');
  check(zeros?.length===1 && typeof zeros[0].value==='string' && Q.parse(zeros[0].value).cmp('0')===0,'GAUGE_ZERO_CHANGED');
  return {document:g,sourceHash:record.sha256};
}
function elevation(value) {
  check(typeof value==='string','INVALID_VALUE');
  const q=Q.parse(value);
  // Explicit broad pilot plausibility envelope, not a certified operating range.
  check(q.cmp('400')>=0 && q.cmp('500')<=0,'OUT_OF_RANGE');
  return q;
}
export function observedElevation(snapshot,asOf) {
  const g=gauge(snapshot,asOf),{document:d,record:s}=source(snapshot,'stage',asOf);
  check(d.pedts==='HGIRG' && d.wfo==='ILX' && d.timeZone==='CST6CDT' &&
    d.primaryName==='Stage' && d.primaryUnits==='ft','WRONG_SERIES');
  check(Array.isArray(d.data) && d.data.length>0,'OBSERVATION_MISSING');
  const rows=d.data.map(p=>{
    const observedAt=utc(p.validTime),generatedTime=utc(p.generatedTime);
    check(millis(observedAt)<=millis(generatedTime) && millis(generatedTime)<=millis(s.receivedAt),'FUTURE_OBSERVATION');
    check(typeof p.primary==='string','INVALID_VALUE');
    return {observedAt,generatedTime,valueFt:p.primary,t:millis(observedAt)};
  });
  check(rows.every((p,i)=>!i || p.t>rows[i-1].t),'SOURCE_CONFLICT');
  const latest=rows.at(-1);
  // Historical missing-value markers remain in the source record. Select the
  // latest timestamp first; a missing latest value blocks, never falls back.
  elevation(latest.valueFt);
  check(utc(d.issuedTime)===latest.observedAt,'OBSERVATION_RUN_CHANGED');
  const previous=snapshot.previousAcceptedStage;
  if(previous) {
    check(latest.t>=millis(previous.observedAt),'SOURCE_REGRESSED');
    if(latest.observedAt===utc(previous.observedAt)) {
      check(millis(latest.generatedTime)>=millis(previous.sourceGeneratedTime),'REVISION_REGRESSED');
      if(latest.generatedTime===utc(previous.sourceGeneratedTime))
        check(elevation(latest.valueFt).cmp(previous.valueFt)===0,'REVISION_CONFLICT');
    }
  }
  const ageSeconds=(millis(asOf)-latest.t)/1000;
  return {status:'AVAILABLE',siteId:'CHLI2',seriesId:'HGIRG',valueFt:latest.valueFt,
    valueKind:'ABSOLUTE_ELEVATION',verticalDatum:'NGVD29',gaugeZeroAdded:false,
    observedAt:latest.observedAt,sourceGeneratedTime:latest.generatedTime,receivedAt:s.receivedAt,
    ageSeconds,late:ageSeconds>86400,delayed:ageSeconds>4320,datumEpoch:null,unitRealization:null,
    approvalStatus:'NOAA feed; point quality not independently verified',sourceHash:s.sha256,gaugeMetadataHash:g.sourceHash};
}
function transform(reference,evidence) {
  const t=reference.gaugeReference?.navd88Transform,r=evidence.review;
  check(t?.id==='chillicothe-ncat-ngvd29-to-navd88-1' &&
    t.scope?.gaugeId==='CHLI2' && t.scope.bridgeId==='il-chillicothe-rr' &&
    t.fromDatum==='NGVD29' && t.toDatum==='NAVD88' &&
    t.operation==='ADD_CONVERTED_ZERO_TO_ABSOLUTE_ELEVATION' && t.offsetMeters==='-0.075' &&
    t.metersPerFoot==='0.3048' && t.reportedTransformationStatisticMeters==='0.023' && t.vertconVersion==='3.0' &&
    t.researchRecordId===TRANSFORM_EVIDENCE.review.id &&
    t.rawResponseSha256===TRANSFORM_EVIDENCE.review.rawResponseSha256 &&
    r?.id===t.researchRecordId && stableStringify(r)===stableStringify(TRANSFORM_EVIDENCE.review) &&
    typeof evidence.rawBody==='string' && hash(evidence.rawBody)===t.rawResponseSha256,'DATUM_TRANSFORM_UNRESOLVED');
  const n=JSON.parse(evidence.rawBody);
  check(n.srcLat==='40.9172000000' && n.srcLon==='-89.4814000000' &&
    n.srcDatum==='NAD83(2011)' && n.destDatum==='NAD83(2011)' &&
    n.srcVertDatum==='NGVD29' && n.destVertDatum==='NAVD88' && n.heightUnits==='m' &&
    n.srcOrthoht==='0.000' && n.destOrthoht===t.offsetMeters && n.sigOrthoht==='0.023' && n.vertconVersion==='3.0',
    'DATUM_TRANSFORM_UNRESOLVED');
  return {offset:Q.parse(n.destOrthoht).div(t.metersPerFoot),id:t.id,rawHash:t.rawResponseSha256};
}
function forecast(snapshot,asOf) {
  const g=gauge(snapshot,asOf),{document:d}=source(snapshot,'forecast',asOf);
  check(g.document.pedts.forecast==='' && d.pedts==='' && Array.isArray(d.data) && d.data.length===0,'FORECAST_CONFIGURATION_CHANGED');
  return {status:'NO_VERIFIED_FORECAST',direction:'UNAVAILABLE',scope:'AT_GAUGE_ONLY',gaugeId:'CHLI2',
    reason:'NOAA publishes no forecast at Chillicothe; observed rise/fall and Henry forecasts are not substituted.'};
}
export function evaluateChillicothe(snapshot,asOf) {
  utc(asOf);
  const reference=structuredClone(snapshot.bridgeReference??CHILLICOTHE_REFERENCE);
  const evidence=structuredClone(snapshot.datumTransformEvidence??TRANSFORM_EVIDENCE);
  const stage=attempt(()=>observedElevation(snapshot,asOf));
  const clearance=attempt(()=>{
    check(reference.bridgeId==='il-chillicothe-rr' && reference.openingPosition==='FIXED' && reference.verticalDatum==='NAVD88','REFERENCE_ID_MISMATCH');
    check(Q.parse(reference.lowSteelElevationFt).sub(reference.referenceSurface.elevationFt).cmp(reference.publishedClearanceFt)===0,'REFERENCE_ARITHMETIC_CONFLICT');
    check(reference.pilotEstimateEnabled===true,'PILOT_ESTIMATE_DISABLED');
    const g=reference.gaugeReference,m=reference.bridgeWaterModel;
    check(g?.gaugeId==='CHLI2' && g.zeroElevationFt==='0' && g.valueKind==='ABSOLUTE_ELEVATION' && g.verticalDatum==='NGVD29' && g.unit==='ft','GAUGE_REFERENCE_UNRESOLVED');
    check(m?.bridgeId===reference.bridgeId && m.gaugeId==='CHLI2' && m.type==='DIRECT' && m.offsetFt==='0' &&
      m.basis==='OWNER_ASSUMPTION' && m.validated===false && m.errorBoundVerified===false && m.assumedMaxDifferenceInches==='2','MODEL_UNRESOLVED');
    check(stage.status==='AVAILABLE',stage.status);
    const t=transform(reference,evidence),water=elevation(stage.valueFt).add(t.offset);
    const exact=Q.parse(reference.lowSteelElevationFt).sub(water),display=exact.floor(1);
    return {status:'ESTIMATED',valueFt:display,validAt:stage.observedAt,timeBasis:'AT_OBSERVATION_TIME',
      historical:stage.delayed,late:stage.late,accuracyStatus:'UNVERIFIED',method:'LOW_STEEL_NAVD88_MINUS_CONVERTED_CHILLICOTHE_ELEVATION',
      trace:{sourceWaterNgvd29Ft:stage.valueFt,gaugeZeroAdded:false,datumTransformId:t.id,datumOffsetFt:t.offset.toJSON(),
        ncatOffsetMeters:'-0.075',metersPerFoot:'0.3048',ncatTransformStatisticMeters:'0.023',ncatRawResponseSha256:t.rawHash,
        waterElevationNavd88Ft:water.toJSON(),lowSteelNavd88Ft:reference.lowSteelElevationFt,
        unroundedClearanceFt:exact.toJSON(),displayRoundingFt:exact.sub(display).toJSON(),modelId:m.id,bridgeMinusGaugeFt:'0',uncertaintyDeducted:false},
      assumptions:['Chillicothe gauge water elevation applies at the bridge 1.4 river miles upstream; owner-authorized prototype assumption, not field validated.',
        'The NGVD29-to-NAVD88 conversion is local to the gauge. Coordinate frame, foot realization and effective gauge epoch are unverified.',
        'NCAT reports a 0.023 m transformation statistic, not a total or maximum clearance error. The ±3-ft scenario remains illustrative.']};
  });
  return {adapterVersion:ADAPTER_VERSION,asOf,bridgeId:'il-chillicothe-rr',stage,
    forecast:attempt(()=>forecast(snapshot,asOf)),datumTransformEvidence:evidence,
    bridgeReference:{...reference,recordSha256:hash(stableStringify(reference))},clearance:withPocRange({...clearance,productionEligible:false})};
}
