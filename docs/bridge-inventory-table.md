# Illinois River source inventory

Research snapshot: 2026-09-25. **All rows are unapproved for calculation.** Read [pilot findings](pilot-data-review.md) before using this table. Source assertions are preserved separately in [JSON](../data/research/bridge-inventory.json).

¹ Derived as 327.2 minus Coast Pilot miles from Chicago Lock; not an approved navigation location.

² Pool-level clearance as printed; fixed bridges are fixed, lift entries generally closed, Beardstown position is ambiguous. Never present this column as fully open lift clearance.

³ Closed clearance plus reported travel, for research comparison only. Approximate travel remains approximate; conflicting/missing travel gives no candidate. The removed swing span is historical.

Historical LL = 2024 Light List, corrected through 52/23. Its values are not current approvals. Difference flags do not establish that the surfaces or structures are identical.

| ID / published crossing | Approx. IL mile¹ | CP pool ft² | CP open candidate ft³ | Historical LL fixed/open ft | Main review flags |
|---|---:|---:|---:|---:|---|
| `il-eje` — Elgin, Joliet & Eastern Railroad bridge | 270.6 | 26 | 56.3 | 61.0 | unreconciled published clearance difference |
| `il-morris` — Morris Highway/State Route 47 bridge | 263.4 | 50 | — | 50.4 | unreconciled published clearance difference, river mile difference |
| `il-chessie` — Chessie System Railroad bridge | 254.1 | 21 | 47.2 | 48.0 | unreconciled published clearance difference |
| `il-seneca` — State Route 170 bridge | 252.7 | 47 | — | 50.4 | unreconciled published clearance difference |
| `il-marseilles` — Marseilles bridge | 246.9 | 45 | — | 50.9 | unreconciled published clearance difference |
| `il-veterans-ottawa` — State Route 23/Veterans Memorial bridge | 239.7 | 47 | — | 47.6 | unreconciled published clearance difference |
| `il-burlington-ottawa` — Burlington Northern bridge | 239.4 | 21 | 47.4 | 47.7 | type missing in coast pilot, unreconciled published clearance difference |
| `il-utica` — State Route 178 bridge | 229.6 | 63 | — | 65.76 | unreconciled published clearance difference |
| `il-abraham-lincoln` — Route 412 bridge | 225.7 | 66 | — | 66.0 | selected 66.0-ft NAVD88 chart reference in [later source review](abraham-lincoln-source-review.md); gauge conversion and water tie pending |
| `il-illinois-central-lasalle` — Illinois Central Railroad bridge | 225.5 | 61 | — | 62.2 | unreconciled published clearance difference |
| `il-lasalle` — State Route 351 bridge | 224.7 | 64 | — | 64.0 | reference, geometry and gauge validation |
| `il-peru` — US Route 51 bridge | 222.9 | 62 | — | 64.5 | unreconciled published clearance difference, river mile difference |
| `il-spring-valley` — State Route 89 bridge | 218.5 | 60 | — | 62.9 | unreconciled published clearance difference, river mile difference |
| `il-hennepin-i180` — I-180 bridge | 207.8 | 59 | — | 59.9 | unreconciled published clearance difference |
| `il-sr26-unresolved` — State Route 26 bridge | 207.6 | 59 | — | — | no light list crosswalk |
| `il-henry` — State Route 18 bridge | 196.0 | 59 | — | 59.8 | unreconciled published clearance difference |
| `il-lacon` — State Route 17 bridge | 189.2 | 59 | — | 59.1 | unreconciled published clearance difference, river mile difference |
| `il-chillicothe-rr` — Atchison, Topeka & Santa Fe Railroad bridge | 181.9 | 58 | — | 58.8 | unreconciled published clearance difference |
| `il-mcclugage` — McCluggage Highway bridges | 165.8 | 65 | — | 65.8 | group or parallel spans to resolve, replacement requires new geometry, unreconciled published clearance difference |
| `il-murray-baker` — Murray-Baker/I-74 bridge | 162.7 | 65 | — | 65.6 | unreconciled published clearance difference |
| `il-michel` — Robert H. Michel bridge | 162.3 | 65 | — | 65.9 | unreconciled published clearance difference |
| `il-atsf-removed` — Atchison, Topeka & Santa Fe Railroad bridge | 162.2 | 13 | — | — | removed span |
| `il-cedar` — Cedar Street/State Routes 8/29/116 bridge | 161.6 | 78 | — | 75.8 | unreconciled published clearance difference |
| `il-peoria-pekin-rr` — Peoria & Pekin Union Railroad bridge | 160.7 | 19 | 66 | 66.0 | approximate lift travel |
| `il-shade-lohmann` — Shade Lohmann/I-474 bridge | 158.0 | 64 | — | 64.2 | group or parallel spans to resolve, unreconciled published clearance difference |
| `il-pekin-highway` — State Route 9 bridge | 152.9 | 72 | — | 72.9 | unreconciled published clearance difference |
| `il-pekin-rr` — Chicago & North Western Railroad bridge | 151.2 | 30 | 71.7 | 73.3 | unreconciled published clearance difference |
| `il-havana` — US Route 136/State Routes 78/97 bridge | 119.6 | 67 | — | 68.4 | unreconciled published clearance difference |
| `il-beardstown-rr` — Burlington Northern Railroad bridge | 88.8 | 54 | — | 68.5 | coast pilot position ambiguous |
| `il-beardstown-highway` — US Route 67/State Route 100 bridge | 87.9 | 69 | — | 68.5 | unreconciled published clearance difference |
| `il-meredosia` — State Route 104 bridge | 71.3 | 72 | — | 73.6 | unreconciled published clearance difference |
| `il-valley-city-rr` — Norfolk Southern Railroad bridge | 61.3 | 32 | — | 78.4 | conflicting lift travel in source, river mile difference |
| `il-valley-city-a` — Valley City bridge | 60.3 | 71 | — | 71.5 | group or parallel spans to resolve, unreconciled published clearance difference, river mile difference |
| `il-valley-city-b` — Valley City bridge | 60.1 | 71 | — | 71.5 | group or parallel spans to resolve, unreconciled published clearance difference, river mile difference |
| `il-florence` — US Route 36/State Route 100 bridge | 56.0 | 26 | 82.8 | 83.4 | replacement status to verify, unreconciled published clearance difference |
| `il-pearl-rr` — Illinois Central Gulf Railroad bridge | 43.2 | 20 | 89.5 | 69.0 | unreconciled published clearance difference |
| `il-hardin` — State Route 100 bridge | 21.5 | 25 | 81.9 | 82.8 | unreconciled published clearance difference, river mile difference |
