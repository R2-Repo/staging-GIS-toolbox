# Agent handoff

## Latest

- **Date**: 2026-06-14
- **Status**: **Side panel background image restored**
- **Branch**: working tree (uncommitted)

### What changed

- `css/main.css` — restored `Side_Background.webp` on panel pseudo-elements; overlay tuned to `0.85` (between original `0.952` and trial `0.75`)
- `vite.config.js` — copy `Side_Background.webp` to `dist/` on build; added to PWA `includeAssets`
- `tests/panel-background.test.js` — regression test for asset + CSS reference

### Root cause

During React refactor prep, panel pseudo-element backgrounds were switched from `url('../Side_Background.webp')` to CSS gradients. The webp asset remained at repo root but was no longer referenced.

### Verification

- `npm test -- tests/panel-background.test.js` — green
- `npm test` — green
- `npm run build` — green; `dist/Side_Background.webp` present; bundled CSS references hashed asset
- Browser: `npm run preview` — confirm textured background visible in left/right panel gaps (manual)

### Next

- None

---

## Previous (2026-06-14)

- **Status**: **Pipeline header button click-area fix**
- **Branch**: working tree (uncommitted)

### What changed

- `css/workflow.css` — hidden workflow overlay now uses `z-index: -1` (only `9000` when `.visible`); closed `#wf-overlay-root` ignores pointer events
- `js/workflow/workflow-controller.js` — sets `inert` on overlay root when closed
- `react/header/HeaderBar.jsx` — Pipeline + Dual Screen grouped in `header-pipeline-cluster` so flex-wrap does not split them; Pipeline icon wrapped like other header buttons
- `css/main.css` — header `.btn-sm` min-height 28px; tighter dual-screen separator margin; cluster layout styles
- `tests/workflow-overlay-hit.test.js` — guards overlay stacking + header layout conventions

### Root cause

After visiting the pipeline editor, the hidden full-screen overlay stayed at `z-index: 9000` above the header (`z-index: 100`). React Flow DOM could intercept clicks meant for `#btn-workflow`. Pipeline button was also ~2px shorter than sibling header buttons and could wrap away from Dual Screen on narrower widths.

### Verification

- `npm test -- tests/workflow-overlay-hit.test.js tests/app-boot-modals.test.js` — green
- `npm run build` — green
- Browser: open Pipeline → Back to Map → click Pipeline again in header (manual)

### Next

- None

---

## Previous (2026-06-14)

- **Status**: **Pipeline overlay map interaction fix (confirmed)**
- **Branch**: working tree (uncommitted)

### What changed

- `css/workflow.css` — when workflow overlay is hidden, it now uses `visibility: hidden` and suppresses pointer events for descendants, preventing hidden React Flow DOM from intercepting map gestures after returning to map view
- `js/workflow/workflow-controller.js` — removed temporary debug instrumentation used during runtime diagnosis
- Deleted temporary debug log artifact `.cursor/debug-af1899.log`

### Verification

- User repro flow confirmed fixed: open Data Pipeline Editor → Back to Map → map pan/zoom works again
- `npm run build` — green

### Next

- None

---

## Previous (2026-06-14)

- **Status**: **Neumorphic UI mockup (future plan only — not implementing)**
- **Branch**: working tree (uncommitted)

### What changed

- [`docs/mockups/neumorphic-ui-mockup.html`](docs/mockups/neumorphic-ui-mockup.html) — interactive light/dark neumorphic preview
- [`docs/NEUMORPHIC_UI_PLAN.md`](docs/NEUMORPHIC_UI_PLAN.md) — **future plan** (scope, tokens, effort, open questions)

### Verification

- Open mockup in browser; toggle dark theme in header

### Next

- None unless product decides to pursue — see `docs/NEUMORPHIC_UI_PLAN.md`

---

## Previous (2026-06-14)

- **Status**: **Input node canvas color fix**
- **Branch**: working tree (uncommitted)

### What changed

- Input nodes (`Layer Input`, `File Import`) now use orange `#d97706` on canvas, matching the Inputs palette category
- Previously hardcoded green `#16a34a` in `js/workflow/nodes/input-nodes.js`
- `tests/workflow-node-colors.test.js` — asserts every node instance color matches its category palette color

### Verification

- `npm test -- tests/workflow-node-colors.test.js` — green

### Next

- Browser smoke: add an input node to the pipeline canvas and confirm orange header/border (before run output)

---

## Previous (2026-06-14)

- **Status**: **Trackpad map pan fix**
- **Branch**: working tree (uncommitted)

### What changed

- Box-select no longer hijacks normal click-drag panning when a layer is active
- `_setupRectangleSelect()` now requires **Shift+drag** on empty map (`shouldStartBoxSelectDrag` in `js/map/map-interaction-utils.js`)
- Updated selection hints in `SelectionBar.jsx` and `tool-guide-sections.js`
- `tests/map-interaction-utils.test.js` — unit tests for box-select drag gating

### Verification

- `npm test` — full suite green
- **Browser** (manual): with an active layer, trackpad/mouse drag on empty map pans; Shift+drag draws box-select rectangle

### Next

- Browser smoke: confirm box-select still works with Shift+drag after import auto-activate

---

## Previous (2026-06-14)

- **Status**: **Imported layers auto-activate**
- **Branch**: working tree (uncommitted)

### What changed

- New imports automatically become the active layer (file import, ArcGIS, photo import)
- `addLayer(dataset, { activate: true })` in `js/core/state.js` — emits `layer:active` when switching
- `_addImportedDatasets` and photo-import paths pass `{ activate: true }`
- `tests/import-active-layer.test.js` — regression for activate behavior

