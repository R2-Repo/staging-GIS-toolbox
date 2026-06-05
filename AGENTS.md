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
| `react/` | React islands (panels, map, tool dialogs, workflow editor) |
| `manifest.json`, `vite.config.js` | PWA manifest and `vite-plugin-pwa` service worker config |
| `tests/` | Vitest specs (`*.test.js`) |
| `scripts/preview-smoke.mjs` | Playwright smoke checks against `npm run preview` |
| [HANDOFF.md](HANDOFF.md) | Session handoff for the next agent |

## Agent workflow

- Cursor rules: [.cursor/rules/agent-workflow.mdc](.cursor/rules/agent-workflow.mdc) (test-first, concise replies, update `HANDOFF.md`).
- End substantive work with an updated **HANDOFF.md**.

## Conventions

- Prefer **small, focused changes**; match existing patterns in nearby files (imports, naming, error handling via `handleError` / toasts).
- Use **ES modules** (`import`/`export`); keep paths explicit (e.g. `./core/logger.js`).
- The **shipped site** is built with **Vite** (`npm run build` → `dist/`). React islands mount alongside legacy `js/` modules; feature flags keep rollback paths. Dev-only: Vitest + Playwright smoke script.
- Avoid committing **secrets** (API keys, tokens). Use environment-specific config or user-supplied values, not hardcoded credentials.
- Remove stray **`.bak`** files rather than committing them.

## How to run locally

From the repo root:

```bash
npm install
npm run dev      # Vite dev server (HMR)
npm run build    # production bundle → dist/
npm run preview  # serve dist/ (default port 4173)
npm test
npm run smoke:preview   # Playwright checks (preview must be running)
```

Supplement with browser checks after substantive map/UI changes (Vitest runs in Node; it does not replace manual map verification).

## Cursor Cloud Agents

- **Environment**: `.cursor/environment.json` defines the Vite build + preview command and forwarded preview port for smoke checks in the cloud VM.
- **Persistent guidance**: project rules live under `.cursor/rules/`; this file (`AGENTS.md`) is the human-oriented overview. Keep both aligned when workflows change.
- **GitHub / secrets**: connect the repo and manage Cloud Agent secrets in the [Cursor Cloud Agents dashboard](https://cursor.com/dashboard/cloud-agents); do not put credentials in tracked files.
- **Branches / PRs**: use normal feature branches off `main`, commit in logical chunks, push, and open PRs for review (match your team’s naming conventions).

When cloud-specific steps grow (deploy URLs, staging accounts), add them **here** under this section so agents and humans stay in sync.

### Cursor Cloud specific instructions

- **Build before preview** — the app is no longer served as raw repo files. Cloud preview uses Vite: `npm run build && npm run preview -- --host 0.0.0.0 --port 4173 --strictPort` (see [`.cursor/environment.json`](.cursor/environment.json)). For day-to-day edits, `npm run dev` is fine locally; cloud smoke tests target the **built** `dist/` output on port **4173**.
- **Automated gate**: `npm test` (Vitest, **120+** tests). No ESLint/npm lint script. Optional E2E: `npm run smoke:preview` against a running preview (needs `npx playwright install chromium` once per VM).
- **React refactor**: UI is migrating incrementally under `react/` with feature flags (`*-feature-flags.js`). Default paths remain legacy unless a flag is enabled — see [docs/REACT_REFACTOR_PLAN.md](docs/REACT_REFACTOR_PLAN.md) and [HANDOFF.md](HANDOFF.md).
- **Outbound HTTPS** still required for map tiles, glyphs, and CDN assets at runtime.
- **Long-lived preview**: use a tmux session (e.g. `vite-preview`) so the server survives across agent turns.
