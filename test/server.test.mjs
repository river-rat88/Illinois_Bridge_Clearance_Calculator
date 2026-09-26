import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';

test('server serves application assets only and refuses writes', async t => {
  const server = makeServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const root = `http://127.0.0.1:${server.address().port}`;
  for (const path of ['/', '/src/app.js', '/src/exact.js', '/src/calculator.js', '/data/demo.js', '/styles.css']) {
    const response = await fetch(root + path); assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  }
  for (const path of ['/.git/config', '/package.json', '/%2e%2e/server.mjs']) assert.equal((await fetch(root + path)).status, 404);
  assert.equal((await fetch(root, { method: 'POST', body: 'x' })).status, 405);
});
