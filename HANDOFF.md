# Agent handoff

Keep this file current so the next session can continue without re-discovery.

## Latest

- **Date**: 2026-06-04
- **Goal**: Complete **M3 — React Flow pipeline editor** with rollback safety, while keeping build/tests green.
- **Branch**: `main`
- **Fix**:
  - Added `react/bridge.js` with Zustand-backed legacy bridge:
    - `createLegacyBridge(...)` (testable factory),
    - sync from legacy `state` + `event-bus` events,
    - bridge actions (`setActiveLayer`, `setUIState`, `toggleAGOLCompat`),
    - `initLegacyBridge()` lazy singleton for runtime wiring.
  - Added `js/core/libs.js` external-library boundary:
    - npm import fallback when globals are absent,
    - global-first behavior for existing no-bundler runtime compatibility.
  - Added initial M3 scaffold (not wired into runtime yet):
    - `react/workflow/PipelineEditor.jsx` (React Flow rendering shell),
    - `react/workflow/mountPipelineEditor.jsx`,
    - installed `@xyflow/react`.
  - Wired M3 scaffold into `js/workflow/workflow-overlay.js` and finished migration to React Flow path:
    - added `js/workflow/workflow-feature-flags.js`,
    - added dynamic mount/unmount of React Flow island in workflow canvas area,
    - **React Flow is now default**, with rollback via `wfReactFlow=0` (query/localStorage/global).
  - Wired first consumer of `initLegacyBridge()` in `react/workflow/mountPipelineEditor.jsx`.
  - Upgraded `react/workflow/PipelineEditor.jsx` from static preview to interactive editor:
    - custom node rendering with per-port handles,
    - drag/move updates node positions in `WorkflowEngine`,
    - connect/disconnect updates wires in `WorkflowEngine`,
    - selection/double-click emits existing inspector events (`workflow:node-selected`, `workflow:node-inspect`),
    - delete removes nodes/edges and keeps inspector sync.
  - React interaction parity refinements:
    - selected-node state now syncs both directions between React Flow and existing inspector/bus events,
    - node border/status styling mirrors legacy semantics (error=red, output=green, default=node color),
    - edge delete works from keyboard and double-click (legacy-like quick wire removal),
    - custom delete-key handling avoids deleting nodes while typing in form fields,
    - robust edge→wire mapping for reliable engine removal and bus notifications.
  - Updated `js/workflow/workflow-overlay.js` to support interactive React Flow mode:
    - no longer depends on legacy `WorkflowCanvas` when React mode is active,
    - routes palette add/drop to engine updates compatible with React Flow mode,
    - emits `workflow:engine-changed` for cross-island synchronization,
    - emits fit/add-node request events consumed by React Flow island.
  - React Flow wiring is opt-in only:
    - query param: `?wfReactFlow=1`
    - local storage: `localStorage.setItem('wfReactFlow', '1')`
    - global override: `window.__WF_REACTFLOW__ = true`
  - Migrated import/export/photo modules to `libs.js` loaders (PapaParse, XLSX, JSZip, toGeoJSON, shpjs, exifr) instead of direct global references.
  - Added npm deps for the shared boundary: `zustand`, `papaparse`, `xlsx`, `jszip`, `@mapbox/togeojson`, `shpjs`, `exifr`.
  - Added tests:
    - `tests/react-bridge.test.js` (bridge sync + action forwarding),
    - `tests/libs-loader.test.js` (global-first + npm fallback behavior),
    - `tests/workflow-feature-flags.test.js` (flag resolution + precedence).

## Verification

- **Vitest**: `npm test` — green (69 tests).
- **Build**: `npm run build` — succeeds; emits `dist/`.
- **Notes**:
  - Vite reports chunk-size warnings and mixed dynamic/static import warnings in legacy modules; informational for now, no build failure.

## Next

1. **Commit this M1–M3 work** on a feature branch (large staged set; tests/build already green).
2. Run manual browser parity checks for workflow editor:
   - examples load/run/preview,
   - add/remove/connect/delete nodes,
   - import/export config round-trip,
   - persistence after refresh,
   - "Add to Map" behavior.
3. Start M4 (`MapService` + `<MapView>`) after parity sign-off.
4. Keep `index.html` runtime path unchanged until shell-flip milestone.

**New agent prompt**: continue milestone-by-milestone from `docs/REACT_REFACTOR_PLAN.md` and keep `main` shippable.

---

_Archive older bullets when stale (optional):_

- 2026-06-04: Dual Screen activation fix on `main` (#16).
- 2026-06-04: Phase 4 polish merged (#13).
