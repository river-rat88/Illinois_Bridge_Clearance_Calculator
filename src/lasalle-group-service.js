import { readFileSync } from 'node:fs';
import { hash } from './feeds/usgs-pilot.js';
import { stableStringify } from './exact.js';
import { evaluateLaSalleBridge } from './feeds/lincoln.js';

const references = Object.fromEntries(['il-illinois-central-lasalle','il-lasalle','il-peru'].map(id => [id,
  JSON.parse(readFileSync(new URL(`../data/${id}-bridge-reference.json`, import.meta.url), 'utf8'))]));

// Reuse one immutable La Salle source snapshot, then issue a distinct receipt
// for each bridge reference. The feed is never fetched independently per span.
export function createLaSalleGroupServices(lincolnService) {
  return Object.fromEntries(Object.entries(references).map(([bridgeId, reference]) => [bridgeId, {
    async get() {
      const base = await lincolnService.get();
      const input = { ...base.input, bridgeReference: structuredClone(reference) };
      const result = evaluateLaSalleBridge(input, base.result.asOf, reference);
      if (base.result.historicalStage) result.historicalStage = structuredClone(base.result.historicalStage);
      const body = { schemaVersion: 1, input, historicalContext: base.historicalContext,
        snapshotId: base.snapshotId, result };
      return { receiptId: `sha256:${hash(stableStringify(body))}`, ...body };
    }
  }]));
}
