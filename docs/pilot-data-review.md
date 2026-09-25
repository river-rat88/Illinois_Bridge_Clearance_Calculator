# Real-data inventory and pilot selection

Research reviewed September 25, 2026. This milestone supplies a source-backed inventory and three pilot candidates. **No real bridge is approved for live calculation yet.** The existing webpage continues to display its labeled synthetic examples.

## What is ready

- [Complete source-row inventory](bridge-inventory-table.md): all 37 crossing rows from NOAA Coast Pilot 6, printed pages 390–391, September 20, 2026 edition, within the assumed Illinois River mile 0–273 scope.
- [Machine-readable inventory](../data/research/bridge-inventory.json): original measurements, original mile system, provisional river-mile crosswalk, historical Coast Guard comparisons, explicit issues and approval state.
- [Pilot/gauge records](../data/research/pilot-candidates.json): three candidates with source metadata and unresolved work. No approved transformations or observations are populated.
- [Source manifest](../data/research/sources.json) and text evidence: retrieval date, original-document SHA-256, excerpt SHA-256, edition and locator. Full downloaded PDFs/HTML are not committed; the reviewed text excerpts are. Hashes establish content integrity, not agency approval or a surveyed accuracy claim.

The 37 records are **source crossing rows, not 37 confirmed active physical bridges**. One row explicitly describes a removed swing span; several rows group parallel bridges. State Route 26 and the two Valley City rows need identity reconciliation. Lock/dam service structures and the navigable route around Marseilles must be checked against navigation charts before claiming every navigable overhead crossing is covered. Coordinates and current owner asset IDs remain unverified.

## Selected pilots

| Order | Bridge | Candidate gauge | Why selected | First blocking evidence |
|---|---|---|---|---|
| 1 | Henry / SR18, approximately RM 196.0 | USACE HNYI2; USGS 05558300 cross-reference | Gauge description places it 600 ft upstream of the bridge; suitable first fixed-bridge study | Reconcile CP 59 ft with historical LL 59.8 ft; establish low steel, gauge-zero epoch and water-surface transfer |
| 2 | Morris / SR47, approximately RM 263.4–263.5 | USACE MORI2, RM 263.1 | Documented downstream gauge; exercises a measured bridge-to-gauge offset | Reconcile mile and reference-surface differences; validate offset and downstream backwater effects |
| 3 | Elgin–Joliet–Eastern railroad lift, RM 270.6 | USACE IL04 **tailwater** | Exercises fully open geometry and correct lock-side selection | Resolve CP-derived 56.3 ft versus historical LL explicit 61.0 ft; confirm span identity and tailwater series |

These are study selections, not approved nearest-gauge assignments. In each case, compare concurrent bridge-local water levels with gauge observations over rising and falling conditions and the intended operating range. Fit and independently validate a direct or fixed-offset model only if its residuals and all other error components support the total error target. Otherwise select a better instrument/model or leave the result unavailable.

### Gauge metadata that can be recorded now

| Gauge | Published zero/reference | Published flat pool | Interpretation and unresolved work |
|---|---|---|---|
| HNYI2 | 425.88 ft NGVD29 | Stage 14.12 ft; sum 440.00 ft | Gauge-zero effective epoch and exact foot realization missing. USGS site altitude 425.85 ft NAVD88 is not by itself a documented zero/transform tie. |
| MORI2 | 478.50 ft NGVD29 | Stage 4.30 ft; sum 482.80 ft | Prove bridge normal pool and station flat pool equivalence. Gauge is upstream of Nettle Creek; downstream backwater still requires validation. |
| IL04 | Zero 0 ft NGVD29 | Upper pool 504.50 ft; tail 482.80 ft | Select the tailwater parameter. Verify absolute-elevation semantics; do not add a nonzero stage origin or substitute upper pool. |

Do not infer an Illinois-wide NGVD29→NAVD88 offset, or even a Henry-specific −0.03 ft offset, from two site metadata numbers. Obtain the benchmark tie, realization, unit and effective interval. A clearance/reference-stage shortcut may avoid a datum conversion only after same-gauge, same-epoch and bridge-water equivalence are established.

USGS Henry metadata explicitly says CST and no daylight saving. Parse the actual feed's declared time offset and parameter metadata; never assume every provider's “Central” string follows the same daylight-saving convention. Source-page stage and forecast snippets are archived for provenance only; they are not a live dataset.

## Source findings and quarantines

