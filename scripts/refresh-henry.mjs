import { createHenryService } from '../src/henry-service.js';
const service = createHenryService({ ...(process.env.HENRY_DATA_DIR ? { directory: process.env.HENRY_DATA_DIR } : {}) });
const receipt = await service.get({ force: true });
console.log(JSON.stringify({ receiptId: receipt.receiptId, snapshotId: receipt.snapshotId, ...receipt.result }, null, 2));
if (receipt.result.stage.status !== 'AVAILABLE') process.exitCode = 1;
