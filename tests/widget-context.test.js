import { describe, expect, it } from 'vitest';
import { getSpatialLayerOptions } from '../js/widgets/widget-context.js';

describe('getSpatialLayerOptions', () => {
    it('maps spatial layers with optional fields and polygon flags', () => {
        const ctx = {
            getLayers: () => ([
                {
                    id: 'a',
                    name: 'Points',
                    type: 'spatial',
                    geojson: {
                        features: [
                            { geometry: { type: 'Point' }, properties: { name: 'x', extra: 1 } }
                        ]
                    }
                },
                {
                    id: 'b',
                    name: 'Polygons',
                    type: 'spatial',
                    geojson: {
                        features: [
                            { geometry: { type: 'Polygon' }, properties: { zone: 'A' } }
                        ]
                    }
                },
                { id: 't', name: 'Table', type: 'table', geojson: { features: [] } }
            ]),
            mapService: { getSelectionCount: () => 2 }
        };

        const options = getSpatialLayerOptions(ctx, {
            includeFields: true,
            requirePolygons: true,
            includeSelectionCount: true
        });

        expect(options).toHaveLength(2);
        expect(options[0].fields).toEqual(['extra', 'name']);
        expect(options[0].hasPolygons).toBe(false);
        expect(options[1].hasPolygons).toBe(true);
        expect(options[1].selectedCount).toBe(2);
    });
});
