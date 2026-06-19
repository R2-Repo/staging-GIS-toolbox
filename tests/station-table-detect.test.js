import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { detectStationTableColumns, getOffsetEmbeddedSideForMapping, normalizeColumnMapping } from '../js/widgets/project-stationing/table-import/station-table-detect.js';

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

function parseCsv(text) {
    const lines = text.trim().split(/\r?\n/);
    const headers = lines[0].split(',').map((h) => h.trim());
    return lines.slice(1).filter(Boolean).map((line) => {
        const values = line.split(',');
        return Object.fromEntries(headers.map((header, i) => [header, values[i]?.trim() ?? '']));
    });
}

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

    it('detects ITS-style CSV with embedded offset side', () => {
        const csv = readFileSync(join(fixtureDir, 'its-station-table.csv'), 'utf8');
        const rows = parseCsv(csv);
        const detection = detectStationTableColumns(rows);

        expect(detection.station.field).toBe('Station');
        expect(detection.offset.field).toBe('Offset');
        expect(detection.label.field).toBe('ID');
        expect(detection.hasUsableStation).toBe(true);
        expect(detection.side.confidence).toBeLessThan(50);
        expect(detection.offsetEmbeddedSide.includesSide).toBe(true);
        expect(detection.offsetEmbeddedSide.offsetField).toBe('Offset');
        expect(detection.offsetEmbeddedSide.pct).toBeGreaterThan(50);
        expect(detection.latitude.confidence).toBeLessThan(50);
    });

    it('reports embedded RT/LT side for mapped offset column', () => {
        const csv = readFileSync(join(fixtureDir, 'its-station-table.csv'), 'utf8');
        const rows = parseCsv(csv);
        const embedded = getOffsetEmbeddedSideForMapping(rows, 'Offset');
        expect(embedded.includesSide).toBe(true);
        expect(embedded.pct).toBeGreaterThan(50);
    });

    it('does not map low-confidence numeric ID column as latitude/longitude', () => {
        const csv = readFileSync(join(fixtureDir, 'its-station-table.csv'), 'utf8');
        const rows = parseCsv(csv);
        const detection = detectStationTableColumns(rows);
        const mapping = normalizeColumnMapping(detection);

        expect(mapping.latitude).toBe('');
        expect(mapping.longitude).toBe('');
        expect(mapping.station).toBe('Station');
        expect(mapping.offset).toBe('Offset');
        expect(mapping.label).toBe('ID');
    });
});
