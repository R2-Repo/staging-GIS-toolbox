import { describe, it, expect } from 'vitest';
import { NODE_INSPECTORS, getNodeInspector } from '../react/workflow/inspectors/index.js';
import { INPUT_NODES } from '../js/workflow/nodes/input-nodes.js';
import { OUTPUT_NODES } from '../js/workflow/nodes/output-nodes.js';
import { ENRICHMENT_NODES } from '../js/workflow/nodes/enrichment-nodes.js';
import { TRANSFORM_NODES } from '../js/workflow/nodes/transform-nodes.js';
import { SPATIAL_NODES } from '../js/workflow/nodes/spatial-nodes.js';

const ALL_NODE_TYPES = [
    ...INPUT_NODES,
    ...OUTPUT_NODES,
    ...ENRICHMENT_NODES,
    ...TRANSFORM_NODES,
    ...SPATIAL_NODES
].map((def) => def.type);

describe('workflow inspector registry', () => {
    it('has a React inspector for every registered node type', () => {
        for (const type of ALL_NODE_TYPES) {
            expect(getNodeInspector(type), `missing inspector for ${type}`).toBeTruthy();
            expect(typeof NODE_INSPECTORS[type]).toBe('function');
        }
    });

    it('covers exactly the known node types', () => {
        expect(Object.keys(NODE_INSPECTORS).sort()).toEqual([...ALL_NODE_TYPES].sort());
    });
});
