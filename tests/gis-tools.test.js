import { describe, it, expect } from 'vitest';
import * as turf from '@turf/turf';
import {
    bufferFeatures,
    lineOffsetFeatures,
    clipFeatures,
    simplifyFeatures,
    dissolveFeatures,
    nearestJoin,
    intersectLayers,
    spatialJoinPointsInPolygons
} from '../js/tools/gis-tools.js';
import { createSpatialDataset } from '../js/core/data-model.js';
import { computeFeatureDistance } from '../js/tools/feature-distance.js';

describe('bufferFeatures', () => {
    it('buffers only features in a selection-sized subset', async () => {
        const fc = {
            type: 'FeatureCollection',
            features: [
                turf.point([0, 0], { id: 'a' }),
                turf.point([5, 5], { id: 'b' })
            ]
        };
        const subset = {
            type: 'FeatureCollection',
            features: [fc.features[0]]
        };
        const ds = createSpatialDataset('sites', subset, { format: 'test' });
        const out = await bufferFeatures(ds, 1, 'kilometers');
        expect(out.geojson.features).toHaveLength(1);
        expect(out.name).toContain('sites_buffer_');
        expect(out.geojson.features[0].geometry.type).toBe('Polygon');
    });
});

describe('lineOffsetFeatures', () => {
    it('offsets line features by the requested distance', async () => {
        const line = turf.lineString([[0, 0], [0, 0.01]], { id: 'road' });
        const ds = createSpatialDataset('roads', turf.featureCollection([line]), { format: 'test' });
        const out = await lineOffsetFeatures(ds, 0.001, 'kilometers');
        expect(out.geojson.features).toHaveLength(1);
        expect(out.name).toContain('roads_offset');
        expect(out.geojson.features[0].geometry.type).toBe('LineString');
        expect(out.geojson.features[0].properties.id).toBe('road');
        expect(out.geojson.features[0].geometry.coordinates[0][0]).not.toBe(0);
    });

    it('passes non-line geometries through unchanged', async () => {
        const fc = turf.featureCollection([
            turf.point([1, 1], { id: 'pt' }),
            turf.lineString([[0, 0], [0, 0.01]], { id: 'ln' })
        ]);
        const ds = createSpatialDataset('mixed', fc, { format: 'test' });
        const out = await lineOffsetFeatures(ds, 0.001, 'kilometers');
        expect(out.geojson.features).toHaveLength(2);
        expect(out.geojson.features[0].geometry.type).toBe('Point');
        expect(out.geojson.features[0].geometry.coordinates).toEqual([1, 1]);
    });
});

describe('clipFeatures', () => {
    it('clips a subset of features to a polygon mask', async () => {
        const fc = {
            type: 'FeatureCollection',
            features: [
                turf.point([1, 1], { id: 'in' }),
                turf.point([9, 9], { id: 'out' })
            ]
        };
        const ds = createSpatialDataset('pts', fc, { format: 'test' });
        const mask = turf.polygon([[[0, 0], [5, 0], [5, 5], [0, 5], [0, 0]]]);
        const out = await clipFeatures(ds, mask.geometry);
        expect(out.geojson.features).toHaveLength(1);
        expect(out.geojson.features[0].properties.id).toBe('in');
        expect(out.name).toContain('pts_clipped');
    });
});

describe('simplifyFeatures', () => {
    it('simplifies each feature in a multi-feature collection', async () => {
        const fc = {
            type: 'FeatureCollection',
            features: [
                turf.polygon([[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]]),
                turf.polygon([[[3, 0], [5, 0], [5, 2], [3, 2], [3, 0]]])
            ]
        };
        const ds = createSpatialDataset('test_simp', fc, { format: 'test' });
        const { dataset, stats } = await simplifyFeatures(ds, 0.01);
        expect(dataset.geojson.features).toHaveLength(2);
        expect(stats.verticesAfter).toBeLessThanOrEqual(stats.verticesBefore);
    });
});

