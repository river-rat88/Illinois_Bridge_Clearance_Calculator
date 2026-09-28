import { join } from 'node:path';
import { createSnapshotService } from './snapshot-service.js';
import { URLS, evaluateLincoln, LINCOLN_REFERENCE } from './feeds/lincoln.js';
export function createLincolnService(options = {}) {
  return createSnapshotService({ urls: URLS, evaluate: evaluateLincoln, reference: LINCOLN_REFERENCE,
    directory: join(process.cwd(), 'var', 'lincoln'), ...options });
}
