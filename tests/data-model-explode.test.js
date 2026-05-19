import { describe, it, expect } from 'vitest';
import {
    explodeGeometryCollectionsInFeatureCollection,
    explodeGeometryCollectionsInFeatureCollectionAsync,
    flattenFeatureGeometryCollections
} from '../js/core/data-model.js';
import { TaskRunner } from '../js/core/task-runner.js';

describe('explodeGeometryCollections', () => {
    it('flattens a GeometryCollection into separate features', () => {
        const fc = {
            type: 'FeatureCollection',
            features: [{
                type: 'Feature',
                properties: { id: 1 },
                geometry: {
                    type: 'GeometryCollection',
                    geometries: [
                        { type: 'Point', coordinates: [0, 0] },
                        { type: 'Point', coordinates: [1, 1] }
                    ]
                }
            }]
        };
        const out = explodeGeometryCollectionsInFeatureCollection(fc);
        expect(out.features).toHaveLength(2);
        expect(out.features.every((f) => f.geometry.type === 'Point')).toBe(true);
    });

    it('async explode matches sync for many features', async () => {
        const features = Array.from({ length: 120 }, (_, i) => ({
            type: 'Feature',
            properties: { i },
            geometry: {
                type: 'GeometryCollection',
                geometries: [
                    { type: 'Point', coordinates: [i, i] },
                    { type: 'Point', coordinates: [i + 0.5, i] }
                ]
            }
        }));
        const fc = { type: 'FeatureCollection', features };
        const sync = explodeGeometryCollectionsInFeatureCollection(fc);
        const task = new TaskRunner('Explode', 'Test');
        const asyncFc = await task.run((t) =>
            explodeGeometryCollectionsInFeatureCollectionAsync(fc, t)
        );
        expect(asyncFc.features.length).toBe(sync.features.length);
    });

    it('flattenFeatureGeometryCollections preserves non-collection features', () => {
        const f = { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [0, 0] } };
        expect(flattenFeatureGeometryCollections(f)).toHaveLength(1);
    });
});
