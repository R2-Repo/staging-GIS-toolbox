import { describe, it, expect, beforeAll } from 'vitest';
import * as turf from '@turf/turf';
import { UDOT_ROUTE_SEGMENT_CONFIG, OUTPUT_ALIGNMENT } from '../js/widgets/route-milepost-segment/config.js';
import {
    normalizeRouteSearchTerm,
    expandRouteSearchPatterns,
    validateMilepostValue,
    validateMilepostRange,
    isWholeMilepost,
    chooseMilepostLayer,
    buildRouteSearchWhere,
    buildRouteSearchBaseWhere,
    normalizeRouteAliasCommon,
    formatRouteVariantLabel,
    mapRouteSearchRows,
    groupRouteSearchResults,
    buildSelectedRouteWhere,
    buildMilepostWhere,
    buildMilepostRangeWhere,
    buildMilepostPointWhere,
    findStartEndMilepostPoints,
    resolveMilepostPoint,
    getMilepostSnapTolerance,
    buildMilepostSnapWarnings,
    readRouteMileageBounds,
    milepostToDistanceFeet,
    locateMilepostOnRoute,
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
    computeSegmentResult,
    formatMilepost
} from '../js/widgets/route-milepost-segment/engine.js';

beforeAll(() => {
    globalThis.turf = turf;
});

