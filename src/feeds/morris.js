import { createUsgsPilot, parseExact } from './usgs-pilot.js';
export { hash, check, parseExact, utc, seriesSignature } from './usgs-pilot.js';
import { readFileSync } from 'node:fs';

export const ADAPTER_VERSION = 'morris-stage-pilot-3';
export const MORRIS_REFERENCE = JSON.parse(readFileSync(new URL('../../data/morris-bridge-reference.json', import.meta.url), 'utf8'));
export const SERIES = 'eaa4fff04ce7425083d4493374156c10';
export const URLS = Object.freeze({
  stage: 'https://api.waterdata.usgs.gov/ogcapi/v1/collections/latest-continuous/items?f=json&monitoring_location_id=USGS-05542500&parameter_code=00065&limit=100',
  series: 'https://api.waterdata.usgs.gov/ogcapi/v1/collections/time-series-metadata/items?f=json&monitoring_location_id=USGS-05542500&parameter_code=00065&limit=100',
  forecast: 'https://api.water.noaa.gov/nwps/v1/gauges/mori2/stageflow/forecast',
  gauge: 'https://api.water.noaa.gov/nwps/v1/gauges/mori2'
});

const contract = parseExact(readFileSync(new URL('../../data/morris-feed-contract.json', import.meta.url), 'utf8'));
const adapter=createUsgsPilot({adapterVersion:ADAPTER_VERSION,bridgeReference:MORRIS_REFERENCE,bridgeId:'il-morris',gaugeId:'MORI2',siteId:'USGS-05542500',usgsId:'05542500',wfo:'LOT',seriesId:SERIES,urls:URLS,contract,minFt:'1',maxFt:'30'});
export const {observedStage,stationForecast,evaluate:evaluateMorris}=adapter;
