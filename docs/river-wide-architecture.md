# River-wide bridge coverage architecture

Status: proof-of-concept architecture, September 28, 2026. Scope is Illinois Waterway river miles 0–279. The working source catalog has **38 crossing rows**: 37 displayed rows and one removed span retained for audit. Rows can describe grouped or parallel structures and are not a verified count of individual active bridges. Four rows have source-backed, assumption-labeled pilot estimates; the other 33 active rows remain visibly pending. No pilot is production eligible.

## Current executable contract

`data/bridge-coverage-plan.json` names **every source crossing ID** and records its activation phase. `src/coverage.js` checks it against the source inventory and selected NAVD88 references when building `/api/bridges`. A missing, duplicate, unknown or incompatible entry fails startup. The webpage obtains the connected pilot list and API endpoints from this validated directory response; it no longer maintains a second list of bridge endpoints. The server still explicitly registers each trusted feed adapter and rejects a plan whose pilot endpoints have no service.

| Phase | Required evidence | Result |
|---|---|---|
| `REFERENCE_PENDING` | Confirm the current physical channel opening, NAVD88 controlling low steel, reference pool elevation and listed clearance. For lifts, confirm the **fully open** geometry. | Listed research assertions stay in audit detail; gauge and calculated clearance stay unavailable. |
| `ASSOCIATION_PENDING` | A selected, internally consistent bridge reference exists. Determine a station within the applicable hydraulic reach and document the bridge-water relationship. | Reference may display, but no gauge is bound. |
| `FEED_PENDING` | The selected bridge reference names a gauge/model. Verify the stage/elevation parameter, local zero, datum transformation and observation series, and implement its source adapter. | No live endpoint or clearance until feed checks and receipts exist. |
| `PILOT` | A selected reference, explicitly scoped gauge/model and registered adapter produce deterministic receipts. | Assumption-labeled estimate at observation time and illustrative ±3-ft scenario. `productionEligible: false`. |
| `HISTORICAL` | Source evidence for a removed span. | Retained for research, excluded from the default active list; no calculation. |

The first three phases are **not** automatic progressions. A new source row cannot become numeric because a Coast Pilot pool clearance or historical Light List value happens to exist. The activation plan has no gauge IDs for pending rows. The detailed research flags and a bridge-specific next evidence request accompany each row. A missing or changed datum, identity, quality or source receipt blocks a pilot even after its phase is `PILOT`.

## Data model to fill as evidence arrives

| Record | Key fields and invariants |
|---|---|
| `crossing` | Stable catalog ID, original agency names and mile systems, source rows, lifecycle and aliases. A row may need splitting into separate physical spans; preserve the old row and source lineage. |
| `opening` | Physical bridge/span ID, controlling channel opening, fixed or fully open position, effective dates, NAVD88 low-steel elevation, listed clearance, reference surface and source artifact hash. Reconcile `low steel − pool = listed clearance` exactly before selection. |
| `gauge` and `series` | Station ID, coordinates, reach and side of controlling works, parameter semantics (`STAGE_ABOVE_GAUGE_ZERO` or `ABSOLUTE_ELEVATION`), agency series ID, units, expected cadence and quality codes. |
| `gauge_zero_epoch` and `datum_transform` | Physical zero and its effective interval; original geodetic datum, foot realization, location-specific NAVD88 transformation, model version, input and output source hashes. A stage uses the zero effective at its observation time. An absolute elevation never adds a zero. |
| `bridge_water_model` | Bridge opening, gauge series, `DIRECT`, `FIXED_OFFSET`, `BRACKETED_LINEAR` or rated model, same-reach evidence, offsets/ranges, hydraulic regime and version. Never borrow the numerically nearest gauge or cross a controlling boundary silently. |
| `observation_snapshot` | Raw bytes, SHA-256, requested/received/observed times, source revision, status, quality and parsed exact decimal strings. Keep an immutable snapshot even when a feed fails. |
| `calculation_receipt` | All selected record versions, observation hashes, transformations, exact water and clearance, outward-rounded proof-of-concept scenario, forecast *separately*, age flags and assumption labels. Replay from the same inputs must reproduce the same result. |
| `field_comparison` | Independent photo/board reading, bridge opening, timestamp, reading precision and corresponding receipt ID. It is validation evidence, never an automatic correction to the model. |

