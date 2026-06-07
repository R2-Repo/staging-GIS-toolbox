# Agent handoff

Keep this file current so the next session can continue without re-discovery.

## Latest

- **Date**: 2026-06-06
- **Phase completed**: **Phase 4** — Full workflow React ([docs/REACT_FINISH_PLAN.md](docs/REACT_FINISH_PLAN.md))
- **Goal**: React finish migration — Phase 5 next (React shell flip)
- **Branch**: `main`

### What was done (Phase 4)

Replaced the hybrid workflow shell with full React UI:

**4a — React workflow shell**
- **Added** `react/workflow/WorkflowOverlay.jsx` — top bar, palette, canvas, inspector, preview
- **Added** `react/workflow/mountWorkflowOverlay.jsx` + `js/workflow/workflow-controller.js` (engine lifecycle, run/import/export/examples)
- **Added** `react/workflow/WorkflowPalette.jsx` — React palette (replaces DOM build in `workflow-palette.js` class usage)

**4b — Node inspectors (3 batches)**
- **Added** `react/workflow/InspectorPanel.jsx` — node selection, data summary, validation, comment, delete
- **Added** `react/workflow/inspectors/` — one React inspector per node type (~35), shared primitives + registry
  - Batch 1: `inputInspectors.jsx`, `outputInspectors.jsx`, `enrichmentInspectors.jsx`
  - Batch 2: `transformInspectors.jsx` (17 types)
  - Batch 3: `spatialInspectors.jsx` (13 types)

**4c — Preview panel**
- **Added** `react/workflow/DataPreviewPanel.jsx` — sortable virtual-scrolled table

**Deleted** (parity confirmed)
- `js/workflow/workflow-overlay.js`, `workflow-inspector.js`, `workflow-data-preview.js`
- `renderInspector` / `readInspector` from all node classes (`node-base.js`, `input-nodes.js`, `output-nodes.js`, `enrichment-nodes.js`, `transform-nodes.js`, `spatial-nodes.js`)

**Wired**
- `js/app.js` uses `createWorkflowController()` instead of `WorkflowOverlay` class
- `PipelineEditor.jsx` mounted inside `WorkflowOverlay` (no separate mount lifecycle)

### Preserved (unchanged behavior)

- 3 widgets, V1 GIS tools, SmartStyle, selection shortcuts + React `SelectionBar`, dual-screen protocol, workflow React Flow canvas, PWA build
- `js/workflow/workflow-palette.js` kept for `WorkflowPalette.findDef()` (node registry lookup)
- `js/workflow/workflow-engine.js`, `workflow-store.js` unchanged

### Files changed (high level)

**Added**: `js/workflow/workflow-controller.js`, `react/workflow/WorkflowOverlay.jsx`, `mountWorkflowOverlay.jsx`, `WorkflowPalette.jsx`, `InspectorPanel.jsx`, `DataPreviewPanel.jsx`, `react/workflow/inspectors/*`, `tests/workflow-inspectors.test.js`

**Modified**: `js/app.js`, `js/workflow/nodes/*.js`, `react/workflow/PipelineEditor.jsx`, `docs/REACT_FINISH_PLAN.md`, `HANDOFF.md`

**Removed**: `workflow-overlay.js`, `workflow-inspector.js`, `workflow-data-preview.js` (~35k LOC inspector DOM across nodes + shell)

### Verification

- `npm test` — green (29 files, 129 tests; +2 inspector registry tests)
- `npm run build` — green; emits `mountWorkflowOverlay` chunk (~52 kB)

### Issues / notes for Phase 5

- **`workflow-palette.js`** still has vanilla `WorkflowPalette` class (only `findDef` used at runtime; palette UI is React). Optional cleanup: extract `findDef` to a registry module in Phase 6.
- **`workflow-canvas.js`** may still exist as dead code from Phase 1 — verify and delete during shell flip if unused.
- **Phase 5 scope**: `react/App.jsx` + `react/main.jsx`, delete `js/app.js`, `#root` shell, thin Zustand `AppStore` — see plan § Phase 5.
- **Manual smoke** deferred to Phase 5/6 gate: load `pipelines/*.json`, configure nodes, run pipeline, Add to Map.

### Next

**Phase 5** — React shell flip per [docs/REACT_FINISH_PLAN.md](docs/REACT_FINISH_PLAN.md) § Phase 5.

---

_Archive older bullets when stale (optional):_

- 2026-06-06: Phase 3 — Mobile gate.
- 2026-06-06: Phase 2 — Finish last vanilla-only UIs.
- 2026-06-06: Phase 1 — Cut rollback scaffolding.
