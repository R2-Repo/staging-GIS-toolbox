# Agent handoff

Keep this file current so the next session can continue without re-discovery.

## Latest

- **Date**: 2026-06-07
- **Status**: **Import process hardening complete**
- **Architecture**: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Branch**: `main` (local changes uncommitted unless user committed)

### What was done

**Shared post-import pipeline** — [`js/import/post-import.js`](js/import/post-import.js)
- `normalizeImporterResult`, `expandMixedGeometryDatasets`, `filterDatasetByFence`
- `applyImportLayerStyles`, `finalizeImportedDatasets`, `serializeImportedDataset`
- `revokeKmzBlobUrls` on layer delete
- [`handleFileImport`](js/tools/tool-handlers.js) refactored to use shared pipeline
- Workflow `addToMap` uses `applyImportMetadata` + `applyImportLayerStyles`

**KML/KMZ hardening**
- Fixture tests: `tests/fixtures/import/`, `tests/kml-import.test.js`, `tests/post-import.test.js`, `tests/importer-zip.test.js`
- Shapefile: `GeometryCollection` explode ([`shapefile-importer.js`](js/import/shapefile-importer.js))
- ZIP sniff: shapefile vs KMZ ([`importer.js`](js/import/importer.js) `detectZipKind`)
- KMZ: blob URL tracking + revoke; relative NetworkLink read from archive ([`kml-networklink.js`](js/import/kml-networklink.js), [`zip-utils.js`](js/import/zip-utils.js))

**Workflow parity**
- [`inputInspectors.jsx`](react/workflow/inspectors/inputInspectors.jsx), [`input-nodes.js`](js/workflow/nodes/input-nodes.js): multi-layer warning, `serializeImportedDataset` with `_kmlStyle` / warnings

**UX**
- [`ImportFlowDialog.jsx`](react/tools/ImportFlowDialog.jsx): supported formats + KML limits copy
- Fixed import-related `????` encoding in tool-handlers (drop overlay, fence UI)
- [`docs/kml-kmz-roadmap.md`](docs/kml-kmz-roadmap.md) F3 status updated

**Bugfix (prior in session)**
- `_maybeOfferSimpleStyleConvert is not defined` on every import — moved into post-import as `applyImportLayerStyles`

### Verification

- `npm test` — 32 files, 145 tests green
- `npm run build` — green
- `npm run build` — run after pull
- Manual: import KML/KMZ fixtures, multi-layer shapefile ZIP, workflow file-import node

### Known issues / limits

- Workflow file-import still previews **first layer only** from multi-layer ZIP (by design v1)
- `_kmzLinkResolver` is not serializable — in-archive NetworkLink merge only on main import path
- GPX / GeoPackage not in scope

### Next

- Optional: workflow multi-layer picker for ZIP imports
- C1 per-feature KML StyleMap parsing
- Browser smoke on `npm run preview` after map changes

---

## NEXT AGENT PROMPT

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/kml-kmz-roadmap.md](docs/kml-kmz-roadmap.md). Import logic: `js/import/` + `js/import/post-import.js`. Gate: `npm test` + `npm run build`.
