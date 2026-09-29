import { Q } from './exact.js';

// A lower reading from the archived Corps table versus a chart calculation
// at the table's implied La Salle water level. Never feed this unknown-time
// comparison into an observed-time clearance calculation.
export function lowerArchivedComparison(reference) {
  const crosscheck = reference?.corpsCalculatorCrosscheck;
  if (!crosscheck || crosscheck.status !== 'UNRECONCILED_SINGLE_SCREENSHOT') return null;
  const table = Q.parse(crosscheck.tableCurrentClearanceFt);
  const chartProxy = Q.parse(crosscheck.sameWaterProxyClearanceFt);
  const tableLower = table.cmp(chartProxy) <= 0;
  return {
    valueFt: tableLower ? crosscheck.tableCurrentClearanceFt : crosscheck.sameWaterProxyClearanceFt,
    source: tableLower ? 'CORPS_TABLE_CURRENT' : 'CHART_LOW_STEEL_AT_LASALLE_TABLE_PROXY',
    timestamp: null,
    current: false,
    measuredErrorBound: false,
    basisRecordId: crosscheck.recordId
  };
}
