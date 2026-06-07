# Agent handoff

## Latest

- **Date**: 2026-06-07
- **Status**: **Import OOM hardening (follow-up)**
- **Branch**: working tree (uncommitted)

### What changed (OOM follow-up)

Chrome **"Aw, Snap — Out of Memory"** kills the tab process; JS cannot catch it. Prior guard still allowed large files through (50–75 MB + "Continue anyway" confirm).

**New defenses:**
- [`js/import/import-memory-budget.js`](js/import/import-memory-budget.js) — format expansion factors, ~96 MB estimated-peak reject, Chrome heap headroom check
- **Stricter file caps** — text reject ≥15 MB; binary reject ≥30 MB; hard caps 25 MB / 40 MB
- **STRONG tier removed** — no confirm-to-proceed path that still crashes the tab
- **ZIP/KMZ** — uncompressed size check (80 MB max) before shapefile/KML parse
- **Map** — in-place feature tagging when `_geometryExploded` (avoids full feature copy)

### Verification

- `npm test` — 40 files, 176 tests green
- **Re-test in browser** (`npm run dev` or `npm run preview`): drag-drop the same file — should show **Import Failed — File Too Large** modal instead of tab crash

### If it still crashes

Note file **name, format, and size (MB)** — a small compressed ZIP or dense GeoJSON can expand past limits before checks run; we may need to tune factors further.

## Previous (2026-06-07)

**Import optimization & performance plan (Phase 1–2)** — guard module, schema sampling, CSV streaming, incremental map, ArcGIS/KMZ caps.

## Previous (2026-06-07)

**Session restore confirm dialog fix** — `restoreSessionIfAvailable()` before `showToolInfo()` in [`react/App.jsx`](react/App.jsx).
