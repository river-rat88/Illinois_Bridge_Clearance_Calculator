# Illinois River Bridge Clearance Calculator

A **calculation prototype** for Illinois River miles 0–273, with a separate [Henry live gauge pilot](docs/henry-live-pilot.md). It is not an operational clearance service or a verified bridge inventory. The main calculator uses labeled fictional bridges, stages, forecasts and error allowances; `/henry` displays official stage and forecast data and an assumption-labeled clearance estimate at observation time.

![Desktop prototype showing synthetic bridge clearances](docs/screenshots/prototype-desktop.png)

[Mobile preview](docs/screenshots/prototype-mobile.png)

## Run locally

Install Node.js 22 or newer, open a terminal in this repository, then run:

```sh
npm start
```

Open **http://localhost:3000**. No npm packages, API keys or database are required. The server listens only on the local computer. Stop it with Ctrl+C. The default port can be changed with the `PORT` environment variable.

Open **http://localhost:3000/henry** for the live gauge pilot. It requires internet access and writes auditable source snapshots to `var/henry/` (or `HENRY_DATA_DIR`). Run `npm run henry:refresh` to fetch and inspect a snapshot directly. The [pilot documentation](docs/henry-live-pilot.md) explains the feed contract, forecast rules, storage and remaining reference evidence.

```sh
npm test
npm run check
```

## What to review

The next milestone adds a [real bridge inventory and three-pilot review](docs/pilot-data-review.md), with a [37-row source table](docs/bridge-inventory-table.md), preserved source evidence and unresolved conflicts. These research records are separate from the synthetic webpage and are not approved for live clearance calculations. Run `npm run inventory:check` to verify the research package.

1. Sample A: listed clearance 65.0 ft at a 500.0-ft reference surface. Stage 7.25 ft above a 500.0-ft gauge zero gives water elevation 507.25 ft. Clearance is 57.75 ft, displayed as **57.7 ft** after downward rounding.
2. Raise the stage adjustment by 1.0 ft. Calculated clearance falls by exactly 1.0 ft.
3. Sample B: listed and calculated values both assume the lift span is **fully open**. Its position is not verified.
4. Sample C: two gauges bracket the synthetic bridge. Both normalized water elevations appear in its record.
5. Sample D: a 25-hour-old observation is marked **LATE**, and clearance is withheld under the fixture's separate two-hour stop policy.
6. Samples E/F: missing observations and an unresolved NGVD29 conversion remain visible with unavailable results.
7. Use the scenario menu, upstream/downstream sort, search, expandable records and JSON audit download.

The sample cutoff stays frozen at **2026-09-25 18:00 UTC** so repeat runs can be compared. There is no live refresh, and changing sample stages does not alter the separate synthetic forecast.

## Architecture

| File | Responsibility |
|---|---|
| `illinois-bridge-clearance-model-spec.md` | Overall design, including the confirmed >24-hour late rule |
| `src/exact.js` | BigInt rational arithmetic, exact length conversion, canonical JSON and SHA-256 |
| `src/calculator.js` | Pure calculation, validation, forecast direction and reproducible receipts |
| `data/demo.js` | Six fictional scenarios with hashed source snapshots |
| `src/app.js`, `index.html`, `styles.css` | Responsive browser interface; no external assets or libraries |
| `server.mjs` | Local static server with an explicit asset allowlist |
| `src/feeds/henry.js`, `src/henry-service.js` | Official stage/forecast parsing, validation, persistent source snapshots and receipts |
| `henry.html`, `src/henry-page.js` | Live Henry pilot estimate with explicit owner assumptions |
| `test/` | Calculation and HTTP tests; optional browser interaction check |
| `docs/implementation.md` | Implemented behavior, limitations and next milestones |

The prototype runs the calculator in the browser. The core has no DOM or network dependency and can move unchanged into a future ingestion/calculation service. Production data must eventually be served from validated, versioned backend snapshots; browsers should not scrape official feeds.

## Audit receipts

Downloaded JSON contains the complete input snapshot, input revision IDs, source payloads and SHA-256 hashes, UTC cutoff, formula version, selected observations and gauge-zero epochs, datum transforms, exact fractional results, display value, error components and forecast receipt. The receipt ID hashes the complete input-and-result body using key-sorted JSON. It is a content identifier, not a signature or proof of source authenticity.

`createReceipt(input)` also verifies included source-payload hashes. `calculate(input)` is the synchronous mathematical core and expects ingestion to verify payload integrity. Neither function reads the clock or fetches data. Replaying the same input with the same formula version produces the same receipt.

All measured values are decimal strings. `ft` means the international foot; `us_survey_ft` is explicitly different. Exact numerators and denominators remain available even when a converted value repeats in decimal notation.

## Deliberate prototype limits

- Production input in the synthetic core is disabled. Henry’s separate pilot adapter permits a labeled estimate using the owner’s direct-water-level assumption; overall accuracy remains unverified. Setting `datasetKind` to anything except `SYNTHETIC` withholds clearance.
- The **six-inch objective is not field-validated**. Sample error allowances only exercise the gate and include elapsed-time and display-rounding contributions. No uncertainty or operating margin is deducted from the clearance.
- Models implemented: direct, fixed offset, bracketed linear. Piecewise ratings, fallback gauge models, other movable-bridge geometries, and unlimited-clearance states are deferred.
- The fixture's two-hour calculation stop, 24-hour forecast window, 0.1-ft forecast deadband and six-hour forecast issue limit are demonstration defaults. Only the observation late label **strictly after 24 hours** is owner-confirmed.
- The official-source research inventory is incomplete as a verified physical-structure catalog. Henry has live USGS stage and NOAA station-forecast feeds plus local snapshot persistence. Authentication, external monitoring and deployment are not included.
- River-wide adapters, a production bitemporal database, automated source reconciliation, survey review and hydraulic validation remain to be built.

## Optional browser check

With Playwright installed in your development environment and Chromium available:

```sh
node scripts/browser-check.mjs
```

The script starts its own local server and checks desktop/mobile layouts, stage adjustment, failure scenarios, filtering, sort, records and download. If Playwright is outside the project, set `PLAYWRIGHT_MODULE` to its absolute module entry path. Browser checks are optional developer tooling and not a runtime dependency.
