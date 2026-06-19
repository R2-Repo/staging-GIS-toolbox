import { beforeAll, describe, expect, it } from 'vitest';
import * as turf from '@turf/turf';
import {
    applyLocatorNamingOptions,
    bearingToTravelDirectionAbbrev,
    buildLocatorName,
    computeStationLocatorFields,
    enrichRouteProfileTravelDirection,
    formatLocatorRouteName,
    milepostAtRouteDistance,
    milepostIncreasingBearing,
    oppositeTravelDirection,
    resolveSideDirectionMapping,
    resolveTravelDirectionAbbrev,
    resolveTravelDirectionForOffsetSide,
    suggestSideDirectionMapping,
    suggestTravelDirection,
    travelDirectionAxisFromBearing,
    travelDirectionChoicesForAxis
} from '../js/widgets/project-stationing/table-import/station-locator-name.js';
import { distanceFeetToMilepost, milepostToDistanceFeet } from '../js/widgets/route-milepost-segment/engine.js';

function makeNorthLine(lengthFeet, lon = -111.9, lat = 40.7) {
    const miles = lengthFeet / 5280;
    const latDelta = miles / 69;
    return turf.lineString([[lon, lat], [lon, lat + latDelta]]);
}

function makeEastWestLine(lengthFeet, lon = -111.9, lat = 40.7) {
    const miles = lengthFeet / 5280;
    const lonDelta = miles / (69 * Math.cos((lat * Math.PI) / 180));
    return turf.lineString([[lon, lat], [lon + lonDelta, lat]]);
}

beforeAll(() => {
    globalThis.turf = turf;
});

