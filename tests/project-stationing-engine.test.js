import { describe, it, expect, beforeAll } from 'vitest';
import * as turf from '@turf/turf';
import {
    DEFAULT_INTERVAL_FT,
    CLIP_METHODS,
    parseStation,
    formatStation,
    formatRouteMileage,
    parseRouteMileage,
    resolvePartialMilepostClipInputs,
    resolveClipMilepostRange,
    validateStation,
    computeStationBreaks,
    trimCenterlineByOffsets,
    trimCenterlineByEndStation,
    clipCenterlineToArea,
    clipCenterlineToBbox,
    pickLongestLineFeature,
    generateStationPoints,
    generateProjectStationingOutput,
    generateStationSegments,
    generateStationingGraphics,
    buildStationTick,
    buildStationLabelPoint,
    resolveLabelBearing,
    getLocalTangentBearing,
    isMajorStation,
    buildOutputLayerName,
    computeProjectStationing
} from '../js/widgets/project-stationing/engine.js';
import {
    buildRouteProfile,
    calculateGeometryHash,
    isProjectStationingCenterline,
    readRouteProfile
} from '../js/widgets/project-stationing/route-profile.js';

beforeAll(() => {
    globalThis.turf = turf;
});

function makeNorthSouthLine(lengthFeet, lon = -111.9, lat = 40.7) {
    const miles = lengthFeet / 5280;
    const latDelta = miles / 69;
    return turf.lineString([[lon, lat], [lon, lat + latDelta]]);
}

describe('formatRouteMileage / resolveClipMilepostRange', () => {
    it('formats mileage to 2 decimals', () => {
        expect(formatRouteMileage(20.567)).toBe('20.57');
        expect(formatRouteMileage(null)).toBe('—');
    });

    it('resolves milepost range from explicit MP clip', () => {
        const line = makeNorthSouthLine(1000);
        const routeContext = {
            routeRecord: { BEG_MILEAGE: 10, END_MILEAGE: 20 },
            routeSelection: { positiveLine: line }
        };
        const clip = { range: { startMp: 12.5, endMp: 15.2 } };
        const result = resolveClipMilepostRange(clip, routeContext, {
            begMileageField: 'BEG_MILEAGE',
            endMileageField: 'END_MILEAGE'
        });
        expect(result.ok).toBe(true);
        expect(result.minMp).toBe(12.5);
        expect(result.maxMp).toBe(15.2);
    });

    it('resolves milepost range from route BEG/END for full route', () => {
        const line = makeNorthSouthLine(1000);
        const routeContext = {
            routeRecord: { BEG_MILEAGE: 10.12, END_MILEAGE: 20.56 },
            routeSelection: { positiveLine: line }
        };
        const result = resolveClipMilepostRange({ clipMethod: CLIP_METHODS.FULL_ROUTE }, routeContext, {
            begMileageField: 'BEG_MILEAGE',
            endMileageField: 'END_MILEAGE'
        });
        expect(result.ok).toBe(true);
        expect(result.minMp).toBe(10.12);
        expect(result.maxMp).toBe(20.56);
    });

    it('interpolates milepost range for map pick', () => {
        const line = makeNorthSouthLine(1000);
        const routeContext = {
            routeRecord: { BEG_MILEAGE: 10, END_MILEAGE: 20 },
            routeSelection: { positiveLine: line }
        };
        const clip = { mapClipStartFt: 250, mapClipEndFt: 750 };
        const result = resolveClipMilepostRange(clip, routeContext, {
            begMileageField: 'BEG_MILEAGE',
            endMileageField: 'END_MILEAGE'
        });
        expect(result.ok).toBe(true);
        expect(result.minMp).toBeCloseTo(12.5, 1);
        expect(result.maxMp).toBeCloseTo(17.5, 1);
    });
});

describe('route profile metadata', () => {
    it('builds route profile and detects stationed centerline layer', () => {
        const line = makeNorthSouthLine(500);
        const result = generateStationingGraphics({
            centerline: line,
            beginStationFeet: 10000,
            intervalFeet: 100,
            routeMeta: { routeId: 'r1', routeAlias: 'Main Road' }
        });
        const profile = buildRouteProfile(
            { routeMeta: { routeId: 'r1', routeAlias: 'Main Road' }, intervalFeet: 100 },
            result
        );
        expect(profile.route_name).toBe('Main Road');
        expect(profile.start_station_label).toBe('100+00');
        expect(profile.route_geometry_hash).toBe(calculateGeometryHash(result.centerline.geometry));

        const layer = {
            id: 'layer-1',
            type: 'spatial',
            _stationingProfile: profile,
            geojson: { type: 'FeatureCollection', features: [result.centerline] }
        };
        expect(isProjectStationingCenterline(layer)).toBe(true);
        expect(readRouteProfile(layer).route_id).toBe('r1');
    });
});

describe('parseRouteMileage', () => {
    it('returns null for invalid', () => {
        expect(parseRouteMileage('abc')).toBeNull();
        expect(parseRouteMileage(12.34)).toBe(12.34);
    });
});

