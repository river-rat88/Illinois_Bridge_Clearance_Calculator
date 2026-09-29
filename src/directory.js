import { Q } from './exact.js';
import { resolveCoverage } from './coverage.js';

// River miles are decimal strings. Never sort them lexicographically.
export function orderBridges(bridges, { query = '', direction = 'up', includeHistorical = false } = {}) {
  const term = query.trim().toLowerCase();
  return bridges.filter(b => (includeHistorical || !b.historical) && (!term ||
    `${b.name} ${b.riverMile} ${b.derivedRiverMile}`.toLowerCase().includes(term)))
    .sort((a,b) => (Q.parse(a.riverMile).cmp(b.riverMile) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) * (direction === 'down' ? -1 : 1));
}

export function buildDirectory(inventory, extension, references, manifest, coveragePlan) {
  const sources = new Map([...manifest.sources, extension.source].map(s => [s.id,s]));
  const seen = new Set();
  const selected = new Map(references.map(r => [r.bridgeId, { ...r,
    consistency: r.verticalDatum !== 'NAVD88' ? 'DATUM_UNRESOLVED' :
      Q.parse(r.lowSteelElevationFt).sub(r.referenceSurface.elevationFt).cmp(r.publishedClearanceFt) === 0 ? 'INTERNALLY_CONSISTENT' : 'REFERENCE_ARITHMETIC_CONFLICT'
  }]));
  const bridges = [...inventory.bridges, ...extension.bridges].map(b => {
    if (seen.has(b.id)) throw new Error('DUPLICATE_BRIDGE_ID');
    seen.add(b.id);
    const reference = selected.get(b.id);
    const historicalMile = b.historicalLightList?.riverMile;
    const riverMile = reference?.riverMile ?? historicalMile ?? b.derivedRiverMile;
    if (typeof riverMile !== 'string' || Q.parse(riverMile).cmp('0') < 0 || Q.parse(riverMile).cmp('279') > 0) throw new Error('MILE_OUT_OF_SCOPE');
    const sourceId = historicalMile ? b.historicalLightList.sourceId : b.coastPilot.sourceId;
    if (!sources.has(sourceId) || !sources.has(b.coastPilot.sourceId)) throw new Error('MILE_SOURCE_MISSING');
    const historical = b.lifecycle === 'REMOVED_SPAN_RETAINED_FOR_AUDIT';
    return { id:b.id, name:reference?.chartName ?? (b.id === 'il-henry' ? 'Henry / State Route 18 bridge' : b.nameAsPublished),
      riverMile, derivedRiverMile:b.derivedRiverMile, historical,
      mileStatus:reference?.riverMile ? 'OWNER_CONFIRMED' : historicalMile ? 'PUBLISHED_HISTORICAL' : 'DERIVED_UNVERIFIED',
      mileSourceId:sourceId, mileConflict:!!historicalMile && Q.parse(historicalMile).cmp(b.derivedRiverMile) !== 0,
      type:b.coastPilot.type ?? 'unconfirmed',
      selectedReference:!historical ? reference ?? null : null,
      research:b };
  });
  const coverage = resolveCoverage([...inventory.bridges,...extension.bridges],references,coveragePlan);
  for (const bridge of bridges) bridge.coverage = coverage.byId.get(bridge.id);
  return { schemaVersion:1, scope:extension.scope, completeness:'UNDER_REVIEW',
    coveragePolicyVersion:coverage.policyVersion, pilots:coverage.pilots,
    milePolicy:'Use owner-confirmed chart miles first, then directly published historical Light List river miles where available; otherwise use provisional Coast Pilot crosswalk. Preserve both and flag differences. Current chart verification remains pending.',
    bridges:orderBridges(bridges,{includeHistorical:true}),
    sources:[...sources.values()].filter(s=>bridges.some(b=>b.mileSourceId===s.id || b.research.coastPilot.sourceId===s.id)) };
}
