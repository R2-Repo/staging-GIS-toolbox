# Agent instructions — GIS Toolbox

This repository is **GIS-Toolbox.com**: a client-side GIS and data-prep web app (MapLibre, import/export, workflow editor, ArcGIS REST helpers). The **shipped app** has **no build step**: ES modules load from `index.html`. **Dev-only**: `package.json` exists for **Vitest** (`npm test`), not for bundling the site.

## Layout (quick map)

| Area | Role |
|------|------|
| `index.html` | Shell, script tags, UI chrome |
| `js/app.js` | Main wiring and event handlers |
| `js/core/` | State, session, events, errors, logging |
| `js/map/` | MapLibre map, draw tools |
| `js/import/`, `js/export/` | Format handlers |
| `js/dataprep/` | Transforms, templates, undo history |
| `js/workflow/` | Pipeline editor (canvas, nodes, store) |
| `js/arcgis/`, `js/agol/` | ArcGIS Online / REST integration |
| `css/` | `main.css`, `mobile.css`, `workflow.css` |
| `pipelines/` | Saved pipeline JSON + `index.json` |
| `manifest.json`, `sw.js` | PWA manifest and service worker |
| `tests/` | Vitest specs (`*.test.js`) |
| [HANDOFF.md](HANDOFF.md) | Session handoff for the next agent |

## Agent workflow

- Cursor rules: [.cursor/rules/agent-workflow.mdc](.cursor/rules/agent-workflow.mdc) (test-first, concise replies, update `HANDOFF.md`).
- End substantive work with an updated **HANDOFF.md**.

## Conventions

- Prefer **small, focused changes**; match existing patterns in nearby files (imports, naming, error handling via `handleError` / toasts).
- Use **ES modules** (`import`/`export`); keep paths explicit (e.g. `./core/logger.js`).
- **Do not** add a bundler or any Node-only requirement **for loading/running the shipped site** unless agreed; dev-only tooling (e.g. Vitest) is fine.
- Avoid committing **secrets** (API keys, tokens). Use environment-specific config or user-supplied values, not hardcoded credentials.
- Remove stray **`.bak`** files rather than committing them.

## How to run locally

From the repo root:

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080/` (browsers restrict some APIs on `file://`, so always use a local server).

```bash
npm install   # once, for Vitest
npm test
```

Supplement with browser checks after substantive map/UI changes (Vitest runs in Node; it does not replace manual map verification).

## Cursor Cloud Agents

- **Environment**: `.cursor/environment.json` defines a lightweight static server and forwarded port for smoke checks in the cloud VM.
- **Persistent guidance**: project rules live under `.cursor/rules/`; this file (`AGENTS.md`) is the human-oriented overview. Keep both aligned when workflows change.
- **GitHub / secrets**: connect the repo and manage Cloud Agent secrets in the [Cursor Cloud Agents dashboard](https://cursor.com/dashboard/cloud-agents); do not put credentials in tracked files.
- **Branches / PRs**: use normal feature branches off `main`, commit in logical chunks, push, and open PRs for review (match your team’s naming conventions).

When cloud-specific steps grow (deploy URLs, staging accounts), add them **here** under this section so agents and humans stay in sync.

### Cursor Cloud specific instructions

- **No app server or database** — the shipped app is static files only. Run a local HTTP server from the repo root; never open `file://` for smoke tests (ES modules and `fetch` to `./pipelines/` need HTTP).
- **Preview port**: Cloud VMs forward **4173** per [`.cursor/environment.json`](.cursor/environment.json). Bind `0.0.0.0` so the forwarded URL works: `python3 -m http.server 4173 --bind 0.0.0.0`. Local dev commonly uses **8080** instead (`python3 -m http.server 8080`).
- **Automated tests**: `npm install` then `npm test` (Vitest, Node). There is **no ESLint/npm lint script** in this repo — treat `npm test` as the automated quality gate.
- **Browser smoke**: Map tiles, CDN scripts (MapLibre, Turf, etc.), and optional ArcGIS/elevation calls need **outbound HTTPS**. If the map is blank, check network first.
- **Long-lived static server**: Use a tmux session (e.g. `gis-static-server`) so the preview keeps running across agent turns; see `.cursor/environment.json` `terminals` for the canonical command.
