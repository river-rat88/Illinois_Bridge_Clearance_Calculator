import { Q } from './exact.js';

// An owner-selected illustration around a pilot calculation, not a measured
// uncertainty interval or a verified minimum clearance. Use the unrounded
// value and round both endpoints outward to tenths.
export function withPocRange(clearance) {
  if (clearance.status !== 'ESTIMATED') return clearance;
  const raw = clearance.trace?.unroundedClearanceFt;
  if (!raw || raw.unit !== 'ft' || !/^-?\d+$/.test(raw.numerator) || !/^\d+$/.test(raw.denominator)) {
    throw new Error('ESTIMATE_TRACE_MISSING');
  }
  const exact = new Q(BigInt(raw.numerator), BigInt(raw.denominator));
  const width = Q.parse('3');
  const lower = exact.sub(width).floor(1);
  const upper = Q.parse(exact.add(width).mul('-1').floor(1)).mul('-1').floor(1);
  return { ...clearance, pocRange: {
    lowerFt: lower, upperFt: upper, halfWidthFt: '3',
    basis: 'OWNER_SELECTED_ILLUSTRATIVE_SCENARIO',
    measuredErrorBound: false, confidenceLevel: null,
    calculation: 'EXACT_ESTIMATE_PLUS_MINUS_3_FT_OUTWARD_TO_0.1_FT'
  } };
}
