# Agent handoff

Keep this file current so the next session can continue without re-discovery.

## Latest

- **Date**: 2026-06-06
- **Status**: **React migration complete** — all 6 phases done ([docs/REACT_FINISH_PLAN.md](docs/REACT_FINISH_PLAN.md))
- **Architecture**: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Branch**: `main`

### What was done (Phase 6)

**Documentation**
- **Added** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — React UI + `js/` domain, widget/tool/workflow patterns
- **Updated** [docs/WIDGET_AUTHORING.md](docs/WIDGET_AUTHORING.md) — post-migration paths (`tool-handlers.js`, `WidgetPanel`, no `app.js`)
- **Marked** [docs/REACT_REFACTOR_PLAN.md](docs/REACT_REFACTOR_PLAN.md) as **completed**
- **Updated** [AGENTS.md](AGENTS.md) — links `ARCHITECTURE.md`

**Dead code removal**
- **Deleted** `js/ui/data-prep-panel-html.js` (replaced by `LayerDataToolsPanel.jsx` in Phase 5)
- **Removed** `renderWidgetPanelHtml()` from `js/widgets/registry.js`
- **Removed** legacy SVG canvas CSS from `css/workflow.css` (`.wf-canvas-svg`, `.wf-node-group`, ports, wires)
- **Removed** workflow mobile overrides from `css/workflow.css` (covered by `MobileGate`)
- **Removed** dead mobile menu / splash CSS from `css/main.css`
- `workflow-canvas.js` was already deleted in Phase 1

**Deferred**
- **Logs panel** — remains vanilla DOM in `App.jsx` + `setupLogsPanel()`; React port deferred (low priority)

### Verification

- `npm test` — green (29 files, 130 tests)
- `npm run build` — green; precache 14 entries (~3.2 MB)
- `npm run smoke:preview` — 23/23 passed (SW registered, offline shell reload, workflow opens, map-window)
- Lighthouse (`dist/` via preview): Performance 60, Accessibility 100, Best Practices 100
- PWA offline: verified by smoke (manifest + `sw.js` + offline reload)

### Architecture summary

```
react/main.jsx → App.jsx → panels, tools, widgets, workflow (React)
                         ↓
js/tools/tool-handlers.js, js/core/state.js, js/widgets/*/engine.js, mapService
```

- Entry: `index.html` → `#root` → `react/main.jsx`
- No `js/app.js`, no legacy `innerHTML` panels, no feature flags
- Mobile: `MobileGate` splash only (< 768px)
- PWA: Vite build + `vite-plugin-pwa`

### Known follow-ups (post-migration, optional)

- Logs panel React port
- Vendor chunk size (~2.57 MB) — lazy-load MapLibre/Turf or CDN for map-window only
- `map-window.html` still loads MapLibre/Turf from CDN (dual-screen secondary window)

---

## NEXT AGENT PROMPT

Migration is complete. For new features:

1. Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/WIDGET_AUTHORING.md](docs/WIDGET_AUTHORING.md)
2. Widgets: `engine.js` + `react/widgets/` + `registry.js`
3. GIS tools: `gis-tools.js` + `react/tools/*Dialog.jsx` + `tool-handlers.js`
4. Never reintroduce `js/app.js` or legacy UI paths
5. Gate: `npm test` + `npm run build` (+ browser smoke for map/UI changes)

---

_Archive:_

- 2026-06-06: Phase 5 — React shell flip (`App.jsx`, delete `app.js`).
- 2026-06-06: Phase 4 — Full workflow React.
- 2026-06-06: Phase 3 — Mobile gate.
- 2026-06-06: Phase 2 — Finish last vanilla-only UIs.
- 2026-06-06: Phase 1 — Cut rollback scaffolding.
