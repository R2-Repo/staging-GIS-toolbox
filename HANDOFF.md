# Agent handoff

## Latest

- **Date**: 2026-06-20
- **Status**: **Divided highway route search — both widgets**
- **Branch**: working tree (uncommitted)

### What changed

- **Route search** no longer filters `ROUTE_DIRECTION = 'P'` during alias lookup; divided carriageways (e.g. `0080PM` / `0080NM`) both appear
- **Two-step divided highway picker** — first list shows plain names (`SR-155`, `I-80`); clicking a divided route opens direction step (`I-80 (0080P)` / `I-80 (0080N)`)
- Undivided routes never show `(0155P)`-style suffixes
- **`selectRouteFeatures` + `queryRouteFeaturesById`** — N-direction route IDs load their own centerline correctly
- **Both widgets**: Project Stationing + Route Centerline controllers and dialog pickers updated

### Files

- `js/widgets/route-milepost-segment/engine.js`, `config.js`, `arcgis-client.js`
- `js/widgets/project-stationing/controller.js`
- `js/widgets/route-milepost-segment/controller.js`
- `react/widgets/shared/RouteSearchResults.jsx`
- `react/widgets/ProjectStationingDialog.jsx`, `RouteMilepostSegmentDialog.jsx`
- `tests/route-milepost-segment-engine.test.js`

### Verification

- `npm test` — 485 passed
- **Browser** (manual): search `I-80` in both widgets → two options; select each → different preview/mileage

### Next

- Manual browser smoke on I-80 divided-highway pick in Project Stationing + Route Centerline

---

## Previous (2026-06-20) — Import Table tab UI cleanup

## Previous (2026-06-20) — Project Stationing widget — progressive step UX + extent confirm


## Previous (2026-06-20) — Project Stationing widget — progressive step UX (initial)

## Previous (2026-06-19) — Import Station Table — side-based locator direction (RT→EB, LT→WB)


## Previous (2026-06-19) — Import Station Table — editable locator naming (suggested travel direction)

---

## Previous (2026-06-19) — Import Station Table — RT/LT UX clarity

---

## Previous (2026-06-19) — Import Station Table dialog — broken mount import path

---

## Previous (2026-06-19) — CRS architecture — full implementation (Phases 1–4)

---

## Previous (2026-06-19) — Station table import ITS fix

---

## Previous (2026-06-19) — pick clip MapLibre fix

- **Status**: **Pick clip — MapLibre doubleClickZoom API fix**

- **Status**: **Milepost clip — linear referencing for hundredths**
- ArcGIS range query expansion; `startRouteTwoPointPick` for map clip

---

## Previous (2026-06-19) — hundredth milepost validation

- **Status**: **Route milepost clip — snap hundredths to tenth-mile layer**

## Previous — Project Stationing station table subflow

- **Status**: **Project Stationing — station table subflow**
- Added post-run success panel with **Import Station Table** launch button (existing route/clip/station form remains intact)
- Added internal Import Station Table sub-dialog (not registered as a side-panel widget)
- Added CSV/XLSX table loading through `importFile(..., { skipGuard: true })`, column detection, mapping overrides, QA summary, and review list
- Added pure table-import engines:
  - `station-table-detect.js`
  - `station-table-parse.js`
  - `station-event-plot.js`
  - `station-table-validation.js`
- Plot output layers: Imported Events, Offset Connectors, optional Coordinate QA Lines, and Unplotted Rows Report table
- Added context-menu entry **Import Station Table** for Project Stationing centerline layers

### Verification

- `npm test` — 70 files, 394 tests green
- `npm run build` — green
- **Browser** (manual): Create stationing → success panel → Import Station Table → load CSV/XLSX → confirm column detection/review → Plot Ready Rows → verify event/connector/report layers → export KMZ

### Next

- Manual browser smoke on real stationed route and messy station table
- Future UI refinements: batch corrections, richer review table editing, route reverse/rebuild controls, projected CRS support

---

## Previous (2026-06-18)

- **Status**: **Project Stationing — civil-style ticks + offset labels (UI unchanged)**
- **Branch**: working tree (uncommitted)

### What changed

- **Output model** (replaces line segments + along-line text): single **centerline** + **perpendicular station ticks** + **offset station label points** + **begin/end markers**
- Defaults (engine): 100 ft interval (from UI), 30 ft ticks, 50 ft major ticks @ 500 ft, 35 ft label offset right
- **Layers on run**: `{name} Centerline`, `{name} Station Ticks`, `{name} Station Labels`, `{name} Begin End` (+ optional `{name} Mileposts (tenth)`)
- KMZ-friendly: ticks = `LineString`, labels/markers = `Point` with `name` / `station_label`
- `js/widgets/project-stationing/engine.js` — `generateStationingGraphics`, `buildStationTick`, `buildStationLabelPoint`, `getLocalTangentBearing`, `isMajorStation`
- `controller.js` — multi-layer output; preview shows centerline, ticks, labels, markers
- `map-manager.js` — preview styling for `station_tick`, `station_label`, `begin_end_marker`, `project_centerline`
- **Widget UI not changed** (same route/clip/station form)

