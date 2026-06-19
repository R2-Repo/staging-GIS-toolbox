import { describe, it, expect, beforeAll } from 'vitest';
import * as turf from '@turf/turf';
import {
    findFirstLineStringFeature,
    listLineStringFeatures,
    pointToLineDistanceAny,
    nearestPointOnRouteLine,
    lineSliceAlongRoute,
    lineLengthAny
} from '../js/tools/line-geojson.js';

beforeAll(() => {
    globalThis.turf = turf;
});

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

describe('nearestPointOnRouteLine / lineSliceAlongRoute', () => {
    const multiRoute = {
        type: 'Feature',
        properties: { id: 'route' },
        geometry: {
            type: 'MultiLineString',
            coordinates: [
                [[0, 0], [0, 0.001]],
                [[0, 0.002], [0, 0.004]]
            ]
        }
    };

    it('uses cumulative distance across MultiLineString parts', () => {
        const seg1Len = turf.length(turf.lineString(multiRoute.geometry.coordinates[0]), { units: 'feet' });
        const clickSecond = turf.point([0, 0.003]);
        const snap = nearestPointOnRouteLine(clickSecond, multiRoute, 'feet');
        expect(snap.properties.location).toBeGreaterThan(seg1Len);
    });

    it('slices across a MultiLineString using cumulative distances', () => {
        const totalLen = lineLengthAny(multiRoute, 'feet');
        const slice = lineSliceAlongRoute(multiRoute, totalLen * 0.1, totalLen * 0.9, 'feet');
        expect(slice.geometry.type).toBe('LineString');
        expect(slice.geometry.coordinates.length).toBeGreaterThan(1);
    });
});
