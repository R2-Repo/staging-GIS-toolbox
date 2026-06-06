# React Refactor Plan — GIS Toolbox

> **Remaining work:** see **[REACT_FINISH_PLAN.md](REACT_FINISH_PLAN.md)** (approved 2026-06-06). This file documents the original incremental migration; the finish plan supersedes it for all work left to reach a 100% React UI app.
>
> Living doc. Future agents: read **REACT_FINISH_PLAN.md** first for current work; use this file for historical context and Rule #0 parity constraints.
> Goal: move the app to React **incrementally**, never breaking `main`.
> Main driver: replace the custom SVG pipeline canvas with **React Flow**.

---

## 0. Guiding principles

> **RULE #0 — NON-NEGOTIABLE: the app must look and feel identical.**
> The refactor must **not** change the style, theme, colors, spacing, fonts,
> layout, or any visible UI/UX for the end user. Same features, same behavior,
> same look. React is an internal implementation change only — users must not be
> able to tell anything changed.
>
> How we guarantee it:
> - **Reuse the existing CSS verbatim** (`css/main.css`, `css/workflow.css`, etc.).
>   Import them into the React app unchanged. Do **not** rewrite styles or add a
>   component library that restyles things.
> - **Keep the same DOM structure and class names** so the existing CSS applies
>   exactly. React components render the same markup the old code produced.
> - **Visual parity check every milestone** (see gate below). If anything looks
>   different, the milestone is not done.
> - No new design system, no Tailwind/MUI restyle, no theme "cleanup".

1. **Never break main.** Every milestone ships working. Small PRs.
2. **Strangler pattern.** React grows *inside* the current app as "islands",
   one feature at a time. Old and new run side-by-side until a piece is done.
3. **Logic stays, UI changes.** ~60% of the JS is pure logic (import, export,
   transforms, GIS tools, workflow engine). Reuse it. Only rewrite the DOM/UI layer.
4. **Performance first.** Keep map imperative (no re-render per state change).
   Keep heavy work chunked/off main thread. Measure before/after each milestone.
5. **Test-first.** Pure logic gets Vitest before/after a move. Map/UI flows get a
   manual browser check. Keep `npm test` green.
6. **One build, two outputs during migration:** the legacy no-bundler path keeps
   working until the React shell fully replaces it.
7. **Build + verify every milestone.** No milestone is "done" until `npm run build`
   succeeds, `npm test` is green, AND the visual-parity + smoke checklist passes
   (see "Milestone Definition of Done" below). We catch breakage early, not at M11.

### Milestone Definition of Done (gate for every milestone)

A milestone PR may not merge unless **all** of these pass:
1. `npm test` green (pure-logic tests, before == after).
2. `npm run build` succeeds with no errors; `npm run preview` loads.
3. **Visual parity:** the migrated piece looks pixel-identical to before
   (side-by-side against current `main` / screenshots from M0). Same CSS, same DOM.
4. **Functional parity:** the relevant M0 smoke-checklist items pass in the browser.
5. The rest of the app (un-migrated islands) still works.
6. Rollback path noted (feature flag or revertible commit).

---

## 1. Current architecture (snapshot)

Vanilla ES modules, **no bundler**. `index.html` loads CDN libs + `js/app.js`.
~26k lines JS across ~70 files, ~4.3k lines CSS. PWA (`sw.js`, `manifest.json`).

### Layers

