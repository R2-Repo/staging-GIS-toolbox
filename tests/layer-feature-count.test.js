import { describe, expect, it } from 'vitest';
import { getLayerFeatureCount, isSpatialLayer } from '../js/core/data-model.js';

describe('getLayerFeatureCount', () => {
    it('uses schema.featureCount for workspace / spatial-chunked layers', () => {
        const layer = {
            type: 'spatial-chunked',
            storage: 'workspace',
            geojson: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: null, properties: {} }] },
            schema: { featureCount: 125000, fields: [], geometryType: 'Point' }
        };
        expect(isSpatialLayer(layer)).toBe(true);
        expect(getLayerFeatureCount(layer)).toBe(125000);
    });

    it('uses geojson length for in-memory spatial layers', () => {
        const layer = {
            type: 'spatial',
            geojson: {
                type: 'FeatureCollection',
                features: [
                    { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: {} },
                    { type: 'Feature', geometry: { type: 'Point', coordinates: [1, 1] }, properties: {} }
                ]
            },
            schema: { featureCount: 2, fields: [] }
        };
        expect(getLayerFeatureCount(layer)).toBe(2);
    });

    it('uses rows length for table layers', () => {
        const layer = {
            type: 'table',
            rows: [{ a: 1 }, { a: 2 }],
            schema: { fields: [] }
        };
        expect(getLayerFeatureCount(layer)).toBe(2);
    });
});
