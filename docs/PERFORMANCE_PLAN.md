# GIS Toolbox — Performance & reliability plan

Evidence-backed roadmap from codebase audit (2026-05-18). Implement **one phase per PR**; test-first per `AGENTS.md`.

**Constraints (updated 2026-06-07):**

- Shipped app: **Vite + React** (`npm run build` / `npm run preview`).
- Heavy libs via npm (`js/core/libs.js`): MapLibre, PapaParse, XLSX, JSZip, toGeoJSON, shpjs, Turf.
- **Import Web Worker** shipped: `js/workers/import-parse.worker.js` (GeoJSON/KML/KMZ/shapefile parse ≥256 KB).
- Vitest: **156 tests** including import parsers, cancel, preflight, post-import.
- `processInChunks` used in post-import fence, dataprep, gis-tools, spatial-analyzer, data-model explode.

**Import optimization (done):** single-read payloads, batch TaskRunner, async post-import, preflight UX, worker parse pool, map clustering >10k points, session save queue.

---

## Verified gaps (fix first)

| Gap | Evidence |
|-----|----------|
| Import Cancel is cosmetic | `tool-handlers.js` `currentTask` never assigned; `importFile` creates internal `TaskRunner` in `importer.js` ~81 |
| Monolithic Turf (no mid-op cancel) | `simplifyFeatures`, `dissolveFeatures`, `polygonSmoothFeatures` — single `turf.*` on full FC |
| `processInChunks` unused | Only defined in `task-runner.js` |
| nearestJoin O(n×m) | `HANDOFF.md`, `gis-tools.js` 648+; bbox sort threshold 64 in `spatial-bbox.js` |
| Map duplicates geometry | `map-manager.js` `addLayer` / `refreshLayerData` flatten all features each time |
| Session save clears all layers | `session-store.js` `layerStore.clear()` then rewrite |
| No import tests | `tests/` has 6 files, none under `import/` |

**Reference patterns to copy:**

- Chunked async: `js/widgets/proximity-join.js` (`CHUNK_SIZE = 200`, `requestAnimationFrame`).
- Cooperative GIS loops: `js/tools/gis-tools.js` (`throwIfCancelled` + yield every 100 features in buffer, clip, nearestJoin, intersect, etc.).
- Errors: `js/core/error-handler.js` (`ErrorCategory`, `CANCELLED`, `OUT_OF_MEMORY`, etc.).

---

## Phase 1 — Task system & real cancel (DO THIS FIRST)

**Branch:** `cursor/performance-phase-1-8709`

**Objective:** Cancel actually stops work; no partial layers on abandon.

| # | Task |
|---|------|
| 1.1 | Active task registry OR return `{ result, task }` from `importFile` / register before `task.run` |
| 1.2 | `handleFileImport`: assign `currentTask`; cancel → `task.cancel()` |
| 1.3 | On cancel: skip `addLayer` / post-process; toast via `handleError` → `CANCELLED` |
| 1.4 | Remove or `bus.off` duplicate `task:progress` listeners when modal closes |
| 1.5 | ArcGIS download modal: wire Cancel to `TaskRunner` + `rest-importer` `abortController` |
| 1.6 | GIS heavy modals: Cancel on progress → `task.cancel()` where `TaskRunner` exists |
| 1.7 | `throwIfCancelled` before `splitByGeometryType` / `addLayer` in `handleFileImport` |
| 1.8 | Delete `js/map/map-manager.js.bak` if present |

**Tests:**

- `tests/task-runner.test.js` — cancel → `null`, `cancelled` state, `throwIfCancelled`
- `tests/importer-cancel.test.js` — mock slow importer; cancel mid-run → no dataset

**Acceptance:** `npm test` green (≥30 tests); manual: cancel large import → no new layer, map still pans.

---

## Phase 2 — Cooperative scheduling (main thread)

**Objective:** UI stays responsive without workers.

- Use `processInChunks` / Proximity Join rAF pattern in: KML explode batches, spatial-analyzer loops, dataprep maps, PJ cancel checks.
- Chunk or per-feature simplify/dissolve/smooth where possible.
- Debounce `refreshUI` in `tool-handlers.js` (~150 ms; emits `ui:refresh` for React store).
- Single `fitBounds` after multi-layer import split, not per layer.