| Area | Files | Nature |
|------|-------|--------|
| Bootstrap / all panels / ~40 modals | `js/app.js` (5790 lines) | DOM via `innerHTML` + `window.app` global facade |
| State | `js/core/state.js` | Mutable singleton + `event-bus` pub/sub |
| Data model | `js/core/data-model.js` | Pure. Dataset/schema structures |
| Persistence | `js/core/session-store.js` | IndexedDB autosave (2s debounce) |
| Tasks | `js/core/task-runner.js` | Cancel + `processInChunks` |
| Map | `js/map/map-manager.js` (2389), `draw-manager.js` (1046) | Imperative MapLibre singleton |
| Dual screen | `js/dual-screen/*` | 2nd window + BroadcastChannel + MapService decorator relay |
| Import | `js/import/*` | Mostly pure; CDN globals (Papa/XLSX/JSZip/toGeoJSON/shp) |
| Export | `js/export/*` | Mostly pure; `downloadBlob` is DOM |
| Dataprep | `js/dataprep/*` | Pure transforms + undo snapshots |
| Tools | `js/tools/*` | Pure (turf) |
| Widgets | `js/widgets/*` | Class + `innerHTML`, tight map coupling |
| ArcGIS / AGOL | `js/arcgis/*`, `js/agol/*` | `fetch` + pure validation |
| **Workflow editor** | `js/workflow/*` | **Custom SVG canvas → React Flow target** |

### How the UI updates today

state mutation → `bus.emit('layers:changed' | ...)` → `app.js` listeners →
`refreshUI()` rebuilds panel HTML via `innerHTML`; generated HTML calls back via
`window.app.*` and `onclick`. Map is pushed to imperatively (`mapManager.addLayer`).

### Workflow subsystem (migration priority — self-contained)

- `workflow-overlay.js` — full-screen overlay (palette | canvas | inspector | preview).
- `workflow-engine.js` — **pure**: graph (`nodes` Map, `wires[]`), topo-sort, cycle
  check, sequential `run(context)`. **Reuse as-is.**
- `workflow-canvas.js` — custom SVG: pan/zoom, node boxes, ports, bézier wires,
  drag-to-connect. **This is what React Flow replaces.**
- `nodes/*` — `NodeBase` subclasses. Each has `renderInspector` (DOM form),
  `readInspector`, `execute`, `validate`, `getOutputPreview`, `toJSON`. ~35 node types
  across input/transform/spatial/enrichment/output registries.
- `workflow-palette.js`, `workflow-inspector.js`, `workflow-data-preview.js` — DOM UI.
- `workflow-store.js` — sessionStorage (graph) + IndexedDB (cached node data).
- Examples loaded from `pipelines/*.json`.

**Key coupling to untangle:** node logic (`execute`, `validate`) is mixed with node
UI (`renderInspector` builds raw HTML + reads it back). For React we split each node
into: (a) pure spec/exec, (b) a React inspector component.

---

## 2. Target architecture

- **Build tool:** Vite + React + TypeScript-optional (start JS, allow `.tsx`).
- **State:** Zustand store (small, no boilerplate, selector-based, good perf).
  Mirrors today's `state.js` shape (layers, activeLayerId, ui). Keep `event-bus`
  during migration as a bridge so un-migrated modules still work.
- **Map:** single `<MapView>` React component owning one MapLibre instance via ref.
  A `MapService` (extracted from `MapManager`, no UI) does add/remove/style/order.
  React **never** re-renders the map; it calls the service in effects.
- **Pipeline editor:** React Flow. Custom node components per category. Reuse
  `WorkflowEngine` for execution unchanged.
- **Panels/modals/widgets:** React components. Replace `window.app` facade with props/store actions.
- **Dual screen:** keep `map-window.html` as a separate entry (own React root or
  keep light). Promote the monkey-patch facade into an explicit `MapService` decorator.
- **Libs:** move CDN globals to npm imports (`maplibre-gl`, `@turf/turf`,
  `papaparse`, `xlsx`, `jszip`, `@mapbox/togeojson`, `shpjs`, `exifr`). Vite
  code-splits so initial load stays small.
- **PWA:** replace hand-written `sw.js` with `vite-plugin-pwa` (Workbox) at the end.
- **Deploy:** still static. `vite build` → `dist/`. Update `.cursor/environment.json`
  to serve `dist/` (and run `vite` dev server) once the shell flips.

---

## 3. Strangler strategy (how islands work)

1. Add Vite that builds a `react/` source tree into a single JS/CSS bundle.
2. Load that bundle from the **existing `index.html`** (extra `<script type=module>`).
3. Each React island mounts into an existing container `<div>` (e.g. the workflow
   overlay root, then a panel, then the map). The rest of the page stays vanilla.
