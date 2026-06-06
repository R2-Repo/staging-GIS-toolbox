import { describe, expect, it } from 'vitest';
import {
    applyBulkUpdateToLayer,
    coercePropertyValue,
    normalizeBulkUpdates,
    validateBulkUpdate
} from '../js/widgets/bulk-update-engine.js';

describe('normalizeBulkUpdates', () => {
    it('filters entries without a field name', () => {
        expect(normalizeBulkUpdates([
            { field: 'name', value: 'A' },
            { value: 'B' },
            { field: '', value: 'C' }
        ])).toEqual([{ field: 'name', value: 'A' }]);
    });
});

describe('coercePropertyValue', () => {
    it('coerces numeric strings to numbers', () => {
        expect(coercePropertyValue('42')).toBe(42);
        expect(coercePropertyValue('')).toBe('');
        expect(coercePropertyValue('hello')).toBe('hello');
    });
});

describe('validateBulkUpdate', () => {
    it('requires selected features and updates', () => {
        expect(validateBulkUpdate({ selectedIndices: [], updates: [{ field: 'a', value: '1' }] }).valid).toBe(false);
        expect(validateBulkUpdate({ selectedIndices: [0], updates: [] }).valid).toBe(false);
        expect(validateBulkUpdate({ selectedIndices: [0], updates: [{ field: 'a', value: '1' }] }).valid).toBe(true);
    });
});

describe('applyBulkUpdateToLayer', () => {
    it('updates selected feature properties in place', () => {
        const layer = {
            geojson: {
                features: [
                    { properties: { name: 'old', count: 1 } },
                    { properties: { name: 'keep' } }
                ]
            }
        };

        const result = applyBulkUpdateToLayer({
            layer,
            selectedIndices: [0],
            updates: [
                { field: 'name', value: 'new' },
                { field: 'count', value: '5' }
            ]
        });

        expect(result).toEqual({ updatedCount: 1, fieldCount: 2 });
        expect(layer.geojson.features[0].properties).toEqual({ name: 'new', count: 5 });
        expect(layer.geojson.features[1].properties.name).toBe('keep');
    });
});
