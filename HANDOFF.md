# Agent handoff

## Latest

- **Date**: 2026-06-07
- **Status**: **Import only when needed — as-is by default**
- **Branch**: working tree (uncommitted)

### What changed

**Central routing**
- [`js/import/import-routing.js`](js/import/import-routing.js) — `assessImportRoute()`, `OPTIMIZER_PEAK_BYTES` (16 MB), coordinate/KML heavy tiers; `shouldConvertToWorkspace`, `arcgisShouldUseWorkspace`
- [`js/import/import-size-notices.js`](js/import/import-size-notices.js) — `buildNoticeForRoute()` with reason-based copy; `shouldShowImportProgressNotice()`

**Entry points**
- [`js/tools/tool-handlers.js`](js/tools/tool-handlers.js) — `openImportForFiles()` for drag-drop, toolbar, and routed imports; `_addImportedDatasets` workspace opt-in + ≥15k features; ArcGIS `useWorkspace` only when count ≥15k (or spatial filter)
- [`react/tools/ImportFlowDialog.jsx`](react/tools/ImportFlowDialog.jsx) — `assessImportRoute` instead of SOFT-only Optimizer redirect; supports `initialFiles` / field-pick bootstrap
- [`react/tools/ImportOptimizerDialog.jsx`](react/tools/ImportOptimizerDialog.jsx) — conditional `useWorkspace`, reason-based notices, KML default **preserve**

**KML/KMZ**
- [`js/import/kml-importer.js`](js/import/kml-importer.js), [`js/import/kmz-importer.js`](js/import/kmz-importer.js) — default `importMode: 'preserve'`

**Tests**
- [`tests/import-routing.test.js`](tests/import-routing.test.js)
- Updated [`tests/import-size-notices.test.js`](tests/import-size-notices.test.js)

### Verification

- `npm test` — 50 files, 232 tests green
- **Browser**: small GeoJSON → in-memory, no Optimizer; 2.5 MB / 500 features → standard path; 20k CSV → Optimizer + workspace; small ArcGIS → in-memory spatial + style panel; large ArcGIS → workspace stream

### Known issues / limits

- Feature/coord sniff from file sample can still over-estimate on standard path (Optimizer is conservative)
- KML heavy-asset tier (≥4 MB) routes to Optimizer but does not auto-strip on standard path

### Next

- Manual browser matrix above
- Optional: pass `initialScans` through Import Flow to avoid double-scan on drag-drop

---

## Previous (2026-06-07)

- **Status**: **Layer visible scale range (ArcGIS-style)**
- **Branch**: working tree (uncommitted)

### What changed

**Scale range core**
- [`js/map/scale-range.js`](js/map/scale-range.js) — ArcGIS `minScale`/`maxScale` ↔ MapLibre `minzoom`/`maxzoom`; `isLayerVisibleAtScale`, `applyArcgisScaleRangeToLayer`
- [`js/core/data-model.js`](js/core/data-model.js) — `scaleRangeEnabled`, `minScale`, `maxScale` on spatial / workspace layers
- [`js/core/session-store.js`](js/core/session-store.js) — persist scale range fields
- [`js/map/map-manager.js`](js/map/map-manager.js) — apply zoom range on `addLayer`, `_installGeoJsonChunk`, `setLayerScaleRange`; re-apply on `moveend` when latitude shifts
- [`js/map/map-service.js`](js/map/map-service.js) — `setLayerScaleRange` facade

**UI**
- [`react/panels/VisibilityRangeSection.jsx`](react/panels/VisibilityRangeSection.jsx) — toggle, dual scale + zoom inputs, set-from-map, clear
- [`react/panels/RightPanel.jsx`](react/panels/RightPanel.jsx) — section above Smart Style
- [`react/panels/LeftPanel.jsx`](react/panels/LeftPanel.jsx) — SCALE badge; dimmed row when out of range at current zoom
- [`react/App.jsx`](react/App.jsx) — wiring + `layersForPanel` scale state
- [`js/tools/tool-handlers.js`](js/tools/tool-handlers.js) — `handleLayerScaleRangeChange`, snapshot map zoom/lat
- [`css/main.css`](css/main.css) — `.layer-scale-badge`, `.layer-item-scale-hidden`

**Import / sync**
- [`js/arcgis/rest-importer.js`](js/arcgis/rest-importer.js) — read service `minScale`/`maxScale`; apply on import
- [`js/dual-screen/protocol.js`](js/dual-screen/protocol.js) — scale range in `serializeLayerForSync`
- [`js/map-window.js`](js/map-window.js) — secondary map restore applies scale range

**Tests**
- [`tests/scale-range.test.js`](tests/scale-range.test.js)
- [`tests/map-scale-range.test.js`](tests/map-scale-range.test.js)

### Verification

- `npm test` — 49 files, 225 tests green
- **Browser**: `npm run preview` — select layer → Right panel **Visibility Range** → enable, set min/max from map, zoom in/out; ArcGIS REST layer with service scale limits; left-panel SCALE badge + dim when out of range

### Known issues / limits

- Scale↔zoom conversion uses map-center latitude (re-applies when lat shifts >0.5°)
- Attribute/elevation filtering still via workflow Filter Rows (not layer visibility)
- Per-symbol-class scale ranges not supported (one range per layer)

### Next

- Manual browser check for scale range UX at high latitudes
- Optional: GeoJSON export of scale range metadata
