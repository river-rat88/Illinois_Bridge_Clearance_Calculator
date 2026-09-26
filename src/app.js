import { demoCases } from '../data/demo.js';
import { createReceipt } from './calculator.js';
import { Q } from './exact.js';

const $ = id => document.getElementById(id);
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const exactDisplay = value => value ? new Q(BigInt(value.numerator), BigInt(value.denominator)).floor(3) : '—';
const utc = value => value.replace('T', ' ').replace('.000Z', ' UTC');
const age = seconds => seconds < 3600 ? `${Math.floor(seconds / 60)} min` : `${(seconds / 3600).toFixed(1)} hours`;
const labels = { STALE_OBSERVATION: 'Stale gauge', MISSING_OBSERVATION: 'Gauge unavailable', DATUM_UNRESOLVED: 'Datum unresolved',
  ACCURACY_LIMIT_EXCEEDED: 'Accuracy limit exceeded', ACCURACY_UNVERIFIED: 'Accuracy unverified', SOURCE_CONFLICT: 'Source conflict' };
const directions = { RISING: ['↑', 'Rising'], FALLING: ['↓', 'Falling'], STEADY: ['→', 'Steady'], VARIABLE: ['↕', 'Variable'], UNAVAILABLE: ['—', 'Unavailable'] };
let receipts = [], generation = 0;
const expanded = new Set();

function detail(record) {
  const { input, result: r } = record, t = r.trace;
  const equation = t.lowSteelNavd88Ft ? `${exactDisplay(t.lowSteelNavd88Ft)} − ${exactDisplay(t.waterNavd88Ft)} = ${exactDisplay(t.unroundedClearanceFt)} ft` : 'Calculation withheld before a compatible elevation could be established.';
  return `<div class="detail-grid"><div><h3>Calculation record · synthetic inputs</h3><p class="equation">${escape(equation)}</p>
    <p>${escape(r.reason)}</p><p>Model: ${escape(input.model.type)}. ${escape(input.model.rationale)}</p>
    <p>All elevation terms are in NAVD88 feet. Detail decimals are truncated to 0.001 ft for reading; exact fractions are in the receipt.</p>
    <p>Display rounds down to 0.1 ft. No uncertainty allowance is subtracted.</p>
    ${t.errorBudget ? `<p>Total sample error allowance: ${exactDisplay(t.errorBudget.totalFt)} ft. This is a software fixture, not demonstrated field accuracy.</p>` : ''}</div>
    <div><h3>Time, sources &amp; assumptions</h3><p>Calculation cutoff: ${escape(utc(input.asOf))}</p>
    <p>Observation stop policy: ${input.gauges[0].stopAfterSeconds / 3600} hours in these test fixtures. The separate late label applies only after 24 hours.</p>
    <p>Forecast: ${escape(r.forecast.status)}${r.forecast.issuedAt ? ` · issued ${escape(utc(r.forecast.issuedAt))} · ${escape(r.forecast.gaugeId)}` : ''}.</p>
    <p>Forecast window and deadband are proposed defaults: next 24 hours, ±0.1 ft.</p>
    <p>Source: generated synthetic fixture. No official bridge measurements or live observations are included.</p>
    <p class="receipt-id">${escape(record.receiptId)}</p></div></div>
    <details><summary>Inspect complete input and result JSON</summary><pre>${escape(JSON.stringify(record, null, 2))}</pre></details>`;
}

