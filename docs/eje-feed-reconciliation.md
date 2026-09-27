# Dresden tailwater feed comparison

Reviewed September 27, 2026. The owner reported seeing a simultaneous difference of **0.07 ft** between Corps and NOAA Dresden tailwater levels. That is **0.84 in**, numerically below two inches. A comparison of two station feeds is distinct from the separate bridge/gauge water-surface assumption. The observation time, individual values, display rounding and datum labels for that particular comparison were not supplied, so the owner report is recorded as a field observation rather than a verified source pair.

To check the generality of that result, we saved the complete [USACE IL04 tailwater time-series response](../data/research/eje-comparison-2026-09-27/cwms.json) and [NOAA CDII2 observed-tailwater response](../data/research/eje-comparison-2026-09-27/noaa.json), with request URLs, retrieval times, sizes and SHA-256 hashes in the [manifest](../data/research/eje-comparison-2026-09-27/manifest.json). `node scripts/reconcile-dresden.mjs` verifies the saved hashes, checks the source identities and compares only rows with **identical observation timestamps**, using exact decimal arithmetic. There is no interpolation or datum conversion in this feed comparison.

| Frozen comparison, query cutoff 2026-09-27 14:59 UTC | Result |
|---|---:|
| Matching timestamps in the 48-hour Corps query | 89 |
| Median absolute difference in published numeric readings | 0.0498 ft (0.60 in) |
| Differences strictly greater than 2 in (0.1667 ft) | 6 of 89 |
| Largest absolute difference | 0.4453 ft (5.34 in) |

The six exceptions occurred at September 25 20:30 and 23:00 UTC; September 26 03:00 and 13:30 UTC; and September 27 02:30 and 06:00 UTC. The two largest discrepancies were 0.4453 and 0.3824 ft. NOAA's neighboring half-hour readings around those two points were closer to the Corps series, but this alone does not establish which feed was correct. The Corps observations carry quality code 0, which means *unscreened*. Different processing, revision timing and source quality may explain some mismatches; these have not been resolved.

**Interpretation:** The owner's 0.07-ft observation is compatible with many paired readings, but a fixed 2-in bound is not supported by this short retrospective sample. Comparing two published station feeds also does not measure the water surface at the EJE bridge or certify that applying NOAA's −0.21-ft NAVD88 gauge zero to Corps NGVD29 elevation is a surveyed datum conversion. The 2-in bridge/gauge assumption and the under-six-inch total-error target therefore remain unverified. No automatic switch to NOAA data or nearest-gauge fallback follows from this comparison. Next, review the exceptional timestamps with the agencies, verify the datum epochs and gauge tie, then compare an independent bridge-water measurement and fully open low-steel survey.