describe('station locator naming', () => {
    it('round-trips milepost distance along a route segment', () => {
        const beg = 611.44;
        const end = 840.8;
        const len = 22936;
        const dist = milepostToDistanceFeet(700, beg, end, len);
        const mp = distanceFeetToMilepost(dist, beg, end, len);
        expect(mp).toBeCloseTo(700, 5);
    });

    it.each([
        [0, 'NB'],
        [90, 'EB'],
        [180, 'SB'],
        [270, 'WB'],
        [359, 'NB']
    ])('maps bearing %s to travel direction abbrev', (bearing, expected) => {
        expect(bearingToTravelDirectionAbbrev(bearing)).toBe(expected);
    });

    it('uses milepost-increasing direction for east-west centerline', () => {
        const line = makeEastWestLine(1000);
        expect(resolveTravelDirectionAbbrev(line, { begin_milepost: 10, end_milepost: 20 })).toBe('EB');
    });

    it('reverses travel direction when milepost decreases along digitized line', () => {
        const line = makeEastWestLine(1000);
        expect(resolveTravelDirectionAbbrev(line, { begin_milepost: 20, end_milepost: 10 })).toBe('WB');
    });

    it('uses northbound for north-trending centerline', () => {
        const line = makeNorthLine(1000);
        expect(resolveTravelDirectionAbbrev(line, { begin_milepost: 0, end_milepost: 10 })).toBe('NB');
    });

    it('formats route name with spaces as hyphens', () => {
        expect(formatLocatorRouteName('SR 145')).toBe('SR-145');
    });

    it('builds locator name without RT/LT suffix', () => {
        expect(buildLocatorName({
            routeName: 'SR 145',
            milepost: 611.44,
            travelDirectionAbbrev: 'EB'
        })).toBe('SR-145 EB MP 611.44');
    });

    it('uses opposite travel directions for RT and LT offset sides', () => {
        const sideDirectionMapping = { rtDirection: 'EB', ltDirection: 'WB', clDirection: 'EB' };
        const profile = {
            route_name: 'SR 145',
            begin_milepost: 611.44,
            end_milepost: 700,
            total_length_ft: 1000
        };
        const rt = computeStationLocatorFields({
            routeProfile: profile,
            routeDistanceFt: 100,
            stationLabel: '612+00',
            offsetSide: 'RT',
            sideDirectionMapping
        });
        const lt = computeStationLocatorFields({
            routeProfile: profile,
            routeDistanceFt: 100,
            stationLabel: '612+00',
            offsetSide: 'LT',
            sideDirectionMapping
        });
        expect(rt.travel_direction).toBe('EB');
        expect(lt.travel_direction).toBe('WB');
        expect(rt.locator_name).toMatch(/^SR-145 EB MP /);
        expect(lt.locator_name).toMatch(/^SR-145 WB MP /);
        expect(rt.locator_name).not.toContain(' RT');
        expect(lt.locator_name).not.toContain(' LT');
    });

    it('falls back to engineering station when milepost is unavailable', () => {
        expect(buildLocatorName({
            routeName: 'SR 145',
            milepost: null,
            travelDirectionAbbrev: 'NB',
            stationLabel: '611+44'
        })).toBe('SR-145 NB Sta 611+44');
    });

    it('computes milepost at route distance from profile bounds', () => {
        const result = milepostAtRouteDistance(500, {
            begin_milepost: 611.44,
            end_milepost: 840.8,
            total_length_ft: 22936
        });
        expect(result.milepost).toBeCloseTo(616.43, 1);
        expect(result.milepostLabel).toBeTruthy();
    });

    it('resolves CL direction separately from RT/LT', () => {
        const mapping = { rtDirection: 'EB', ltDirection: 'WB', clDirection: 'EB' };
        expect(resolveTravelDirectionForOffsetSide('RT', mapping)).toBe('EB');
        expect(resolveTravelDirectionForOffsetSide('LT', mapping)).toBe('WB');
        expect(resolveTravelDirectionForOffsetSide('CL', mapping)).toBe('EB');
    });

    it('enriches profile with route-level travel direction', () => {
        const line = makeEastWestLine(1000);
        const profile = enrichRouteProfileTravelDirection(line, {
            route_name: 'SR 145',
            begin_milepost: 611.44,
            end_milepost: 700,
            route_direction: 'P'
        });
        expect(profile.travel_direction).toBe('EB');
        expect(profile.route_direction).toBe('P');
    });

    it('derives bearing aligned with increasing milepost', () => {
        const line = makeEastWestLine(1000);
        expect(milepostIncreasingBearing(line, 10, 20)).toBeCloseTo(90, 0);
        expect(milepostIncreasingBearing(line, 20, 10)).toBeCloseTo(270, 0);
    });

    it('limits travel direction choices to one axis pair', () => {
        expect(travelDirectionChoicesForAxis('ew')).toEqual(['EB', 'WB']);
        expect(travelDirectionChoicesForAxis('ns')).toEqual(['NB', 'SB']);
        expect(travelDirectionAxisFromBearing(90)).toBe('ew');
        expect(travelDirectionAxisFromBearing(0)).toBe('ns');
    });

    it('suggests side direction mapping for east-west centerline', () => {
        const line = makeEastWestLine(1000);
        const suggestion = suggestSideDirectionMapping(line, { begin_milepost: 611.44, end_milepost: 700 });
        expect(suggestion.axis).toBe('ew');
        expect(suggestion.choices).toEqual(['EB', 'WB']);
        expect(suggestion.rtDirection).toBe('EB');
        expect(suggestion.ltDirection).toBe('WB');
    });

    it('suggests NB/SB for north-south centerline', () => {
        const line = makeNorthLine(1000);
        const suggestion = suggestSideDirectionMapping(line, { begin_milepost: 0, end_milepost: 10 });
        expect(suggestion.axis).toBe('ns');
        expect(suggestion.rtDirection).toBe('NB');
        expect(suggestion.ltDirection).toBe('SB');
    });

    it('applies user route name override', () => {
        const profile = applyLocatorNamingOptions(
            { route_name: 'SR 145' },
            { routeName: 'State Route 145' }
        );
        expect(profile.route_name).toBe('State Route 145');
    });

    it('resolves user side direction overrides', () => {
        const suggestion = suggestSideDirectionMapping(makeEastWestLine(1000), {
            begin_milepost: 611.44,
            end_milepost: 700
        });
        const mapping = resolveSideDirectionMapping(
            { rtDirection: 'WB', ltDirection: 'EB' },
            suggestion
        );
        expect(mapping.rtDirection).toBe('WB');
        expect(mapping.ltDirection).toBe('EB');
    });

    it('flips opposite travel direction on same axis', () => {
        expect(oppositeTravelDirection('EB')).toBe('WB');
        expect(oppositeTravelDirection('NB')).toBe('SB');
    });
});
