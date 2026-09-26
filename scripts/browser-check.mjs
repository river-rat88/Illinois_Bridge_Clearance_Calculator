import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { makeServer } from '../server.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = makeServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const waitAvailable = value => page.waitForFunction(v => document.getElementById('available').textContent === v && !document.getElementById('download').disabled, value);
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/demo`);
  await waitAvailable('3');
  assert.equal(await page.locator('tr[data-bridge]').count(), 6);
  assert.match(await page.locator('[data-bridge="sample-a"]').innerText(), /57\.7/);
  await page.locator('[data-record="sample-a"]').click();
  assert.match(await page.locator('#detail-sample-a').innerText(), /565\.000 − 507\.250 = 57\.750/);
  await page.locator('[data-record="sample-a"]').click();
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/prototype-desktop.png`, fullPage: true });
  await page.locator('#stage-shift').evaluate(el => { el.value = '10'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForFunction(() => document.querySelector('[data-bridge="sample-a"]').textContent.includes('56.7'));
  await page.locator('#scenario').selectOption('late'); await waitAvailable('0');
  assert.equal(await page.locator('.badge.late').count(), 6); // two observations at the bracketed sample
  await page.locator('#scenario').selectOption('outage'); await waitAvailable('0');
  await page.waitForFunction(() => document.querySelectorAll('[data-bridge] .unavailable').length === 6 && document.querySelector('[data-bridge="sample-a"]').textContent.includes('Gauge unavailable'));
  await page.locator('#reset').click(); await waitAvailable('3');
  await page.locator('#search').fill('sample b'); assert.equal(await page.locator('tr[data-bridge]').count(), 1);
  await page.locator('#search').fill('no such bridge'); assert.equal(await page.locator('#empty').isVisible(), true);
  await page.locator('#search').fill(''); await page.locator('#order').selectOption('down');
  assert.equal(await page.locator('tr[data-bridge]').first().getAttribute('data-bridge'), 'sample-f');
  const downloadPromise = page.waitForEvent('download'); await page.locator('#download').click();
  const download = await downloadPromise; assert.equal(download.suggestedFilename(), 'illinois-clearance-SYNTHETIC-audit.json');
  const stream = await download.createReadStream(), chunks = []; for await (const chunk of stream) chunks.push(chunk);
  const records = JSON.parse(Buffer.concat(chunks).toString()); assert.equal(records.length, 6);
  assert.equal(records[0].result.clearanceFt, '57.7');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#reset').click(); await waitAvailable('3');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/prototype-mobile.png`, fullPage: true });
  assert.deepEqual(errors, []);
  console.log('Browser checks passed: desktop/mobile, arithmetic control, outage/late states, audit expansion, search, sort, download, no console errors.');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