For stage above a local zero, normalized water at gauge \(g\) is \(W_g^{88}=h_g+Z_g^D+T_{D\to88}(x_g,y_g,e)\). The approved bridge-water model gives \(W_b^{88}=F_m(W_g^{88},\ldots)\); bridge clearance is \(C_b=S_b^{88}-W_b^{88}\). All measured quantities stay as decimal strings and exact rationals. If any link is missing, the bridge remains listed with a pending reason. The ±3-ft display is an **illustration**, not a verified error interval or a confirmed lower clearance.

## Hydraulic reach and gauge selection

Before assigning any of the 33 pending crossings, inventory the controlling works at LaGrange, Peoria, Starved Rock, Marseilles and Dresden Island, the navigation route around Marseilles, major tributary joins and Mississippi backwater. Store *validated* reach boundaries and applicable fixed-pool/open-pass regimes in a future versioned reach registry. Until then, river mile and pool name are useful for review but do not activate a gauge. A source must establish whether the selected series is headwater or tailwater at a lock. Near Peoria and LaGrange, operation and backwater can change the water relationship; no river-wide constant offset is assumed.

Selection order is a direct bridge or same-water-surface gauge, a documented fixed offset, compatible bracketing gauges within one reach, then a calibrated hydraulic model. Each option still needs a scoped datum chain and timestamp policy. Alternative gauges are explicitly approved for the same physical water surface; they are not substituted merely because the primary feed is unavailable. Forecast direction belongs to its named station and never supplies the observed clearance.

## Adding the next bridge

1. Reconcile the source crossing with the current physical channel span. Preserve old names and rows if replaced or grouped. Record owner/chart elevation, normal/flat pool reference, position, units, source edition and image/hash. Avoid treating closed-position lift travel arithmetic as confirmed fully open clearance.
2. Add a selected NAVD88 reference. Exact low-steel arithmetic and date/position checks should pass; move its plan entry to `ASSOCIATION_PENDING` while keeping endpoint and gauge ID null.
3. Identify a station and same-reach relationship, then record original stage/absolute-elevation semantics, gauge-zero epoch and any location-specific transformation. Move to `FEED_PENDING` only when a scoped bridge-water model is documented; the endpoint remains null.
4. Implement a source-specific adapter using immutable raw snapshots and deterministic validation of station ID, units, times, revisions, quality and metadata drift. Register its server endpoint and plan entry together. Add a known arithmetic case, rejection cases, outage/historical case and receipt replay check; only then mark `PILOT`.
5. Compare future independent bridge readings over different river conditions. Keep source evidence, receipt and measured residuals separate. Do not promote to operational use from a few visually read values or from the illustrative three-foot scenario.

Good first intake candidates are the Illinois Central bridge at mile 225.5 and State Route 351 at mile 224.7 because their chart details could be compared beside the Lincoln/La Salle work. This **does not assign LSLI2 to either crossing**. The EJE and other lift rows need fully open opening evidence before their Coast Pilot research clearances can become selected NAVD88 references. The McClugage, Valley City and replacement-flagged rows need physical span reconciliation first.

## Implementation boundary

The current proof of concept keeps one immutable snapshot service per pilot in `var/`, with exact source receipts, and a static source inventory. A river-wide service should eventually use versioned persistent tables for sources, bridge/opening identity, datum and gauge-zero epochs, reach associations, observations, model approvals, field comparisons and receipt hashes. Store both when an assertion was **valid in the river** and when the system **learned or changed** it, so an old receipt replays against its then-selected records after chart or gauge revisions. The transition to that database and any deployed operational calculator requires a separate review. This architecture does not silently turn the remaining inventory into calculated clearances.
