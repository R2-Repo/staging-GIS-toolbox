# Agent handoff

## Latest

- **Date**: 2026-06-14
- **Status**: **Input node canvas detail labels**
- **Branch**: working tree (uncommitted)

### What changed

- File Import nodes show `config.fileName` on the canvas after a file is added
- Layer Input nodes show the selected layer name on the canvas
- `getCanvasDetail()` on `NodeBase`; overrides in `input-nodes.js`
- `PipelineEditor` renders a muted detail line under the node header; passes `getLayers` from `WorkflowOverlay`
- Canvas refreshes on `workflow:node-data-ready`
- `tests/workflow-input-canvas-detail.test.js` — unit tests for input detail labels

### Verification

- `npm test -- tests/workflow-input-canvas-detail.test.js tests/workflow-node-colors.test.js` — green

### Next

- Browser smoke: add File Import node, upload a file, confirm filename appears on canvas

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