function render() {
  const search = $('search').value.trim().toLowerCase();
  const visible = receipts.filter(({ input }) => `${input.bridge.name} ${input.bridge.riverMile}`.toLowerCase().includes(search))
    .sort((a, b) => (Number(a.input.bridge.riverMile) - Number(b.input.bridge.riverMile)) * ($('order').value === 'up' ? 1 : -1));
  $('results-count').textContent = `${visible.length} of ${receipts.length} sample bridges`;
  $('empty').hidden = visible.length > 0;
  $('bridge-rows').innerHTML = visible.map(record => {
    const { input, result: r } = record, b = input.bridge, id = b.id;
    const [arrow, direction] = directions[r.forecast.direction];
    const observations = r.observations.length ? r.observations.map(o => `<div><span class="value">${escape(o.value)} <small>${escape(o.unit)}</small></span>
      <span class="sub">${escape(o.gaugeName)}<br>${o.parameter === 'STAGE_ABOVE_GAUGE_ZERO' ? 'Above local gauge zero' : 'Water-surface elevation'}<br>
      ${escape(utc(o.observedAt))}<br>${escape(age(o.ageSeconds))} old at snapshot</span>
      <span class="badge ${o.label === 'LATE' ? 'late' : ''}">${o.label === 'LATE' ? 'LATE · over 24 hours' : 'Within 24 hours'}</span></div>`).join('') : '<span class="sub">No usable observation</span>';
    return `<tr data-bridge="${id}"><td><span class="name">${escape(b.name)}</span><span class="sub">Illinois RM ${escape(b.riverMile)} · Fictional location</span>
      ${b.type === 'LIFT' ? '<span class="badge">Fully open assumption</span><span class="sub">Position not verified</span>' : ''}</td>
      <td><span class="value">${escape(b.opening.listedClearance.value)} <small>ft</small></span><span class="sub">At ${escape(b.opening.referenceSurface.type.toLowerCase().replaceAll('_', ' '))}<br>Synthetic reference</span></td>
      <td>${observations}</td><td>${r.status === 'AVAILABLE' ? `<span class="value clearance">${r.clearanceFt} <small>ft</small></span><span class="sub">Calculated at sample snapshot</span>` : `<span class="unavailable">Unavailable</span><span class="sub">${escape(labels[r.status] || r.status.replaceAll('_', ' ').toLowerCase())}</span>`}</td>
      <td><span class="forecast"><span class="arrow" aria-hidden="true">${arrow}</span>${direction}</span><span class="sub">${r.forecast.direction === 'UNAVAILABLE' ? 'No usable forecast' : 'Next 24 hours · sample forecast'}</span></td>
      <td><button class="record-button" data-record="${id}" aria-expanded="${expanded.has(id)}" aria-controls="detail-${id}" aria-label="${expanded.has(id) ? 'Hide' : 'View'} calculation for ${escape(b.name)}">${expanded.has(id) ? 'Hide' : 'View'} record</button></td></tr>
      <tr class="detail-row" id="detail-${id}" ${expanded.has(id) ? '' : 'hidden'}><td colspan="6">${expanded.has(id) ? detail(record) : ''}</td></tr>`;
  }).join('');
  $('count').textContent = receipts.length;
  $('available').textContent = receipts.filter(r => r.result.status === 'AVAILABLE').length;
  $('unavailable').textContent = receipts.filter(r => r.result.status !== 'AVAILABLE').length;
}

async function recalculate() {
  const ticket = ++generation;
  $('download').disabled = true;
  $('error').hidden = true;
  const shiftTenths = Number($('stage-shift').value);
  $('shift-output').textContent = `${shiftTenths > 0 ? '+' : ''}${(shiftTenths / 10).toFixed(1)} ft`;
  try {
    const cases = await demoCases({ shiftTenths, scenario: $('scenario').value });
    const next = await Promise.all(cases.map(createReceipt));
    if (ticket !== generation) return;
    receipts = next; render(); $('download').disabled = false;
  } catch (error) {
    if (ticket !== generation) return;
    receipts = []; render();
    $('error').textContent = `Prototype could not calculate: ${error.message}`;
    $('error').hidden = false;
  }
}

$('bridge-rows').addEventListener('click', event => {
  const button = event.target.closest('[data-record]');
  if (!button) return;
  const id = button.dataset.record;
  expanded.has(id) ? expanded.delete(id) : expanded.add(id);
  render();
  document.querySelector(`[data-record="${id}"]`).focus();
});
$('stage-shift').addEventListener('input', recalculate);
$('scenario').addEventListener('change', recalculate);
$('search').addEventListener('input', render);
$('order').addEventListener('change', render);
$('reset').addEventListener('click', () => {
  $('stage-shift').value = '0'; $('scenario').value = 'baseline'; $('search').value = ''; $('order').value = 'up';
  expanded.clear(); recalculate();
});
$('download').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(receipts, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = 'illinois-clearance-SYNTHETIC-audit.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
recalculate();
