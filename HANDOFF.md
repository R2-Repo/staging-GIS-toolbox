# Agent handoff

Keep this file current so the next session can continue without re-discovery.

## Latest

- **Date**: 2026-05-18
- **Goal**: **Performance & reliability** — responsive UI, real cancel, test coverage (see full plan)
- **Branch (next work)**: `cursor/performance-phase-1-8709`
- **Plan doc**: [docs/PERFORMANCE_PLAN.md](docs/PERFORMANCE_PLAN.md) (phases 1–6, evidence, tests, starter prompt)
- **Context**: Prior thread was **planning only** — no performance PR merged; no code from that thread unless committed separately.

### What to build next (Phase 1 only)

1. Fix **import cancel bug**: `app.js` declares `currentTask` but never assigns it; `importFile` in `importer.js` creates its own `TaskRunner` (~line 81).
2. **Active task registry** or expose task from import so Cancel stops work.
3. On cancel: **no** `addLayer` / no partial layers; use `ErrorCategory.CANCELLED` via `handleError`.
4. Clean up `bus.on('task:progress')` leak on import modal close.
5. Wire Cancel on ArcGIS download + heavy GIS progress where `TaskRunner` already exists.
6. Add `tests/task-runner.test.js`, `tests/importer-cancel.test.js`.
7. Optional housekeeping: delete `js/map/map-manager.js.bak` if still present.

**Do not start** in Phase 1: Web Workers, rbush, incremental map updates, progressive import to map.

### Prior shipped work (still relevant)

- **Spatial pruning**: [js/tools/spatial-bbox.js](js/tools/spatial-bbox.js) — bbox overlap, `nearestJoin` sort threshold 64, used in gis-tools + Proximity Join.
- **Proximity Join**: chunked `requestAnimationFrame` (`CHUNK_SIZE = 200`) — **reference pattern** for Phase 2.
- **TaskRunner**: [js/core/task-runner.js](js/core/task-runner.js) — `cancel()`, `throwIfCancelled()`, `processInChunks` (unused elsewhere).
- **Tests**: 28 passing — spatial-bbox, feature-distance, line-geojson, gis-tools (dissolve, nearestJoin, intersect, spatialJoin), map-interaction-utils, logger.

## Verification

- **Vitest**: `npm test` from repo root — expect **28+** tests green after Phase 1.
- **Phase 1 manual**: Start import of a slow file → **Cancel** → no new layer; map still pans/zooms.
- **Browser** (general): `python3 -m http.server 8080` → http://localhost:8080/

## Known issues / risks

- **Import cancel broken** (verified): `currentTask` never set in `handleFileImport`.
- **nearestJoin** worst-case O(n×m); bbox heuristics help, spatial index is Phase 4.
- **Monolithic Turf** on simplify/dissolve/polygonSmooth — UI blocks until return (`gis-tools.js`).
- **No workers** in repo yet; CDN-only libs in `index.html`.
- **`js/map/map-manager.js.bak`**: stray backup — delete when convenient.
- **`package-lock.json`**: may be dirty locally (unrelated); do not commit unless dependency change intentional.

## Next (after Phase 1)

- Phase 2: `processInChunks` adoption, debounce `refreshUI`, PJ/spatial-analyzer cancel + chunking — [docs/PERFORMANCE_PLAN.md](docs/PERFORMANCE_PLAN.md)
- Phase 3+: workers for KML/KMZ/shapefile parse (requires CDN-in-worker or vendor strategy)

---

## New agent — copy/paste prompt

```
Read HANDOFF.md, docs/PERFORMANCE_PLAN.md, and AGENTS.md.

Implement Phase 1 only: fix import cancel (currentTask), active task wiring,
cancel guards before addLayer, ArcGIS/GIS cancel where applicable,
tests/task-runner.test.js and tests/importer-cancel.test.js.

Test-first; npm test green; branch cursor/performance-phase-1-8709;
commit, push, draft PR. Do not implement workers, spatial index, or map chunking.
```

---

_Archive_

- 2026-05-13: GIS tools/widgets, spatial pruning, Proximity Join alignment — see git history.
- 2026-05-13: Vitest scaffold + rules.
