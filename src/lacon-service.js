import { evaluateLacon, LACON_REFERENCE } from './feeds/henry.js';
import { hash } from './feeds/usgs-pilot.js';
import { stableStringify } from './exact.js';

// Henry and Lacon share the same accepted source snapshot and polling cycle.
export function createLaconService(henryService) {
  return { async get() {
    const base = await henryService.get();
    const input = { ...base.input, bridgeReference: structuredClone(LACON_REFERENCE) };
    const result = evaluateLacon(input, base.result.asOf);
    if (base.result.historicalStage) result.historicalStage = structuredClone(base.result.historicalStage);
    const body = { schemaVersion:1, input, historicalContext:base.historicalContext, snapshotId:base.snapshotId, result };
    return { receiptId:`sha256:${hash(stableStringify(body))}`, ...body };
  } };
}
