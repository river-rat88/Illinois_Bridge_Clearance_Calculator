# Lacon and Santa Fe live pilots — September 30, 2026

The owner accepted the proposed station assignments on September 30. Lacon at mile **189.1** now uses Henry HNYI2 at mile **196.0**, 6.9 river miles upstream. The active fixed Atchison, Topeka and Santa Fe Railroad Bridge at mile **181.9** uses Chillicothe CHLI2 at mile **180.5**, 1.4 miles downstream. These are explicit owner-authorized direct-water prototype models inferred from the identified live station locations in the Peoria pool, not a confirmed reconstruction of the Corps calculator's internal gauge mapping. No automatic nearest-gauge fallback is introduced. The two-inch transfer assumption remains owner-supplied and unverified; the existing ±3-ft scenario remains illustrative.

Both rows now display listed clearance, observation, estimated clearance, observation time, freshness and forecast status. Their endpoints are `/api/lacon` and `/api/chillicothe-rr`. There are **12 pilot rows**, 25 active reference-pending rows and one historical row. Neither new bridge is production eligible. The historical removed Santa Fe swing bridge near mile 162.2 remains separate.

## Lacon: share Henry's snapshot

Lacon retains its selected chart low steel **498.9 ft NAVD88** and normal pool **439.8 ft**, giving listed clearance **59.1 ft**. It uses Henry's existing USGS 05558300 instantaneous stage and NOAA HNYI2 metadata, including the published **425.85-ft NAVD88** zero:

```text
water NAVD88 = 425.85 + Henry stage
Lacon estimate = 498.9 − water = 73.05 − Henry stage
```

Henry and Lacon reuse one immutable source snapshot and one polling cycle, with distinct bridge references and receipt hashes. Lacon retains Henry's independent forecast status at HNYI2. A Henry observation outage withholds both estimates. A forecast failure does not block an otherwise usable observation.

The Corps Henry page publishes **425.88 ft NGVD29**, whereas NOAA publishes **425.85 ft NAVD88**. The 0.03-ft difference is between published gauge-zero elevations, not a correction to subtract again from a calculation already using the NAVD88 zero. Do not reuse this local relationship at Chillicothe.

## Santa Fe: Chillicothe elevation and local conversion

[Corps CHLI2 station metadata](https://rivergages.mvr.usace.army.mil/WaterControl/stationinfo2.cfm?sid=CHLI2&fid=HNYI2&dt=E) and [NOAA CHLI2 metadata](https://api.water.noaa.gov/nwps/v1/gauges/chli2) agree on coordinates **40.9172, −89.4814** and a **0-ft NGVD29** zero. The [NOAA observed feed](https://api.water.noaa.gov/nwps/v1/gauges/chli2/stageflow/observed) labels its product `HGIRG`, Stage, ft, ILX, CST6CDT, but its readings in the 400s already express water elevation because the zero is zero. The adapter explicitly marks them `ABSOLUTE_ELEVATION`; it does not add another pool elevation or telemetry offset.

An archived [NGS NCAT request](https://geodesy.noaa.gov/api/ncat/llh?lat=40.9172&lon=-89.4814&orthoHt=0&inDatum=nad83(2011)&outDatum=nad83(2011)&inVertDatum=NGVD29&outVertDatum=NAVD88) at the gauge coordinates converts **0.000 m NGVD29 to −0.075 m NAVD88**, using VERTCON 3.0. Its reported `sigOrthoht` is **0.023 m**; that transformation statistic is not a total clearance error or maximum bound. NAD83(2011), international feet and gauge-zero applicability are documented assumptions. The response and review are pinned by SHA-256 and included in the downloadable calculation input; NCAT is not queried during ordinary page refreshes.

```text
local datum offset ft = −0.075 / 0.3048 = −125/508 ft
water NAVD88 = observed Chillicothe NGVD29 elevation − 125/508
Santa Fe estimate = 498.5 − water NAVD88
```

The chart remains **498.5-ft NAVD88 low steel**, **439.7-ft normal pool**, **58.8-ft listed clearance**. Exact rational arithmetic retains the full conversion; only the displayed estimate rounds downward to 0.1 ft.

The captured observation **441.11 ft NGVD29 at September 30, 12:00 UTC** yields about **440.864 ft NAVD88**, an unrounded clearance about **57.636 ft**, displayed **57.6 ft**. Its illustrative scenario is **54.6–60.7 ft**. This is a frozen verification example, not a current reading or confirmed minimum. `test/fixtures/chillicothe/` contains the original official responses (the full observed series is stored losslessly with gzip); ordinary tests never substitute them for a failed live feed.

## Data checks, freshness and forecasting

The adapter checks source URLs, HTTP/content type, raw hashes, receipt cutoff, station identity, coordinates, zero/datum, series, units, ordered unique timestamps and observation/production times. Select the latest timestamp before validating its elevation. Historical sentinel values stay in the source archive and do not block a valid latest point; a sentinel at the latest point withholds clearance without falling back to an older observation. Metadata changes, future values, regressed times, conflicting revisions, altered transformations or changed bridge associations also withhold estimates.

The five-minute refresh cadence and immutable storage are shared with the existing snapshot service. Measurement age, not download time, determines freshness. `LATE` remains strictly **greater than 24 hours**; above 72 minutes the existing prototype policy marks an estimate delayed/historical. After an outage, the previous accepted reading is historical context only. Raw source payloads, transform evidence and calculation time are in each receipt for deterministic replay.

NOAA currently publishes **no Chillicothe forecast**: gauge forecast PEDTS is empty and the forecast response contains no points. Santa Fe displays forecast unavailable. An observed 24-hour change and a Henry forecast are not substituted. If NOAA begins publishing a forecast, the explicit configuration-change state calls for review before enabling it.

During the live refresh check, Henry's forecast response carried producer tag `LSX`, whereas its pinned contract expects `ILX`. The existing validator withheld forecast direction for Henry and Lacon while preserving their valid observations and estimates. That separate feed-contract change was not silently accepted in this work.

## Corps comparison and verification

`data/research/henry-chillicothe-review-2026-09-30/` preserves an earlier successful Corps bridge-table response, its hash and the three matching bridge rows. The full HTML response is stored losslessly with gzip to keep the code review readable. The table agrees on listed clearance and bridge identity, but provides neither electronic station assignments nor row observation times. Consequently its “current” values cannot be time-paired with the NOAA/USGS captures to derive a calibrated spatial offset or accuracy bound. The newest table refresh returned HTTP 200 with only “An error has occurred.”; that failure is archived separately and is not treated as data. The successful response's exact receipt time was not retained and is explicitly unknown.

`npm run check` passes **80 tests** and the inventory gate. The new checks cover local transformation arithmetic, one-foot rise response, missing latest values, metadata drift, source integrity, changed models, the exact late boundary, receipt replay, shared Henry polling, outages and both HTTP endpoints. `npm run pilots:refresh` successfully retrieved both station observations and produced the new estimates. Browser visual layout was not reverified because Chromium is unavailable in this environment; existing directory styling is reused.
