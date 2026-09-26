# Implementation status and handoff

## Milestone 1: calculation prototype

This implementation follows the confirmed specification with observations older than 86,400 seconds marked late. The initial deliverable is a responsive, runnable demonstration and independently testable arithmetic core, not river-wide operational coverage.

### Implemented

- Exact rational arithmetic with BigInt, decimal-string inputs, international feet/metres/US survey feet, exact interpolation, downward display rounding.
- NAVD88 canonical elevations; explicit approved, versioned, entity-scoped and time-scoped datum offsets. No Illinois-wide NGVD29 offset.
- Gauge-zero epochs with half-open effective intervals; no zero addition to absolute elevations.
- Published clearance plus bridge-specific reference surface creates low-steel elevation. LWRP/pool level remain surface labels rather than geodetic datums.
- Direct, fixed-offset and bracketed water models; explicit same-reach and regime gates, elevation ranges, and no extrapolation.
- Deterministic latest-observation/revision selection at a common UTC cutoff. Only records received by the cutoff qualify. Equal-revision conflicts block; no averaging or silent fallback from rejected latest readings.
- Missing, invalid-quality, wrong-series, unit mismatch, impossible/future timestamp, late, stale, datum, model, geometry and accuracy failure states.
- Lift-bridge fully open scenario and restriction checks.
- Reviewed component error-budget gate strictly below 0.5 ft, with elapsed-time bound, explicit multi-gauge mismatch allowance and actual display-rounding difference included. Sample evidence is labeled synthetic.
- Independent forecast direction with same-run interpolation, horizon coverage, approved association and issue-age checks. Rise/fall/steady/variable classification includes intermediate extrema.
- Full downloadable calculation receipts with stable SHA-256 IDs and source-payload integrity verification.
- Responsive interface with fictional bridge examples, scenario controls, search, navigation ordering and audit detail.

### Review defaults, not approved operational policy

| Setting | Prototype value | Status |
|---|---|---|
| Observation late flag | Age >86,400 seconds | Confirmed owner requirement |
| Calculation stop | Age >7,200 seconds | Synthetic gauge policy only |
| Forecast horizon | Next 86,400 seconds | Proposed |
| Forecast deadband | ±0.1 ft | Proposed |
| Forecast maximum issue age | 21,600 seconds | Synthetic policy only |
| Clearance precision | Down to 0.1 ft | Specification design choice; rounding included in error budget |

### Validation limits

The synthetic tests prove programmed behavior for their inputs. They do not validate bridge elevations, gauge ties, real hydraulic relationships, sensor quality, or six-inch field accuracy. Approval flags and error allowances are trusted versioned inputs; the future administration/ingestion service must enforce who can approve them and retain the evidence.

The engine currently reports the first blocking calculation reason, with observation freshness and forecast status separate. Full multi-issue quarantine diagnostics are deferred. The synthetic input snapshot contains the candidate observation records. Henry now has separate raw official-feed parsing and local snapshot persistence, described below. Forecast metadata is defined once per run; an ingestion adapter must reject mixed-run, mixed-datum or mixed-epoch points before forming that run.

### Prototype verification completed

`npm run check` passes 23 automated tests, including exact arithmetic, datum and epoch boundaries, >24-hour lateness, revision conflicts, geometry, accuracy budgets, forecast direction, source integrity, receipt replay and HTTP asset restrictions. A Chromium browser check passes at 1440-pixel desktop and 390-pixel mobile widths, including controls, unavailable states, ordering, search, expandable records and JSON download, with no console errors. Mobile rows stack their fields so calculated clearance stays visible without horizontal scrolling.

## Milestone 2: verified live pilot

The source-inventory and candidate-selection portion is complete as a research deliverable: [pilot data review](pilot-data-review.md), [37-row crossing table](bridge-inventory-table.md), machine-readable assertions, 11 hashed source excerpts and a deterministic inventory checker. Henry/HNYI2, Morris/MORI2 and EJE/IL04 tailwater are selected for study. Physical completeness, current geometry, datum epochs, hydraulic associations and the six-inch objective remain unverified. No production bridge record is enabled.

