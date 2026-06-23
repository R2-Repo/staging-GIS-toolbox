# Agent handoff

## Latest

- **Date**: 2026-06-23
- **Status**: **Dual-screen map popup styling + coord-search bridge**
- **Branch**: `main`

### What changed

- [`css/map-window.css`](css/map-window.css) — dark MapLibre popup theme (matches main app), CSS variables for popup inline styles, coord-search + measure control styling
- [`js/dual-screen/secondary-client.js`](js/dual-screen/secondary-client.js) — relay coord-search popup actions to primary; handle `clearSearchMarker` draw cmd
- [`js/dual-screen/primary-handlers.js`](js/dual-screen/primary-handlers.js) — route coord-search popup actions to app handlers
- [`js/tools/tool-handlers.js`](js/tools/tool-handlers.js) — coord-search handlers accept search info from secondary; clear marker on both windows when dual-screen active
- [`js/map/map-manager.js`](js/map/map-manager.js) — coord search popup subtitle uses `--text-muted`
- Tests updated in `dual-screen-primary-handlers.test.js`, `dual-screen-secondary-client.test.js`

### Verification

- `npm test` — 560 passed
- Manual: open Dual Screen, click a feature → popup should be dark with nav/edit; coord search popup buttons should work and dismiss marker on both windows

### Next

- Browser verify dual-screen popups in dev/preview if not already checked

---

## Previous

- **Date**: 2026-06-23
- **Status**: **Deployment pipeline prepared (push pending auth)**
- **Branch**: `main` (3 commits ahead of origin)

### What changed

- [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) — GitHub Pages deploy on push to `main` (`npm ci` → `npm run build` → `dist/`)
- [`.node-version`](.node-version) — Node 20 for Cloudflare Pages
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — staging + production cutover guide
- [`scripts/sync-to-production-repo.ps1`](scripts/sync-to-production-repo.ps1) — copies React app into `gis-toolbox` for Cloudflare preview

### Production repo (local, not pushed)

Cloned `R2-Repo/gis-toolbox` → tagged **`vanilla-pre-react`**, branch **`react-migration`** with full React codebase. `npm test` (559) and `npm run build` pass on that branch.

### Verification

- `npm test` — 559 passed (staging)
- `npm run build` — OK
- `npm run smoke:preview` — 22/23 passed (workflow editor click timing flake; HTTP + map + PWA + map-window OK)
- Browser: app shell, map canvas, dual-screen map window load on preview

### Manual steps required (git push blocked on auth in agent)

**Staging GitHub Pages**

1. `git push origin main` (from this repo — 3 commits)
2. GitHub → **staging-GIS-toolbox** → Settings → Pages → Source: **GitHub Actions**
3. Approve **`github-pages`** environment on first workflow run if prompted
4. Staging URL: https://r2-repo.github.io/staging-GIS-toolbox/

**Production Cloudflare preview**

1. From `gis-toolbox` clone: `git push origin vanilla-pre-react` and `git push -u origin react-migration`
2. Cloudflare Pages → build `npm ci && npm run build`, output `dist`, Node **20**
3. Preview deploy `react-migration`, then merge to `main` when ready

### Next

- Push both repos and confirm GitHub Actions + Cloudflare preview URLs
- Full browser QA on live staging before merging `react-migration` → `main`

---

## Previous (2026-06-22)

- **Status**: **CRS Manager widget hidden**
- **Branch**: working tree (uncommitted)

### What changed