1. **Mile systems differ.** Coast Pilot uses distance from Chicago Lock. `327.2 − CP_mile` is a provisional reconciliation value. The historical Light List uses river miles above the mouth. Original values remain separate, and disagreements are flagged rather than silently overwritten.
2. **Publication date is not structure-survey date.** The September 2026 Coast Pilot still includes a removed swing-span row. IDOT's December 31, 2025 update reports demolition of the old eastbound McClugage bridge in 2025 and opening of the new bridge in 2024. The old grouped 65/65.8-ft entries cannot approve the replacement's geometry.
3. **Fully open values need explicit interpretation.** Coast Pilot gives closed heights plus travel for many lift spans. Peoria & Pekin's travel is “about 47 feet.” Norfolk Southern/Valley City has inline travel 45.5 ft but also references the approximately 47-ft note. Beardstown's 54-ft entry lacks an unambiguous open-height derivation. These remain blocked.
4. **Substantial published differences require reconciliation.** EJE is 56.3 ft by CP arithmetic versus historical LL 61.0 ft open; Pearl is 89.5 ft by CP arithmetic versus historical LL 69.0 ft open. Differences might reflect geometry, reference surfaces, vintage or an error; this review does not choose an operational winner. Preserve the original assertions and obtain current bridge-owner/USCG geometry and reference evidence.
5. **The current Light List does not fill the gap.** The September 23, 2026 weekly Volume V was checked. The relevant Illinois section lacks the pilot bridge-clearance records found in the 2024 publication. Their absence does not establish removal. The 2024 edition, corrected through 52/23, is explicitly historical comparison evidence, never current approval.
6. **The undated USACE gauge sheet has questionable metadata.** Its Ottawa mile 218.4 conflicts with station OTWI2's 239.8 and duplicates the Spring Valley mile. The OTWI2 page also says the instrument cannot measure below 459.85 ft while displaying a lower recent reading. Do not turn either into an automatic operational rule until the agency resolves the inconsistency. Ottawa also lies at the Fox River confluence, requiring explicit hydraulic review.
7. **Replacement plans are not completion evidence.** The Florence project page's anticipated construction schedule does not establish which span is present in September 2026. Verify status and the current controlling span before activation.
8. **The USACE bridge calculator was unavailable during retrieval.** Its error page and search-engine-cached stage values were excluded from the inventory. No live clearance was inferred from a cached result.

## Next implementation ticket: Henry evidence and feed adapter

Start with Henry and build an ingestion path while geometry validation proceeds:

1. Resolve the current physical bridge, controlling navigation opening and surveyed low-steel elevation/reference. Obtain effective dates and the current gauge-zero/benchmark evidence; retain superseded assertions with their valid intervals.
2. Confirm a machine-readable official stage series and metadata. Store immutable payload bytes, source URL, fetch time, observation time, revision, parameter, datum epoch, units and quality flags. Do not scrape displayed “latest stage” as the production interface.
3. Collect paired bridge/gauge measurements. Record the proposed model, reach, valid elevation range, hydraulic regimes, independent validation measurements and bounded errors. A small fitted residual alone is not a complete error budget.
4. Keep the confirmed **strictly older than 24 hours → LATE** label. Determine calculation eligibility separately from the target accuracy and rate of change. Exactly 24 hours is not late. Preserve unavailable rows and the last reading as explicitly historical context; never advance its timestamp after a fetch failure.
5. Add an independently validated forecast association. Verify availability, issue time, run identity, units and horizon before showing rising/falling/steady/variable. Otherwise show “Forecast unavailable.” An observed 24-hour change is not a forecast, and a forecast does not replace a current observation.
6. Exercise outages, invalid readings, changed gauge epochs, conflicting revisions, wrong lock-side series and out-of-range hydraulics against the existing deterministic engine. Save replayable receipts and compare pilot results with independent measurements.
7. Approve a complete error budget **strictly below 0.5 ft**, including source geometry/reference, gauge, transformation, water transfer, age and display rounding. Whole-foot published values alone do not demonstrate this. Continue to show simple calculated clearance, with no uncertainty deduction. Lift scenarios remain “fully open assumed; position not verified.”

Release gate: reviewed geometry, datum/epoch chain, official feed contract, bridge-water relationship, freshness policy and error evidence must all pass before enabling any real numeric clearance. Wider coverage follows the same process bridge by bridge.

## Reproduce the data checks

Run `npm run inventory:check`. It checks 37 unique rows, scope and exact mile arithmetic, source references, evidence hashes, pilot joins, missing/unapproved metadata, fully open research arithmetic and known quarantines. It runs locally without fetching mutable sources. These checks validate the research package's integrity and internal consistency; they do not certify physical accuracy or inventory completeness.

Principal official documents: [NOAA Coast Pilot 6](https://www.nauticalcharts.noaa.gov/publications/coast-pilot/files/cp6/CPB6_WEB.pdf), [USCG 2024 Light List V](https://www.navcen.uscg.gov/sites/default/files/pdf/lightLists/LightList_V5_2024.pdf), [USCG current weekly Volume V](https://www.navcen.uscg.gov/sites/default/files/pdf/lightLists/weeklyUpdates/v5D08WeeklyChanges.pdf). Additional station and IDOT links are in the source manifest.
