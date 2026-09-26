import { orderBridges } from './directory.js';
const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time = value => new Date(value).toISOString().replace('T',' ').replace(/\.\d{3}Z$/,' UTC');
const ft = value => `<span class="value">${escape(value)} <small>ft</small></span>`;
const unavailable = note => `<span class="unavailable">Unavailable</span><span class="sub">${escape(note)}</span>`;
let directory, receipt;
const expanded = new Set();
function detail(b) {
  const source = directory.sources.find(s=>s.id===b.mileSourceId);
  const cp = b.research.coastPilot;
  const selected = b.selectedReference;
  const href = source && /^https:\/\//.test(source.url) ? `<a href="${escape(source.url)}" target="_blank" rel="noopener">${escape(source.title)}</a>` : 'Source unavailable';
  return `<div class="bridge-record"><p><strong>Mile ${escape(b.riverMile)}</strong> · ${b.mileStatus==='OWNER_CONFIRMED'?'Owner-confirmed chart location':b.mileStatus==='PUBLISHED_HISTORICAL'?'Published historical river mile; current chart review pending':'Provisional derived location; chart review pending'}.</p>
    <p>Agency mile reference: ${href}. Coast Pilot distance from Chicago Lock: ${escape(cp.milesFromChicagoLock)} mi; derived river mile: ${escape(b.derivedRiverMile)} (327.2 minus that distance). ${b.mileConflict?'The mile references differ; both are retained.':''}</p>
    ${selected?`<p>Owner-reported listed clearance: ${escape(selected.publishedClearanceFt)} ft. Reported low steel: ${escape(selected.lowSteelElevationFt)} ft NAVD88. Reference pool: ${escape(selected.referenceSurface.elevationFt)} ft NAVD88.</p>`:'<p>Listed clearance is pending reference review. Source assertions below are research data, not accepted calculation inputs.</p>'}
    ${selected?.consistency==='REFERENCE_ARITHMETIC_CONFLICT'?'<p class="unavailable">Reference mismatch: low steel minus pool does not equal listed clearance. Elevation and position confirmation are pending.</p>':''}
    <p>${b.historical?'Removed span retained for historical reference; no clearance calculation.':b.id==='il-henry'?'Henry uses the recorded two-inch owner assumption. Overall accuracy is unverified.':'Gauge association and clearance calculation are pending.'}</p>
    ${b.id==='il-henry'?'<p><a href="/henry">Henry details and downloadable calculation receipt →</a></p>':''}
    <details><summary>Source assertions and reference record</summary><pre>${escape(JSON.stringify({selectedReference:selected,research:b.research},null,2))}</pre></details></div>`;
}
function render() {
  if (!directory) return;
  const rows = orderBridges(directory.bridges,{query:$('search').value,direction:$('order').value,includeHistorical:$('show-historical').checked});
  $('bridge-rows').innerHTML = rows.map(b=>{
    const r = b.id==='il-henry' ? receipt?.result : null, s=r?.stage, c=r?.clearance, f=r?.forecast;
    const stage = s?.status==='AVAILABLE' ? `${ft(s.valueFt)}<span class="sub">${escape(time(s.observedAt))}</span><span class="badge ${s.late||s.delayed?'late':''}">${s.late?'LATE >24h':s.delayed?'DELAYED':'Latest observation'}</span>` : unavailable(b.historical?'Historical crossing':b.id==='il-henry'?'Henry reading not available':'Gauge connection pending');
    const clearance = c?.status==='ESTIMATED' ? `${ft(c.valueFt)}<span class="sub">${c.late?'LATE — historical estimate':c.historical?'DELAYED — historical estimate':'Estimate at observation time'}<br>${escape(time(c.validAt))}<br>Accuracy unverified</span>` : unavailable(b.historical?'Removed span':b.selectedReference?.consistency==='REFERENCE_ARITHMETIC_CONFLICT'?'Low-steel position needs confirmation':c?c.status.replaceAll('_',' '):'Calculation pending');
    const forecast = f?.status==='AVAILABLE' ? `<span class="forecast">${({RISING:'↑ Rising',FALLING:'↓ Falling',STEADY:'→ Steady',VARIABLE:'↕ Variable'})[f.direction]}</span><span class="sub">Henry gauge · next 24h<br>Issued ${escape(time(f.issuedAt))}</span>` : unavailable('Forecast not available');
    const mileNote = b.historical?'Removed span':b.mileStatus==='OWNER_CONFIRMED'?'Owner-confirmed mile':b.mileConflict?'Mile references differ':b.mileStatus==='DERIVED_UNVERIFIED'?'Approximate · derived mile':'Historical mile reference';
    return `<tr data-bridge="${escape(b.id)}"><td><span class="river-mile">Mile ${escape(b.riverMile)}</span><span class="name">${escape(b.name)}</span><span class="sub">${escape(mileNote)}${b.type==='lift'?' · Fully open scenario':''}</span></td>
      <td>${b.selectedReference?`${ft(b.selectedReference.publishedClearanceFt)}<span class="sub">${b.selectedReference.openingPosition==='FULLY_OPEN'?'Fully open · ':''}Owner-reported · ${escape(b.selectedReference.referenceSurface.elevationFt)} ft NAVD88 pool</span>`:unavailable(b.historical?'Removed span':'Reference review pending')}</td>
      <td>${stage}</td><td>${clearance}</td><td>${forecast}</td><td><button class="record-button" data-record="${escape(b.id)}" aria-expanded="${expanded.has(b.id)}" aria-controls="detail-${escape(b.id)}">${expanded.has(b.id)?'Hide':'View'} record</button></td></tr>
      <tr class="detail-row" id="detail-${escape(b.id)}" ${expanded.has(b.id)?'':'hidden'}><td colspan="6">${expanded.has(b.id)?detail(b):''}</td></tr>`;
  }).join('');
  $('count').textContent = directory.bridges.filter(b=>!b.historical).length;
  $('available').textContent = receipt?.result.clearance.status==='ESTIMATED'?'1':'0';
  $('results-count').textContent = `${rows.length} crossings shown`;
  $('empty').hidden = rows.length!==0;
}
async function refresh() {
  if ($('refresh').disabled) return;
  $('refresh').disabled=true; receipt=null; render();
  $('feed-status').textContent='Checking Henry’s observation…';
  try {
    const response=await fetch('/api/henry',{cache:'no-store',signal:AbortSignal.timeout(25000)});
    if (!response.ok) throw new Error('Henry reading unavailable. Bridge locations remain listed.');
    const next=await response.json();
    if (next.result?.bridgeId!=='il-henry') throw new Error('Henry source record did not match the bridge.');
    receipt=next;
    $('feed-status').textContent=`Henry evaluated ${time(next.result.asOf)} · refreshes every five minutes while this page is visible`;
  } catch(e) { receipt=null; $('feed-status').textContent=e.message; }
  finally { render(); $('refresh').disabled=false; }
}
$('search').addEventListener('input',render);
$('order').addEventListener('change',render);
$('show-historical').addEventListener('change',render);
$('refresh').addEventListener('click',refresh);
$('bridge-rows').addEventListener('click',event=>{
  const button=event.target.closest('[data-record]'); if (!button) return;
  const id=button.dataset.record; expanded.has(id)?expanded.delete(id):expanded.add(id); render();
  document.querySelector(`[data-record="${id}"]`).focus();
});
try {
  const response=await fetch('/api/bridges',{cache:'no-store'});
  if (!response.ok) throw new Error('Bridge directory unavailable. Reload the page to try again.');
  directory=await response.json(); render(); await refresh();
} catch(e) { $('error').textContent=e.message; $('error').hidden=false; }
finally { $('loading').hidden=true; }
setInterval(()=>{if(!document.hidden && directory)refresh();},300000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden && directory)refresh();});
