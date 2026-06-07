# React Finish Plan — GIS Toolbox

> **Status: complete** (2026-06-06). The app is a React-owned UI. See [ARCHITECTURE.md](ARCHITECTURE.md) for current layout and patterns.

---

## Final architecture

```
react/main.jsx → App.jsx → panels, tools, widgets, workflow (React)
                         ↓
js/tools/tool-handlers.js, js/core/state.js, js/widgets/*/engine.js, mapService
```

- Entry: `index.html` → `#root` → `react/main.jsx`
- Handlers: `js/tools/tool-handlers.js`
- State: `js/core/state.js` + `react/providers/AppStore.jsx`
- Map: imperative `mapService` (not in React render tree)
- Mobile: `MobileGate` splash only (< 768px)
- PWA: Vite + `vite-plugin-pwa`

---

## Phase completion

| Phase | Summary | Status |
|-------|---------|--------|
| 1 | Delete rollback scaffolding | completed |
| 2 | Port last modals + SelectionBar | completed |
| 3 | Mobile gate | completed |
| 4 | Full workflow React | completed |
| 5 | React shell flip (delete `app.js`) | completed |
| 6 | Docs, dead CSS, smoke + PWA polish | completed |

---

## Guardrails (do not reintroduce)

1. No `js/app.js` or legacy `innerHTML` panel renders.
2. No feature flags, `WidgetBase`, or dual UI paths.
3. New UI = React components; new domain logic = `js/` modules. Widgets follow [WIDGET_AUTHORING.md](WIDGET_AUTHORING.md).

---

## Related docs

- [ARCHITECTURE.md](ARCHITECTURE.md) — primary reference for agents
- [REACT_REFACTOR_PLAN.md](REACT_REFACTOR_PLAN.md) — historical note on the original incremental plan