### Verification

- `npm test` — 67 files, 367 tests green
- **Browser** (manual): preview/run → orange centerline, white perpendicular ticks, offset labels; export KMZ → Google Earth

### Next

- Expose advanced settings in UI (label side, tick length, major interval, reverse direction) per scope doc
- Manual browser smoke on real UDOT route

---

## Previous (2026-06-18)

- **Status**: **Project Stationing — simplified UX (segments + line labels + optional milepost tenths)**
- **Branch**: working tree (uncommitted)

### What changed

- **Simplified widget UX**: route on map + zoom; **BEG_MILEAGE / END_MILEAGE** shown (2 decimals); optional clip via Start/End MP **or** map pick (mutually exclusive); default = full positive centerline
- **Output**: 100-ft **line segments** with MapLibre **line-following labels** (`station_start`); KMZ-friendly `name` on each segment
- **Optional radio**: “Segments + milepost tenths” adds UDOT ArcGIS tenth-mile point layer along clip (`{name} Mileposts (tenth)`)
- Removed box/circle/polygon draw clip from UI
- `js/widgets/route-milepost-segment/config.js` — `BEG_MILEAGE`, `END_MILEAGE` on route query
- `js/widgets/project-stationing/engine.js` — `formatRouteMileage`, `resolveClipMilepostRange`; `computeProjectStationing` → `generateStationSegments`
- `js/widgets/project-stationing/controller.js` — simplified `resolveClip`; `onPickClipOnRoute`; segment + optional milepost layers
- `react/widgets/ProjectStationingDialog.jsx` — mileage display, MP/pick clip, output radio
- `js/map/map-labels.js` — `placement: 'line'` for path-following labels
- `js/map/map-manager.js` — line label layers wired

### Verification

- `npm test` — 67 files, 363 tests green
- `npm run build` — green
- **Browser** (manual):
  - Select route → mileage display → map zooms to route
  - Full route / MP clip / map pick paths
  - Segment labels along lines; optional milepost tenths layer
  - Export segments → KMZ → Google Earth Pro

### Next

- Manual browser smoke on real UDOT route
- Google Earth label behavior (placemark names, not curved path text)

---

## Previous (2026-06-18)

- **Status**: **Project Stationing — centerline + labels + draw clip (v2)**
- **Branch**: working tree (uncommitted)

### What changed

- **Output**: continuous centerline + labeled station **points** (not 100-ft segment lines); two layers on run (`{name} Centerline`, `{name} Stations`)
- **Clip methods** (prominent at top of form): Milepost | Box | Circle | Draw — reuses `createAreaDrawHandlers` from Spatial Analyzer
- `js/widgets/project-stationing/engine.js` — `CLIP_METHODS`, `clipCenterlineToArea`, `clipCenterlineToBbox`, `generateStationPoints`, `generateProjectStationingOutput`; `computeProjectStationing` returns centerline + points
- `js/widgets/project-stationing/controller.js` — `resolveClip` branches milepost vs draw; `onDrawClipArea`; preview shows clip area + station points; run creates two styled layers with `_mapLabels` on stations
- `react/widgets/ProjectStationingDialog.jsx` — single-page form with clip-method selector, draw buttons, collapsible "Adjust clip" (offsets + map pick); preview summary shows point count
- `js/map/map-labels.js` — `buildMapLabelLayerSpec`, `normalizeMapLabels` (new)
- `js/map/map-manager.js` — symbol text layer when `dataset._mapLabels.field` is set
- `tests/project-stationing-engine.test.js` — clip + points + centerline (22 tests)
- `tests/map-labels.test.js` — label layer spec (2 tests)

### Verification

- `npm test` — 67 files, 357 tests green
- `npm run build` — green
- **Browser** (manual): GIS Widgets → Project Stationing → milepost path; draw box/circle/polygon path

### Next

- Browser smoke on real UDOT route

---

## Previous (2026-06-18)

- **Status**: **Project Stationing widget (v1)**
- **Branch**: working tree (uncommitted)

### What changed

- New **Project Stationing** GIS widget — clips UDOT ALRS positive-direction centerline by milepost range, optional foot offsets or map pick trim, then generates 100-ft project station line segments with civil-style labels (`817+15`, `818+00`, …)
- `js/widgets/project-stationing/engine.js` — `parseStation`, `formatStation`, `computeStationBreaks`, `generateStationSegments`, trim helpers
- `js/widgets/project-stationing/controller.js` — reuses `route-milepost-segment` ArcGIS client + milepost clip; map pick trim; preview/run
- `react/widgets/ProjectStationingDialog.jsx` — 4-step wizard (Route → Clip → Stationing → Review)
- `js/map/map-manager.js` — `showProjectStationingPreview()` for route/clip/station segment preview styling
- `js/widgets/registry.js` — registered widget
- `tests/project-stationing-engine.test.js` — 24 engine tests

### Verification

- `npm test` — 66 files, 357 tests green
- `npm run build` — green

### Next

- Browser smoke on real UDOT route with known mileposts

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
