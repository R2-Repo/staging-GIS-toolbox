import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as turf from '@turf/turf';
import { generateStationEventOutput } from '../js/widgets/project-stationing/table-import/station-event-plot.js';
import { normalizeColumnMapping, detectStationTableColumns } from '../js/widgets/project-stationing/table-import/station-table-detect.js';

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

function parseCsv(text) {
    const lines = text.trim().split(/\r?\n/);
    const headers = lines[0].split(',').map((h) => h.trim());
    return lines.slice(1).filter(Boolean).map((line) => {
        const values = line.split(',');
        return Object.fromEntries(headers.map((header, i) => [header, values[i]?.trim() ?? '']));
    });
}

beforeAll(() => {
    globalThis.turf = turf;
});

function makeLine(lengthFeet, lon = -111.9, lat = 40.7) {
    const miles = lengthFeet / 5280;
    const latDelta = miles / 69;
    return turf.lineString([[lon, lat], [lon, lat + latDelta]]);
}

function makeProfile(startFeet = 0, totalLengthFt = 1000) {
    return {
        route_id: 'r1',
        route_name: 'Main Road',
        start_station_feet: startFeet,
        start_station_label: '0+00',
        end_station_feet: startFeet + totalLengthFt,
        end_station_label: '10+00',
        total_length_ft: totalLengthFt,
        station_interval_ft: 100,
        units: 'feet'
    };
}

describe('station event plotting', () => {
    it('plots station-only row on centerline', async () => {
        const line = makeLine(1000);
        const output = await generateStationEventOutput(
            [{ STA: '2+00', DESC: 'sign' }],
            line,
            makeProfile(),
            { station: 'STA', label: 'DESC' }
        );
        expect(output.eventPoints.length).toBe(1);
        expect(output.eventPoints[0].properties.stationing_location_method).toBe('station');
        expect(output.unplottedRows.length).toBe(0);
    });

    it('plots station plus offset and creates connector line', async () => {
        const line = makeLine(1000);
        const output = await generateStationEventOutput(
            [{ STA: '2+00', OFF: '25 RT', DESC: 'pole' }],
            line,
            makeProfile(),
            { station: 'STA', offset: 'OFF', label: 'DESC' }
        );
        expect(output.eventPoints.length).toBe(1);
        expect(output.connectorLines.length).toBe(1);
        expect(output.eventPoints[0].properties.stationing_offset_feet).toBe(25);
    });

    it('plots coordinate-only row and calculates nearest station', async () => {
        const line = makeLine(1000);
        const pt = turf.along(line, 300, { units: 'feet' });
        const [lon, lat] = pt.geometry.coordinates;
        const output = await generateStationEventOutput(
            [{ LAT: String(lat), LON: String(lon), DESC: 'gps point' }],
            line,
            makeProfile(),
            { latitude: 'LAT', longitude: 'LON', label: 'DESC' }
        );
        expect(output.eventPoints.length).toBe(1);
        expect(output.eventPoints[0].properties.stationing_location_method).toBe('coordinates');
        expect(output.eventPoints[0].properties.stationing_station_label).toBe('3+00');
    });

    it('keeps outside-route station in unplotted report', async () => {
        const line = makeLine(1000);
        const output = await generateStationEventOutput(
            [{ STA: '20+00', DESC: 'bad' }],
            line,
            makeProfile(),
            { station: 'STA', label: 'DESC' }
        );
        expect(output.eventPoints.length).toBe(0);
        expect(output.unplottedRows.length).toBe(1);
        expect(output.summary.outsideRoute).toBe(1);
    });

    it('handles routes that start at non-zero station', async () => {
        const line = makeLine(1000);
        const output = await generateStationEventOutput(
            [{ STA: '101+50', DESC: 'offset route' }],
            line,
            makeProfile(10000, 1000),
            { station: 'STA', label: 'DESC' }
        );
        expect(output.eventPoints.length).toBe(1);
        expect(output.eventPoints[0].properties.stationing_route_distance_ft).toBe(150);
    });

    it('plots ITS-style station table with one outside-route outlier', async () => {
        const csv = readFileSync(join(fixtureDir, 'its-station-table.csv'), 'utf8');
        const rows = parseCsv(csv);
        const detection = detectStationTableColumns(rows);
        const mapping = normalizeColumnMapping(detection);
        const startFeet = 61144;
        const endFeet = 84080;
        const totalLengthFt = endFeet - startFeet;
        const line = makeLine(totalLengthFt);
        const lineLengthFt = turf.length(line, { units: 'feet' });
        const profile = {
            route_id: 'its-route',
            route_name: 'ITS Route',
            start_station_feet: startFeet,
            start_station_label: '611+44',
            end_station_feet: startFeet + lineLengthFt,
            end_station_label: '840+80',
            total_length_ft: lineLengthFt,
            station_interval_ft: 100,
            units: 'feet'
        };

        const output = await generateStationEventOutput(rows, line, profile, mapping);

        expect(output.eventPoints.length).toBe(32);
        expect(output.connectorLines.length).toBe(32);
        expect(output.unplottedRows.length).toBe(1);
        expect(output.summary.outsideRoute).toBe(1);
        expect(output.unplottedRows[0].station_raw).toBe('474+40.00');
        expect(output.eventPoints[0].properties.name).toBe('A1');
        expect(output.eventPoints[0].properties.stationing_station_label).toBe('611+44');
    });

    it('uses mapped label column only for map name (not station prefix)', async () => {
        const line = makeLine(1000);
        const output = await generateStationEventOutput(
            [{ STA: '2+00', ID: 'sign-42', DESC: 'ignored' }],
            line,
            makeProfile(),
            { station: 'STA', label: 'ID' }
        );
        expect(output.eventPoints[0].properties.name).toBe('sign-42');
        expect(output.eventPoints[0].properties.stationing_station_label).toBe('2+00');
    });
});
