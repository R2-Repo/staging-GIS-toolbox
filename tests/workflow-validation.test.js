import { describe, it, expect } from 'vitest';
import { WorkflowEngine } from '../js/workflow/workflow-engine.js';
import { findNodeDef } from '../js/workflow/node-catalog.js';
import { collectInvalidNodes, validatePipelineBeforeRun } from '../js/workflow/workflow-validation.js';

function addNode(engine, type, config = {}) {
    const def = findNodeDef(type);
    const node = def.create();
    Object.assign(node.config, config);
    engine.addNode(node);
    return node;
}

describe('workflow validation', () => {
    it('collectInvalidNodes finds nodes failing validate()', () => {
        const engine = new WorkflowEngine();
        const filter = addNode(engine, 'filter-rows', { rules: [{ field: '', operator: 'equals', value: '' }] });
        const preview = addNode(engine, 'preview');
        engine.addWire({ from: filter.id, fromPort: 'out', to: preview.id, toPort: 'in' });

        const invalid = collectInvalidNodes(engine);
        expect(invalid).toHaveLength(1);
        expect(invalid[0].node.id).toBe(filter.id);
        expect(invalid[0].message).toMatch(/filter/i);
    });

    it('validatePipelineBeforeRun returns true when all nodes valid', () => {
        const engine = new WorkflowEngine();
        addNode(engine, 'preview');
        expect(validatePipelineBeforeRun(engine)).toBe(true);
    });

    it('validatePipelineBeforeRun returns false when any node invalid', () => {
        const engine = new WorkflowEngine();
        addNode(engine, 'filter-rows', { rules: [{ field: '', operator: 'equals', value: '' }] });
        expect(validatePipelineBeforeRun(engine)).toBe(false);
    });
});
