# CRS Manager widget (hidden)

> **Status:** Hidden from the GIS Widgets panel as of 2026-06-22. Code remains in the repo for possible future use.

## Why it is hidden

CRS Manager was confused with **export CRS** and **map preview in multiple coordinate systems**. This app’s web map (MapLibre) only displays GeoJSON as **WGS 84 lon/lat**. It cannot show UTM or State Plane layers in their native units on the map.

CRS Manager’s actual job is narrow: **batch reproject layers with projected coordinates to WGS 84 (EPSG:4326)** so they display correctly after import. That overlaps with tools users already have:

| Need | Use instead |
|------|-------------|
| Fix one layer for the map | **GIS Tools → Reproject Layer** |
| Export deliverables in UTM / State Plane | **Export** → CRS picker (reprojects at export time) |
| Import projected CSV/Excel | Import CRS confirm dialog; then Reproject tool if needed |
| Shapefile with `.prj` | Usually auto-converted to WGS 84 on import |

## What still exists in code

| Path | Role |
|------|------|
| `js/widgets/crs-manager/engine.js` | Layer audit, validation, batch plan |
| `js/widgets/crs-manager/controller.js` | Modal wiring |
| `react/widgets/CrsManagerDialog.jsx` | UI |
| `tests/crs-manager-engine.test.js` | Engine unit tests |
| `tests/crs-layer-crs.test.js` | Shared CRS helpers used by the widget |

Shared CRS logic in `js/crs/` and `js/crs/layer-crs.js` is **not** widget-specific — import, export, Reproject tool, and workflow nodes still use it.

## Workflow impact

- **No pipeline nodes** reference CRS Manager.
- **No `APP_ACTIONS` entry** for `openCrsManager` while hidden (no panel button, no `data-app-action` handler).
- **`openWidget('crs-manager', ctx)`** still works for dev/console if needed.
- **Import/export/Reproject tool** are unchanged.

## Re-enabling in the UI

1. Move the `crs-manager` object from `GIS_WIDGETS_HIDDEN` to `GIS_WIDGETS` in [`js/widgets/registry.js`](../js/widgets/registry.js).
2. Optionally revisit UX copy (target is WGS 84 only; not for export preview).
3. Run `npm test` and smoke-test with a layer that has the **CRS badge** (projected import).

## Import policy (unchanged)

Import is **warn-only** — coordinates are not auto-reprojected except shapefiles parsed with `.prj` (shpjs → WGS 84). See [ARCHITECTURE.md](ARCHITECTURE.md) § Coordinate reference systems.