describe('validateMilepostValue', () => {
    it.each(['10', '10.0', '10.1', '10.5', '10.65', '10.55', '100.8'])('accepts valid milepost %s', (value) => {
        expect(validateMilepostValue(value).valid).toBe(true);
    });

    it.each(['10.375', '10.655', 'abc', ''])('rejects invalid milepost %s', (value) => {
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

const I80_DIVIDED_ROWS = [
    {
        ROUTE_ID: '0080NM',
        ROUTE_DIRECTION: 'N',
        ROUTE_ALIAS_COMMON: 'I-80',
        ROUTE_ALIAS_STD_DIR: '0080N'
    },
    {
        ROUTE_ID: '0080PM',
        ROUTE_DIRECTION: 'P',
        ROUTE_ALIAS_COMMON: 'I 80',
        ROUTE_ALIAS_STD_DIR: '0080P'
    }
];

describe('buildRouteSearchWhere', () => {
    it('escapes single quotes and filters by alias, route type, and carto code without direction', () => {
        const where = buildRouteSearchWhere("O'Brien", UDOT_ROUTE_SEGMENT_CONFIG);
        expect(where).toContain("O''BRIEN");
        expect(where).not.toContain('ROUTE_DIRECTION');
        expect(where).toContain("ROUTE_TYPE = 'M'");
        expect(where).toContain("CARTO_CODE IN ('1', '2', '3', '4')");
        expect(where).toContain('ROUTE_ALIAS_COMMON');
        expect(where).not.toContain('ROUTE_ID LIKE');
    });

    it('buildRouteSearchBaseWhere omits direction filter', () => {
        const where = buildRouteSearchBaseWhere(UDOT_ROUTE_SEGMENT_CONFIG);
        expect(where).not.toContain('ROUTE_DIRECTION');
        expect(where).toContain("ROUTE_TYPE = 'M'");
    });

    it('matches hyphenated route queries against space-separated aliases', () => {
        const where = buildRouteSearchWhere('SR-145', UDOT_ROUTE_SEGMENT_CONFIG);
        expect(where).toContain("LIKE '%SR 145%'");
        expect(where).toContain("LIKE '%SR-145%'");
        expect(where).toContain("LIKE '%SR145%'");
        expect(where).not.toContain('REPLACE(');
    });
});

describe('expandRouteSearchPatterns', () => {
    it('includes hyphen, space, and compact variants', () => {
        expect(expandRouteSearchPatterns('SR-145')).toEqual(
            expect.arrayContaining(['SR-145', 'SR 145', 'SR145', '145'])
        );
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
        const where = buildMilepostPointWhere('015P', 10.5, UDOT_ROUTE_SEGMENT_CONFIG, 'tenth');
        expect(where).toContain("ROUTE_ID = '015P'");
        expect(where).toContain('Measure >= 10.449');
        expect(where).toContain('Measure <= 10.551');
    });

    it('expands milepost range queries by snap tolerance', () => {
        const where = buildMilepostRangeWhere('0089PM', 459.81, 488.79, UDOT_ROUTE_SEGMENT_CONFIG, 'tenth');
        expect(where).toContain('Measure >= 459.759');
        expect(where).toContain('Measure <= 488.841');
    });

    it('resolves hundredth inputs against tenth-mile layer points in range', () => {
        const features = [];
        for (let mp = 459.7; mp <= 489; mp = Math.round((mp + 0.1) * 10) / 10) {
            features.push(turf.point([-111.9, 40.7], { Measure: mp }));
        }
        const { missing, snaps } = findStartEndMilepostPoints(features, 459.81, 488.79);
        expect(missing).toEqual([]);
        expect(snaps).toHaveLength(2);
        expect(snaps[0].resolved).toBe(459.8);
        expect(snaps[1].resolved).toBe(488.8);
    });
});

describe('findStartEndMilepostPoints', () => {
    it('finds exact milepost matches within tolerance', () => {
        const features = [
            turf.point([-111.9, 40.7], { Measure: 10 }),
            turf.point([-111.8, 40.7], { Measure: 10.5 }),
            turf.point([-111.7, 40.7], { Measure: 20 })
        ];
        const { startPoint, endPoint, missing, snaps } = findStartEndMilepostPoints(features, 10, 20);
        expect(missing).toEqual([]);
        expect(snaps).toEqual([]);
        expect(startPoint.properties.Measure).toBe(10);
        expect(endPoint.properties.Measure).toBe(20);
    });

    it('snaps hundredth mileposts to nearest tenth-mile point', () => {
        const features = [
            turf.point([-111.9, 40.7], { Measure: 459.8 }),
            turf.point([-111.8, 40.7], { Measure: 488.8 })
        ];
        const { startPoint, endPoint, missing, snaps } = findStartEndMilepostPoints(features, 459.81, 488.79);
        expect(missing).toEqual([]);
        expect(startPoint.properties.Measure).toBe(459.8);
        expect(endPoint.properties.Measure).toBe(488.8);
        expect(snaps).toHaveLength(2);
    });

    it('reports missing mileposts when nothing is close enough', () => {
        const features = [turf.point([-111.9, 40.7], { Measure: 10 })];
        const { missing } = findStartEndMilepostPoints(features, 10, 99);
        expect(missing).toContain(99);
    });
});

describe('buildMilepostSnapWarnings', () => {
    it('warns when a milepost was snapped to the nearest layer measure', () => {
        const warnings = buildMilepostSnapWarnings([
            { snapped: true, requested: 459.81, resolved: 459.8, snapDistance: 0.01 }
        ]);
        expect(warnings[0]).toContain('459.81');
        expect(warnings[0]).toContain('459.8');
    });
});

describe('divided highway route search labels', () => {
    it('normalizes common alias spacing', () => {
        expect(normalizeRouteAliasCommon('I 80')).toBe('I-80');
        expect(normalizeRouteAliasCommon('I-80')).toBe('I-80');
    });

    it('formats divided variant labels with std dir suffix only for disambiguation', () => {
        expect(formatRouteVariantLabel(I80_DIVIDED_ROWS[0], UDOT_ROUTE_SEGMENT_CONFIG)).toBe('I-80 (0080N)');
        expect(formatRouteVariantLabel(I80_DIVIDED_ROWS[1], UDOT_ROUTE_SEGMENT_CONFIG)).toBe('I-80 (0080P)');
    });

    it('returns one mapped row per route id with plain alias label', () => {
        const mapped = mapRouteSearchRows(I80_DIVIDED_ROWS, UDOT_ROUTE_SEGMENT_CONFIG);
        expect(mapped).toHaveLength(2);
        expect(mapped.map((row) => row.routeId).sort()).toEqual(['0080NM', '0080PM']);
        expect(mapped.every((row) => row.routeLabel === 'I-80')).toBe(true);
    });

    it('groups divided highways for two-step picker', () => {
        const mapped = mapRouteSearchRows(I80_DIVIDED_ROWS, UDOT_ROUTE_SEGMENT_CONFIG);
        const groups = groupRouteSearchResults(mapped, UDOT_ROUTE_SEGMENT_CONFIG);
        expect(groups).toHaveLength(1);
        expect(groups[0].routeLabel).toBe('I-80');
        expect(groups[0].isDivided).toBe(true);
        expect(groups[0].variants).toHaveLength(2);
        expect(groups[0].variants[0].routeLabel).toMatch(/I-80 \(0080/);
    });

    it('keeps undivided routes as a single plain group', () => {
        const mapped = mapRouteSearchRows([{
            ROUTE_ID: '0155P',
            ROUTE_DIRECTION: 'P',
            ROUTE_ALIAS_COMMON: 'SR-155',
            ROUTE_ALIAS_STD_DIR: '0155P'
        }], UDOT_ROUTE_SEGMENT_CONFIG);
        const groups = groupRouteSearchResults(mapped, UDOT_ROUTE_SEGMENT_CONFIG);
        expect(groups).toHaveLength(1);
        expect(groups[0].routeLabel).toBe('SR-155');
        expect(groups[0].isDivided).toBe(false);
        expect(groups[0].variants[0].routeLabel).toBe('SR-155');
    });
});

describe('selectRouteFeatures', () => {
    it('uses N-direction centerline when route record is negative-direction', () => {
        const features = [
            turf.lineString([[-112, 40], [-111.9, 40.1]], { ROUTE_DIRECTION: 'N', Shape__Length: 5000 })
        ];
        const result = selectRouteFeatures(features, UDOT_ROUTE_SEGMENT_CONFIG, I80_DIVIDED_ROWS[0]);
        expect(result.positiveLine.properties.ROUTE_DIRECTION).toBe('N');
        expect(result.negativeLine).toBeNull();
    });

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

describe('formatMilepost', () => {
    it('formats whole miles without decimals', () => {
        expect(formatMilepost(10)).toBe('10');
    });

    it('preserves one or two decimal places', () => {
        expect(formatMilepost(10.5)).toBe('10.5');
        expect(formatMilepost(10.65)).toBe('10.65');
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

describe('locateMilepostOnRoute', () => {
    it('places hundredth mileposts between tenth-mile anchors on the centerline', () => {
        const positiveLine = turf.lineString([[-112, 40], [-111, 40]], {
            BEG_MILEAGE: 459,
            END_MILEAGE: 489
        });
        const atTenth = locateMilepostOnRoute(positiveLine, 459.8, positiveLine.properties, UDOT_ROUTE_SEGMENT_CONFIG);
        const atHundredth = locateMilepostOnRoute(positiveLine, 459.81, positiveLine.properties, UDOT_ROUTE_SEGMENT_CONFIG);
        expect(atTenth.ok).toBe(true);
        expect(atHundredth.ok).toBe(true);
        expect(atHundredth.distanceFeet).toBeGreaterThan(atTenth.distanceFeet);
        const totalFeet = turf.length(positiveLine, { units: 'feet' });
        const delta = atHundredth.distanceFeet - atTenth.distanceFeet;
        expect(delta).toBeCloseTo((0.01 / 30) * totalFeet, 1);
    });

    it('rejects mileposts outside route mileage bounds', () => {
        const positiveLine = turf.lineString([[-112, 40], [-111, 40]], {
            BEG_MILEAGE: 10,
            END_MILEAGE: 20
        });
        const result = locateMilepostOnRoute(positiveLine, 99, positiveLine.properties, UDOT_ROUTE_SEGMENT_CONFIG);
        expect(result.ok).toBe(false);
    });
});

describe('computeSegmentResult', () => {
    it('builds centerline segment from linear-referenced mileposts', () => {
        const positiveLine = turf.lineString([[-112, 40], [-111.5, 40], [-111, 40]], {
            ROUTE_ID: '015P',
            ROUTE_ALIAS_COMMON: 'I-15',
            ROUTE_DIRECTION: 'P',
            BEG_MILEAGE: 10,
            END_MILEAGE: 20,
            Shape__Length: 5000
        });
        const result = computeSegmentResult({
            positiveLine,
            negativeLine: null,
            milepostFeatures: [],
            startMp: 10,
            endMp: 20,
            alignment: OUTPUT_ALIGNMENT.POSITIVE_CENTERLINE,
            config: UDOT_ROUTE_SEGMENT_CONFIG,
            milepostLayerKey: 'whole',
            routeMeta: {
                routeId: '015P',
                routeAlias: 'I-15',
                routeRecord: positiveLine.properties
            }
        });
        expect(result.ok).toBe(true);
        expect(result.outputFeature.geometry.type).toMatch(/LineString/);
        expect(result.summary.lengthMiles).toBeGreaterThan(0);
    });

    it('clips at exact hundredth mileposts without snapping to tenths', () => {
        const positiveLine = turf.lineString([[-112, 40], [-111, 40]], {
            BEG_MILEAGE: 459,
            END_MILEAGE: 489
        });
        const tenth = computeSegmentResult({
            positiveLine,
            negativeLine: null,
            milepostFeatures: [],
            startMp: 459.8,
            endMp: 488.8,
            alignment: OUTPUT_ALIGNMENT.POSITIVE_CENTERLINE,
            config: UDOT_ROUTE_SEGMENT_CONFIG,
            milepostLayerKey: 'tenth',
            routeMeta: { routeRecord: positiveLine.properties }
        });
        const hundredth = computeSegmentResult({
            positiveLine,
            negativeLine: null,
            milepostFeatures: [],
            startMp: 459.81,
            endMp: 488.79,
            alignment: OUTPUT_ALIGNMENT.POSITIVE_CENTERLINE,
            config: UDOT_ROUTE_SEGMENT_CONFIG,
            milepostLayerKey: 'tenth',
            routeMeta: { routeRecord: positiveLine.properties }
        });
        expect(tenth.ok).toBe(true);
        expect(hundredth.ok).toBe(true);
        expect(hundredth.startPoint.properties.milepost).toBe('459.81');
        expect(hundredth.endPoint.properties.milepost).toBe('488.79');
        expect(hundredth.summary.lengthMiles).toBeLessThan(tenth.summary.lengthMiles);
        expect(hundredth.startPoint.geometry.coordinates[0]).not.toBeCloseTo(
            tenth.startPoint.geometry.coordinates[0],
            6
        );
    });

    it('fails when mileposts are outside route mileage bounds', () => {
        const positiveLine = turf.lineString([[-112, 40], [-111, 40]], {
            BEG_MILEAGE: 10,
            END_MILEAGE: 20,
            Shape__Length: 100
        });
        const result = computeSegmentResult({
            positiveLine,
            negativeLine: null,
            milepostFeatures: [],
            startMp: 10,
            endMp: 99,
            alignment: OUTPUT_ALIGNMENT.POSITIVE_CENTERLINE,
            config: UDOT_ROUTE_SEGMENT_CONFIG,
            milepostLayerKey: 'whole',
            routeMeta: { routeRecord: positiveLine.properties }
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
