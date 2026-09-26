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

The [Henry live gauge pilot](henry-live-pilot.md) is implemented at `/henry`, with `/api/henry`, official USGS stage, separate NOAA forecast direction at the gauge, immutable local source snapshots, strict >24-hour lateness, quality/schema checks and historical-only outage context. Bridge clearance remains null. NOAA metadata corroborates a 425.85-ft NAVD88 datum but does not establish the effective gauge-zero epoch or bridge tie. All 35 tests and inventory checks pass; the live adapter and desktop/mobile page were verified, including audit download and outage display.

Owner reference selection recorded September 26 UTC: Henry listed clearance 59.8 ft, low steel 499.6 ft and normal pool 439.8 ft, reported from the owner's e-chart. The exact arithmetic reconciles. The original research assertions remain historical; the new selected reference is separately versioned and included in receipts. The chart datum is still unknown, and no operational clearance is enabled.

1. Compile and reconcile the real Illinois River mile 0–273 bridge inventory from current authoritative records. Confirm whether lock/dam service bridges belong in the inventory.
2. Define real gauge IDs, parameter/series units, gauge-zero epochs and hydraulic reaches. Record source copies, hashes and effective dates.
3. Select a few representative bridges, document each reference surface and fully open geometry, and approve the bridge-to-gauge relationship against independent data.
4. Implement one official feed adapter, immutable storage and a server-side calculation endpoint. Keep source parsing separate from this core.
5. Establish a reviewed operating envelope and error evidence. Resolve source conflicts, precision limitations, age policies and forecast association before showing a current number.

## Milestone 3: river-wide service

Add all verified bridge rows, approved fallback models, other opening types and piecewise models as required. Add backend scheduling, metadata-change monitoring, historical receipts and outage handling. Evaluate operational data against independent observations across changing water levels and hydraulic regimes. Host a reviewed preview before a public operational release.
