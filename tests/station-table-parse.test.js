import { describe, expect, it } from 'vitest';
import {
    parseCombinedStationOffset,
    parseOffsetValue,
    parseStationValue,
    stationToDistanceAlongRoute
} from '../js/widgets/project-stationing/table-import/station-table-parse.js';

describe('station table parsing', () => {
    it.each([
        ['12+50', 1250],
        ['12+50.25', 1250.25],
        ['STA 12+50', 1250],
        ['Sta. 12+50', 1250],
        ['12 + 50', 1250],
        ['0012+50', 1250]
    ])('parses station %s', (raw, feet) => {
        const result = parseStationValue(raw);
        expect(result.valid).toBe(true);
        expect(result.stationFeet).toBe(feet);
    });

    it('flags risky station formats for review', () => {
        expect(parseStationValue('12-50').valid).toBe(false);
        expect(parseStationValue('1250').valid).toBe(false);
    });

    it.each([
        ['25 RT', '', 25, 'RT'],
        ["25' LT", '', 25, 'LT'],
        ['R25', '', 25, 'RT'],
        ['L25', '', 25, 'LT'],
        ['25R', '', 25, 'RT'],
        ['25L', '', 25, 'LT'],
        ['+25', '', 25, 'RT'],
        ['-25', '', 25, 'LT'],
        ['CL', '', 0, 'CL'],
        ['centerline', '', 0, 'CL']
    ])('parses offset %s', (raw, sideRaw, feet, side) => {
        const result = parseOffsetValue(raw, sideRaw);
        expect(result.valid).toBe(true);
        expect(result.offsetFeet).toBe(feet);
        expect(result.offsetSide).toBe(side);
    });

    it('parses combined station and offset values', () => {
        const result = parseCombinedStationOffset("12+50, 25' LT");
        expect(result.station.valid).toBe(true);
        expect(result.station.stationFeet).toBe(1250);
        expect(result.offset.valid).toBe(true);
        expect(result.offset.offsetFeet).toBe(25);
        expect(result.offset.offsetSide).toBe('LT');
    });

    it('converts station to route distance using route start station', () => {
        expect(stationToDistanceAlongRoute(10150, 10000)).toBe(150);
    });
});