4. A thin **bridge** lets React read/write the legacy store + bus, so both sides
   stay in sync during the overlap.
5. When all islands cover the page, delete `js/app.js` wiring and flip `index.html`
   to the Vite-built shell. Remove the bridge last.

This guarantees every milestone is shippable and reversible.

---

## 4. Milestones

Each milestone = one or a few PRs. Branch prefix `cursor/`, suffix per repo rules.
Each lists: **Goal → Steps → Verify → Rollback → Perf**.

### M0 — Baseline & safety net
- **Goal:** Lock current behavior + appearance before any change.
- **Steps:** Document manual smoke checklist (import each format, draw, tools,
  widgets, dual screen, workflow run, export, session restore, PWA install).
  **Capture reference screenshots** of every screen/panel/modal/the pipeline editor
  at a fixed desktop viewport (e.g. 1440×900) — these are the visual-parity baseline
  every later milestone compares against. Add Vitest coverage for any pure logic that
  lacks it and is on the migration path (importers, exporters, transforms,
  workflow-engine, gis-tools edges).
- **Verify:** `npm test` green; checklist passes on `main`; screenshots stored
  (e.g. `docs/parity/`).
- **Rollback:** n/a (no app change).
- **Perf:** Capture baseline metrics (cold load size/time, large-import time,
  workflow run time, map FPS on pan with N layers). Save numbers in this doc §6.

### M1 — Introduce Vite + React (no behavior change)
- **Goal:** Build pipeline exists; legacy app untouched.
- **Steps:** Add `vite`, `react`, `react-dom`, `@vitejs/plugin-react` as devDeps.
  Create `react/` with an empty mount util `mountIsland(el, Component)`. Add
  `vite.config.js` (root build, output `dist/`, base `./`). Add npm scripts:
  `dev`, `build`, `preview`. Do **not** wire into `index.html` yet.
- **Verify:** `npm run build` produces `dist/`; `npm test` still green; site still
  runs via `python3 -m http.server` unchanged.
- **Rollback:** delete `react/`, config, devDeps.
- **Perf:** none yet; confirm Vite tree-shakes/splits.

### M2 — Shared library boundary (npm + bridge)
- **Goal:** Pure logic importable by both worlds; no duplicate libs.
- **Steps:** Add npm versions of the CDN libs (pin to `index.html` versions).
  Make import/export/tools modules accept an injected lib (or import npm) instead
  of reading `window.Papa` etc. — keep a fallback to the global so legacy still works.
  Create `react/bridge.js`: read legacy `state`/`bus`, expose Zustand store synced
  both ways.
- **Verify:** `npm test` green (logic unchanged); legacy site unchanged in browser.
- **Rollback:** revert bridge + lib injection (globals still present).
- **Perf:** verify Vite chunks heavy libs lazily (dynamic `import()`), not in initial bundle.

### M3 — Pipeline editor in React Flow (THE PRIORITY)
- **Goal:** Replace the SVG canvas with React Flow, reuse the engine. Highest value,
  most isolated.
- **Steps:**
  1. Add `reactflow` (a.k.a. `@xyflow/react`).
  2. Split each node type into pure spec/exec (reuse existing `execute`/`validate`/
     `toJSON`/`getOutputPreview`) + a React inspector component (port each
     `renderInspector` HTML to JSX, drop the `readInspector` DOM-read in favor of
     controlled inputs writing `node.config`).
  3. Build `<PipelineEditor>`: React Flow canvas, palette (drag/click add),
     inspector panel, preview panel, top bar (run/import/export/clear/examples).
  4. Reuse `WorkflowEngine.run(context)` verbatim. Map node statuses
     (`_running/_error/_outputData`) to node styling via React Flow node data.
  5. Reuse `WorkflowStore` (sessionStorage + IndexedDB) for persistence; reuse
     `pipelines/*.json` examples and config import/export.
  6. Mount `<PipelineEditor>` into the existing overlay container when the
     "Data Pipeline Editor" button is clicked (replace `WorkflowOverlay._build`'s
     canvas/palette/inspector with the React island; keep open/close wiring).