### Verification

- `npm test` — 61 files, 319 tests green
- **Browser** (manual): import a file while another layer is active → new layer highlighted in left panel

### Next

- Browser smoke: multi-file import activates last imported layer; session restore still respects saved active layer

---

## Previous (2026-06-14)

- **Status**: **GIS Tools spatial layer fix**
- **Branch**: working tree (uncommitted)

### What changed

- On reload, the **Guide splash** (`showToolInfo`) now opens first; **Restore Previous Session** runs only after the splash is dismissed
- Boot sequence moved into the modal-host effect so dialogs always have a mounted host; `bootRanRef` prevents duplicate boot runs
- Modal layers: `splash` (z-index 1100) for the guide, `deferred` (z-index 900) for session restore — splash stays on top if both overlap
- `tests/app-boot-modals.test.js` — regression guards for boot order and z-index tiers

### Verification

- `npm test -- tests/app-boot-modals.test.js` — 3 tests green
- **Browser** (manual): reload with saved layers → Guide splash on top → dismiss → restore prompt appears

### Next

- Browser smoke on mobile: session restore prompt should remain under `MobileGate` (unchanged z-index behavior)

---

## Previous (2026-06-14)

- **Status**: **Export fix for workspace layers**
- **Branch**: working tree (uncommitted)

### What changed

- Fixed GeoJSON (and other) export crash for **`spatial-chunked` / workspace** layers: `applyFieldSelectionToDataset` no longer treats them as table rows (`dataset.rows.map` on undefined)
- Workspace layers skip in-memory field selection; format exporters read features from IndexedDB
- Added `tests/export-workspace.test.js`

### Verification

- `npm test -- tests/export-workspace.test.js` — 2 tests green
- **Browser** (manual): import or load a workspace-backed layer → Export → GeoJSON downloads without error

### Next

- Consider applying schema field selection during workspace batch export (currently exports all attributes from IndexedDB)

---

## Previous (2026-06-14)

- **Status**: **Line Offset restored (map + pipeline)**
- **Branch**: working tree (uncommitted)

### What changed

- Re-enabled **Line Offset** GIS tool in V1 map mode (`line-offset` in `V1_MAP_TOOL_IDS`)
- Added **`line-offset` pipeline node** (`LineOffsetNode`) using existing `lineOffsetFeatures` in `gis-tools.js`
- Inspector, palette tooltip description, and tests for map catalog + node execution

### Verification

- `npm test` — 57 files, 307 tests green
- **Browser** (manual): GIS Tools panel → **↔ Offset** on a line layer; Pipeline → Spatial → **Line Offset** node

### Next

- Browser smoke: offset a real road layer in map mode and in a sample pipeline

---

## Previous (2026-06-14)

- **Status**: **Pipeline palette node tooltips**
- **Branch**: working tree (uncommitted)

### What changed

- Added `js/workflow/node-descriptions.js` — centralized tooltip text for all 34 pipeline node types
- `node-catalog.js` attaches `description` to every node def via `getNodeDescription()`
- `WorkflowPalette.jsx` shows styled hover/focus tooltips + native `title` fallback
- `css/workflow.css` — `.wf-palette-item-tooltip` styles
- `tests/workflow-node-tooltips.test.js` — fails if a registered node lacks a description (future-proof)

### Verification

- `npm test -- tests/workflow-node-tooltips.test.js` — 2 tests green
- **Browser** (manual): open Pipeline → hover nodes in left palette → tooltip appears below item

### Next

- Browser smoke: verify tooltip positioning for nodes near bottom of palette scroll area

---

## Previous (2026-06-07)

- **Status**: **Data Pipeline Editor update (Phase 1 + 2)**
- **Branch**: working tree (uncommitted)

### What changed

**Correctness & trust**
- Fixed sample pipelines using wrong filter operator (`greaterThan` → `greater_than`)
- Added `normalizeFilterOperator()` alias map in `FilterRowsNode`
- Pre-run validation gate in `workflow-controller.js` (`collectInvalidNodes`)
- Debounced auto-save (1s) on `workflow:engine-changed`; inspector config/comment emits save trigger
- Clear pipeline requires confirm; session restore warns on skipped unknown node types
- Removed auto add-to-map on file-import upload (map only via Add to Map node at run)

**Simplify onboarding**
- `pipelines/manifest.json` — recipe metadata (`v1Compatible`, `linear`, title, description)
- `WorkflowEmptyState.jsx` — recipe cards + blank canvas on empty canvas
- `WorkflowStepsPanel.jsx` + `workflow-graph-utils.js` — Graph | Steps toggle for linear pipelines
- Examples dropdown: V1 recipes first, Advanced examples expander
- Top bar: Fit view, More ▾ (Import/Export/Clear); Dual Screen kept in overlay (header hidden while editor open)

**Icon**
- Custom `PipelineIcon` SVG + `icons/pipeline.svg`; header button label shortened to **Pipeline**

**Tests**
- `workflow-filter.test.js`, `workflow-validation.test.js`, `workflow-examples.test.js`

### Verification

- `npm test` — 55 files, 300 tests green
- `npm run build` — green
- **Browser** (manual): open Pipeline → empty state recipes → load Filter and Preview → Steps view → Run → preview table; header shows SVG icon (not puzzle piece)

### Next

- Browser smoke: Spatial Join example (non-linear → Steps disabled); Import/Export via More menu
- Consider `workflow-graph-utils` unit tests for linear detection edge cases

---

## Previous (2026-06-07)

- **Status**: **GIS Widget Panel UX parity (all 4 widgets)**
