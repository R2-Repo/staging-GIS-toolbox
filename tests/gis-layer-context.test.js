import { describe, it, expect } from 'vitest';
import {
    isGisToolLayer,
    getWorkingFeaturesFromLayer,
    getWorkingDatasetFromLayer
} from '../js/tools/gis-layer-context.js';
import { createSpatialDataset, createChunkedSpatialDataset } from '../js/core/data-model.js';
import * as turf from '@turf/turf';

describe('gis-layer-context', () => {
    it('treats workspace-backed layers as valid GIS tool layers', () => {
        const chunked = createChunkedSpatialDataset('roads', {
            id: 'ws1',
            schema: { featureCount: 100, fields: [], geometryType: 'LineString' }
        });
        expect(isGisToolLayer(chunked)).toBe(true);
    });

    it('rejects table layers', () => {
        expect(isGisToolLayer({ type: 'table', rows: [] })).toBe(false);
    });

    it('builds working dataset from in-memory spatial layer', () => {
        const ds = createSpatialDataset('pts', turf.featureCollection([turf.point([1, 1])]), { format: 'test' });
        const work = getWorkingDatasetFromLayer(ds, 'layer', {});
        expect(work.geojson.features).toHaveLength(1);
        expect(work._isSelection).toBe(false);
    });

    it('uses workspace feature count when geojson cache is empty', () => {
        const chunked = createChunkedSpatialDataset('big', {
            id: 'ws2',
            schema: { featureCount: 5000, fields: [], geometryType: 'Point' }
        });
        const work = getWorkingFeaturesFromLayer(chunked, 'layer', {});
        expect(work.totalCount).toBe(5000);
        expect(work.count).toBe(0);
    });
});