- **Verify:** Every example pipeline loads, runs, previews, and "Add to Map" works.
  Config export/import round-trips. Persistence survives refresh. `npm test` green
  (engine tests unchanged + new node-spec tests).
- **Rollback:** feature-flag: keep old `workflow-canvas.js` path behind a flag;
  flip back if React Flow regresses.
- **Perf:** React Flow virtualizes nodes; confirm large graphs (50+ nodes) pan
  smoothly. Keep engine execution off the React render path.

### M4 — Map as a React component (service extraction)
- **Goal:** One `<MapView>` owns MapLibre; logic moves to `MapService`.
- **Steps:** Extract non-UI methods from `MapManager` into `MapService`
  (init/destroy/addLayer/removeLayer/restyle/order/refreshData/basemap/3D/
  interactions). `<MapView>` creates the map in a ref, calls service in effects
  keyed off the store's layers. Keep `mapManager` singleton as a thin adapter so
  un-migrated callers (draw, widgets, dual screen) still work during overlap.
- **Verify:** all map ops (add/remove/visibility/reorder/style/basemap/3D/popups/
  context menu) behave as before. `map.resize()` on panel collapse still correct.
- **Rollback:** mount legacy `#map-container` path instead of `<MapView>`.
- **Perf:** confirm no map rebuild on unrelated state changes; reuse `setData` where
  already done; verify pan FPS ≥ baseline.

### M5 — Left panel (Layers & Fields) in React
- **Goal:** Replace `renderLayerList` / `renderFieldList` / dataprep tools island.
- **Steps:** React `<LayerList>`, `<FieldList>`, `<DataPrepTools>` reading the store.
  Replace `window.app` callbacks with store actions. Keep AGOL toggle behavior.
- **Verify:** select/rename/reorder/visibility/zoom, field select/rename/add,
  undo/redo, AGOL fixes — all match old behavior.
- **Rollback:** render legacy panel HTML if island disabled.
- **Perf:** memoize rows; avoid full re-render on selection (selector slices).

### M6 — Right panel (Output, Export, Styling) in React
- **Goal:** Replace `renderOutputPanel` + style panel + export UI.
- **Steps:** `<OutputPanel>`, `<StylePanel>`, `<ExportPanel>`. Reuse `exporter.js`;
  replace imperative `downloadBlob` with a small React-safe download helper.
- **Verify:** every export format + multi-layer KML/KMZ; style edits reflect on map;
  AGOL compat path.
- **Rollback:** legacy right panel.
- **Perf:** debounce style→map restyle; avoid restyle-by-full-re-add where feasible.

### M7 — Modals, toasts, tool dialogs, widgets in React
- **Goal:** Port `js/ui/modals.js`, `toast.js`, the ~40 `open*` tool modals, and
  `js/widgets/*` to React components/hooks.
- **Steps:** Generic `<Modal>`/`<Toast>` + `useTask()` (progress/cancel) hook.
  Port GIS tool dialogs (buffer, simplify, measure, etc.) calling `gis-tools.js`.
  Port widgets (bulk update, proximity join, spatial analyzer) using a `useMap`
  interaction hook (point pick, rect, polygon, circle) wrapping `MapService`.
- **Verify:** each tool/widget produces identical results; map interactions work;
  cancel actually cancels.
- **Rollback:** keep legacy modal openers behind a flag per dialog.
- **Perf:** keep chunked algorithms; ensure progress UI doesn't thrash render.

### M8 — Import / ArcGIS / Photos / Draw UI in React
- **Goal:** Port the remaining feature UIs.
- **Steps:** `<ImportFlow>` (drag-drop + progress), `<ArcGISImporter>`,
  `<PhotoMapper>`, draw toolbar as React over the map. Reuse all underlying logic.
- **Verify:** import each format incl. fence filter + KML NetworkLinks; ArcGIS
  presets + custom URL + fence; photo EXIF mapping; draw create/edit/delete.
- **Rollback:** legacy openers behind flags.
- **Perf:** import stays chunked/cancelable; draw previews stay imperative on map.

