# Agent handoff

## Latest

- **Date**: 2026-06-07
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
