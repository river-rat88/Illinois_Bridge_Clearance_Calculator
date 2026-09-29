import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Q } from '../src/exact.js';
import { lowerArchivedComparison } from '../src/source-comparison.js';

const read = async name => JSON.parse(await readFile(new URL(`../data/${name}`, import.meta.url), 'utf8'));

test('archived source comparison selects the lower figure in either direction without claiming a live bound', async () => {
  const evidence = await read('research/lasalle-corps-clearance-table-2026-09-28.json');
  for (const [id, expected, source] of [
    ['il-spring-valley', '58.78', 'CORPS_TABLE_CURRENT'],
    ['il-hennepin-i180', '56.73', 'CHART_LOW_STEEL_AT_LASALLE_TABLE_PROXY']
  ]) {
    const ref = await read(`${id}-bridge-reference.json`);
    const compared = lowerArchivedComparison(ref);
    const row = evidence.rows.find(r => r.id === id);
    const proxy = evidence.comparison.predictedFromSameWater[id];
    assert.equal(compared.valueFt, expected);
    assert.equal(compared.source, source);
    assert.equal(compared.basisRecordId, evidence.id);
    assert.equal(compared.timestamp, null);
    assert.equal(compared.current, false);
    assert.equal(compared.measuredErrorBound, false);
    assert.ok(Q.parse(compared.valueFt).cmp(row.corpsCurrentClearance) <= 0);
    assert.ok(Q.parse(compared.valueFt).cmp(proxy.valueFt) <= 0);
  }
  assert.equal(lowerArchivedComparison(await read('il-utica-bridge-reference.json')), null);
});
