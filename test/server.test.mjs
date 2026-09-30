import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';

test('server serves application assets only and refuses writes', async t => {
  const server = makeServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const root = `http://127.0.0.1:${server.address().port}`;
  for (const path of ['/', '/demo', '/directory.css', '/src/directory-page.js', '/src/source-comparison.js', '/src/directory.js', '/src/coverage.js', '/src/app.js', '/src/exact.js', '/src/calculator.js', '/data/demo.js', '/styles.css']) {
    const response = await fetch(root + path); assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  }
  const directory = await (await fetch(root + '/api/bridges')).json();
  assert.equal(directory.bridges.length,38);assert.equal(directory.scope.maximumRiverMile,'279');
  assert.equal(directory.pilots.length,10);assert.equal(directory.bridges.filter(b=>b.coverage.phase==='REFERENCE_PENDING').length,25);
  assert.equal(directory.bridges.filter(b=>b.coverage.phase==='ASSOCIATION_PENDING').length,2);
  assert.equal(directory.bridges.find(b=>b.id==='il-morris').selectedReference.publishedClearanceFt,'50.4');
  assert.match(await (await fetch(root)).text(),/Every crossing/);
  assert.match(await (await fetch(root+'/demo')).text(),/DEMONSTRATION ONLY/);
  for (const path of ['/.git/config', '/package.json', '/%2e%2e/server.mjs']) assert.equal((await fetch(root + path)).status, 404);
  assert.equal((await fetch(root, { method: 'POST', body: 'x' })).status, 405);
});
