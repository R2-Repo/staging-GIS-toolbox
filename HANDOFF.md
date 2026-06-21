# Agent handoff

## Latest

- **Date**: 2026-06-21
- **Status**: **Toolbox Kit — custom project export/import (`.gtbx`)**
- **Branch**: working tree (uncommitted)

### What changed

- New **Toolbox Kit** portable project format (`.gtbx` ZIP) with selective sections: layers & styles, map appearance, pipeline, preferences
- [`js/core/project-kit.js`](js/core/project-kit.js) — manifest schema, pack/parse, download helper
- [`js/core/layer-restore.js`](js/core/layer-restore.js) — shared layer reconstruction; workspace bundle import; merge ID suffixing
- [`js/workspace/workspace-store.js`](js/workspace/workspace-store.js) — `exportWorkspaceLayerBundle` / `importWorkspaceLayerBundle`
- [`js/core/session-store.js`](js/core/session-store.js) — exported `serializeLayerForPersistence`
- Session restore now handles **workspace-backed layers** (refs in session IDB + data in workspace IDB)
- [`js/tools/tool-handlers.js`](js/tools/tool-handlers.js) — `exportProjectKit`, `importProjectKit`, launchQueue `.gtbx` handler
- [`react/tools/ProjectKitDialog.jsx`](react/tools/ProjectKitDialog.jsx), [`mountProjectKitDialog.jsx`](react/tools/mountProjectKitDialog.jsx)
- [`react/panels/RightPanel.jsx`](react/panels/RightPanel.jsx) — Toolbox Kit section (always visible)
- PWA `file_handlers` for `.gtbx` in [`manifest.json`](manifest.json) and [`vite.config.js`](vite.config.js)
- [`tests/project-kit.test.js`](tests/project-kit.test.js)

### Verification

- `npm test` — 80 files, 519 tests green
- `npm run build` — green
- **Browser** (manual): Export Kit from right panel → clear site data → Import Kit → verify layers, styles, basemap, pipeline, palette favorites

### Next

- Browser smoke: large workspace layer round-trip via `.gtbx`
- Optional: show estimated `.gtbx` size in export dialog before download

---

## Previous (2026-06-21)

- **Status**: **Map popup scroll — open at top of attributes**
