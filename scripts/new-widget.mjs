#!/usr/bin/env node
/**
 * Scaffold a new GIS widget folder structure.
 * Usage: npm run new:widget -- --id my-widget --steps 3
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function parseArgs(argv) {
    const args = { id: '', steps: 3 };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--id' && argv[i + 1]) args.id = argv[++i];
        if (argv[i] === '--steps' && argv[i + 1]) args.steps = Number(argv[++i]) || 3;
    }
    return args;
}

function toPascalCase(id) {
    return id.split(/[-_]/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
}

function toActionName(id) {
    return `open${toPascalCase(id)}`;
}

const { id, steps } = parseArgs(process.argv.slice(2));
if (!id) {
    console.error('Usage: npm run new:widget -- --id my-widget [--steps 3]');
    process.exit(1);
}

const pascal = toPascalCase(id);
const action = toActionName(id);
const widgetDir = join(root, 'js', 'widgets', id);
const reactDir = join(root, 'react', 'widgets');

if (existsSync(widgetDir)) {
    console.error(`Widget folder already exists: ${widgetDir}`);
    process.exit(1);
}

mkdirSync(widgetDir, { recursive: true });

writeFileSync(join(widgetDir, 'engine.js'), `/**
 * Pure logic for ${id} widget.
 */

export function validate${pascal}Config(config = {}) {
    const errors = [];
    // TODO: validate config
    return { valid: errors.length === 0, errors };
}

export async function run${pascal}(config = {}) {
    const validation = validate${pascal}Config(config);
    if (!validation.valid) {
        throw new Error(validation.errors[0] || 'Invalid configuration.');
    }
    // TODO: implement run logic
    return { ok: true };
}
`);

writeFileSync(join(widgetDir, 'controller.js'), `import { openReactIsland } from '../../ui/open-react-island.js';
import { getSpatialLayerOptions } from '../widget-context.js';
import { run${pascal} } from './engine.js';

export async function ${action}(ctx) {
    await openReactIsland({
        title: '${pascal}',
        width: '560px',
        mountPath: '../../../react/widgets/mount${pascal}Dialog.jsx',
        mountExport: 'mount${pascal}Dialog',
        getProps: (close) => ({
            layers: getSpatialLayerOptions(ctx),
            onCancel: close,
            onRun: async (config) => run${pascal}(config)
        })
    });
}
`);

writeFileSync(join(reactDir, `${pascal}Dialog.jsx`), `import { useState } from 'react';
import { LayerSelect } from './shared/LayerSelect.jsx';
import { WidgetStepWizard } from './shared/WidgetStepWizard.jsx';
import { RunPreviewFooter } from './shared/RunPreviewFooter.jsx';

const STEPS = [${Array.from({ length: steps }, (_, i) => `'Step ${i + 1}'`).join(', ')}];

export function ${pascal}Dialog({ layers = [], onCancel, onRun }) {
    const [step, setStep] = useState(1);
    const [layerId, setLayerId] = useState('');
    const [running, setRunning] = useState(false);
    const [error, setError] = useState('');

    const run = async () => {
        setError('');
        setRunning(true);
        try {
            await onRun?.({ layerId });
        } catch (err) {
            setError(err?.message || 'Run failed.');
        } finally {
            setRunning(false);
        }
    };

    return (
        <div>
            <WidgetStepWizard steps={STEPS} currentStep={step} />
            {error ? <div className="info-box text-xs mb-8" style={{ color: 'var(--danger)' }}>{error}</div> : null}
            {step === 1 ? (
                <LayerSelect label="Layer" value={layerId} layers={layers} onChange={setLayerId} />
            ) : (
                <div className="text-xs text-muted">TODO: step {step} UI</div>
            )}
            <RunPreviewFooter
                onCancel={onCancel}
                onRun={step < STEPS.length ? () => setStep((s) => s + 1) : run}
                runLabel={step < STEPS.length ? 'Next' : 'Run'}
                running={running}
                disabled={step === 1 && !layerId}
            />
        </div>
    );
}
`);

writeFileSync(join(reactDir, `mount${pascal}Dialog.jsx`), `import { mountIsland } from '../mountIsland.jsx';
import { ${pascal}Dialog } from './${pascal}Dialog.jsx';

export function mount${pascal}Dialog(element, props = {}) {
    if (!element) {
        throw new Error('mount${pascal}Dialog: target element is required');
    }
    const unmount = mountIsland(element, ${pascal}Dialog, props);
    return { unmount };
}
`);

writeFileSync(join(root, 'tests', `${id}-engine.test.js`), `import { describe, expect, it } from 'vitest';
import { validate${pascal}Config } from '../js/widgets/${id}/engine.js';

describe('validate${pascal}Config', () => {
    it('returns valid for empty config (update when rules exist)', () => {
        expect(validate${pascal}Config({}).valid).toBe(true);
    });
});
`);

console.log(`Created widget scaffold: ${id}`);
console.log('');
console.log('Next steps:');
console.log(`  1. Implement js/widgets/${id}/engine.js`);
console.log(`  2. Finish react/widgets/${pascal}Dialog.jsx`);
console.log(`  3. Add registry entry in js/widgets/registry.js:`);
console.log(`     { type: '${id}', action: '${action}', label: '...', icon: '⚙️', tip: '...', open: ${action} }`);
console.log(`  4. npm test`);