### M9 — Header & navigation in React (mobile simplified)
- **Goal:** Replace header buttons + panel toggles. **Desktop look unchanged.**
- **Scope change (per owner):** the dedicated mobile UI is **out of scope**. We do
  **not** port the mobile FABs, flyouts, bottom-nav, mobile content panels, or
  `css/mobile.css` behaviors. Instead the React app is plain **responsive** (panels
  collapse/stack gracefully on small widths). Desktop UI/UX is byte-for-byte the same.
  Legacy mobile markup/CSS can be dropped during M11 cleanup.
- **Steps:** `<Header>` (same markup/classes/icons as today), panel collapse/expand,
  remove inline `onclick`/`toggleSection` globals. Add lightweight responsive rules
  only where needed; reuse existing desktop CSS untouched.
- **Verify:** desktop header + all menus + tab/panel collapse look and behave
  identically to M0 screenshots; app is usable (not pixel-locked) at narrow widths.
- **Rollback:** legacy header markup.
- **Perf:** CSS-driven responsive; avoid layout thrash on resize.

### M10 — Dual screen on the new architecture
- **Goal:** Port second-window sync without the monkey-patch.
- **Steps:** Turn the legacy dual-screen map facade into `installDualScreenMapServiceDecorator`
  decorator over `MapService`. Keep BroadcastChannel protocol (`protocol.js`)
  unchanged. `map-window.html` becomes a minimal React (or kept-light) entry using
  the same `MapService` + protocol client. Port draw/fence/popup/context relays.
- **Verify:** full dual-screen checklist from `HANDOFF.md` (activate, mirror layers,
  viewport sync, draw relay, file drop, fence, exit/restore, window close).
- **Rollback:** keep legacy dual-screen path until parity confirmed; flag to switch.
- **Perf:** snapshot/diff sync unchanged; confirm no extra map rebuilds.

### M11 — Flip the shell; remove legacy
- **Goal:** React owns the whole page; delete vanilla wiring.
- **Steps:** Make `index.html` the Vite-built shell. Remove `js/app.js` and migrated
  DOM modules, the `window.app` facade, and the bridge. Keep reused pure logic.
  Move surviving pure modules under the React `src/` tree (or keep `js/` as a lib dir).
- **Verify:** entire M0 smoke checklist on the built app via `npm run preview`.
- **Rollback:** revert the `index.html` flip commit (islands still functioned).
- **Perf:** full bundle-size + load-time pass; code-split routes (map vs pipeline editor).

### M12 — PWA, polish, cleanup
- **Goal:** Production hardening.
- **Steps:** Replace `sw.js` with `vite-plugin-pwa`; verify offline + update flow.
  Update `manifest.json` paths. Update `.cursor/environment.json` to build+serve `dist/`.
  Remove dead CSS; consolidate the two undo systems (`state.js` legacy vs
  `transform-history.js`). Fix the `#dataprep-tools` stale-render quirk (now moot).
  Final perf pass + Lighthouse.
- **Verify:** install as PWA, offline load, auto-update; Lighthouse ≥ baseline.
- **Rollback:** keep old `sw.js` until new SW verified.
- **Perf:** confirm metrics meet/beat §6 budget.

---

## 5. Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| Build step breaks "no-bundler" deploy | Islands load from existing HTML until M11; flip is one revertible commit |
| Map perf regresses under React | Map stays imperative via `MapService`; never in render tree |
| Dual-screen is fragile (2 realms) | Port last (M10), keep protocol unchanged, parity flag |
| Node UI/logic entanglement | Split spec/exec from inspector per node (M3) |
| `window.app` facade everywhere | Replace incrementally; bridge keeps both sides synced |
| Two persistence stores (session + workflow) | Reuse both as-is; only swap their UI |
| Large diff / regressions | One milestone per PR + manual checklist + feature flags |
| Library version drift (CDN→npm) | Pin npm to current CDN versions in M2 |

---

## 6. Performance budget (fill during M0)

