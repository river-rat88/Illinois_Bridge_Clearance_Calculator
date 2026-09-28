import test from 'node:test';
import assert from 'node:assert/strict';
import { withPocRange } from '../src/poc-range.js';

test('proof-of-concept scenario rounds both exact endpoints outward and never asserts a measured bound',()=>{
  const estimate={status:'ESTIMATED',valueFt:'61.9',trace:{unroundedClearanceFt:{numerator:'61989',denominator:'1000',unit:'ft'}}};
  const result=withPocRange(estimate);
  assert.deepEqual(result.pocRange,{lowerFt:'58.9',upperFt:'65.0',halfWidthFt:'3',
    basis:'OWNER_SELECTED_ILLUSTRATIVE_SCENARIO',measuredErrorBound:false,confidenceLevel:null,
    calculation:'EXACT_ESTIMATE_PLUS_MINUS_3_FT_OUTWARD_TO_0.1_FT'});
  assert.equal(result.valueFt,'61.9');assert.equal(estimate.pocRange,undefined);
  assert.deepEqual(withPocRange({status:'SOURCE_UNAVAILABLE',valueFt:null}),{status:'SOURCE_UNAVAILABLE',valueFt:null});
  assert.throws(()=>withPocRange({status:'ESTIMATED',valueFt:'61.9'}),/ESTIMATE_TRACE_MISSING/);
});
