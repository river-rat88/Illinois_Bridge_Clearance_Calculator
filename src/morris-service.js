import { join } from 'node:path';
import { createSnapshotService } from './snapshot-service.js';
import { URLS, evaluateMorris, MORRIS_REFERENCE } from './feeds/morris.js';
export function createMorrisService(options={}) {
 return createSnapshotService({urls:URLS,evaluate:evaluateMorris,reference:MORRIS_REFERENCE,directory:join(process.cwd(),'var','morris'),...options});
}
