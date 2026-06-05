import { beforeAll, describe, expect, it } from 'vitest';
import * as turf from '@turf/turf';
import { checkSpatialRelation, runSpatialAnalysis } from '../js/widgets/spatial-analyzer-engine.js';

beforeAll(() => {
    globalThis.turf = turf;
});

describe('checkSpatialRelation', () => {
    it('detects intersections for points within polygon', () => {
        const area = turf.polygon([[[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]]);
        const point = turf.point([0, 0]);
        expect(checkSpatialRelation(point, area, 'intersects')).toBe(true);
        expect(checkSpatialRelation(point, area, 'within')).toBe(true);
    });
});

describe('runSpatialAnalysis', () => {
    it('returns matched features and geometry stats', async () => {
        const area = turf.polygon([[[-5, -5], [5, -5], [5, 5], [-5, 5], [-5, -5]]]);
        const features = [
            turf.point([0, 0]),
            turf.lineString([[0, 0], [1, 1]]),
            turf.polygon([[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]),
            turf.point([100, 100])
        ];

        const result = await runSpatialAnalysis({
            features,
            analysisArea: area,
            spatialRelation: 'intersects'
        });

        expect(result.matchedFeatures).toHaveLength(3);
        expect(result.stats.points).toBe(1);
        expect(result.stats.lines).toBe(1);
        expect(result.stats.polygons).toBe(1);
        expect(result.stats.totalLength).toBeTruthy();
        expect(result.stats.totalArea).toBeTruthy();
    });
});
