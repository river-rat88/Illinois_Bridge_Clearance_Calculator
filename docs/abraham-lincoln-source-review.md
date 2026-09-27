# Abraham Lincoln Memorial Bridge: fourth gauge review

Review date: September 27, 2026 UTC. Bridge row `il-abraham-lincoln`, historical USCG mile **225.7** (Corps chart mile **225.8**). The main directory still labels the mile historical. Fixed bridge, in the Peoria pool between Starved Rock and Peoria locks. No owner NAVD88 elevation record has been supplied for this bridge.

| Source and purpose | Published assertion | Treatment |
|---|---|---|
| [USCG Light List, historical inventory](https://www.navcen.uscg.gov/light-list) and research snapshot in `data/research/bridge-inventory.json` | 66.0 ft above pool stage, mile 225.7 | Directory research only; not selected as an elevation reference. |
| [USACE Illinois Waterway Navigation Charts, Appendix B (2013)](https://www.mvr.usace.army.mil/Portals/48/docs/Nav/NavigationCharts/ILW/AppendixB.pdf), row 76/4 | Abraham Lincoln Memorial Bridge mile 225.8, 66.3 ft vertical clearance, low steel 506.6 ft, flat pool 440.3 ft, **NGVD29** | Arithmetic reconciles: 506.6 − 440.3 = 66.3 ft. Historical candidate, not an owner NAVD88 chart reference. |
| [USACE UMR Hydraulic Model Phase III (March 2022)](https://www.mvr.usace.army.mil/Portals/48/docs/FRM/UMR%20Hydraulic%20Model%20Phase%20III%20-%20Report.pdf), § Bridges and Table 4 | Mile 225.8, **505.1 ft NAVD88 low chord over main channel used in HEC-RAS** | Different defined use and datum from navigation low steel. Its relationship to the controlling navigation opening is unresolved; do not substitute it as a clearance reference or assert that the numerical difference is a datum offset. |
| [USACE La Salle station record](https://rivergages.mvr.usace.army.mil/WaterControl/stationinfo2.cfm?dt=S&fid=LSLI2&sid=LSLI2) and [NOAA NWPS gauge metadata](https://api.water.noaa.gov/nwps/v1/gauges/lsli2) | LSLI2 at mile 224.7, zero **430.00 ft NGVD29**; NOAA observed product `HGIRG`, forecast `HGIFF` | Gauge candidate about 1.1 river miles downstream in the same pool. NOAA metadata currently does not publish a NAVD88 zero for LSLI2. The bridge/gauge water difference has not been tested; location alone is not approval. |

The Corps chart's 440.3-ft flat pool and the LSLI2 430.00-ft zero plus 10.20-ft flat-pool stage from the station listing differ by 0.10 ft. This comparison is a research check, not a verified datum or hydraulic tie. The Corps hydraulic-model low chord, the navigation-chart low steel, and the Coast Guard listed clearance have different definitions and/or vintages; the prototype does not force them to agree.

## Implemented feed and display

`/api/lincoln` archives the raw NOAA [gauge metadata](https://api.water.noaa.gov/nwps/v1/gauges/lsli2), [observed stage](https://api.water.noaa.gov/nwps/v1/gauges/lsli2/stageflow/observed), and [forecast](https://api.water.noaa.gov/nwps/v1/gauges/lsli2/stageflow/forecast) with hashes, timestamps and a replayable receipt. It checks station/product identity, gauge zero, units, observation order and revisions, issue/generation time, range, source integrity, and forecast run/coverage. Stage is in feet **above the NGVD29 gauge zero**. The strict late threshold is age greater than 24 hours. A failed refresh may show the last accepted stage as historical only.

Forecast direction is calculated from a complete, labeled 24-hour station forecast window, with a 0.1-ft deadband. It describes **LSLI2 only**; the association is not approved. A missing or stale forecast does not alter stage status. The clearance remains `NAVD88_REFERENCE_REQUIRED` with null value regardless of a valid stage and forecast. This is intentional, not a zero-clearance indication. The older 66.3-ft Corps research value is not shown as the selected listed clearance.

The NOAA feed does not supply a per-reading approval/quality flag in this response. An accepted API reading is labeled as an unverified point-quality observation; external quality validation remains open. Bounds 0–45 ft suppress nonsensical stage values in this pilot, not a claim about the range of physically possible floods. `var/lincoln/` stores the local immutable snapshots; `LINCOLN_DATA_DIR` overrides that path.

## Evidence needed for a numeric pilot

1. Owner e-chart edition/source, bridge identity and controlling navigation span, listed clearance, **low-steel NAVD88 elevation**, and **reference pool NAVD88 elevation**. Reconcile listed clearance with low steel minus pool elevation and preserve the 225.7/225.8 mile difference.
2. A station-specific LSLI2 NAVD88 gauge zero with epoch and foot realization, or a documented scoped NGVD29→NAVD88 transformation. No conversion is inferred from neighboring stations or the 2022 hydraulic-model chord.
3. Approve the bridge-to-gauge water-level association using paired observations across representative rising and falling stages. The owner's two-inch proximity assumption is a hypothesis here; this 1.1-mile tie has not been measured.
4. Check navigation-opening geometry, observation quality and overall accuracy before enabling an assumption-labeled estimate, and separately validate any operational use. The user's two-foot vessel passage margin remains a distinct policy and cannot be evaluated without air draft.

The local synthetic tests and one live NOAA fetch on September 27 verify adapter behavior, not physical clearance accuracy. At 18:36 UTC the live NOAA result was 14.11-ft stage observed 17:45 UTC, forecast **falling** at the gauge, with clearance withheld. It will change as the source updates.
