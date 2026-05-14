import { describe, it, expect } from 'vitest';
import * as turf from '@turf/turf';
import {
    bboxOverlap,
    minBBoxSeparationMeters,
    buildBBoxIndexEntries,
    bboxPreFilterByRadius,
    NEAREST_JOIN_SORT_THRESHOLD
} from '../js/tools/spatial-bbox.js';

describe('bboxOverlap', () => {
    it('detects overlap', () => {
        expect(bboxOverlap([0, 0, 1, 1], [0.5, 0.5, 2, 2])).toBe(true);
    });
    it('detects disjoint', () => {
        expect(bboxOverlap([0, 0, 1, 1], [2, 2, 3, 3])).toBe(false);
    });
});

describe('minBBoxSeparationMeters', () => {
    it('returns 0 when boxes overlap', () => {
        expect(minBBoxSeparationMeters([0, 0, 2, 2], [1, 1, 3, 3])).toBe(0);
    });
    it('is positive when disjoint', () => {
        const d = minBBoxSeparationMeters([0, 0, 1, 1], [3, 3, 4, 4]);
        expect(d).toBeGreaterThan(1000);
    });
});

describe('buildBBoxIndexEntries', () => {
    it('indexes features', () => {
        const fc = turf.featureCollection([turf.point([1, 2]), turf.point([5, 6])]);
        const ix = buildBBoxIndexEntries(fc.features);
        expect(ix.length).toBe(2);
        expect(ix[0].idx).toBe(0);
    });
});

describe('bboxPreFilterByRadius', () => {
    it('returns subset when radius limited', () => {
        const tgt = [turf.point([0, 0]), turf.point([50, 50])];
        const ix = buildBBoxIndexEntries(tgt);
        const src = turf.point([0, 0]);
        const cand = bboxPreFilterByRadius(src, ix, tgt, 5000);
        expect(cand.length).toBeLessThanOrEqual(tgt.length);
        expect(cand.length).toBeGreaterThan(0);
    });
});

describe('NEAREST_JOIN_SORT_THRESHOLD', () => {
    it('is documented constant', () => {
        expect(NEAREST_JOIN_SORT_THRESHOLD).toBeGreaterThanOrEqual(32);
    });
});
