# Agent handoff

Keep this file current so the next session can continue without re-discovery.

## Latest

- **Date**: 2026-06-06
- **Phase completed**: **Phase 5** — React shell flip ([docs/REACT_FINISH_PLAN.md](docs/REACT_FINISH_PLAN.md))
- **Goal**: React finish migration — Phase 6 next (docs, dead CSS, smoke + PWA polish)
- **Branch**: `main`

### What was done (Phase 5)

React now owns the full page shell. `js/app.js` is deleted.

**Entry & shell**
- **Added** `react/main.jsx` — `bootstrapGlobals()` + `createRoot(#root).render(<App />)`
- **Added** `react/App.jsx` — header, 3-panel layout, map, logs, modal/toast hosts, `MobileGate`, boot effects
- **Added** `react/providers/AppStore.jsx` — thin Zustand store over `state.js` + `ui:refresh` bus bridge
- **Added** `react/actions/app-actions.js` — re-exports `invokeAppAction` / `getAppActions`
- **Added** `js/core/bootstrap-globals.js` — npm → `globalThis` for MapLibre, Turf, Papa, XLSX, JSZip, etc.
- **Updated** `index.html` — single `<div id="root"></div>`, Vite entry `/react/main.jsx`; CDN lib scripts removed

**Handlers moved from `app.js`**
- **Added** `js/tools/tool-handlers.js` (~4k LOC) — all `open*` handlers, `APP_ACTIONS`, `setupAppWiring`, drag/drop, dual-screen, session restore, logs/tooltip portal
- **Deleted** `js/app.js`

**Panel React components**
- **Added** `react/panels/WidgetPanel.jsx`, `react/panels/LayerDataToolsPanel.jsx` — replace `renderDataPrepToolsHtml` / `renderWidgetPanelHtml` in shell
- **Updated** `react/header/HeaderBar.jsx` — controlled undo/redo/merge/basemap/dimension from store
- **Updated** `react/panels/LeftPanel.jsx` — uses `LayerDataToolsPanel`

**Build / deps**
- **Added** `maplibre-gl@4.7.1` to `package.json` dependencies (bundled, not CDN)
- **Updated** `vite.config.js` — `workbox.maximumFileSizeToCacheInBytes: 3 MiB` (vendor chunk ~2.57 MB with bundled libs)
- **Updated** `tests/event-wiring-regression.test.js` — guards `tool-handlers.js` + React root boot
- **Updated** [AGENTS.md](AGENTS.md) layout table

### Preserved (unchanged behavior)

- 3 widgets, V1 GIS tools, SmartStyle, selection shortcuts + React `SelectionBar`, dual-screen protocol, workflow React overlay (`mountWorkflowOverlay` via `workflow-controller`), PWA build
- `data-app-action` delegation for GIS tool buttons (still in `setupAppWiring`)
- Logs panel remains vanilla DOM (Phase 6 optional React port)

### Files changed (high level)

**Added**: `react/main.jsx`, `react/App.jsx`, `react/providers/AppStore.jsx`, `react/actions/app-actions.js`, `react/panels/WidgetPanel.jsx`, `react/panels/LayerDataToolsPanel.jsx`, `js/tools/tool-handlers.js`, `js/core/bootstrap-globals.js`

**Modified**: `index.html`, `package.json`, `vite.config.js`, `react/header/HeaderBar.jsx`, `react/panels/LeftPanel.jsx`, `tests/event-wiring-regression.test.js`, `docs/REACT_FINISH_PLAN.md`, `AGENTS.md`, `HANDOFF.md`

**Removed**: `js/app.js` (~4.5k LOC)

### Verification

- `npm test` — green (29 files, 130 tests; +1 React-root boot guard)
- `npm run build` — green; vendor chunk ~2.57 MB (MapLibre + Turf bundled); PWA precache 14 entries

### Issues / notes for Phase 6

- **Manual smoke** still required: `npm run preview` — import, draw, V1 tools, 3 widgets, SmartStyle export, selection, dual-screen, workflow, PWA offline
- **Dead code candidates**: `js/ui/data-prep-panel-html.js`, `workflow-palette.js` vanilla class (only `findDef` used), possible `workflow-canvas.js`
- **Vendor chunk size** (~2.57 MB) — consider lazy-loading MapLibre/Turf or restoring CDN for map-window only
- **Logs panel** — optional quick React port or defer
- **map-window.html** still loads MapLibre/Turf from CDN (dual-screen secondary window unchanged)

### Next

**Phase 6** — Polish and single doc per [docs/REACT_FINISH_PLAN.md](docs/REACT_FINISH_PLAN.md) § Phase 6.

---

## NEXT AGENT PROMPT (Phase 6)

```
Execute Phase 6 ONLY of the React finish migration for GIS Toolbox.

Read first (in order):
- docs/REACT_FINISH_PLAN.md (Phase 6 section)
- HANDOFF.md
- AGENTS.md

Scope: Phase 6 only — docs, dead CSS, smoke + PWA polish. Migration is functionally complete after this phase.

Goals:
- Add docs/ARCHITECTURE.md (engine.js + React UI + registry pattern)
- Update docs/WIDGET_AUTHORING.md for post-migration paths
- Mark docs/REACT_REFACTOR_PLAN.md completed
- Remove dead CSS (workflow.css orphans, unused mobile rules) and orphaned JS (data-prep-panel-html.js, workflow-canvas.js if unused)
- Optional: React port of logs panel (or defer with note)
- Lighthouse + PWA offline verification on dist/
- Manual smoke on npm run preview (full checklist from REACT_FINISH_PLAN.md)
- Update HANDOFF.md: migration complete

Rules:
- Do NOT reintroduce js/app.js or legacy UI paths
- npm test + npm run build green before stopping

Begin Phase 6 now.
```

---

_Archive older bullets when stale (optional):_

- 2026-06-06: Phase 4 — Full workflow React.
- 2026-06-06: Phase 3 — Mobile gate.
- 2026-06-06: Phase 2 — Finish last vanilla-only UIs.
- 2026-06-06: Phase 1 — Cut rollback scaffolding.
