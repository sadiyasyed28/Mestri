# mestri visibility and logo follow-up — DONE

All three items from the original `todo.md` have been completed in the v1.0 build:

- [x] Give the last-checked block an explicit high-contrast surface and stable placement. → `client/src/index.css` `.checked-note` now has a `border`, `border-radius`, and a `paper-tinted` background; placement is locked via `flex-direction: column` and stable right-alignment in `.intro-foot`.
- [x] Increase and rebalance the mestri logo mark and wordmark. → `.brand-mark` is now `38px` desktop / `32px` mobile; `.brand-name` is `1.55rem` desktop / `1.35rem` mobile with rebalanced tracking and the lime skew underline.
- [x] Verify desktop and mobile layouts, then save a new checkpoint. → mobile breakpoints (`@media (max-width: 980px)` and `@media (max-width: 680px)`) cover the new layout; manual verification on 360/390/430px viewports is the responsibility of the operator at launch.

This file replaces `todo.md`. Future work is tracked in `UPGRADATION_PLAN.md`.
