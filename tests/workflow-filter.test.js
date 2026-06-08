import { describe, it, expect } from 'vitest';
import { FilterRowsNode, normalizeFilterOperator } from '../js/workflow/nodes/transform-nodes.js';

function makeSpatialData(features) {
    return {
        type: 'spatial',
        geojson: { type: 'FeatureCollection', features },
        schema: { fields: [{ name: 'elevation_ft', type: 'number' }], featureCount: features.length }
    };
}

describe('FilterRowsNode operators', () => {
    it('normalizes camelCase operator aliases', () => {
        expect(normalizeFilterOperator('greaterThan')).toBe('greater_than');
        expect(normalizeFilterOperator('lessThan')).toBe('less_than');
        expect(normalizeFilterOperator('greater_than')).toBe('greater_than');
    });

    it('filters rows with greater_than', async () => {
        const node = new FilterRowsNode();
        node.config = {
            rules: [{ field: 'elevation_ft', operator: 'greater_than', value: '7000' }],
            logic: 'AND'
        };
        const data = makeSpatialData([
            { type: 'Feature', geometry: null, properties: { elevation_ft: 7200 } },
            { type: 'Feature', geometry: null, properties: { elevation_ft: 5400 } },
            { type: 'Feature', geometry: null, properties: { elevation_ft: 9500 } }
        ]);
        const result = await node.execute([data], {});
        expect(result.geojson.features).toHaveLength(2);
        expect(result.geojson.features.every((f) => f.properties.elevation_ft > 7000)).toBe(true);
    });

    it('accepts legacy greaterThan alias in rules', async () => {
        const node = new FilterRowsNode();
        node.config = {
            rules: [{ field: 'elevation_ft', operator: 'greaterThan', value: '7000' }],
            logic: 'AND'
        };
        const data = makeSpatialData([
            { type: 'Feature', geometry: null, properties: { elevation_ft: 7200 } },
            { type: 'Feature', geometry: null, properties: { elevation_ft: 5400 } }
        ]);
        const result = await node.execute([data], {});
        expect(result.geojson.features).toHaveLength(1);
    });

    it('passes all rows for unknown operators (legacy behavior)', async () => {
        const node = new FilterRowsNode();
        node.config = {
            rules: [{ field: 'elevation_ft', operator: 'totally_invalid', value: '7000' }],
            logic: 'AND'
        };
        const data = makeSpatialData([
            { type: 'Feature', geometry: null, properties: { elevation_ft: 100 } },
            { type: 'Feature', geometry: null, properties: { elevation_ft: 9000 } }
        ]);
        const result = await node.execute([data], {});
        expect(result.geojson.features).toHaveLength(2);
    });
});
