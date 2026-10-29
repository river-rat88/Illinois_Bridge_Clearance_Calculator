import { createUsgsPilot, parseExact } from './usgs-pilot.js';
export { hash, check, parseExact, utc, seriesSignature } from './usgs-pilot.js';
import { readFileSync } from 'node:fs';

export const ADAPTER_VERSION = 'henry-stage-pilot-6';
export const HENRY_REFERENCE = JSON.parse(readFileSync(new URL('../../data/henry-bridge-reference.json', import.meta.url), 'utf8'));
export const SERIES = '2368ad8cb32f4cc4bcd1068c0faab837';
export const URLS = Object.freeze({
  stage: 'https://api.waterdata.usgs.gov/ogcapi/v1/collections/latest-continuous/items?f=json&monitoring_location_id=USGS-05558300&parameter_code=00065&limit=100',
  series: 'https://api.waterdata.usgs.gov/ogcapi/v1/collections/time-series-metadata/items?f=json&monitoring_location_id=USGS-05558300&parameter_code=00065&limit=100',
  forecast: 'https://api.water.noaa.gov/nwps/v1/gauges/hnyi2/stageflow/forecast',
  gauge: 'https://api.water.noaa.gov/nwps/v1/gauges/hnyi2'
});

const contract = parseExact(readFileSync(new URL('../../data/henry-feed-contract.json', import.meta.url), 'utf8'));
const adapter=createUsgsPilot({adapterVersion:ADAPTER_VERSION,bridgeReference:HENRY_REFERENCE,bridgeId:'il-henry',gaugeId:'HNYI2',siteId:'USGS-05558300',usgsId:'05558300',wfo:'ILX',seriesId:SERIES,urls:URLS,contract,minFt:'-1',maxFt:'40'});
export const {observedStage,stationForecast,evaluate:evaluateHenry}=adapter;

export const LACON_REFERENCE = JSON.parse(readFileSync(new URL('../../data/il-lacon-bridge-reference.json', import.meta.url), 'utf8'));
export const { evaluate: evaluateLacon } = createUsgsPilot({adapterVersion:'lacon-henry-shared-pilot-1',bridgeReference:LACON_REFERENCE,bridgeId:'il-lacon',gaugeId:'HNYI2',siteId:'USGS-05558300',usgsId:'05558300',wfo:'ILX',seriesId:SERIES,urls:URLS,contract,minFt:'-1',maxFt:'40'});
