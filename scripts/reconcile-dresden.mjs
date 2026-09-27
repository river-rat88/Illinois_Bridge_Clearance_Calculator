// Replays a frozen, same-timestamp comparison. It does not validate a datum transform.
import { readFile } from 'node:fs/promises';
import { Q } from '../src/exact.js';
import { hash, parseExact } from '../src/feeds/usgs-pilot.js';
import { SERIES, urlsFor } from '../src/feeds/eje.js';

const root = new URL('../data/research/eje-comparison-2026-09-27/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
const source = async key => {
  const entry = manifest.sources[key];
  const body = await readFile(new URL(`${key}.json`, root), 'utf8');
  if (hash(body) !== entry.sha256 || Buffer.byteLength(body) !== entry.bytes || entry.httpStatus !== 200) throw new Error(`${key}: source integrity`);
  return parseExact(body);
};
const [cwms, noaa] = await Promise.all([source('cwms'), source('noaa')]);
if (manifest.sources.cwms.url !== urlsFor(manifest.queryAt).stage ||
    manifest.sources.noaa.url !== 'https://api.water.noaa.gov/nwps/v1/gauges/cdii2/stageflow/observed' ||
    cwms.name !== SERIES || cwms['office-id'] !== 'MVR' || cwms.units !== 'ft' ||
    cwms.total !== String(cwms.values?.length) || cwms['next-page'] ||
    noaa.pedts !== 'HTIRG' || noaa.primaryName !== 'Tailwater' || noaa.primaryUnits !== 'ft') throw new Error('Source contract changed');

// CWMS values have more fractional digits than Q.parse permits; retain the JSON token.
function decimal(s) {
  if (typeof s !== 'string' || !/^-?\d{1,9}(?:\.\d{1,18})?$/.test(s)) throw new Error('Invalid measured value');
  const [whole, fraction = ''] = s.split('.');
  return new Q(BigInt(whole.replace('.', '') + fraction), 10n ** BigInt(fraction.length));
}
const noaaByTime = new Map();
for (const row of noaa.data) {
  const time = Date.parse(row.validTime);
  if (!Number.isFinite(time) || noaaByTime.has(time)) throw new Error('Duplicate or invalid NOAA time');
  noaaByTime.set(time, row.primary);
}
const pairs = [];
for (const row of cwms.values) {
  const time = Number(row[0]), value = noaaByTime.get(time);
  if (value === undefined) continue;
  if (row[2] !== '0' || value === '-999') throw new Error('Unusable matched observation');
  const difference = decimal(row[1]).sub(decimal(value));
  const absolute = difference.cmp('0') < 0 ? difference.mul('-1') : difference;
  pairs.push({ time: new Date(time).toISOString(), cwmsFt: row[1], noaaFt: value,
    differenceFt: difference.toJSON(), absoluteDifferenceFt: absolute });
}
if (!pairs.length || new Set(pairs.map(p => p.time)).size !== pairs.length) throw new Error('No unique pairs');
const sorted = pairs.map(p => p.absoluteDifferenceFt).sort((a, b) => a.cmp(b));
const overTwoInches = pairs.filter(p => p.absoluteDifferenceFt.cmp(new Q(1n, 6n)) > 0);
const report = {
  queryAt: manifest.queryAt,
  sources: Object.fromEntries(Object.entries(manifest.sources).map(([k, v]) => [k, { url: v.url, sha256: v.sha256, receivedAt: v.receivedAt }])),
  matchedAtExactTimestamps: pairs.length,
  medianAbsoluteDifferenceFt: sorted[Math.floor(sorted.length / 2)].floor(4),
  maximumAbsoluteDifferenceFt: sorted.at(-1).floor(4),
  overTwoInches: overTwoInches.length,
  exceptions: overTwoInches.map(p => ({ time: p.time, cwmsFt: p.cwmsFt, noaaFt: p.noaaFt,
    absoluteDifferenceFt: p.absoluteDifferenceFt.floor(4) })),
  qualification: 'Raw published values at identical timestamps; no conversion applied. CWMS quality 0 is unscreened. This is a station-feed comparison, not a bridge-water or datum survey.'
};
console.log(JSON.stringify(report, null, 2));
