import { describe, it, expect, beforeEach } from 'vitest';
import {
    auditLayers,
    buildBatchReprojectPlan,
    layerNeedsReprojection,
    loadCrsFavorites,
    saveCrsFavorites,
    validateBatchReprojectStep,
    validateCustomWkt,
    validateLayerForReproject
} from '../js/widgets/crs-manager/engine.js';
import { createSpatialDataset } from '../js/core/data-model.js';
import * as turf from '@turf/turf';

function mockLocalStorage() {
    const store = new Map();
    globalThis.localStorage = {
        getItem: (key) => store.get(key) ?? null,
        setItem: (key, value) => store.set(key, String(value)),
        removeItem: (key) => store.delete(key),
        clear: () => store.clear()
    };
}

describe('crs-manager engine', () => {
    beforeEach(() => {
        mockLocalStorage();
    });

    it('audits spatial layers with CRS status', () => {
        const layers = [
            createSpatialDataset('geo', turf.featureCollection([turf.point([0, 0])]), {}, { crs: 'EPSG:4326' }),
            createSpatialDataset('proj', turf.featureCollection([turf.point([1, 1])]), {}, { crs: 'EPSG:26912' })
        ];
        const audit = auditLayers(layers);
        expect(audit).toHaveLength(2);
        expect(audit[0].displayReady).toBe(true);
        expect(audit[1].displayReady).toBe(false);
    });

    it('builds batch reproject plan', () => {
        const plan = buildBatchReprojectPlan(['a', 'b'], 'EPSG:4326');
        expect(plan).toHaveLength(2);
        expect(plan[0].toCrs).toBe('EPSG:4326');
    });

    it('rejects no-op batch reproject when source and target CRS match', () => {
        const result = validateBatchReprojectStep('EPSG:4326', 'EPSG:4326');
        expect(result.ok).toBe(false);
        expect(result.message).toMatch(/already in/i);
    });

    it('rejects reproject when layer is already map-ready', () => {
        const layer = createSpatialDataset(
            'highway',
            turf.featureCollection([turf.point([-111.8, 40.4])]),
            { format: 'geojson' },
            { crs: 'EPSG:4326' }
        );
        expect(layerNeedsReprojection(layer, layer.geojson)).toBe(false);
        const result = validateLayerForReproject(layer, layer.geojson, 'EPSG:4326', 'EPSG:4269');
        expect(result.ok).toBe(false);
        expect(result.message).toMatch(/already map-ready/i);
    });

    it('allows reproject when coordinates look projected', () => {
        const layer = createSpatialDataset(
            'survey',
            turf.featureCollection([turf.point([436182.15, 4509317.04])]),
            { format: 'xlsx' },
            { crs: 'EPSG:26912' }
        );
        expect(layerNeedsReprojection(layer, layer.geojson)).toBe(true);
        const result = validateLayerForReproject(layer, layer.geojson, 'EPSG:26912', 'EPSG:4326');
        expect(result.ok).toBe(true);
    });

    it('warns when batch target CRS is not web-map display ready', () => {
        const result = validateBatchReprojectStep('EPSG:6337', 'EPSG:6337');
        expect(result.ok).toBe(false);
        const projected = validateBatchReprojectStep('EPSG:6337', 'EPSG:4326');
        expect(projected.ok).toBe(true);
        expect(projected.warning).toBeUndefined();
        const toProjected = validateBatchReprojectStep('EPSG:4326', 'EPSG:6337');
        expect(toProjected.ok).toBe(false);
        expect(toProjected.message).toMatch(/web map display/i);
    });

    it('lists only display-ready presets as map targets', async () => {
        const { getMapDisplayTargetPresets } = await import('../js/widgets/crs-manager/engine.js');
        const targets = getMapDisplayTargetPresets();
        expect(targets.length).toBeGreaterThan(0);
        expect(targets.every((p) => ['EPSG:4326', 'EPSG:4269', 'EPSG:4258'].includes(p.code))).toBe(true);
        expect(targets.some((p) => p.code === 'EPSG:26912')).toBe(false);
    });

    it('persists CRS favorites', () => {
        saveCrsFavorites(['EPSG:26912', 'EPSG:4326']);
        expect(loadCrsFavorites()).toEqual(['EPSG:26912', 'EPSG:4326']);
    });

    it('validates custom WKT', () => {
        expect(validateCustomWkt('').valid).toBe(false);
        expect(validateCustomWkt('PROJCS["NAD_1983_UTM_Zone_12N"]').valid).toBe(true);
    });
});
