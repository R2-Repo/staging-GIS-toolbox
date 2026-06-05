# Agent handoff

Keep this file current so the next session can continue without re-discovery.

## Latest

- **Date**: 2026-06-05
- **Goal**: Fix React Flow Data Pipeline editor — palette click/drag could not add nodes reliably.
- **Branch**: `cursor/fix-reactflow-pipeline-add-node-969f`
- **Root cause**: React Flow mount is async; palette interactions emitted `workflow:add-node-request` before the React island registered its listener. The old handler also referenced `WorkflowPalette` in a way that could throw at runtime in the built chunk.
- **Fix**:
  - Added `js/workflow/workflow-node-placement.js` + `js/workflow/workflow-canvas-bridge.js` so the overlay adds nodes directly to the engine after awaiting React Flow mount.
  - `workflow-overlay.js` now awaits mount, shows a brief canvas loading state, and no longer depends on the bus round-trip for add-node.
  - `PipelineEditor.jsx` registers `screenToFlowPosition` via the bridge for accurate drop placement; removed the fragile `workflow:add-node-request` handler.
  - `css/workflow.css`: explicit React Flow host sizing + loading overlay styles.
  - Added `tests/workflow-node-placement.test.js`.
- **Verification**:
  - `npm test` ✅ (126)
  - `npm run build` ✅
  - `node scripts/workflow-add-node-smoke.mjs http://127.0.0.1:4174` ✅ (palette click adds nodes on preview build)

## Next

1. Manual browser pass: drag palette nodes, connect wires, run pipeline, reopen editor.
2. Optionally wire `workflow-add-node-smoke.mjs` into CI preview smoke.

---

_Archive older bullets when stale (optional)._
