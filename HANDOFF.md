# Agent handoff

Keep this file current so the next session can continue without re-discovery.

## Latest

- **Date**: 2026-06-04
- **Goal**: Start **M4 — MapService extraction + React `<MapView>`** incrementally, while preserving M3 stability and rollback safety.
- **Branch**: `main`
- **Fix**:
  - Re-validated baseline on current working tree:
    - `npm test` and `npm run build` are green before M4 edits.
  - Added first M4 extraction boundary:
    - `js/map/map-service.js` (`createMapService`, delegating lifecycle + core map ops to current `mapManager`).
    - `js/map/map-feature-flags.js` (new map island flag resolver).
    - **Default remains legacy map path**; React map is opt-in for rollback safety.
  - Added initial React map island:
    - `react/map/MapView.jsx` (owns map init/destroy through `mapService`).
    - `react/map/mountMapView.jsx` (mount helper + readiness promise).
    - `js/app.js` now routes map init through:
      - legacy/default: `mapService.init('map-container')`
      - opt-in M4 path: dynamic mount of `<MapView>` via `mapReactView` flag.
  - Added styling support for map island host:
    - `css/main.css`: `.map-react-view-host` fill container sizing.
  - Added tests for new M4 slice:
    - `tests/map-feature-flags.test.js`
    - `tests/map-service.test.js`
  - Continued incremental `MapService` adoption in `js/app.js` (without changing shell path):
    - switched several low-risk calls from `mapManager` → `mapService`:
      - map resize hooks (boot/panel-collapse/mobile-map),
      - import/photo/workflow/draw add/remove/toggle paths,
      - basemap/2D-3D toggles,
      - layer reorder sync,
      - style apply + field-refresh map updates.
  - Expanded `MapService` wrapper surface in `js/map/map-service.js`:
    - style helpers (`getLayerStyle`, `setLayerStyle`),
    - basemap state (`getCurrentBasemap`),
    - fence/search helpers (`hasImportFence`, `clearImportFence`, `startImportFenceDraw`, `getImportFenceEsriEnvelope`, `getSearchLatLng`, `clearSearchMarker`),
    - selection helpers (`isSelectionMode`, `getSelectedIndices`, `getSelectedFeatures`, `getSelectionCount`, `enter/exit/clear/selectAll/invert`),
    - map interaction helpers (`startPointPick`, `startTwoPointPick`, `startRectangleDraw`, `startSketchPolygon`, `startSketchCirclePolygon`, `showInteractionBanner`, `showTempFeature`),
    - layer lookup helper (`getLayerRecord`).
    - layer-id + adapter state helpers (`getLayerIds`, `getLayerStyles`, `setCurrentBasemap`, `is3DEnabled`, `set3DEnabled`).
    - popup/orbit helpers (`hasPopupHits`, `cyclePopup`, `getActivePopupHit`, `closePopup`, `findFeaturesNearClick`, `showMultiPopup`, `showPopup`, `isOrbiting`, `startCameraOrbit`, `stopCameraOrbit`).
    - compatibility getters for legacy-style consumers (`map`, `dataLayers`).
  - Migrated `js/app.js` to consume these wrappers, removing direct `mapManager` method calls.
    - `js/app.js` now has no direct `mapManager.*` usage; it goes through `mapService` for map operations while still passing `mapManager` into required legacy adapter hooks (`installDualScreenMapFacade`, export map-style injection).
    - widget dependency injection now passes `mapService` (Spatial Analyzer / Bulk Update / Proximity Join).
  - Migrated dual-screen modules to `mapService`:
    - `js/dual-screen/secondary-client.js` now uses `mapService` for popup bridge, orbit actions, and fence commands.
    - `js/map-window.js` now uses `mapService` for snapshot apply, layer sync, viewport fits, and map chrome toggles.
    - `js/dual-screen/coordinator.js` now uses `mapService` for map lifecycle restore, snapshot chrome state, and bounds access.
  - Migrated draw subsystem boundary:
    - `js/map/draw-manager.js` now uses `mapService` instead of importing `map-manager` directly for selection, interaction cancel, rectangle draw delegation, and highlight/lookup calls.
  - Updated widget dependency injection in `js/app.js`:
    - Spatial Analyzer, Bulk Update, and Proximity Join now receive `mapService` as their map dependency.
  - Extended tests:
    - `tests/map-service.test.js` now verifies delegation for the new wrapper methods, including popup/orbit, fence set-from-bbox, layer IDs, map/dataLayers compatibility getters, sketch helpers, interaction banner, cancel/highlight helpers.

## Verification

- **Vitest**: `npm test` — green (78 tests).
- **Build**: `npm run build` — succeeds; emits `dist/`.
- **Dev server smoke**: `npm run dev -- --host 127.0.0.1 --port 4173` starts successfully (Vite ready, local URL printed).
- **Post-migration check**: reran `npm test` + `npm run build` after additional `mapService` call-site migration — still green.
- **Checkpoint-ready working tree**:
  - Modified: `js/app.js`, `js/map/draw-manager.js`, `js/map-window.js`, `js/dual-screen/coordinator.js`, `js/dual-screen/secondary-client.js`, `js/map/map-service.js`, `tests/map-service.test.js`, `css/main.css`, `HANDOFF.md`.
  - Added: `js/map/map-feature-flags.js`, `react/map/MapView.jsx`, `react/map/mountMapView.jsx`, `tests/map-feature-flags.test.js`.
- **Notes**:
  - Vite reports chunk-size warnings and mixed dynamic/static import warnings in legacy modules; informational for now, no build failure.
  - Full M3 **manual browser parity** checklist could not be executed from this agent runtime (no interactive browser control). Needs human/manual pass in-browser.

## Next

1. Run manual browser parity checks for workflow editor:
   - examples load/run/preview,
   - add/remove/connect/delete nodes,
   - import/export config round-trip,
   - persistence after refresh,
   - "Add to Map" behavior.
2. Exercise opt-in map island path in browser (`mapReactView=1`) and confirm parity for:
   - map initialization, resize, layer add/remove/toggle/restyle/order,
   - basemap + 2D/3D toggles,
   - dual-screen compatibility (legacy facade still attached).
3. Continue M4 extraction by migrating remaining `mapManager`-centric modules where safe:
   - `js/widgets/bulk-update.js`,
   - `js/widgets/spatial-analyzer.js`.
4. Keep `js/dual-screen/map-facade.js` and `js/export/exporter.js` map-style integration path as intentional compatibility layers during overlap (do not remove yet).
5. Keep `index.html` runtime path unchanged until shell-flip milestone.

**New agent prompt**: continue milestone-by-milestone from `docs/REACT_REFACTOR_PLAN.md` and keep `main` shippable.

---

_Archive older bullets when stale (optional):_

- 2026-06-04: Dual Screen activation fix on `main` (#16).
- 2026-06-04: Phase 4 polish merged (#13).
