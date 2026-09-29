let receipt = null;
const el = id => document.getElementById(id);
const text = (id, value) => { el(id).textContent = value; };
const time = value => new Date(value).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
const age = seconds => `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m old`;
async function update() {
  if (el('refresh').disabled) return;
  el('refresh').disabled = true;
  // Remove a previously current-looking value while the request is unresolved.
  receipt = null; el('audit').disabled = true;
  text('stage', 'Checking…'); text('forecast', 'Checking…'); text('clearance', 'Checking…');
  for (const id of ['clearance-time','clearance-status','clearance-range','stage-status','stage-time','stage-age','quality','forecast-time','forecast-window']) text(id, '');
  el('history').hidden = true;
  try {
    const response = await fetch('/api/henry', { cache: 'no-store', signal: AbortSignal.timeout(25000) });
    if (!response.ok) throw new Error('Live source record unavailable. Check the connection and try again.');
    receipt = await response.json(); const r = receipt.result, s = r.stage, f = r.forecast;
    const c = r.clearance;
    text('clearance', c.status === 'ESTIMATED' ? `${c.valueFt} ft` : 'Unavailable');
    text('clearance-status', c.status === 'ESTIMATED' ? c.late ? 'LATE — historical estimate' : c.historical ? 'DELAYED — historical estimate' : 'Calculated estimate · assumptions apply' : c.status.replaceAll('_', ' '));
    if (c.status === 'ESTIMATED' && c.pocRange) text('clearance-range', `Lower illustrative scenario: ${c.pocRange.lowerFt} ft (assumed −3 ft). Full scenario: ${c.pocRange.lowerFt}–${c.pocRange.upperFt} ft. Not a measured minimum or accuracy guarantee; inspect the pier gauge before transiting.`);
    if (c.validAt) text('clearance-time', `At observation time: ${time(c.validAt)}`);
    text('stage', s.status === 'AVAILABLE' ? `${s.valueFt} ft` : 'Unavailable');
    text('stage-status', s.status === 'AVAILABLE' ? s.late ? 'LATE — older than 24 hours' : s.delayed ? 'DELAYED — last observed reading' : 'Latest reported observation' : s.status.replaceAll('_', ' '));
    if (s.observedAt) { text('stage-time', `Observed ${time(s.observedAt)}`); text('stage-age', `${age(s.ageSeconds)} · downloaded ${time(s.receivedAt)}`); text('quality', `${s.approvalStatus} USGS data${s.approvalStatus === 'Provisional' ? ' — subject to revision' : ''}`); }
    text('forecast', f.status === 'AVAILABLE' ? ({ RISING: '↑ Rising', FALLING: '↓ Falling', STEADY: '→ Steady', VARIABLE: '↕ Variable' })[f.direction] : 'Unavailable');
    text('forecast-time', f.status === 'AVAILABLE' ? `Issued ${time(f.issuedAt)}` : f.status.replaceAll('_',' '));
    if (f.windowEnd) text('forecast-window', `Forecast window: ${time(f.windowStart)} through ${time(f.windowEnd)}`);
    if (r.historicalStage) { const h = r.historicalStage; el('history').hidden = false; text('history-text', `${h.valueFt} ft · ${time(h.observedAt)} · ${age(h.ageSeconds)}${h.late ? ' · LATE' : ''}. Latest retrieval was not usable.`); }
    text('checked', `Evaluated ${time(r.asOf)} · upstream checks at most every 5 min`);
    el('pilot-error').hidden = true; el('audit').disabled = false;
  } catch(e) {
    text('stage','Unavailable'); text('forecast','Unavailable'); text('clearance','Unavailable'); text('checked','Update failed');
    text('pilot-error', e.message); el('pilot-error').hidden = false;
  } finally { el('refresh').disabled = false; }
}
el('refresh').addEventListener('click', update);
el('audit').addEventListener('click', () => {
  if (!receipt) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(receipt,null,2)], { type:'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = 'henry-live-stage-source-record.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
});
update(); setInterval(() => { if (!document.hidden) update(); },300000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) update(); });
