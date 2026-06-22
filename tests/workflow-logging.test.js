import { describe, it, expect, beforeEach } from 'vitest';
import { WorkflowEngine } from '../js/workflow/workflow-engine.js';
import { findNodeDef } from '../js/workflow/node-catalog.js';
import { logger } from '../js/core/logger.js';

function addNode(engine, type, config = {}) {
    const def = findNodeDef(type);
    const node = def.create();
    Object.assign(node.config, config);
    engine.addNode(node);
    return node;
}

describe('workflow engine logging', () => {
    beforeEach(() => {
        logger.clear();
    });

    it('logs pipeline start, node completion, and pipeline end', async () => {
        const engine = new WorkflowEngine();
        const layer = {
            id: 'lyr-1',
            type: 'table',
            rows: [{ id: 1 }],
            schema: { fields: [{ name: 'id', type: 'number' }] },
            name: 'Test Layer'
        };
        const input = addNode(engine, 'layer-input', { layerId: 'lyr-1' });
        const preview = addNode(engine, 'preview');
        engine.addWire({ from: input.id, fromPort: 'out', to: preview.id, toPort: 'in' });

        await engine.run({ getLayers: () => [layer] });

        const entries = logger.getEntries();
        expect(entries.some((e) => e.action === 'Pipeline started')).toBe(true);
        expect(entries.some((e) => e.action === 'Pipeline run' && e.duration != null && e.context?.success === true)).toBe(true);
        expect(entries.some((e) => e.action.startsWith('Node:') && e.duration != null)).toBe(true);
    });

    it('logs node failure and pipeline failure', async () => {
        const engine = new WorkflowEngine();
        const filter = addNode(engine, 'filter-rows', { rules: [{ field: '', operator: 'equals', value: '' }] });
        const preview = addNode(engine, 'preview');
        engine.addWire({ from: filter.id, fromPort: 'out', to: preview.id, toPort: 'in' });

        await expect(engine.run({})).rejects.toThrow(/failed/i);

        expect(logger.getEntries().some((e) => e.level === 'ERROR' && e.action === 'Node failed')).toBe(true);
        expect(logger.getEntries().some((e) => e.level === 'ERROR' && e.action === 'Pipeline failed')).toBe(true);
    });
});
