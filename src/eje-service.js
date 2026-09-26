import { join } from 'node:path';
import { createSnapshotService } from './snapshot-service.js';
import { urlsFor, evaluateEje, EJE_REFERENCE } from './feeds/eje.js';
export function createEjeService(options={}) {
 return createSnapshotService({urls:urlsFor,evaluate:evaluateEje,reference:EJE_REFERENCE,directory:join(process.cwd(),'var','eje'),accept:'application/json;version=2',...options});
}
