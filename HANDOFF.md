# Agent handoff

## Latest

- **Date**: 2026-06-07
- **Status**: **Data Pipeline Editor update (Phase 1 + 2)**
- **Branch**: working tree (uncommitted)

### What changed

**Correctness & trust**
- Fixed sample pipelines using wrong filter operator (`greaterThan` → `greater_than`)
- Added `normalizeFilterOperator()` alias map in `FilterRowsNode`
- Pre-run validation gate in `workflow-controller.js` (`collectInvalidNodes`)
- Debounced auto-save (1s) on `workflow:engine-changed`; inspector config/comment emits save trigger
- Clear pipeline requires confirm; session restore warns on skipped unknown node types
- Removed auto add-to-map on file-import upload (map only via Add to Map node at run)

**Simplify onboarding**
- `pipelines/manifest.json` — recipe metadata (`v1Compatible`, `linear`, title, description)
- `WorkflowEmptyState.jsx` — recipe cards + blank canvas on empty canvas
- `WorkflowStepsPanel.jsx` + `workflow-graph-utils.js` — Graph | Steps toggle for linear pipelines
- Examples dropdown: V1 recipes first, Advanced examples expander
- Top bar: Fit view, More ▾ (Import/Export/Clear); Dual Screen kept in overlay (header hidden while editor open)

**Icon**
- Custom `PipelineIcon` SVG + `icons/pipeline.svg`; header button label shortened to **Pipeline**

**Tests**
- `workflow-filter.test.js`, `workflow-validation.test.js`, `workflow-examples.test.js`

### Verification

- `npm test` — 55 files, 300 tests green
- `npm run build` — green
- **Browser** (manual): open Pipeline → empty state recipes → load Filter and Preview → Steps view → Run → preview table; header shows SVG icon (not puzzle piece)

### Next

- Browser smoke: Spatial Join example (non-linear → Steps disabled); Import/Export via More menu
- Consider `workflow-graph-utils` unit tests for linear detection edge cases

---

## Previous (2026-06-07)

- **Status**: **GIS Widget Panel UX parity (all 4 widgets)**
