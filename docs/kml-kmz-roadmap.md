# KML / KMZ roadmap

Single source of truth for planned work. Any agent or session can implement from this file without relying on prior chat history.

## Goals

- **Reliable display** — Valid GeoJSON from KML/KMZ should render (multi-part lines/polygons, geometry collections).
- **Honest export** — Chosen format (KML vs KMZ) and multi-layer behavior match user expectations.
- **Better real-world KMZ** — Resolve or preserve in-archive assets where feasible.
- **Clear limits** — NetworkLink and remote fetches are **best effort** with explicit UX (CORS, snapshots, caps).

---

## Phase A — Critical / high impact (first)

### A1. Map: `MultiLineString` and `MultiPolygon`

**Issue:** Line layers filter `$type === 'LineString'` only; polygon layers use `Polygon` only; `hasLines` / `hasPolygons` still add layers, so multi-part features never match.

**Options:** (1) Extend MapLibre filters to include `MultiLineString` / `MultiPolygon`. (2) Optionally normalize on import: explode to simple geometries.

**Acceptance:** KMZ with KML MultiGeometry → GeoJSON multi-part lines displays without pre-processing in Google Earth.

### A2. Map: `GeometryCollection`

**Issue:** No map layers for `GeometryCollection`; `splitByGeometryType` mis-buckets unknown types into polygon in mixed scenarios.

**Options:** Explode GC to child parts before render/split, or dedicated GC handling with clear errors—never silent empty map.

### A3. Multi-layer export: KML vs KMZ

**Issue:** Multi-layer path always calls `exportMultiLayerKMZFile` (`.kmz`) even when user chose KML.

**Fix:** Branch on format: multi-layer → `exportMultiLayerKML` + `.kml` download vs KMZ path; align toasts and filenames.

---

## Phase B — Import fidelity (KMZ / KML)

### B1. KMZ: resolve in-archive assets

**Issue:** Only main KML text is read; relative `href`s (icons, images, overlays, HTML) break.

**Approach (incremental):** Path map inside zip → blob/object URLs; rewrite common refs. v1: placemark icons + images; defer GroundOverlay / heavy HTML.

### B2. Zero-feature KML

**Issue:** Hard error when no placemarks; blocks container / NetworkLink-only roots.

**Approach:** Soft path: empty layer + warning, or guided next step to NetworkLink resolve (Phase E).

### B3. `.xml` routing

**Issue:** All `.xml` sent to KML parser → misleading errors.

**Fix:** Sniff root / namespace for KML before parse; otherwise clear “not KML” message.

### B4. Main KML inside KMZ

**Issue:** `doc.kml` match is naive (exact name, root-only).

**Fix:** Prefer root `doc.kml`; else heuristics (shortest path, largest `.kml`); log chosen entry.

---

## Phase C — Style and metadata

### C1. `_kmlStyle` is coarse

**Staged:** Preserve per-feature style props when present; longer-term parse `Style` / `StyleMap` / icons.

### C2. Workflow cache omits `_kmlStyle`

**Fix:** Carry style hint in workflow spatial cache for KML/KMZ sources so map styling matches direct import.

---

## Phase D — Export robustness

### D1. `geometryToKML` unknown types

Emit MultiGeometry / multiple placemarks from GC, or skip with logged count + optional UI warning.

### D2. `_hexToKmlColor`

Validate / expand 3-digit hex; safe fallback.

### D3. KMZ attachment URL replacement

Avoid blind `replaceAll` on full document; tokenize or scope to CDATA `src`.

### D4. Missing JSZip in exporter

Use `AppError` for consistency with importers.

---

## Phase E — NetworkLink workflow

**Intent:** Optionally flatten NetworkLink KML into a **static** snapshot (layer in app and/or downloadable `.kml` / `.kmz`).

### E1. Detection

Scan parsed XML for `<NetworkLink>` / `<Link><href>` before or alongside `toGeoJSON`. If zero features but links exist, surface **Resolve network links** entry point.

### E2. UX (best effort, no guarantee)

- **Modal** (not toast-only): snapshot only; CORS/auth may block fetches; size/time/recursion limits; optional confirm checkbox.
- **Progress:** Task runner per link (“Fetching 2/5…”).
- **Outcomes:** Success toast; partial failure lists failed `href`s + reason; total failure points to manual download / “Save as KMZ in Google Earth.”

### E3. Technical

- `fetch` with timeout, max size, redirect cap, HTTPS preference.
- Merge fetched KML into one document or one GeoJSON FC; optional `_networkLinkHref` on features.
- Recursion: max depth + visited-URL cycle guard.
- KMZ-relative `href` before absolute URL.

### E4. Browser reality (must be user-visible)

CORS will block many public URLs from a static site—modal copy states this; **server proxy (E5c)** is optional future tier.

### E5. Delivery tiers

| Tier | Scope |
|------|--------|
| E5a | Detect + explain + workarounds (no fetch). |
| E5b | Client fetch when CORS allows; merge; import or export static file. |
| E5c | Optional backend proxy for reliable fetch. |

### E6. Dependencies

Ties to **B2** (empty import). Complements **B1** when links point inside same KMZ.

---

## Phase F — UX / quality

### F1. Multi-layer picker copy

Align with real behavior after **A3**.

### F2. Description tables / object props

Safe stringify or “(object)” instead of `[object Object]`.

### F3. Regression assets

Fixture KML/KMZ files + manual checklist (or future scripted checks) for import/export and geometry types.

---

## Phase G — Optional / larger scope

- Altitude modes, `gx:` extensions, newer KML—document limits; upgrade parser only if needed.
- CRS / Z: document WGS84; optional preserve Z in export coordinates.
- Global “normalize multi-part on import” toggle.

---

## Milestones (suggested)

| ID | Scope | User-visible win |
|----|--------|------------------|
| M1 | A1, A2, D1 minimal | Earth-style KMZ lines/areas show on map |
| M2 | A3, F1 | Export format matches choice |
| M3 | B2, E1–E2, E5a/b | NetworkLink path with honest UX |
| M4 | B1 v1, B4 | Richer KMZ symbology |
| M5 | C, D2–D4, F2 | Polish |
| M6 | F3, G | Hardening / spec depth |

---

## How to run implementation (agents / chats)

1. **Use this file as SSOT** — Do not depend on long chat transcripts; link or read `docs/kml-kmz-roadmap.md`.
2. **One milestone per PR or session** — e.g. M1 only: `map-manager.js`, `data-model.js`, small fixtures.
3. **New chat/agent is fine** — Fresh context + this doc often beats one endless thread; context limits matter less when each session has a narrow scope from the milestone table.

Starting the **build** here is fine for M1 if you say “implement M1”; starting a **new agent** with “read `docs/kml-kmz-roadmap.md` and implement M1” is equally good and may be clearer for long work.
