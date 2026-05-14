# Agent handoff

Keep this file current so the next session can continue without re-discovery.

## Latest

- **Date**: 2026-05-13
- **Goal**: Cursor agent rules + Vitest scaffold + handoff doc
- **Branch**: (local / unspecified)
- **Summary**: Added [.cursor/rules/agent-workflow.mdc](.cursor/rules/agent-workflow.mdc), [HANDOFF.md](HANDOFF.md), [package.json](package.json), [vitest.config.js](vitest.config.js), [tests/logger.test.js](tests/logger.test.js); updated [AGENTS.md](AGENTS.md), [gis-toolbox.mdc](.cursor/rules/gis-toolbox.mdc), [.cursor/environment.json](.cursor/environment.json).

## Verification

- `npm install && npm test` — expected green after install
- Browser — not required for this change set

## Known issues / risks

- Map/UI still need manual smoke tests; Vitest covers Node-testable modules first.

## Next

- Prefer extracting testable logic from `js/app.js` into `js/` modules as features grow.

---

_Archive older bullets here when stale (optional):_