describe('resolvePartialMilepostClipInputs', () => {
    it('returns full range when both mileposts are valid', () => {
        const result = resolvePartialMilepostClipInputs('12.5', '15.2', 10, 20);
        expect(result.ok).toBe(true);
        expect(result.partial).toBe(false);
        expect(result.startMilepost).toBe('12.5');
        expect(result.endMilepost).toBe('15.2');
    });

    it('extends start-only milepost to route end mileage', () => {
        const result = resolvePartialMilepostClipInputs('12.5', '', 10, 20);
        expect(result.ok).toBe(true);
        expect(result.partial).toBe(true);
        expect(result.startMilepost).toBe('12.5');
        expect(result.endMilepost).toBe('20');
    });

    it('extends end-only milepost to route begin mileage', () => {
        const result = resolvePartialMilepostClipInputs('', '15.2', 10, 20);
        expect(result.ok).toBe(true);
        expect(result.partial).toBe(true);
        expect(result.startMilepost).toBe('10');
        expect(result.endMilepost).toBe('15.2');
    });

    it('returns not ok when no valid partial mileposts are entered', () => {
        expect(resolvePartialMilepostClipInputs('', '', 10, 20)).toEqual({ ok: false });
        expect(resolvePartialMilepostClipInputs('bad', '', 10, 20)).toEqual({ ok: false });
        expect(resolvePartialMilepostClipInputs('12.5', 'bad', 10, 20)).toEqual({ ok: false });
    });
});

describe('parseStation / formatStation', () => {
    it.each([
        ['817+15', 81715],
        ['817+15.00', 81715],
        ['818+00', 81800],
        ['825+00.00', 82500],
        ['0+50', 50]
    ])('parses civil format %s → %i', (input, expected) => {
        expect(parseStation(input)).toBe(expected);
    });

    it('parses raw feet', () => {
        expect(parseStation('81715')).toBe(81715);
        expect(parseStation('81715.5')).toBe(81715.5);
    });

    it('rejects invalid station strings', () => {
        expect(parseStation('')).toBeNull();
        expect(parseStation('abc')).toBeNull();
        expect(parseStation('817+')).toBeNull();
        expect(parseStation('81+100')).toBeNull();
    });

    it.each([
        [81715, '817+15'],
        [81800, '818+00'],
        [82500, '825+00'],
        [50, '0+50']
    ])('formats %i → %s', (feet, expected) => {
        expect(formatStation(feet)).toBe(expected);
    });

    it('preserves hundredths when present', () => {
        expect(formatStation(81715.5)).toBe('817+15.50');
    });
});

describe('clipCenterlineToArea / clipCenterlineToBbox', () => {
    const line = makeNorthSouthLine(1000);

    it('clips line to polygon area', () => {
        const mid = turf.along(line, turf.length(line, { units: 'feet' }) / 2, { units: 'feet' });
        const poly = turf.buffer(mid, 200, { units: 'feet', steps: 8 });
        const result = clipCenterlineToArea(line, poly);
        expect(result.ok).toBe(true);
        expect(result.lengthFeet).toBeGreaterThan(100);
        expect(result.lengthFeet).toBeLessThan(1000);
    });

    it('clips line to bbox', () => {
        const bbox = turf.bbox(turf.buffer(turf.point(line.geometry.coordinates[0]), 300, { units: 'feet' }));
        const result = clipCenterlineToBbox(line, bbox);
        expect(result.ok).toBe(true);
        expect(result.centerline.geometry.type).toBe('LineString');
    });

    it('picks longest segment from multiple parts', () => {
        const short = turf.lineString([[-111.9, 40.7], [-111.9, 40.7005]]);
        const long = makeNorthSouthLine(500);
        const picked = pickLongestLineFeature([short, long]);
        expect(turf.length(picked, { units: 'feet' })).toBeCloseTo(500, -1);
    });

    it('rejects when no intersection', () => {
        const poly = turf.bboxPolygon([-112, 41, -111.99, 41.01]);
        const result = clipCenterlineToArea(line, poly);
        expect(result.ok).toBe(false);
    });
});

describe('generateProjectStationingOutput', () => {
    it('creates centerline and station points at breaks', () => {
        const line = makeNorthSouthLine(785);
        const result = generateProjectStationingOutput({
            centerline: line,
            beginStationFeet: 81715,
            endStationFeet: 82500,
            intervalFeet: 100,
            routeMeta: { routeId: '145P', routeAlias: 'SR-145' },
            clipMeta: { clipMethod: CLIP_METHODS.MILEPOST, mileposts: { startMp: 10, endMp: 10.2 } }
        });

        expect(result.ok).toBe(true);
        expect(result.centerline.geometry.type).toBe('LineString');
        expect(result.stationPoints.length).toBe(9);
        expect(result.stationPoints[0].properties.station).toBe('817+15');
        expect(result.stationPoints[8].properties.station).toBe('825+00');
        expect(result.summary.pointCount).toBe(9);
    });

    it('generateStationPoints places points along line', () => {
        const line = makeNorthSouthLine(300);
        const breaks = [81800, 81900, 82000];
        const points = generateStationPoints(line, breaks, 81800, { routeId: 'x' }, { clipMethod: 'box' });
        expect(points.length).toBe(3);
        expect(points[1].properties.station).toBe('819+00');
        expect(points[1].properties.clip_method).toBe('box');
    });
});

