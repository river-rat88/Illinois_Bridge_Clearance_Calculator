# Project guidance

- Read `illinois-bridge-clearance-model-spec.md` for mathematical and source requirements, and `docs/implementation.md` for current scope.
- Keep measured quantities as decimal strings and use exact arithmetic in `src/exact.js`. Do not replace it with floating-point clearance arithmetic.
- Preserve the fully open lift-bridge assumption, explicit datum transformations, strict >24-hour late flag, and separation of forecast from observations.
- Never introduce fabricated real bridge data or imply the synthetic demonstration has verified six-inch accuracy.
- Keep unavailable bridge rows visible. Do not add nearest-gauge fallback or extrapolation without an approved model.
- Run `npm run check` after calculation or application changes. Update meaningful boundary tests and documentation when behavior changes.
- This branch is a prototype. Do not enable production data or deploy it as an operational calculator without completing the validation milestones.
