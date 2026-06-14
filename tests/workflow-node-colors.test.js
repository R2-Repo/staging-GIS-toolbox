import { describe, it, expect } from 'vitest';
import { NODE_CATEGORIES } from '../js/workflow/node-catalog.js';

describe('workflow node canvas colors', () => {
    it('matches category palette color when instantiated', () => {
        for (const cat of NODE_CATEGORIES) {
            for (const def of cat.nodes) {
                const node = def.create();
                expect(node.color, `${def.type} should use ${cat.label} color`).toBe(cat.color);
            }
        }
    });
});
