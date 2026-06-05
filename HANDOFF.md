# Agent handoff

Keep this file current so the next session can continue without re-discovery.

## Latest

- **Date**: 2026-06-05
- **Goal**: Fix React Flow pipeline editor stuck on "Loading canvas…" and palette nodes not appearing.
- **Branch**: `cursor/fix-reactflow-canvas-loading-2ca4`
- **Root cause**: React Flow mount is async; if mount throws (e.g. `createRoot` called twice on the same host after a failed attempt), `_reactFlowReady` never flips true and `wf-canvas-loading` stays forever. Overlay also became visible before mount finished.
- **Fix**:
  - `workflow-overlay.js`: await React Flow mount before showing overlay; add mount error recovery via `_tearDownReactFlowHost()` (fresh host element each mount); return boolean from `_ensureReactFlowCanvasMounted()`; skip node placement when mount fails.
  - `workflow-add-node-smoke.mjs`: assert loading overlay clears after open and after add-node.
- **Regression fix**: reverted `mountIsland.jsx` WeakMap root reuse — it broke map/header on first load. Workflow remount uses new host DOM nodes instead.
- **Verification**:
  - `npm test` ✅ (126)
  - `npm run build` ✅
  - `node scripts/workflow-add-node-smoke.mjs http://127.0.0.1:4173` ✅
  - Headed Playwright on virtual desktop (`DISPLAY=:1`): open editor, add node, close/reopen — canvas loads, nodes appear, no stuck loading overlay.

## Next

1. If users still see stuck loading, hard-refresh or clear site data (PWA service worker may cache old chunks).
2. Manual pass: drag palette nodes onto canvas, connect wires, run pipeline.

---

_Archive older bullets when stale (optional)._
