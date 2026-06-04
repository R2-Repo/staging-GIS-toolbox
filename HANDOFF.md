# Agent handoff

Keep this file current so the next session can continue without re-discovery.

## Latest

- **Date**: 2026-06-04
- **Goal**: **Dual Screen exit UX** — restore normal 3-panel layout (map center, side panels).
- **Branch**: `cursor/dual-screen-exit-fix-6fd6`
- **Root cause**: `.app-layout.dual-screen-active .panel-center { display: none }` hid the center panel entirely, so placeholder/exit copy was invisible; header button label stayed "Dual Screen" when active.
- **Fix**:
  - Remove `display: none` on `.panel-center` in dual-screen mode (map hidden via `#map-container.dual-screen-map-hidden` only).
  - Center placeholder with **Return map to this window** button; header label **Exit Dual Screen** when active.
  - `js/dual-screen/layout.js` — shared layout helpers; `postMessage` fallback when secondary exits (`gis-toolbox-dual-screen-exit`).
  - **Map tiles half-blank on exit**: apply normal layout *before* `mapManager.init`, then `scheduleMapResizeAfterLayout` (rAF + 100ms + 250ms) and on map `load`.
  - SW cache `1.31.18`.

## Verification

- **Vitest**: `npm test` — green (60 tests).
- **Browser (manual)**:
  - Dual on → center shows placeholder + Return button; header says Exit Dual Screen.
  - Click Return or Exit Dual Screen → map restores in center; panels normal width.
  - Close map window → primary restores (BYE / poll when window ref exists).
  - Exit Dual Screen in map window → primary restores.

## Next

1. Merge PR; optional: detect secondary close when `window.open` returned null (without spawning blank popups).

**New agent prompt**: see bottom of `docs/DUAL_SCREEN_MODE.md`.

---

_Archive older bullets when stale (optional):_

- 2026-06-04: Dual Screen activation fix on `main` (#16).
- 2026-06-04: Phase 4 polish merged (#13).