- [`js/widgets/registry.js`](js/widgets/registry.js) — `GIS_WIDGETS_HIDDEN` for CRS Manager; panel and `APP_ACTIONS` use visible list only; `openWidget('crs-manager')` still works via `ALL_GIS_WIDGETS`
- [`docs/CRS_MANAGER.md`](docs/CRS_MANAGER.md) — why hidden, alternatives (Reproject tool, export CRS), re-enable steps
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/WIDGET_AUTHORING.md`](docs/WIDGET_AUTHORING.md), [`AGENTS.md`](AGENTS.md) — cross-links and hidden-widget note
- [`js/widgets/crs-manager/controller.js`](js/widgets/crs-manager/controller.js) — removed debug instrumentation
- [`js/map/map-manager.js`](js/map/map-manager.js) — removed debug instrumentation
- [`tests/widget-registry.test.js`](tests/widget-registry.test.js) — asserts CRS Manager hidden from UI/actions

### Verification

- `npm test` — run after change (widget-registry + crs-manager-engine + crs-layer-crs)
- **Browser**: GIS Widgets panel should no longer show CRS Manager; Reproject tool and export CRS unchanged

### Next

- Manual browser smoke on Proximity Join wizard if not yet checked in preview
- Investigate layer restore errors after kit import (user reported separately)

---

## Previous (2026-06-22)

- **Status**: **Data Preview layer info**
- **Branch**: working tree (uncommitted)

### What changed

- [`js/core/layer-info.js`](js/core/layer-info.js) — `getLayerInfoSummary(layer)` for read-only info rows (type, records, fields, geometry, CRS, source, size, added, storage)
- [`react/panels/DataPreviewSection.jsx`](react/panels/DataPreviewSection.jsx) — info grid + Show Data Table button inside Data Preview section
- [`react/panels/RightPanel.jsx`](react/panels/RightPanel.jsx) — uses `DataPreviewSection`
- [`css/main.css`](css/main.css) — `.layer-info-*` styles
- [`js/import/importer.js`](js/import/importer.js) — stamps `source.fileSize` on import
- [`tests/layer-info.test.js`](tests/layer-info.test.js) — unit tests

### Verification

- `npm test` — 548 passed
- **Browser** (`npm run dev -- --port 5174`): Data Preview shows layer info for spatial and table layers; Show Data Table button below divider

### Next

- Manual browser smoke on Proximity Join wizard if not yet checked in preview
- Investigate layer restore errors after kit import (user reported separately)

---

## Previous (2026-06-22)

- **Status**: **Proximity Join UI simplification**
- **Branch**: working tree (uncommitted)

### What changed

- [`js/tools/tool-handlers.js`](js/tools/tool-handlers.js) — `setupAppWiring()` is now idempotent (fixes duplicate widget modals on one click from Strict Mode / HMR re-init)
- [`tests/proximity-join-engine.test.js`](tests/proximity-join-engine.test.js) — distance-only validation, preview, and run cases
- [`react/widgets/ProximityJoinDialog.jsx`](react/widgets/ProximityJoinDialog.jsx) — 3-step wizard (Choose layers → What to add → Review & run); field checklist; Advanced collapse; preview on step 3 only; Run again on results
- [`js/widgets/proximity-join/controller.js`](js/widgets/proximity-join/controller.js) — live selection subscription, layer focus, widened modal; passes new validation flags

### Verification

- `npm test` — all passed (including 7 proximity-join-engine tests)
- **Browser** (`npm run preview`): quick path (layers → distance only → run); full path with copied fields; Advanced max radius; selection-only blocked when nothing selected

### Next

- Manual browser smoke on Proximity Join wizard if not yet checked in preview
- Investigate layer restore errors after kit import (user reported separately)

---

## Previous (2026-06-22)

- **Status**: **Right panel section reorder**

- **Status**: **Import dialog card-grid redesign**

- **Status**: **Logging cleanup and coverage**

- [`js/core/logger.js`](js/core/logger.js) — `setPanelOpen()`; DEBUG/INFO only mirror to console when logs panel is open; WARN/ERROR always console
- [`js/tools/tool-handlers.js`](js/tools/tool-handlers.js) — sync panel open state on toggle/close
- [`js/map/draw-manager.js`](js/map/draw-manager.js), [`js/photo/photo-mapper.js`](js/photo/photo-mapper.js), [`js/map/map-manager.js`](js/map/map-manager.js) — routine UI actions downgraded to `DEBUG`
- [`js/tools/gis-tools.js`](js/tools/gis-tools.js) — per-feature loop warnings replaced with single failure summaries
- [`js/workflow/workflow-engine.js`](js/workflow/workflow-engine.js) — pipeline/node start, timing, and failure logging
- [`js/export/exporter.js`](js/export/exporter.js) — log export start (failures still via `TaskRunner`/`handleError`)
- [`js/widgets/registry.js`](js/widgets/registry.js) — log widget open and unknown widget type
- [`tests/logger.test.js`](tests/logger.test.js), [`tests/workflow-logging.test.js`](tests/workflow-logging.test.js) — new/expanded coverage

## Previous (2026-06-21)

- **Status**: **Toast notification simplification**

- [`js/ui/toast.js`](js/ui/toast.js) — dedupe identical toasts within 2s; shorter default durations
- [`react/ui/ToastHost.jsx`](react/ui/ToastHost.jsx) + [`css/main.css`](css/main.css) — compact toast UI
- [`js/tools/tool-handlers.js`](js/tools/tool-handlers.js) — removed ~35 noisy success/info toasts
