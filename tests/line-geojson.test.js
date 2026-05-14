import { describe, it, expect } from 'vitest';
import * as turf from '@turf/turf';
import {
    findFirstLineStringFeature,
    listLineStringFeatures,
    pointToLineDistanceAny
} from '../js/tools/line-geojson.js';

const fcMulti = {
    type: 'FeatureCollection',
    features: [{
        type: 'Feature',
        properties: { id: 1 },
        geometry: {
            type: 'MultiLineString',
            coordinates: [[[0, 0], [1, 0]], [[2, 0], [3, 0]]]
        }
    }]
};

describe('listLineStringFeatures', () => {
    it('explodes MultiLineString', () => {
        const lines = listLineStringFeatures(fcMulti);
        expect(lines.length).toBe(2);
        expect(lines[0].geometry.type).toBe('LineString');
        expect(lines[0].geometry.coordinates).toEqual([[0, 0], [1, 0]]);
    });
});

describe('findFirstLineStringFeature', () => {
    it('returns first exploded segment', () => {
        const f = findFirstLineStringFeature(fcMulti);
        expect(f.geometry.coordinates).toEqual([[0, 0], [1, 0]]);
    });
});

describe('pointToLineDistanceAny', () => {
    it('handles MultiLineString', () => {
        const pt = turf.point([0.5, 1]);
        const line = fcMulti.features[0];
        const d = pointToLineDistanceAny(pt, line, 'meters');
        expect(d).toBeGreaterThan(0);
        expect(d).toBeLessThan(200000);
    });
});
