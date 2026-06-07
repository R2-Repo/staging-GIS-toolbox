import { describe, it, expect } from 'vitest';
import { stripKmlPresentationFromGeoJSON } from '../js/import/parsers/kml-strip.js';
import { GridSpatialIndex, bboxFromFeatures } from '../js/workspace/spatial-index.js';

describe('kml-strip', () => {
    it('removes style and long description fields', () => {
        const fc = stripKmlPresentationFromGeoJSON({
            type: 'FeatureCollection',
            features: [{
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [0, 0] },
                properties: {
                    name: 'A',
                    description: 'x'.repeat(3000),
                    styleUrl: '#foo',
                    'marker-color': '#ff0000',
                    id: 1
                }
            }]
        });
        expect(fc.features[0].properties.name).toBe('A');
        expect(fc.features[0].properties.id).toBe(1);
        expect(fc.features[0].properties.description).toBeUndefined();
        expect(fc.features[0].properties.styleUrl).toBeUndefined();
        expect(fc.features[0].properties['marker-color']).toBeUndefined();
    });
});

describe('spatial-index', () => {
    it('queries chunks intersecting bounds', () => {
        const idx = new GridSpatialIndex(1);
        idx.insert('c1', 'layer1', [-2, -2, 0, 0], 10);
        idx.insert('c2', 'layer1', [5, 5, 7, 7], 10);
        const hits = idx.query([-1, -1, 1, 1], 'layer1');
        expect(hits).toContain('c1');
        expect(hits).not.toContain('c2');
    });

    it('bboxFromFeatures computes extent', () => {
        const bb = bboxFromFeatures([{
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [1, 2] },
            properties: {}
        }]);
        expect(bb).toEqual([1, 2, 1, 2]);
    });
});
