import { describe, it, expect, beforeAll } from 'vitest';
import * as turf from '@turf/turf';
import { UDOT_ROUTE_SEGMENT_CONFIG, OUTPUT_ALIGNMENT } from '../js/widgets/route-milepost-segment/config.js';
import {
    normalizeRouteSearchTerm,
    validateMilepostValue,
    validateMilepostRange,
    isWholeMilepost,
    chooseMilepostLayer,
    buildRouteSearchWhere,
    buildSelectedRouteWhere,
    buildMilepostWhere,
    buildMilepostPointWhere,
    findStartEndMilepostPoints,
    selectRouteFeatures,
    median,
    snapMilepostsToRoute,
    sliceRouteBetweenMileposts,
    sampleLineForSeparation,
    chooseOffsetDirectionTowardReferenceLine,
    buildApproximateMedianLine,
    buildOutputLayerName,
    buildOutputFeature,
    buildWarnings,
    computeSegmentResult
} from '../js/widgets/route-milepost-segment/engine.js';

beforeAll(() => {
    globalThis.turf = turf;
});

describe('validateMilepostValue', () => {
    it.each(['10', '10.0', '10.1', '10.5', '100.8'])('accepts valid milepost %s', (value) => {
        expect(validateMilepostValue(value).valid).toBe(true);
    });

    it.each(['10.55', '10.375', 'abc', ''])('rejects invalid milepost %s', (value) => {
        expect(validateMilepostValue(value).valid).toBe(false);
    });
});

describe('validateMilepostRange', () => {
    it('sorts reversed mileposts', () => {
        const result = validateMilepostRange('100', '10');
        expect(result.valid).toBe(true);
        expect(result.startMp).toBe(10);
        expect(result.endMp).toBe(100);
        expect(result.reversed).toBe(true);
    });

    it('rejects equal mileposts', () => {
        expect(validateMilepostRange('10', '10').valid).toBe(false);
    });
});

describe('chooseMilepostLayer', () => {
    it('uses whole-mile layer when both are whole numbers', () => {
        const choice = chooseMilepostLayer(10, 20, UDOT_ROUTE_SEGMENT_CONFIG);
        expect(choice.layerKey).toBe('whole');
    });

    it('uses tenth-mile layer when either has a tenth', () => {
        const choice = chooseMilepostLayer(10, 10.5, UDOT_ROUTE_SEGMENT_CONFIG);
        expect(choice.layerKey).toBe('tenth');
    });
});

describe('buildRouteSearchWhere', () => {
    it('escapes single quotes and filters by alias, direction, route type, and carto code', () => {
        const where = buildRouteSearchWhere("O'Brien", UDOT_ROUTE_SEGMENT_CONFIG);
        expect(where).toContain("O''BRIEN");
        expect(where).toContain("ROUTE_DIRECTION = 'P'");
        expect(where).toContain("ROUTE_TYPE = 'M'");
        expect(where).toContain("CARTO_CODE IN ('1', '2', '3', '4')");
        expect(where).toContain('ROUTE_ALIAS_COMMON');
        expect(where).not.toContain('ROUTE_ID LIKE');
    });
});

describe('buildSelectedRouteWhere / buildMilepostWhere', () => {
    it('builds route and milepost filters', () => {
        expect(buildSelectedRouteWhere('015P', 'P', UDOT_ROUTE_SEGMENT_CONFIG)).toContain("ROUTE_ID = '015P'");
        expect(buildSelectedRouteWhere('015P', 'P', UDOT_ROUTE_SEGMENT_CONFIG)).toContain("ROUTE_TYPE = 'M'");
        expect(buildSelectedRouteWhere('015P', 'P', UDOT_ROUTE_SEGMENT_CONFIG)).toContain("CARTO_CODE IN ('1', '2', '3', '4')");
        expect(buildMilepostWhere('015P', 10, 20, UDOT_ROUTE_SEGMENT_CONFIG)).toContain('Measure >= 10');
    });

    it('builds exact single-milepost filter', () => {
        const where = buildMilepostPointWhere('015P', 10.5, UDOT_ROUTE_SEGMENT_CONFIG);
        expect(where).toContain("ROUTE_ID = '015P'");
        expect(where).toContain('Measure >= 10.5');
        expect(where).toContain('Measure <= 10.5');
    });
});

describe('findStartEndMilepostPoints', () => {
    it('finds exact milepost matches within tolerance', () => {
        const features = [
            turf.point([-111.9, 40.7], { Measure: 10 }),
            turf.point([-111.8, 40.7], { Measure: 10.5 }),
            turf.point([-111.7, 40.7], { Measure: 20 })
        ];
        const { startPoint, endPoint, missing } = findStartEndMilepostPoints(features, 10, 20);
        expect(missing).toEqual([]);
        expect(startPoint.properties.Measure).toBe(10);
        expect(endPoint.properties.Measure).toBe(20);
    });

    it('reports missing mileposts', () => {
        const features = [turf.point([-111.9, 40.7], { Measure: 10 })];
        const { missing } = findStartEndMilepostPoints(features, 10, 99);
        expect(missing).toContain(99);
    });
});