The [Henry live gauge pilot](henry-live-pilot.md) is implemented at `/henry`, with `/api/henry`, official USGS stage, separate NOAA forecast direction at the gauge, immutable local source snapshots, strict >24-hour lateness, quality/schema checks and historical-only outage context. Henry now displays an assumption-labeled estimate at observation time, using `499.6 − (425.85 + stage)`. The owner assumes bridge/gauge water levels differ by at most two inches; this allowance is recorded without deduction. NOAA metadata corroborates a 425.85-ft NAVD88 datum but does not establish the effective gauge-zero epoch or bridge tie. The original 35 tests and inventory checks passed; the live adapter and desktop/mobile page were verified, including audit download and outage display.

Owner reference selection recorded September 26 UTC: Henry listed clearance 59.8 ft, low steel 499.6 ft and normal pool 439.8 ft, reported from the owner's e-chart. The exact arithmetic reconciles. The original research assertions remain historical; the new selected reference is separately versioned and included in receipts. The owner subsequently confirmed NAVD88 for all supplied chart elevations. Reference revision 3 and the model specification record this confirmation and the subsequent owner-approved two-inch direct-water-level assumption; external source datums remain unchanged. Gauge-zero epoch and total accuracy validation remain pending. The separate pilot permits estimates with these assumptions visible; no operational clearance is enabled. Delayed/late numbers are historical estimates at the measurement time. Invalid observations or gauge metadata withhold estimates; unavailable forecasts are independent.

1. Compile and reconcile the real Illinois Waterway mile 0–279 bridge inventory from current authoritative records. Confirm whether lock/dam service bridges belong in the inventory.
2. Define real gauge IDs, parameter/series units, gauge-zero epochs and hydraulic reaches. Record source copies, hashes and effective dates.
3. Select a few representative bridges, document each reference surface and fully open geometry, and approve the bridge-to-gauge relationship against independent data.
4. Implement one official feed adapter, immutable storage and a server-side calculation endpoint. Keep source parsing separate from this core.
5. Establish a reviewed operating envelope and error evidence. Resolve source conflicts, precision limitations, age policies and forecast association before showing a current number.

## Milestone 3: river-wide service

Add all verified bridge rows, approved fallback models, other opening types and piecewise models as required. Add backend scheduling, metadata-change monitoring, historical receipts and outage handling. Evaluate operational data against independent observations across changing water levels and hydraulic regimes. Host a reviewed preview before a public operational release.

Current pilot verification: all 38 automated tests and inventory checks pass, including exact elevation calculations, receipt replay, datum/model rejection, the late boundary and independent forecast failures. The browser-check script was updated; rerunning Chromium for this revision was blocked by an unavailable browser executable and a failed browser download. Prior desktop/mobile verification is historical.


## Mile-ordered directory — September 26

The main page now shows the source crossing inventory from mile 0 to 279, sorted ascending by exact decimal mile with stable bridge-ID tie-breaking. The extension includes the I-55 crossing in the lower Des Plaines reach, with a preserved NOAA page-389 excerpt and hash. There are 37 non-removed crossing rows and one removed historical row; this is not a certified physical bridge count. Search, reverse sorting and an optional removed-span display are available. Reference sources and conflicting mile assertions are inspectable. Missing-data rows remain visible, including during a Henry outage. The synthetic demonstration moved to `/demo`; Henry's live estimate appears in its directory row and retains its detailed `/henry` page and receipt.

Owner-confirmed Morris mile 263.5 and elevations (532.9 − 482.5 = 50.4 ft NAVD88) are recorded. EJE mile 270.6 and fully open clearance 61 ft are confirmed with corrected low steel 543.5 ft NAVD88 at pool 482.5 ft. Revision 2 retains the initially reported 513.5-ft elevation as superseded history; the owner resolved the conflict. Both new bridges await live gauge setup. No provisional research elevation or nearest-gauge inference is silently promoted into a calculation.

Directory verification: all 43 automated tests and original inventory checks pass. A DOM interaction check passes initial rendering, Henry's estimate, Morris search, reverse sorting, removed-span display, EJE reference expansion and retaining bridge rows while clearing Henry's estimate on an API outage. Chromium download remained unavailable, so visual layout was not reverified. `scripts/browser-check-directory.mjs` is provided for a browser-equipped environment; `scripts/dom-check-directory.mjs` supports optional LinkeDOM verification without layout.
