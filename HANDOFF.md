# Agent handoff

Keep this file current so the next session can continue without re-discovery.

## Latest

- **Date**: 2026-06-05
- **Goal**: Fix regression from #23 — map missing on load and side-panel tools/widgets gone.
- **Branch**: `cursor/revert-mountisland-regression-2ca4`
- **Root cause**: #23 added global React root reuse in `mountIsland.jsx` (WeakMap). That broke first-load mounting for map/header React islands. Workflow remount safety already lives in `workflow-overlay.js` via fresh host elements.
- **Fix**: Revert `mountIsland.jsx` to one `createRoot` per mount (no WeakMap).
- **Verification**:
  - `npm test` ✅ (126)
  - `npm run build` ✅
  - `node scripts/preview-smoke.mjs http://127.0.0.1:4173` ✅ (23/23 — map canvas, panels, workflow)
  - `node scripts/workflow-add-node-smoke.mjs http://127.0.0.1:4173` ✅

## Next

1. Squash-merge this PR to restore map/panels while keeping #23 workflow-overlay changes.
2. Manual pass: drag palette nodes, connect wires, run pipeline.

---

_Archive older bullets when stale (optional)._
