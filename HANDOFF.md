# Agent handoff

## Latest

- **Date**: 2026-06-07
- **Status**: **Route Milepost Segment — UX simplification**
- **Branch**: working tree (uncommitted)

### What changed

**Single-page widget (was 4-step wizard)**
- Removed step wizard, Next/Back, Preview on Map, and Refresh Preview
- Route search collapses to chip after select; mileposts + Create Layer on one screen
- **Live map preview**: debounced (500ms) as mileposts are typed — single MP shows green point; both valid MPs auto-build segment
- Compact panel-dock layout: sticky footer, 100px search list, reduced padding
- Files: `RouteMilepostSegmentDialog.jsx`, `controller.js` (`onMilepostPreview`), `engine.js` (`buildMilepostPointWhere`), `css/main.css`

### Verification

- `npm test` — 52 files, 267 tests green
- **Browser** (manual): open Route Milepost Segment Builder with right panel expanded — select route, type MPs, confirm map preview updates without extra clicks; Create Layer closes modal

### Next

- Browser smoke on Bulk Update / other GIS widgets in panel dock
- Consider `modalClass` per-widget body padding if route-mp still scrolls on small viewports

---

## Previous (2026-06-07)

- **Status**: **GIS widget modals docked + draggable**

- **Status**: **Panel section collapse fixed**
- **Branch**: working tree (uncommitted)

### What changed

**Panel collapse fix**
- Root cause: duplicate collapse handlers (React `onClick` + legacy `document` listeners in `setupAppWiring`) double-toggled sections, canceling each other out
- Added [`react/ui/CollapsibleSection.jsx`](react/ui/CollapsibleSection.jsx) — React state–driven section collapse
- Migrated all left/right panel sections to `CollapsibleSection` (Layers, Fields, Data Tools, GIS Widgets, GIS Tools, Export, Style, Visibility Range, etc.)
- Removed duplicate panel/section collapse listeners from [`js/tools/tool-handlers.js`](js/tools/tool-handlers.js)
- Regression guards in [`tests/event-wiring-regression.test.js`](tests/event-wiring-regression.test.js)

### Verification

- `npm test` — 50 files, 234 tests green
- **Browser**: click each panel section header (left + right) — body should hide/show and stay collapsed after layer changes

### Next

- Manual browser check of panel collapse across all sections
