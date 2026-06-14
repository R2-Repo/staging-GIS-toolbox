import { describe, it, expect } from 'vitest';
import { NODE_CATEGORIES } from '../js/workflow/node-catalog.js';
import { NODE_DESCRIPTIONS } from '../js/workflow/node-descriptions.js';

const ALL_NODE_DEFS = NODE_CATEGORIES.flatMap((cat) => cat.nodes);

describe('workflow node palette tooltips', () => {
    it('has a description for every registered node type', () => {
        for (const def of ALL_NODE_DEFS) {
            expect(def.description, `missing description for ${def.type}`).toBeTruthy();
            expect(def.description.length, `empty description for ${def.type}`).toBeGreaterThan(10);
        }
    });

    it('covers exactly the known node types in NODE_DESCRIPTIONS', () => {
        const types = ALL_NODE_DEFS.map((def) => def.type).sort();
        expect(Object.keys(NODE_DESCRIPTIONS).sort()).toEqual(types);
    });
});
