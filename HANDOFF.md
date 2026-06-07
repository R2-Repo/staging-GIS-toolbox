# Agent handoff

Keep this file current so the next session can continue without re-discovery.

## Latest

- **Date**: 2026-06-06
- **Status**: **Legacy code cleanup complete**
- **Architecture**: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Branch**: `main`

### What was done

**Dead files removed**
- `react/panels/mountLeftPanel.jsx`, `react/header/mountHeaderBar.jsx`, `react/map/mountSelectionBar.jsx`
- `scripts/phase1-strip-app.mjs`, `scripts/phase1-strip-legacy-modals.mjs`
- `.cursor/debug-cc2062.log`
- `js/workflow/workflow-palette.js` (vanilla DOM class)

**Code slimmed**
- **Added** `js/workflow/node-catalog.js` — `NODE_CATEGORIES` + `findNodeDef()`; shared by workflow engine + React palette
- **Removed** from `tool-handlers.js`: `layerOptions()`, `updateToolbarState()`, `updateSelectionUI()` stub + bus listeners
- **Removed** `mobileLabel` metadata from registry and tool-catalog
- **Removed** `.gis-widget` CSS block from `main.css`

**Comments & docs**
- Updated stale legacy/migration comments in `js/` and `react/mountIsland.jsx`
- Rewrote `.cursor/rules/gis-toolbox.mdc`, trimmed `REACT_FINISH_PLAN.md` / `REACT_REFACTOR_PLAN.md`
- Updated `AGENTS.md`, `DUAL_SCREEN_MODE.md`, `PERFORMANCE_PLAN.md`, `WIDGET_AUTHORING.md`

### Verification

- `npm test` — green (29 files, 130 tests)
- `npm run build` — green; precache 14 entries (~3.2 MB)
- `npm run smoke:preview` — 23/23 passed

### Optional follow-ups

- Logs panel React port (still vanilla DOM in `App.jsx`)
- Vendor chunk lazy-loading (~2.5 MB)
- `map-window.html` CDN cleanup for dual-screen secondary window

---

## NEXT AGENT PROMPT

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) first. The app is a React-owned Vite app; domain logic stays in `js/`. Gate: `npm test` + `npm run build`.

---

_Archive:_

- 2026-06-06: Phase 6 — Docs, dead CSS, smoke + PWA polish (migration complete).
- 2026-06-06: Phase 5 — React shell flip.
