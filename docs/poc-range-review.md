# Illustrative clearance range for the proof of concept

Owner decision, September 28, 2026: display a three-foot scenario on either side of each available pilot estimate. This is a comparison aid while physical accuracy is unmeasured. It is **not** a measured error bound, confidence interval, confirmed minimum, or navigation clearance. No vessel air draft or two-foot operating gap is assessed. The earlier six-inch criterion remains in the synthetic production-style tests only; no live pilot is production eligible.

For exact unrounded model clearance \(C\) in feet, the page displays its existing simple point estimate \(\lfloor 10C\rfloor/10\) and a separate scenario:

\[
L=\lfloor 10(C-3)\rfloor/10,\qquad H=\lceil 10(C+3)\rceil/10.
\]

Outward rounding makes the displayed illustration contain the intended mathematical interval. For example, \(C=61.989\) produces point display **61.9 ft** and illustrative **58.9–65.0 ft**. The range is calculated from the original rational result, not the already rounded point display. The receipt records `lowerFt`, `upperFt`, `halfWidthFt`, `basis`, `measuredErrorBound: false`, and `confidenceLevel: null`. It is included only with an accepted estimate, inherits the observation-time and late/historical labels, and disappears on unavailable input. Forecast values never extend or update the range.

The page now emphasizes the lower endpoint as an **illustrative screening scenario**, with its assumed three-foot reduction alongside it. It is not a likely error estimate and cannot be substituted for the bridge's observed clearance board, the tow's air draft or an operating margin. Taking the smaller of two uncertain calculations does not guarantee that actual clearance is greater. The [Corps calculator disclaimer](https://rivergages.mvr.usace.army.mil/bridge_clearance/disclaimer.cfm) itself advises mariners to scrutinize calculated clearances and exercise caution.

### Archived Corps source comparison

The owner-supplied cropped Corps table screenshot has no timestamp or station mapping. With the chart-based La Salle proxy of 442.97 ft NAVD88, Spring Valley's chart low steel implies 59.63 ft versus the table's 58.78 ft; the lower **archived comparison** is 58.78 ft. At I-180 the chart proxy is 56.73 ft versus the table's 57.69 ft; the lower is 56.73 ft. The discrepancies are 0.85 ft and 0.96 ft in opposite directions, and Spring Valley's published reference figures differ by 1.30 ft. These are cross-source differences from one unknown-time snapshot, not a measured range or a transferable adjustment. `lowerArchivedComparison` selects the lower figure reproducibly for the bridge record, while the observed-time estimate remains based on its selected chart low steel and NOAA gauge reading.

To replace the illustrative scenario with an evidence-based lower estimate, collect repeated, time-paired Corps outputs, NOAA gauge observations and legible pier-board readings for the same channel span and opening state over rising and falling conditions. Preserve the raw readings, their times and revisions, water-level and chart datums, and the model residuals. Only apply a documented bridge-specific offset or uncertainty after confirming the gauge mapping and independently checking how it behaves across the intended stage range.

### Future visual checks

When the owner passes a bridge, a comparison record can include bridge ID and river mile, channel span and lift position, UTC time, photo of the clearance board and its legible graduation, observed reading and reading precision, weather/current conditions if relevant, the app's downloaded source receipt and observed gauge time. Preserve the raw observation separately from any interpretation. A pier board is a useful independent cross-check only if its scale is current and tied to the controlling channel opening. Do not treat a coarse or oblique photo as proof of an inch-level difference, or automatically recalibrate the model from a single comparison.

For Abraham Lincoln specifically, compare paired board readings with `505.8 − (130.997/0.3048 + LSLI2 stage)` ft at the **stage observation time**. If that differs systematically, review chart low steel, bridge-board calibration, station zero, NCAT input coordinates, and water-level difference before changing the formula. The chart's 66.0-ft clearance at 439.8-ft normal pool and a modeled LSLI2 flat-pool water elevation of about 439.980 ft are different reference statements, not simultaneous bridge and gauge observations.
