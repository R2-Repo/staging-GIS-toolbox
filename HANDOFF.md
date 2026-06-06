# Agent handoff

Keep this file current so the next session can continue without re-discovery.

## Latest

- **Date**: 2026-06-06
- **Phase completed**: **Phase 1** — Cut the dead weight ([docs/REACT_FINISH_PLAN.md](docs/REACT_FINISH_PLAN.md))
- **Goal**: React finish migration — Phase 2 next (last vanilla-only modals + SelectionBar)
- **Branch**: `main`

### What was done (Phase 1)

Removed all rollback scaffolding so React is the **only** runtime UI path for migrated surfaces:

- **Deleted legacy widget UI**: `widget-base.js`, `bulk-update.js`, `spatial-analyzer.js`, `proximity-join.js`
- **Deleted workflow SVG canvas**: `workflow-canvas.js`; `workflow-overlay.js` always uses React Flow
- **Deleted all 8 feature-flag modules + tests**: map, left/right panel, toast, modal, tool-dialog, header, workflow flags
- **Simplified modal/toast**: subscriber API only in `modals.js` / `toast.js` (no DOM fallbacks)
- **Removed legacy panel renders from `app.js`**: `renderLayerList`, `renderFieldList`, `renderOutputPanel`, `buildStylePanel`, `bindStylePanel`, `renderDataPrepTools` — panels always mount via React islands at boot
- **Removed legacy HTML modal branches** from ~40 migrated `open*` handlers (React-only)
- **Simplified widget controllers**: always `openReactIsland` (no `WidgetBase` / legacy fallbacks)
- **Removed duplicate `react/tools/` widget shims**; canonical paths are `react/widgets/`
- **Moved data-prep panel HTML** to `js/ui/data-prep-panel-html.js` (used by React left panel)

### Preserved (unchanged behavior)

- 3 widgets: engines + React dialogs + registry (`bulk-update/`, `spatial-analyzer/`, `proximity-join/`)
- V1 GIS tools + `tool-catalog.js`
- SmartStyle (`react/panels/SmartStylePanel.jsx`, `style-engine.js`)
- Selection map logic (`map-manager.js`, `selection-shortcuts.js`, `ApplyToSelector.jsx`)
- Dual-screen protocol
- Workflow React Flow canvas (`PipelineEditor.jsx`)

### Files changed (high level)

**Modified**: `js/app.js`, `js/ui/modals.js`, `js/ui/toast.js`, `js/map/draw-manager.js`, `js/workflow/workflow-overlay.js`, `js/widgets/*/controller.js`, `js/widgets/widget-types.js`, `docs/REACT_FINISH_PLAN.md`, `docs/WIDGET_AUTHORING.md`, `scripts/new-widget.mjs`, `HANDOFF.md`

**Added**: `js/ui/data-prep-panel-html.js`, `scripts/phase1-strip-app.mjs`, `scripts/phase1-strip-legacy-modals.mjs`

**Deleted**: `js/widgets/widget-base.js`, `js/widgets/bulk-update.js`, `js/widgets/spatial-analyzer.js`, `js/widgets/proximity-join.js`, `js/workflow/workflow-canvas.js`, all `*-feature-flags.js` (8 modules), all `*-feature-flags.test.js` (8 tests), `react/tools/*BulkUpdate*`, `react/tools/*SpatialAnalyzer*`, `react/tools/*ProximityJoin*` shims

### Verification

- `npm test` — green (28 files, 125 tests)
- `npm run build` — green; emits `dist/`

### Issues / notes for Phase 2

- **Still vanilla-only in `app.js`** (Phase 2 scope): `openFilterBuilder`, `openJoinTool`, `openValidation`, `openTemplateBuilder`, `openFeatureEditor`, `showDataTable`, `showToolInfo`, `showMapContextMenu`
- **Selection bar** still mutates `#selection-bar` in `updateSelectionUI()` — move to `react/map/SelectionBar.jsx`
- **Map popup globals** (`window._mapPopupNav`, `window._mapPopupEdit`) still in `app.js` boot — Phase 2 portal/delegation
- **Mobile UI** still present — Phase 3 gate
- **Header**: React header mounts at boot; legacy `if (!_isReactHeader)` listener blocks were removed — verify header actions in manual smoke
- **Boot order**: modal + toast hosts mount before map/panels — required now that DOM fallbacks are gone

### Next

**Phase 2** — Finish last vanilla-only UIs per [docs/REACT_FINISH_PLAN.md](docs/REACT_FINISH_PLAN.md) § Phase 2.

---

_Archive older bullets when stale (optional):_

- 2026-06-05: M4–M12 incremental React migration (rollback scaffolding; superseded by finish plan).
- 2026-06-04: Dual Screen activation fix on `main` (#16).
