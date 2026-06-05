# Agent instructions — GIS Toolbox

This repository is **GIS-Toolbox.com**: a client-side GIS and data-prep web app (MapLibre, import/export, workflow editor, ArcGIS REST helpers). The app now ships through the **Vite build/preview pipeline** (`npm run build`, `npm run preview`), with React islands integrated into the main shell.

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
| `manifest.json`, `vite.config.js` | PWA manifest and `vite-plugin-pwa` service worker config |
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
npm install   # once, for Vitest
npm run dev   # Vite dev server
npm run build
npm run preview
npm test
```

Supplement with browser checks after substantive map/UI changes (Vitest runs in Node; it does not replace manual map verification).

## Cursor Cloud Agents

- **Environment**: `.cursor/environment.json` defines the Vite build + preview command and forwarded preview port for smoke checks in the cloud VM.
- **Persistent guidance**: project rules live under `.cursor/rules/`; this file (`AGENTS.md`) is the human-oriented overview. Keep both aligned when workflows change.
- **GitHub / secrets**: connect the repo and manage Cloud Agent secrets in the [Cursor Cloud Agents dashboard](https://cursor.com/dashboard/cloud-agents); do not put credentials in tracked files.
- **Branches / PRs**: use normal feature branches off `main`, commit in logical chunks, push, and open PRs for review (match your team’s naming conventions).

When cloud-specific steps grow (deploy URLs, staging accounts), add them **here** under this section so agents and humans stay in sync.
