import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { hash, check, utc } from './feeds/usgs-pilot.js';
import { stableStringify } from './exact.js';

async function immutable(path, body) {
  try { await writeFile(path, body, { flag: 'wx', mode: 0o600 }); }
  catch(e) { if (e.code !== 'EEXIST') throw e; check(await readFile(path, 'utf8') === body, 'STORAGE_HASH_MISMATCH'); }
}
export function createSnapshotService({ urls: sourceUrls, evaluate, reference, inputContext = {}, directory, fetchImpl = fetch,
  clock = () => new Date().toISOString(), refreshMs = 300000, timeoutMs = 15000, accept = 'application/json' } = {}) {
  let state, initialized = false, inFlight;
  async function initialize() {
    if (initialized) return;
    await mkdir(join(directory, 'raw'), { recursive: true });
    await mkdir(join(directory, 'snapshots'), { recursive: true });
    let pointer;
    try { pointer = JSON.parse(await readFile(join(directory, 'current.json'), 'utf8')); }
    catch(e) { if (e.code !== 'ENOENT') throw e; }
    if (pointer) {
      check(/^[a-f0-9]{64}$/.test(pointer.id), 'STORAGE_HASH_MISMATCH');
      const body = await readFile(join(directory, 'snapshots', `${pointer.id}.json`), 'utf8');
      check(hash(body) === pointer.id, 'STORAGE_HASH_MISMATCH');
      state = JSON.parse(body);
      state.snapshotId = pointer.id;
      for (const s of Object.values(state.snapshot.sources)) if (s.body !== undefined) check(hash(s.body) === s.sha256, 'STORAGE_HASH_MISMATCH');
    }
    initialized = true;
  }
  async function download(url) {
    const s = { url, requestedAt: clock(), receivedAt: null, httpStatus: null, contentType: null };
    try {
      const r = await fetchImpl(url, { headers: { Accept: accept }, signal: AbortSignal.timeout(timeoutMs), redirect: 'error' });
      s.httpStatus = r.status; s.contentType = r.headers.get('content-type') || '';
      const reader = r.body.getReader(), chunks = []; let length = 0;
      try {
        for (;;) { const { done, value } = await reader.read(); if (done) break; length += value.length;
          check(length <= 1048576, 'PAYLOAD_TOO_LARGE'); chunks.push(Buffer.from(value)); }
      } finally { await reader.cancel(); }
      s.body = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)); s.sha256 = hash(s.body);
      if (!r.ok) s.error = `HTTP_${r.status}`;
    } catch(e) { s.error = e.code === 'PAYLOAD_TOO_LARGE' ? e.code : 'NETWORK_OR_TIMEOUT'; }
    s.receivedAt = clock();
    if (s.body !== undefined) await immutable(join(directory, 'raw', `${s.sha256}.txt`), s.body);
    return s;
  }
  async function refresh() {
    await initialize();
    const queryAt = clock(), urls = typeof sourceUrls === 'function' ? sourceUrls(queryAt) : sourceUrls;
    const entries = await Promise.all(Object.entries(urls).map(async ([k,url]) => [k,await download(url)]));
    const snapshot = { schemaVersion: 1, ...(typeof sourceUrls === 'function' ? { queryAt } : {}), sources: Object.fromEntries(entries), previousAcceptedStage: state?.lastAcceptedStage ?? null }, completedAt = clock();
    const result = evaluate(snapshot, completedAt);
    const current = result.stage.status === 'AVAILABLE' ? result.stage : null;
    const next = { snapshot, completedAt, previousSnapshotId: state?.snapshotId ?? null,
      lastAcceptedStage: current ?? state?.lastAcceptedStage ?? null };
    const body = stableStringify(next), id = hash(body);
    await immutable(join(directory, 'snapshots', `${id}.json`), body);
    const temp = join(directory, `current-${randomUUID()}.tmp`);
    await writeFile(temp, JSON.stringify({ id }), { mode: 0o600 });
    await rename(temp, join(directory, 'current.json'));
    state = { ...next, snapshotId: id };
  }
  async function get({ force = false } = {}) {
    if (!inFlight) inFlight = (async () => {
      await initialize();
      const now = Date.parse(utc(clock()));
      if (force || !state || now - Date.parse(state.completedAt) >= refreshMs || now < Date.parse(state.completedAt)) await refresh();
    })().finally(() => { inFlight = null; });
    await inFlight;
    const input = { ...state.snapshot, ...structuredClone(inputContext), bridgeReference: structuredClone(reference) };
    const asOf = clock(), result = evaluate(input, asOf);
    const previous = result.stage.status !== 'AVAILABLE' ? state.lastAcceptedStage : null;
    if (previous) {
      const ageSeconds = (Date.parse(asOf)-Date.parse(previous.observedAt))/1000;
      result.historicalStage = { ...previous, status: 'HISTORICAL_ONLY', ageSeconds, late: ageSeconds > 86400, delayed: ageSeconds > 4320 };
    }
    const body = { schemaVersion: 1, input, historicalContext: previous, snapshotId: state.snapshotId ?? null, result };
    return { receiptId: `sha256:${hash(stableStringify(body))}`, ...body };
  }
  return { get };
}
