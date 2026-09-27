import { join } from 'node:path';
import { createSnapshotService } from './snapshot-service.js';
import { URLS, evaluateHenry, HENRY_REFERENCE } from './feeds/henry.js';
export function createHenryService(options={}) {
 return createSnapshotService({urls:URLS,evaluate:evaluateHenry,reference:HENRY_REFERENCE,directory:join(process.cwd(),'var','henry'),...options});
}
