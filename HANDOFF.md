# Agent handoff

Keep this file current so the next session can continue without re-discovery.

## Latest

- **Date**: 2026-06-06
- **Phase completed**: **Phase 3** — Mobile gate ([docs/REACT_FINISH_PLAN.md](docs/REACT_FINISH_PLAN.md))
- **Goal**: React finish migration — Phase 4 next (Full workflow React)
- **Branch**: `main`

### What was done (Phase 3)

Replaced the mobile app UI with a persistent small-screen gate:

- **Removed** from `index.html`: bottom nav, mobile content panels, FABs/flyouts, mobile title pill, mobile header menu button, mobile dropdown menu
- **Removed** from `js/app.js`: `renderMobileContent`, `renderMobile*`, `mobileShow*`, FAB/flyout handlers, mobile nav/dropdown listeners, `mobileAddCurrentLocation`; simplified `updateSelectionUI()` to no-op (React `SelectionBar` owns UI)
- **Removed** from `js/tools/tool-catalog.js`: `getMobileGisToolFlyoutItems`, `renderMobileGisToolButtonsHtml`
- **Reduced** `css/mobile.css` to splash-only rules for `MobileGate`
- **Added** `react/shell/MobileGate.jsx` — full-screen non-dismissable overlay below 768px with branding, gate message, and How To content
- **Added** `react/shell/mountMobileGate.jsx` — mounted first in `app.js` boot (same pattern as `ModalHost`)
- **Cleaned** `react/header/HeaderBar.jsx` and `react/tools/ToolGuideDialog.jsx` (removed obsolete mobile menu / mobile notice)

### Preserved (unchanged behavior)

- 3 widgets, V1 GIS tools, SmartStyle, selection shortcuts + React `SelectionBar`, dual-screen protocol, workflow React Flow canvas, PWA build

### Files changed (high level)

**Added**: `react/shell/MobileGate.jsx`, `react/shell/mountMobileGate.jsx`

**Modified**: `index.html`, `js/app.js`, `js/tools/tool-catalog.js`, `css/mobile.css`, `react/header/HeaderBar.jsx`, `react/tools/ToolGuideDialog.jsx`, `docs/REACT_FINISH_PLAN.md`, `HANDOFF.md`

**Removed logic** (~830 LOC mobile handlers in `app.js`; mobile markup in `index.html`)

### Verification

- `npm test` — green (28 files, 127 tests)
- `npm run build` — green; emits `dist/` including `mountMobileGate` chunk

### Issues / notes for Phase 4

- **Workflow shell** still vanilla: `workflow-overlay.js`, `workflow-inspector.js`, `workflow-data-preview.js` — Phase 4a–4c
- **Dead CSS** in `css/main.css` (`.mobile-menu-*`, `.splash-mobile-notice`) — defer cleanup to Phase 6 unless touched during workflow work
- **`checkMobile()` / `state.ui.isMobile`** retained for dual-screen guard and body class; map/draw managers still use viewport checks for touch hints (unrelated to mobile UI)
- **Tool guide splash** skipped on viewport &lt; 768px at boot; `MobileGate` shows branding + How To instead
- **Phase 4 does NOT start automatically** — next agent should read Phase 4 section only

### Next

**Phase 4** — Full workflow React per [docs/REACT_FINISH_PLAN.md](docs/REACT_FINISH_PLAN.md) § Phase 4.

---

_Archive older bullets when stale (optional):_

- 2026-06-06: Phase 2 — Finish last vanilla-only UIs.
- 2026-06-06: Phase 1 — Cut rollback scaffolding.
- 2026-06-05: M4–M12 incremental React migration (superseded by finish plan).
