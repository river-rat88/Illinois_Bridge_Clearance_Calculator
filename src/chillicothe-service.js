import { join } from 'node:path';
import { createSnapshotService } from './snapshot-service.js';
import { URLS, evaluateChillicothe, CHILLICOTHE_REFERENCE, TRANSFORM_EVIDENCE } from './feeds/chillicothe.js';
export function createChillicotheService(options={}) {
  return createSnapshotService({urls:URLS,evaluate:evaluateChillicothe,reference:CHILLICOTHE_REFERENCE,
    inputContext:{datumTransformEvidence:TRANSFORM_EVIDENCE},directory:join(process.cwd(),'var','chillicothe'),...options});
}
