# React Refactor Plan — GIS Toolbox

> **Historical.** This was the original incremental migration plan (strangler pattern, 12 milestones). The React finish migration completed 2026-06-06. **For all current work, read [ARCHITECTURE.md](ARCHITECTURE.md).**

---

## Rule #0 (still applies)

The refactor must not change visible UI/UX for end users. React components reuse existing CSS class names and DOM structure so `css/main.css`, `css/workflow.css`, etc. apply unchanged.

---

## What changed

The app moved from `js/app.js` + `innerHTML` panels to a single React shell (`react/App.jsx`) with domain logic remaining in `js/`. Key outcomes:

- React Flow workflow canvas (replaced custom SVG canvas)
- React dialogs for all tools and widgets
- `MobileGate` instead of mobile app UI
- Vite build + PWA

Phase details: [REACT_FINISH_PLAN.md](REACT_FINISH_PLAN.md).