**Tests:** `process-in-chunks.test.js`, `data-model-explode.test.js`, extend `gis-tools` if simplify chunked.

---

## Phase 3 — Web Workers (parse / export)

**Objective:** XML, zip, JSON parse and huge KML export off main thread.

**Decision required:** CDN `importScripts` in worker (match `index.html` versions) vs vendor copy under `js/vendor/`.

| Worker (proposed) | Offloads |
|-------------------|----------|
| `js/workers/kml-parse-worker.js` | DOMParser + toGeoJSON + explode |
| `js/workers/kmz-worker.js` | JSZip |
| `js/workers/shapefile-worker.js` | `shp(buffer)` |
| `js/workers/json-worker.js` | Large `JSON.parse` |
| `js/workers/kml-export-worker.js` | KML XML string build |

Extract **pure** parse functions testable in Node; worker is thin `postMessage` wrapper.

**Cancel:** `worker.terminate()` → `CANCELLED`.

---

## Phase 4 — Spatial indexes

- Add rbush (or similar): vendor ESM or devDep + copy — **no production bundler unless agreed**.
- Index layer B in `nearestJoin`, `intersectLayers`, Proximity Join.
- Preflight dialogs: feature count / n×m product (align `LARGE_DATASET_WARN = 5000` in PJ, `10000` map warn, `50000` gis-tools buffer warn).

**Tests:** nearestJoin vs brute force at 200+ candidates; index query tests.

---

## Phase 5 — Map display efficiency

- Point clustering when count > N (`map-manager.js` has `clusterGroups` Map — verify usage).
- Optional simplify-for-display vs full-resolution storage.
- Throttle `refreshLayerData` during in-place joins.
- Mostly **manual** browser verification (MapLibre not in Vitest).

---

## Phase 6 — Session, export, workflow, photos

- Session: incremental IndexedDB writes; `QuotaExceededError` → `OUT_OF_MEMORY`.
- Export KML/KMZ in worker.
- Workflow: cancel + timeouts on `workflow-engine.js` run.
- Photos: concurrency limit 2–4; cancel between files (`photo-mapper.js`).

---

## GIS tools audit (cooperative vs blocking)

| Cooperative loops | Blocking / sync |
|-------------------|-----------------|
| buffer, clip, bboxClip, bezier, lineOffset, findKinks, union, spatialJoin, nearestJoin, intersect, difference, summarizeWithin | simplify, dissolve, polygonSmooth (whole FC Turf) |
| | combineFeatures (sync, no TaskRunner) |

---

## Testing strategy

| Priority | Area | Type |
|----------|------|------|
| P0 | TaskRunner, cancel, importer | Unit |
| P0 | KML explode, CSV coords | Unit + `tests/fixtures/` |
| P0 | nearestJoin, intersect, dissolve | Extend `gis-tools.test.js` |
| P1 | Workers | Pure functions in Node; worker manual |
| P2 | MapLibre | Manual checklist in HANDOFF |

**Commands:** `npm test` | `python3 -m http.server 8080` for browser.

**Error handling:** Use existing `AppError`, `handleError`, `ErrorCategory` — do not parallel a new system.

---

## Explicit non-goals

- Server-side processing.
- Vector tiles / PMTiles rewrite.
- Incremental map `setData` during import (deferred).
- Claiming “zero freeze” without workers/chunking.

---

## Success metrics

| Metric | Baseline |
|--------|----------|
| `npm test` | 28 passed |
| Import cancel | Broken (`currentTask` unset) |
| Long tasks | No worker; PJ chunking only in widget |

---

## New-thread starter prompt (Phase 1)

```
Read HANDOFF.md, docs/PERFORMANCE_PLAN.md, and AGENTS.md.

Implement Phase 1 only: fix import cancel (currentTask), active task wiring,
cancel guards before addLayer, ArcGIS/GIS cancel where applicable, tests/task-runner.test.js
and tests/importer-cancel.test.js. Test-first; npm test green; branch cursor/performance-phase-1-8709;
commit, push, draft PR. Do not implement workers, spatial index, or map chunking.
```