describe('generateStationingGraphics', () => {
    it('creates centerline, ticks, and offset labels', () => {
        const line = makeNorthSouthLine(450);
        const result = generateStationingGraphics({
            centerline: line,
            beginStationFeet: 0,
            intervalFeet: 100
        });

        expect(result.ok).toBe(true);
        expect(result.centerline.geometry.type).toBe('LineString');
        expect(result.stationTicks.length).toBeGreaterThan(3);
        expect(result.stationLabels.length).toBeGreaterThan(3);
        expect(result.beginEndMarkers.length).toBe(0);
        expect(result.summary.tickCount).toBe(result.stationTicks.length);
        expect(result.stationLabels[0].properties.station_label).toBe('0+00');
        expect(result.stationLabels[0].geometry.type).toBe('Point');
        expect(result.stationTicks[0].properties.name).toBeTruthy();
    });

    it('flags major stations every 500 ft from begin', () => {
        const line = makeNorthSouthLine(1200);
        const result = generateStationingGraphics({
            centerline: line,
            beginStationFeet: 0,
            intervalFeet: 100
        });
        const majors = result.stationTicks.filter((t) => t.properties.is_major_station);
        expect(majors.some((t) => t.properties.station_label === '0+00')).toBe(true);
        expect(majors.some((t) => t.properties.station_label === '5+00')).toBe(true);
        expect(majors.some((t) => t.properties.station_label === '10+00')).toBe(true);
    });
});

describe('resolveLabelBearing', () => {
    it('flips label bearing for left-side labels', () => {
        expect(resolveLabelBearing(90, 'right')).toBe(90);
        expect(resolveLabelBearing(90, 'left')).toBe(270);
    });
});

describe('buildStationTick / buildStationLabelPoint', () => {
    it('builds tick perpendicular to route tangent', () => {
        const line = makeNorthSouthLine(500);
        const pt = turf.along(line, 200, { units: 'feet' });
        const tangent = getLocalTangentBearing(line, 200, 10);
        const tick = buildStationTick(pt, tangent, 30, { station_label: '2+00' });
        const tickBearing = turf.bearing(
            turf.point(tick.geometry.coordinates[0]),
            turf.point(tick.geometry.coordinates[1])
        );
        let diff = Math.abs(tickBearing - tangent);
        if (diff > 180) diff = 360 - diff;
        expect(Math.abs(diff - 90)).toBeLessThan(5);
    });

    it('offsets labels to opposite sides for left vs right', () => {
        const line = makeNorthSouthLine(500);
        const pt = turf.along(line, 200, { units: 'feet' });
        const tangent = getLocalTangentBearing(line, 200, 10);
        const right = buildStationLabelPoint(pt, tangent, 35, 'right');
        const left = buildStationLabelPoint(pt, tangent, 35, 'left');
        const center = pt.geometry.coordinates;
        expect(right.geometry.coordinates[0]).not.toBeCloseTo(left.geometry.coordinates[0], 4);
        expect(right.geometry.coordinates[0]).not.toBeCloseTo(center[0], 4);
    });
});

describe('generateStationSegments', () => {
    it('creates partial first segment then 100-ft segments', () => {
        const line = makeNorthSouthLine(785);
        const result = generateStationSegments({
            centerline: line,
            beginStationFeet: 81715,
            endStationFeet: 82500,
            intervalFeet: 100
        });

        expect(result.ok).toBe(true);
        expect(result.segments.length).toBe(8);
        expect(result.stationPoints.length).toBe(9);
    });
});

describe('computeProjectStationing', () => {
    it('rejects line shorter than interval after trim', () => {
        const line = turf.lineString([[-111.9, 40.7], [-111.9, 40.70001]]);
        const result = computeProjectStationing({
            centerline: line,
            beginStation: '818+00',
            startOffsetFt: 0,
            endOffsetFt: 0,
            intervalFt: DEFAULT_INTERVAL_FT
        });
        expect(result.ok).toBe(false);
    });

    it('returns stationing graphics (ticks + labels)', () => {
        const line = makeNorthSouthLine(500);
        const result = computeProjectStationing({
            centerline: line,
            beginStation: '818+00',
            intervalFt: 100
        });
        expect(result.ok).toBe(true);
        expect(result.stationTicks.length).toBeGreaterThan(1);
        expect(result.stationLabels.length).toBeGreaterThan(1);
        expect(result.summary.segmentCount).toBe(result.summary.tickCount);
    });
});

describe('buildOutputLayerName', () => {
    it('formats layer name with route alias and stations', () => {
        expect(buildOutputLayerName('SR-145', '817+15', '825+00', 100))
            .toBe('SR-145 Sta 817+15 to 825+00 (100ft)');
        expect(buildOutputLayerName('SR-145', '817+15', '825+00', 100, 'Centerline'))
            .toBe('SR-145 Sta 817+15 to 825+00 (100ft) Centerline');
    });
});
