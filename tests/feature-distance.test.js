import { describe, it, expect } from 'vitest';
import * as turf from '@turf/turf';
import { computeFeatureDistance, metersToDisplayUnits, representativePoint } from '../js/tools/feature-distance.js';

describe('metersToDisplayUnits', () => {
    it('converts to kilometers', () => {
        expect(metersToDisplayUnits(1000, 'kilometers')).toBe(1);
    });
    it('converts to feet', () => {
        expect(metersToDisplayUnits(1, 'feet')).toBeCloseTo(3.28084, 4);
    });
});

describe('computeFeatureDistance', () => {
    it('returns 0 when point is inside polygon', () => {
        const pt = turf.point([0, 0]);
        const poly = turf.polygon([[[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]]);
        const { distanceMeters } = computeFeatureDistance(pt, poly, 'centroid');
        expect(distanceMeters).toBe(0);
    });

    it('matches centroid-to-centroid for two distant points', () => {
        const a = turf.point([0, 0]);
        const b = turf.point([0, 1]);
        const { distanceMeters } = computeFeatureDistance(a, b, 'centroid');
        const expected = turf.distance(a, b, { units: 'meters' });
        expect(distanceMeters).toBeCloseTo(expected, 4);
    });

    it('uses representativePoint for line source', () => {
        const line = turf.lineString([[0, 0], [10, 0]]);
        const pt = turf.point([10, 0]);
        const { distanceMeters } = computeFeatureDistance(line, pt, 'centroid');
        expect(distanceMeters).toBeGreaterThan(0);
        expect(distanceMeters).toBeLessThan(600000);
    });
});

describe('representativePoint', () => {
    it('accepts center-of-mass alias', () => {
        const poly = turf.polygon([[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]]);
        const c1 = representativePoint(poly, 'center-of-mass');
        const c2 = representativePoint(poly, 'centerOfMass');
        expect(c1).toEqual(c2);
    });
});