| Metric | Baseline (M0) | Target |
|--------|---------------|--------|
| Cold load JS transferred | TBD | ≤ baseline (code-split) |
| Time to interactive | TBD | ≤ baseline |
| Import 50k-feature GeoJSON | TBD | ≤ baseline (still chunked) |
| Workflow run (example) | TBD | ≤ baseline |
| Map pan FPS, 5 layers | TBD | ≥ baseline |
| Pipeline editor pan, 50 nodes | TBD (SVG) | ≥ baseline (React Flow) |

Rule: a milestone may not regress any row without sign-off.

---

## 7. Testing strategy

- **Pure logic:** Vitest before & after every move (import, export, transforms,
  gis-tools, workflow-engine, node specs, coordinates). Must stay green each PR.
- **Node specs (M3):** unit-test each node's `execute`/`validate` independent of UI.
- **Build verification:** every PR runs `npm run build` + `npm run preview`; broken
  builds block merge (part of the Definition of Done).
- **Visual parity:** every PR compares the migrated UI side-by-side with the M0
  reference screenshots at the fixed desktop viewport. Same CSS, same DOM, same look.
  (Optional later: automated screenshot diffing via Playwright once the shell settles.)
- **Map / dual-screen / draw / PWA:** manual checklist (browser via
  `npm run dev` / `preview`). Record results in `HANDOFF.md` per PR.
- **Mobile:** out of scope as a dedicated UI; only check the app stays usable/
  responsive at small widths. No mobile-pixel parity required.

---

## 8. Decisions (CONFIRMED 2026-06-04)

1. **TypeScript:** allowed via `.tsx`, incremental (JS still fine). ✅
2. **State lib:** Zustand. ✅
3. **React Flow:** core `@xyflow/react` (MIT) only; no Pro. ✅
4. **Map window:** keep `map-window.html` as a light separate entry until M10. ✅
5. **Order:** ship **M3 (React Flow pipeline editor) first** after M0–M2. ✅

---

## 8b. Hosting & deployment

**Front-end only.** No server, no API, no SSR — pure static output.

- **Now (testing):** GitHub Pages, served from the repo. App runs as plain ES
  modules (no build) today.
- **Final:** **Cloudflare Pages** (static hosting). Repo stays the source.

### Implications for the migration

- **Relative base path:** set Vite `base: './'`. This makes `dist/` work on both
  GitHub Pages (served under a repo subpath) and Cloudflare Pages (served at root)
  with no per-host config. Avoid absolute `/asset` URLs.
- **Build is static:** `npm run build` → `dist/`. Cloudflare Pages config →
  Build command: `npm run build`, Output dir: `dist`, Framework: Vite/None.
- **During islands phase (M1–M10):** keep deploying the existing no-build app
  (GitHub Pages) exactly as today; the Vite bundle is loaded from the same
  `index.html`, so GitHub Pages keeps working. No host change needed until M11.
- **At M11 flip:** point the host at `dist/`. For GitHub Pages, publish the built
  `dist/` (e.g. Actions build → Pages, or `gh-pages` branch). For Cloudflare Pages,
  the build command above handles it automatically on push.
- **SPA routing:** app is a single page (no client router today). If a router is
  added later, add a Cloudflare Pages SPA fallback (`/* /index.html 200` via
  `_redirects` in `public/`) and the GitHub Pages 404 fallback. Not needed now.
- **PWA (M12):** `vite-plugin-pwa` emits the SW into `dist/`; ensure SW scope works
  under a relative base on both hosts. Verify update flow on the real Cloudflare URL.
- **Headers/caching (optional, Cloudflare):** a `public/_headers` file can set
  long cache for hashed assets and no-cache for `index.html`/SW. Add in M12.
- **No secrets in the bundle:** front-end only; never embed keys. Public ArcGIS/
  tile endpoints only, as today.

## 9. For the next agent

- Read this file + `HANDOFF.md` + `AGENTS.md` first.
- Do exactly one milestone per branch/PR. Keep `main` shippable.
- Update §6 metrics and this checklist as milestones land.
- Reuse logic; only rewrite UI. When in doubt, add a feature flag and keep the old
  path until parity is proven.
