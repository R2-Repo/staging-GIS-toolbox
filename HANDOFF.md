# Agent handoff

Keep this file current so the next session can continue without re-discovery.

## Latest

- **Date**: 2026-06-04
- **Goal**: **Dual Screen Mode** — finish Phase 1, Phase 2 (draw/fence/popup/drop), Phase 3 workflow button
- **Branch**: `cursor/dual-screen-phase-1-2-3-99de`
- **Plan (source of truth)**: [docs/DUAL_SCREEN_MODE.md](docs/DUAL_SCREEN_MODE.md)
- **Summary**:
  - **Phase 1**: `LAYER_ORDER` on secondary; `MAP_CHROME` on primary; `refreshLayerData` + fence bbox on facade; viewport payloads include `bounds` for `getBounds()`.
  - **Phase 2**: `secondary-client.js`, `primary-handlers.js` — `DRAW_CMD`/`DRAW_EVENT`, fence, `POPUP_ACTION`, `FILE_DROP`, `CTX_CMD`, `TOAST`; draw/fence buttons forward when dual active; context menu + popups on map window.
  - **Phase 3**: `#wf-dual-screen` in workflow top bar (calls `window._toggleDualScreen`).
  - **Tests**: `tests/dual-screen-protocol.test.js` (+3 cases, 51 total tests).

## Verification

- **Vitest**: `npm test` — green (51 tests).
- **Browser (manual)**:
  - Desktop: Import → Dual Screen → layer on external map; pan/zoom; fit bounds / clip tools use secondary bounds.
  - Draw layer / fence on secondary; popup Edit opens modal on primary; drop file on map window imports on primary.
  - Workflow open → Dual Screen from top bar → Run → Add to map → layer on external map.
  - Exit dual → map restores in center. Mobile: no dual buttons.

## Known issues / risks

- `layers:changed` still sends full snapshot (acceptable v1).
- Draw/fence UI toasts on secondary are local; primary modals stay on primary.
- **Phase 4** not started: sessionStorage hint, full regression checklist.

## Next

1. **Phase 4** polish per [docs/DUAL_SCREEN_MODE.md](docs/DUAL_SCREEN_MODE.md).
2. Manual regression checklist in plan doc.
3. Optimize incremental layer sync (avoid double snapshot on add + `layers:changed`).

**New agent prompt**: see bottom of `docs/DUAL_SCREEN_MODE.md`.

---

_Archive older bullets when stale (optional):_

- 2026-05-19: Phase 0–1 foundation merged (#11); branch `cursor/dual-screen-mode-ccf7`.
- 2026-05-19: Performance Phases 1–2 on `main` — PR #10.
