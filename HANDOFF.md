# Agent handoff

Keep this file current so the next session can continue without re-discovery.

## Latest

- **Date**: 2026-05-19
- **Goal**: **Dual Screen Mode** — plan + Phase 0–1 foundation
- **Branch**: `cursor/dual-screen-mode-ccf7`
- **Plan (source of truth)**: [docs/DUAL_SCREEN_MODE.md](docs/DUAL_SCREEN_MODE.md)
- **Summary**:
  - Added full product/engineering plan in `docs/DUAL_SCREEN_MODE.md` (phases 0–4, protocol, risks, checklist).
  - **Phase 0**: `js/dual-screen/protocol.js`, `channel.js`; `map-window.html`, `css/map-window.css`, `js/map-window.js`; `tests/dual-screen-protocol.test.js`.
  - **Phase 1 (partial)**: `coordinator.js`, `map-facade.js`, `mapManager.destroy()`, `#btn-dual-screen`, layout CSS, primary hooks in `app.js`.
  - **Not done yet**: Phase 1 exit criteria (full layer sync QA), Phase 2 draw/fence/popup/drop, Phase 3 workflow top bar button.

## Verification

- **Vitest**: run `npm test` (includes `tests/dual-screen-protocol.test.js`).
- **Browser**: Desktop — Import → Dual Screen → layer on external map; close map window → map restores in center. Popup blocker shows toast if blocked.

## Known issues / risks

- `layers:changed` + `LAYER_ADD` may double-sync (snapshot); acceptable for now, optimize later.
- `toggleLayer` in dual mode sends full snapshot (visibility in state vs map).
- Draw/fence/context menu/file drop not wired (Phase 2).
- Workflow dual button not added (Phase 3).

## Next

1. Finish **Phase 1** per checklist in `docs/DUAL_SCREEN_MODE.md`.
2. **Phase 2**: draw/fence on secondary, popups, `POPUP_ACTION`, file drop.
3. **Phase 3**: `#btn-dual-screen` (or equivalent) on `wf-topbar`.

**New agent prompt** (after merge): see bottom of `docs/DUAL_SCREEN_MODE.md`.

---

_Archive older bullets when stale (optional):_

- 2026-05-19: Performance Phases 1–2 on `main` — see PR #10 / git history.
