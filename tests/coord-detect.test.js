import { describe, it, expect } from 'vitest';
import {
    detectCoordinateColumns,
    detectProjectedColumns,
    parseCoordValue
} from '../js/import/coord-detect.js';

describe('coord-detect', () => {
    it('parseCoordValue handles decimal numbers', () => {
        expect(parseCoordValue('40.5')).toBe(40.5);
    });

    it('detectCoordinateColumns finds geographic lat/lon', () => {
        const fields = ['id', 'latitude', 'longitude'];
        const rows = [{ id: 1, latitude: 40.5, longitude: -111.9 }];
        const info = detectCoordinateColumns(fields, rows);
        expect(info?.latField).toBe('latitude');
        expect(info?.projected).toBe(false);
    });

    it('detectProjectedColumns finds large X/Y values', () => {
        const fields = ['id', 'x', 'y'];
        const rows = [{ id: 1, x: 425000, y: 4510000 }];
        const info = detectProjectedColumns(fields, rows);
        expect(info?.projected).toBe(true);
        expect(info?.xField).toBe('x');
    });
});
