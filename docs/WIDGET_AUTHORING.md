# GIS Widget Authoring Guide

> Living doc for humans and AI agents building multi-step GIS widgets.
> Read this before adding or changing anything under **GIS Widgets** in the left panel.

---

## Widget vs GIS Tool vs Pipeline Node

| Need | Build as |
|------|----------|
| One input → one geospatial operation → new layer | **GIS Tool** (`js/tools/gis-tools.js` + `react/tools/`) |
| Multi-step wizard with map interaction, preview, bulk edits | **GIS Widget** (this guide) |
| Reusable step in the visual workflow graph | **Pipeline node** (`js/workflow/nodes/`) |

---

## Architecture (one folder per widget)

```
js/widgets/<widget-id>/
  engine.js       — pure logic (Vitest first)
  controller.js   — opens modal, wires map/layer callbacks

react/widgets/
  <Widget>Dialog.jsx
  mount<Widget>Dialog.jsx
  shared/         — LayerSelect, FieldSelect, WidgetStepWizard, RunPreviewFooter

js/widgets/registry.js   — SINGLE registration point
```

Shared infrastructure:

- `js/widgets/registry.js` — panel buttons, mobile menu, `APP_ACTIONS`
- `js/widgets/widget-context.js` — `getSpatialLayerOptions()`, `createWidgetContext()`
- `js/widgets/map-draw-helpers.js` — `createAreaDrawHandlers()` for area draw workflows
- `js/ui/open-react-island.js` — modal + dynamic React mount boilerplate

**Do not** add widget handlers inline in `app.js`. Controllers receive `WidgetContext` from `getWidgetContext()`.

---

## Five-phase pipeline

| Phase | Output | Gate |
|-------|--------|------|
| 0. Spec | Inputs, steps, map interactions, output layer | Widget vs Tool decision |
| 1. Engine | `engine.js` + `tests/<widget>-engine.test.js` | `npm test` green |
| 2. Dialog | `react/widgets/<Widget>Dialog.jsx` using shared primitives | Renders via `mountIsland` |
| 3. Controller | `controller.js` wires context → props | Opens from registry |
| 4. Register | Entry in `GIS_WIDGETS` array | Panel + mobile + action work |
| 5. Smoke | Browser checklist | Full workflow end-to-end |

---

## Adding a new widget (checklist)

### 1. Scaffold (optional)

```bash
npm run new:widget -- --id my-widget --steps 3
```

### 2. Engine (`js/widgets/my-widget/engine.js`)

- Export pure functions: validation, run, constants
- No DOM, no `mapService`, no `app.js` imports
- Add `tests/my-widget-engine.test.js`

### 3. React dialog (`react/widgets/MyWidgetDialog.jsx`)

- Form state + step UI only
- Side effects via callback props (`onRun`, `onCancel`, `onDrawArea`, …)
- Reuse `react/widgets/shared/` components where possible

### 4. Mount helper (`react/widgets/mountMyWidgetDialog.jsx`)

```jsx
import { mountIsland } from '../mountIsland.jsx';
import { MyWidgetDialog } from './MyWidgetDialog.jsx';

export function mountMyWidgetDialog(element, props = {}) {
    return { unmount: mountIsland(element, MyWidgetDialog, props) };
}
```

### 5. Controller (`js/widgets/my-widget/controller.js`)

```js
import { openReactIsland } from '../../ui/open-react-island.js';
import { getSpatialLayerOptions } from '../widget-context.js';

export async function openMyWidget(ctx) {
    if (!ctx.isReactToolDialogs) return; // new widgets: React-only

    await openReactIsland({
        title: 'My Widget',
        width: '560px',
        mountPath: '../../../react/widgets/mountMyWidgetDialog.jsx',
        mountExport: 'mountMyWidgetDialog',
        getProps: (close) => ({
            layers: getSpatialLayerOptions(ctx, { includeFields: true }),
            onCancel: close,
            onRun: async (input) => { /* use ctx.mapService, ctx.getLayers, etc. */ }
        })
    });
}
```

### 6. Registry entry (`js/widgets/registry.js`)

```js
import { openMyWidget } from './my-widget/controller.js';

// Add to GIS_WIDGETS array:
{
    type: 'my-widget',
    action: 'openMyWidget',
    label: 'My Widget',
    icon: '⚙️',
    mobileLabel: '⚙️ My Widget',
    tip: 'Short description for the panel tooltip.',
    open: openMyWidget
}
```

That's it — panel, mobile flyout, and `APP_ACTIONS` update automatically.

### 7. Re-export shim (optional, for old import paths)

If anything still imports from `react/tools/`, add:

```js
export { mountMyWidgetDialog } from '../widgets/mountMyWidgetDialog.jsx';
```

---

## WidgetContext (available in controllers)

Defined in `js/widgets/widget-types.js`:

- `getLayers()`, `getLayerById(id)`
- `mapService`, `addLayer`, `createSpatialDataset`
- `refreshUI`, `showToast`
- `setActiveLayer`, `updateSelectionUI` (selection workflows)
- `analyzeSchema` (schema refresh after attribute writes)
- `isReactToolDialogs`, `turf`

---

## Existing widgets

| Widget | Folder | Engine tests |
|--------|--------|--------------|
| Find Features in Area | `spatial-analyzer/` | `spatial-analyzer-engine.test.js` |
| Bulk Update | `bulk-update/` | `bulk-update-engine.test.js` |
| Proximity Join | `proximity-join/` | `proximity-join-engine.test.js` |

---

## Smoke checklist (browser)

1. Open widget from left panel **GIS Widgets** section
2. Open same widget from mobile flyout
3. Complete full workflow (all steps)
4. Verify map interactions (draw, select, preview temp features)
5. Verify output layer / attribute changes
6. Cancel mid-flow — no stuck draw mode; map selection is always-on when idle (use `mapService.getSelectedIndices`, not local selection state)
7. `npm test` still green

---

## What not to do

- Do not add widget logic inline in `app.js`
- Do not skip engine tests and go straight to UI
- Do not build a plugin framework — one registry entry + one folder is enough
- Do not require legacy `WidgetBase` for new widgets (React-only)
