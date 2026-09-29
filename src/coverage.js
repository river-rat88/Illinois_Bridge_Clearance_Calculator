import { Q } from './exact.js';

const PHASES = new Set(['REFERENCE_PENDING','ASSOCIATION_PENDING','FEED_PENDING','PILOT','HISTORICAL']);
const OWNER_CHART_SELECTED_IDS = new Set(['il-illinois-central-lasalle','il-lasalle','il-peru','il-utica','il-spring-valley','il-hennepin-i180']);
const SUPERSEDED_RESEARCH_FLAGS = new Set(['UNRECONCILED_PUBLISHED_CLEARANCE_DIFFERENCE','REFERENCE_SURFACE_TIE_UNVERIFIED','RIVER_MILE_DIFFERENCE']);
const assert = (condition, code) => { if (!condition) throw new Error(code); };

function nextEvidence(bridge, phase) {
  if (phase === 'HISTORICAL') return 'Removed span retained for source history; no active calculation.';
  if (phase === 'PILOT') return 'Compare independent bridge readings with the observation-time estimate; overall accuracy remains unverified.';
  if (phase === 'ASSOCIATION_PENDING') return 'Identify the chart-depicted/local gauge series, its datum and the bridge-water relationship.';
  if (phase === 'FEED_PENDING') return 'Bind and validate the approved gauge observation series, datum epoch and source receipt.';
  if (bridge.coastPilot.type === 'lift' || bridge.issues.includes('FULLY_OPEN_GEOMETRY_UNVERIFIED'))
    return 'Confirm controlling fully open low steel and its reference pool as NAVD88 elevations.';
  if (bridge.issues.includes('GROUP_OR_PARALLEL_SPANS_TO_RESOLVE') || bridge.issues.includes('REPLACEMENT_STATUS_TO_VERIFY') || bridge.issues.includes('REPLACEMENT_REQUIRES_NEW_GEOMETRY'))
    return 'Resolve the current physical channel span, then confirm its NAVD88 low steel and pool reference.';
  return 'Confirm controlling low steel and its reference pool as NAVD88 elevations.';
}

// Research values remain research. Only an explicit pilot entry may bind an
// observation endpoint, and even that entry is not production eligible.
export function resolveCoverage(bridges, references, plan) {
  assert(plan?.schemaVersion === 1 && typeof plan.policyVersion === 'string' && Array.isArray(plan.entries), 'COVERAGE_SCHEMA_CHANGED');
  const byId = new Map(), bridgeById = new Map(bridges.map(b => [b.id,b]));
  const selected = new Map();
  for (const r of references) {
    assert(!selected.has(r.bridgeId), 'DUPLICATE_REFERENCE');
    selected.set(r.bridgeId,r);
  }
  const endpoints = new Set(), pilots = [];
  for (const entry of plan.entries) {
    assert(entry && typeof entry.bridgeId === 'string' && bridgeById.has(entry.bridgeId), 'UNKNOWN_COVERAGE_BRIDGE');
    assert(!byId.has(entry.bridgeId), 'DUPLICATE_COVERAGE_BRIDGE');
    assert(PHASES.has(entry.phase), 'COVERAGE_PHASE_INVALID');
    const bridge = bridgeById.get(entry.bridgeId), ref = selected.get(entry.bridgeId);
    const historical = bridge.lifecycle === 'REMOVED_SPAN_RETAINED_FOR_AUDIT';
    assert((entry.phase === 'HISTORICAL') === historical, 'COVERAGE_LIFECYCLE_CONFLICT');
    if (entry.phase === 'PILOT') {
      assert(ref && ref.pilotEstimateEnabled === true && ref.verticalDatum === 'NAVD88' &&
        Q.parse(ref.lowSteelElevationFt).sub(ref.referenceSurface.elevationFt).cmp(ref.publishedClearanceFt) === 0 &&
        ref.bridgeWaterModel?.gaugeId === entry.gaugeId &&
        (ref.openingPosition === 'FIXED' || ref.openingPosition === 'FULLY_OPEN'), 'COVERAGE_REFERENCE_CONFLICT');
      assert(typeof entry.stageLabel === 'string' && entry.stageLabel.length > 0 &&
        /^\/api\/[a-z0-9-]+$/.test(entry.endpoint) && !endpoints.has(entry.endpoint), 'COVERAGE_ENDPOINT_CONFLICT');
      endpoints.add(entry.endpoint);
      pilots.push({bridgeId:entry.bridgeId,gaugeId:entry.gaugeId,endpoint:entry.endpoint,label:entry.stageLabel});
    } else if (entry.phase === 'FEED_PENDING') {
      assert(ref && ref.verticalDatum === 'NAVD88' && ref.bridgeWaterModel?.gaugeId === entry.gaugeId &&
        typeof entry.gaugeId === 'string' && entry.gaugeId.length > 0 &&
        entry.endpoint === null && entry.stageLabel === null, 'UNAPPROVED_GAUGE_BINDING');
    } else {
      assert(entry.gaugeId === null && entry.endpoint === null && entry.stageLabel === null, 'UNAPPROVED_GAUGE_BINDING');
      assert(entry.phase === 'HISTORICAL' || (entry.phase === 'REFERENCE_PENDING' ? !ref : !!ref), 'COVERAGE_REFERENCE_CONFLICT');
    }
    const blockers = entry.phase === 'PILOT' ? ['OVERALL_ACCURACY_UNVERIFIED'] :
      entry.phase === 'HISTORICAL' ? ['REMOVED_SPAN'] :
      entry.phase === 'REFERENCE_PENDING' ? [
        'SELECTED_NAVD88_REFERENCE_REQUIRED',
        ...(bridge.coastPilot.type === 'lift' || bridge.issues.includes('FULLY_OPEN_GEOMETRY_UNVERIFIED') ? ['FULLY_OPEN_GEOMETRY_REQUIRED'] : []),
        'GAUGE_ASSOCIATION_REQUIRED'
      ] : entry.phase === 'ASSOCIATION_PENDING' ? ['GAUGE_ASSOCIATION_REQUIRED'] : ['OBSERVATION_FEED_REQUIRED'];
    const researchFlags = entry.phase !== 'REFERENCE_PENDING' && OWNER_CHART_SELECTED_IDS.has(entry.bridgeId)
      ? bridge.issues.filter(flag => !SUPERSEDED_RESEARCH_FLAGS.has(flag)) : bridge.issues;
    byId.set(entry.bridgeId,{ phase:entry.phase, gaugeId:entry.gaugeId,
      estimateEligible:entry.phase === 'PILOT', productionEligible:false,
      blockers, nextEvidence:nextEvidence(bridge,entry.phase), researchFlags });
  }
  assert(byId.size === bridges.length, 'COVERAGE_INCOMPLETE');
  for (const id of selected.keys()) assert(byId.has(id), 'UNKNOWN_REFERENCE_BRIDGE');
  return {byId,pilots,policyVersion:plan.policyVersion};
}