describe('selectRouteFeatures', () => {
    it('picks longest positive-direction line and negative reference', () => {
        const features = [
            turf.lineString([[-112, 40], [-111.9, 40.1]], { ROUTE_DIRECTION: 'P', Shape__Length: 100 }),
            turf.lineString([[-112, 40.001], [-111.9, 40.101]], { ROUTE_DIRECTION: 'P', Shape__Length: 5000 }),
            turf.lineString([[-112, 40.002], [-111.9, 40.102]], { ROUTE_DIRECTION: 'N', Shape__Length: 4800 })
        ];
        const result = selectRouteFeatures(features, UDOT_ROUTE_SEGMENT_CONFIG);
        expect(result.positiveLine.properties.Shape__Length).toBe(5000);
        expect(result.negativeLine).not.toBeNull();
        expect(result.warnings.some((w) => w.toLowerCase().includes('multiple positive'))).toBe(true);
    });
});

describe('sliceRouteBetweenMileposts', () => {
    it('slices a route between snapped milepost anchors', () => {
        const route = turf.lineString([[-112, 40], [-111.5, 40], [-111, 40]]);
        const start = turf.point([-112, 40]);
        const end = turf.point([-111, 40]);
        const sliced = sliceRouteBetweenMileposts(route, start, end);
        expect(sliced.geometry.coordinates.length).toBeGreaterThan(1);
        expect(turf.length(sliced, { units: 'miles' })).toBeGreaterThan(0);
    });
});

describe('median offset logic', () => {
    it('computes median of distances', () => {
        expect(median([10, 20, 100])).toBe(20);
    });

    it('chooses offset direction closer to reference line', () => {
        const positive = turf.lineString([[-112, 40], [-111, 40]]);
        const negative = turf.lineString([[-112, 40.001], [-111, 40.001]]);
        const direction = chooseOffsetDirectionTowardReferenceLine(positive, negative, 25, 'feet');
        expect(['positive', 'negative']).toContain(direction);
    });

    it('builds approximate median line', () => {
        const positive = turf.lineString([[-112, 40], [-111, 40]]);
        const negative = turf.lineString([[-112, 40.002], [-111, 40.002]]);
        const result = buildApproximateMedianLine(positive, negative);
        expect(result.geometry).toBeTruthy();
        expect(result.medianSeparationFeet).toBeGreaterThan(0);
        expect(result.offsetFeet).toBeGreaterThan(0);
    });
});

describe('buildOutputLayerName', () => {
    it('names centerline and median outputs', () => {
        expect(buildOutputLayerName('I-15', 10.5, 100.8, OUTPUT_ALIGNMENT.POSITIVE_CENTERLINE))
            .toBe('I-15 MP 10.5 to 100.8 Centerline');
        expect(buildOutputLayerName('SR-201', 4.2, 9.8, OUTPUT_ALIGNMENT.APPROXIMATE_MEDIAN))
            .toBe('SR-201 MP 4.2 to 9.8 Median Approx');
    });
});

describe('computeSegmentResult', () => {
    it('builds centerline segment from milepost anchors', () => {
        const positiveLine = turf.lineString([[-112, 40], [-111.5, 40], [-111, 40]], {
            ROUTE_ID: '015P',
            ROUTE_ALIAS_COMMON: 'I-15',
            ROUTE_DIRECTION: 'P',
            Shape__Length: 5000
        });
        const mileposts = [
            turf.point([-112, 40], { Measure: 10, ROUTE_ID: '015P' }),
            turf.point([-111, 40], { Measure: 20, ROUTE_ID: '015P' })
        ];
        const result = computeSegmentResult({
            positiveLine,
            negativeLine: null,
            milepostFeatures: mileposts,
            startMp: 10,
            endMp: 20,
            alignment: OUTPUT_ALIGNMENT.POSITIVE_CENTERLINE,
            config: UDOT_ROUTE_SEGMENT_CONFIG,
            milepostLayerKey: 'whole',
            routeMeta: { routeId: '015P', routeAlias: 'I-15' }
        });
        expect(result.ok).toBe(true);
        expect(result.outputFeature.geometry.type).toMatch(/LineString/);
        expect(result.summary.lengthMiles).toBeGreaterThan(0);
    });

    it('fails when milepost points are missing', () => {
        const positiveLine = turf.lineString([[-112, 40], [-111, 40]], { Shape__Length: 100 });
        const result = computeSegmentResult({
            positiveLine,
            negativeLine: null,
            milepostFeatures: [],
            startMp: 10,
            endMp: 20,
            alignment: OUTPUT_ALIGNMENT.POSITIVE_CENTERLINE,
            config: UDOT_ROUTE_SEGMENT_CONFIG,
            milepostLayerKey: 'whole',
            routeMeta: { routeId: '015P', routeAlias: 'I-15' }
        });
        expect(result.ok).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
    });
});

describe('buildWarnings', () => {
    it('includes median disclaimer for approximate mode', () => {
        const warnings = buildWarnings({
            alignment: OUTPUT_ALIGNMENT.APPROXIMATE_MEDIAN,
            dividedHighwayDetected: true
        });
        expect(warnings.some((w) => w.toLowerCase().includes('approximate'))).toBe(true);
    });
});
