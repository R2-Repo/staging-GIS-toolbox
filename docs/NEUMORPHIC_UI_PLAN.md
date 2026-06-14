# Neumorphic UI refresh — future plan

> **Status:** Exploratory only — not scheduled. Mockup exists for review; no production CSS changes yet.  
> **Last updated:** 2026-06-14

---

## Goal

Evaluate a **neumorphic chrome refresh** for GIS Toolbox: soft raised/inset surfaces on app shell (header, panels, modals, widgets), while keeping map and workflow canvas areas flat and high-contrast.

---

## Mockup artifact

| Item | Location |
|------|----------|
| Interactive HTML mockup | [`docs/mockups/neumorphic-ui-mockup.html`](../docs/mockups/neumorphic-ui-mockup.html) |
| Style reference (light tokens) | [Copy-Splice-Detail-Canvas `neumorphic-tokens.css`](../../Copy-Splice-Detail-Canvas/src/styles/neumorphic-tokens.css) |
| Toggle reference | [Copy-Splice `neumorphic UI html test.html`](../../Copy-Splice-Detail-Canvas/docs/reference/resources/neumorphic%20UI%20html%20test.html) |
| Dark palette reference | User-provided music-player neumorphic screens (neutral charcoal, orange accents) |

**How to preview:** open the HTML file directly, or serve `docs/mockups/` and load `neumorphic-ui-mockup.html`. Header pill switch toggles light/dark; preference stored in `localStorage` key `gis-mockup-theme`.

### Mockup contents

- **View 1:** Main 3-panel shell (header, layers, map placeholder, style/export)
- **View 2:** Pipeline editor chrome (topbar, palette, inspector; flat canvas placeholder)
- **View 3:** Component gallery (menus, toasts, progress, wizard steps, GIS tools grid, form controls, logs, widget previews)
- **Modals:** Import, Progress, Confirm, Proximity Join, Bulk Update, Spatial Analyzer, Route Milepost (toggle via bottom bar)

---

## Scope (if ever implemented)

### In scope — neumorphic chrome

- Header, left/right panels, collapsible sections
- Buttons, inputs, selects, toggles, tabs
- Modals, toasts, widget wizards, GIS tools panel
- Workflow overlay shell: topbar, palette, inspector, preview (not canvas)

### Out of scope — keep flat / current styling

- MapLibre viewport
- Map popups, context menu, draw toolbar, selection bar
- React Flow canvas, nodes, wires
- Map-adjacent controls that must stay crisp over basemaps

**Rationale:** Neumorphism works best on uniform surfaces; GIS map + dense graph UI need sharp hierarchy and contrast.

---

## Design tokens (from mockup)

### Shared accent (both themes)

- Orange gradient active state: `#ff5e13` → `#ff2a00`
- Active ring + inset: `--neo-shadow-active`

### Light theme

| Token | Value |
|-------|-------|
| Page / surface | `#e8ecf1` |
| Shadow dark / light | `#b8bec7` / `#ffffff` |
| Text strong / muted | `#2d3748` / `#718096` |
| Map placeholder | `#d5dbe3` |

### Dark theme (charcoal — not blue)

Inspired by dark neumorphic music-player UIs: black core, warm neutral greys, no blue cast.

| Token | Value |
|-------|-------|
| Page core | `#121214` |
| Surface | `#1a1b1e` |
| Shadow dark / light | `#0a0a0b` / `#2c2d32` |
| Text strong / muted | `#f0f0f2` / `#8a8a90` |
| Map placeholder | `#0e0e10` |
| Page gradient | `#1e1f22` → `#121214` → `#0a0a0b` (neutral) |

### Neumorphic primitives to port

From Copy-Splice / mockup:

- `--neo-shadow-raised`, `--neo-shadow-raised-sm`, `--neo-shadow-inset`, `--neo-shadow-pressed`
- `--neo-shadow-toggle-track`, `--neo-shadow-knob` (layered track → indicator → knob)
- Utility classes: `.neo-raised`, `.neo-inset`, `.neo-btn`, `.neo-input`, `.neo-modal-panel`, etc.

### Toggle pattern (important)

Reference toggles use **three layers**, not a single flat pill:

1. **Track** — grooved 4-shadow inset channel  
2. **Indicator** — fills with orange gradient when on  
3. **Knob** — floating sphere with dual drop shadow + bounce easing  

Segmented header toggles (Map/Satellite): grooved track + raised inactive pills + active orange state.

---

## Rough effort (if pursued)

| Tier | Scope | Estimate |
|------|-------|----------|
| 1 | Chrome only: tokens + header/panels/modals | ~3–7 days |
| 2 | Full shell + workflow chrome + all dialogs | ~2–3 weeks |
| 3 | Full app + a11y audit + visual regression | ~4–6+ weeks |

**Mechanical difficulty:** Moderate (centralized CSS variables in `css/main.css`, `css/workflow.css`).  
**UX risk:** Medium — must preserve map/canvas clarity and WCAG contrast on soft shadows.

---

## Suggested implementation path (someday)

1. Extract tokens from mockup into `css/neumorphic-tokens.css` (do not wire to app yet).
2. Prototype on header + one panel + one modal in a feature branch.
3. Add `[data-theme="dark"]` alongside light; avoid `@media prefers-color-scheme` alone if user toggle is desired.
4. Override shared primitives (`.btn`, `.panel`, `.modal`, `.form-group`) — most dialogs inherit automatically.
5. Leave `PipelineEditor.jsx` inline node styles and map CSS prefixes untouched.
6. Manual browser pass + `npm test` (no visual test suite today).

---

## Open questions

- [ ] Light-only, dark-only, or user toggle in production?
- [ ] Keep GIS gold accent (`#dbac3f`) vs Copy-Splice orange (`#ff5e13`)?
- [ ] Dark charcoal final values — match mockup or tune after side-by-side with map?
- [ ] Partial rollout (header/panels first) vs big-bang theme swap?

---

## Related files (production — unchanged)

- [`css/main.css`](../css/main.css) — current dark flat theme (`#1c1c1e`, gold accent)
- [`css/workflow.css`](../css/workflow.css) — workflow chrome
- [`react/App.jsx`](../react/App.jsx) — layout shell

---

## Decision log

| Date | Decision |
|------|----------|
| 2026-06-14 | Exploratory mockup approved for reference; **no production refactor** |
| 2026-06-14 | Scope excludes map UI and React Flow canvas/nodes |
| 2026-06-14 | Dark theme revised from blue-grey to **neutral charcoal** per user reference images |
