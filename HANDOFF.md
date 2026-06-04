# Agent handoff

Keep this file current so the next session can continue without re-discovery.

## Latest

- **Date**: 2026-06-04
- **Goal**: **Dual Screen false “pop-ups blocked”** — `noopener` on `window.open` returned `null` while the map window still opened; activation never ran.
- **Branch**: `cursor/dual-screen-popup-false-positive-94b0` (PR draft)
- **Fix**: `js/dual-screen/window-open.js` — `MAP_WINDOW_OPEN_FEATURES = 'noreferrer'` only; `isSecondaryMapWindowOpen()`.

## Previous (Phase 4)

- **Date**: 2026-06-04
- **Goal**: **Dual Screen Mode — Phase 4 polish** (popup blocked UX, BYE teardown, sessionStorage hint, regression checklist)
- **Branch**: merged via PR #13 on `main`
- **Plan (source of truth)**: [docs/DUAL_SCREEN_MODE.md](docs/DUAL_SCREEN_MODE.md)
- **Summary**:
  - **Popup blocked**: `POPUP_BLOCKED_MESSAGE` toast (8s); `activate()` rejects null/closed `window.open` without touching map state.
  - **BYE / teardown**: Secondary `sendBye()` once on exit, `beforeunload`, and non-bfcache `pagehide`; primary `deactivate({ fromSecondaryBye })` skips echo BYE/close; re-entrant guard `_deactivating`.
  - **sessionStorage hint**: `js/dual-screen/storage-hint.js` — `dualScreenActive` set on activate, cleared on deactivate; one-shot reload reminder toast (no auto-open).
  - **Regression**: Phase 4 checklist + manual regression items marked in plan doc; Vitest + static server smoke.
  - **Tests**: `tests/dual-screen-protocol.test.js` (+3 cases, **54** total tests).

## Verification

- **Vitest**: `npm test` — green (54 tests).
- **Browser (manual)**:
  - Block pop-ups → Dual Screen → error toast on primary; map stays in center panel.
  - Dual on → close map window → primary restores map; hint cleared.
  - Dual on → reload primary → info toast reminder; click Dual Screen to reopen (no auto popup).
  - Phases 1–3 flows unchanged (import, draw, fence, workflow Add to map).

## Known issues / risks

- `layers:changed` still sends full snapshot (acceptable v1).
- BroadcastChannel `BYE` on `beforeunload` may be dropped in edge cases; `closed` poll + `pagehide` mitigate.

## Next

1. Merge Phase 4 PR; optional: incremental layer sync (avoid double snapshot on add + `layers:changed`).
2. Full interactive dual-screen QA on two monitors if available.

**New agent prompt**: see bottom of `docs/DUAL_SCREEN_MODE.md`.

---

_Archive older bullets when stale (optional):_

- 2026-06-04: Phase 1–3 on `main` via PR #12 (`cursor/dual-screen-phase-1-2-3-99de`).
- 2026-05-19: Phase 0–1 foundation merged (#11); branch `cursor/dual-screen-mode-ccf7`.
- 2026-05-19: Performance Phases 1–2 on `main` — PR #10.
