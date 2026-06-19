import { describe, expect, it } from 'vitest';
import { detectStationTableColumns } from '../js/widgets/project-stationing/table-import/station-table-detect.js';

describe('station table column detection', () => {
    it('detects station offset side and GPS columns', () => {
        const rows = [
            { STA: '12+50', OFF: '25', SIDE: 'RT', GPS_LAT: '40.1', GPS_LONG: '-111.9', DESC: 'sign' },
            { STA: '13+00', OFF: '0', SIDE: 'CL', GPS_LAT: '40.2', GPS_LONG: '-111.8', DESC: 'pole' }
        ];
        const detection = detectStationTableColumns(rows);
        expect(detection.station.field).toBe('STA');
        expect(detection.offset.field).toBe('OFF');
        expect(detection.side.field).toBe('SIDE');
        expect(detection.latitude.field).toBe('GPS_LAT');
        expect(detection.longitude.field).toBe('GPS_LONG');
        expect(detection.label.field).toBe('DESC');
    });

    it('detects Location as station column when values match station format', () => {
        const rows = [
            { Location: '12+50 25 RT', Note: 'a' },
            { Location: '13+00 CL', Note: 'b' }
        ];
        const detection = detectStationTableColumns(rows);
        expect(detection.station.field).toBe('Location');
        expect(detection.station.confidence).toBeGreaterThan(50);
    });
});
