import { describe, it, expect, beforeEach } from 'vitest';
import {
    auditLayers,
    buildBatchReprojectPlan,
    loadCrsFavorites,
    saveCrsFavorites,
    validateCustomWkt
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

    it('persists CRS favorites', () => {
        saveCrsFavorites(['EPSG:26912', 'EPSG:4326']);
        expect(loadCrsFavorites()).toEqual(['EPSG:26912', 'EPSG:4326']);
    });

    it('validates custom WKT', () => {
        expect(validateCustomWkt('').valid).toBe(false);
        expect(validateCustomWkt('PROJCS["NAD_1983_UTM_Zone_12N"]').valid).toBe(true);
    });
});
