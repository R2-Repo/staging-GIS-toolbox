import { describe, expect, it, beforeEach } from 'vitest';
import { WorkflowEngine } from '../js/workflow/workflow-engine.js';
import { addPaletteNodeAt } from '../js/workflow/workflow-node-placement.js';
import { registerWorkflowScreenToFlow } from '../js/workflow/workflow-canvas-bridge.js';
import { bus } from '../js/core/event-bus.js';

describe('workflow node placement', () => {
    let engine;

    beforeEach(() => {
        engine = new WorkflowEngine();
        registerWorkflowScreenToFlow(null);
    });

    it('adds a palette node with snapped canvas-relative coordinates', () => {
        const canvasEl = {
            getBoundingClientRect: () => ({ left: 300, top: 100, width: 800, height: 600 })
        };

        const node = addPaletteNodeAt(engine, canvasEl, 'layer-input', {
            clientX: 412,
            clientY: 256
        });

        expect(node).toBeTruthy();
        expect(engine.nodes.size).toBe(1);
        expect(node.position).toEqual({ x: 120, y: 160 });
    });

    it('uses the React Flow screen-to-flow bridge when registered', () => {
        registerWorkflowScreenToFlow(({ x, y }) => ({ x: x + 50, y: y - 25 }));

        const node = addPaletteNodeAt(engine, null, 'layer-input', {
            clientX: 400,
            clientY: 300
        });

        expect(node.position).toEqual({ x: 460, y: 280 });
    });

    it('nudges colliding nodes instead of stacking', () => {
        const canvasEl = {
            getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 800 })
        };

        addPaletteNodeAt(engine, canvasEl, 'layer-input', { clientX: 120, clientY: 120 });
        const second = addPaletteNodeAt(engine, canvasEl, 'file-import', { clientX: 120, clientY: 120 });

        expect(second.position).not.toEqual({ x: 120, y: 120 });
        expect(engine.nodes.size).toBe(2);
    });

    it('emits selection and engine-changed events', () => {
        const events = [];
        const offSelected = bus.on('workflow:node-selected', (payload) => events.push(['selected', payload]));
        const offChanged = bus.on('workflow:engine-changed', () => events.push(['changed']));

        const node = addPaletteNodeAt(engine, null, 'layer-input', { clientX: 0, clientY: 0 });

        expect(events).toContainEqual(['selected', { nodeId: node.id }]);
        expect(events).toContainEqual(['changed']);

        offSelected();
        offChanged();
    });
});