describe('dissolveFeatures', () => {
    it('dissolves all polygons when field is empty', async () => {
        const fc = {
            type: 'FeatureCollection',
            features: [
                turf.polygon([[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]], { a: 1 }),
                turf.polygon([[[2, 0], [3, 0], [3, 1], [2, 1], [2, 0]]], { a: 2 })
            ]
        };
        const ds = createSpatialDataset('test_diss', fc, { format: 'test' });
        const out = await dissolveFeatures(ds, '');
        expect(out.geojson.features.length).toBeGreaterThanOrEqual(1);
    });

    it('dissolves by property when field given', async () => {
        const fc = {
            type: 'FeatureCollection',
            features: [
                turf.polygon([[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]], { k: 'x' }),
                turf.polygon([[[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]]], { k: 'x' })
            ]
        };
        const ds = createSpatialDataset('test_diss2', fc, { format: 'test' });
        const out = await dissolveFeatures(ds, 'k');
        expect(out.geojson.features.length).toBeGreaterThanOrEqual(1);
    });
});

describe('nearestJoin', () => {
    it('uses geometric distance (point to polygon boundary)', async () => {
        const pts = {
            type: 'FeatureCollection',
            features: [turf.point([0.5, 0.5], { name: 'p1' })]
        };
        const polyFar = {
            type: 'FeatureCollection',
            features: [
                turf.polygon([[[10, 10], [11, 10], [11, 11], [10, 11], [10, 10]]], { label: 'far' })
            ]
        };
        const dsA = createSpatialDataset('a', pts, { format: 'test' });
        const dsB = createSpatialDataset('b', polyFar, { format: 'test' });
        const out = await nearestJoin(dsA, dsB, ['label'], 'kilometers');
        expect(out.geojson.features[0].properties.nearest_label).toBe('far');
        expect(out.geojson.features[0].properties.nearest_distance).toBeGreaterThan(10);
    });

    it('matches brute-force nearest for many candidates (bbox sort + prune)', async () => {
        const featuresB = [];
        for (let i = 0; i < 80; i++) {
            featuresB.push(turf.point([i * 0.1 + 0.02, i * 0.03], { lid: i }));
        }
        const fA = turf.point([4, 2]);
        let bestId = -1;
        let bestD = Infinity;
        for (const fb of featuresB) {
            const d = computeFeatureDistance(fA, fb, 'centroid').distanceMeters;
            if (d < bestD) {
                bestD = d;
                bestId = fb.properties.lid;
            }
        }
        const dsA = createSpatialDataset('a', { type: 'FeatureCollection', features: [fA] }, { format: 'test' });
        const dsB = createSpatialDataset('b', { type: 'FeatureCollection', features: featuresB }, { format: 'test' });
        const out = await nearestJoin(dsA, dsB, ['lid'], 'kilometers');
        expect(out.geojson.features[0].properties.nearest_lid).toBe(bestId);
    });
});

describe('intersectLayers', () => {
    it('returns overlap region for overlapping bbox pairs only', async () => {
        const a = createSpatialDataset('la', turf.featureCollection([
            turf.polygon([[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]], { id: 'a1' })
        ]), { format: 'test' });
        const b = createSpatialDataset('lb', turf.featureCollection([
            turf.polygon([[[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]]], { id: 'b1' }),
            turf.polygon([[[10, 10], [11, 10], [11, 11], [10, 11], [10, 10]]], { id: 'b2' })
        ]), { format: 'test' });
        const out = await intersectLayers(a, b);
        expect(out.geojson.features.length).toBeGreaterThanOrEqual(1);
    });
});

describe('spatialJoinPointsInPolygons', () => {
    it('assigns polygon attributes by containment', async () => {
        const pts = createSpatialDataset('p', turf.featureCollection([
            turf.point([1, 1], { n: 'in' }),
            turf.point([20, 20], { n: 'out' })
        ]), { format: 'test' });
        const polys = createSpatialDataset('poly', turf.featureCollection([
            turf.polygon([[[0, 0], [5, 0], [5, 5], [0, 5], [0, 0]]], { zone: 'Z1' })
        ]), { format: 'test' });
        const out = await spatialJoinPointsInPolygons(pts, polys, ['zone'], 'p_');
        expect(out.geojson.features[0].properties.p_zone).toBe('Z1');
        expect(out.geojson.features[1].properties.p_zone).toBeNull();
    });
});
