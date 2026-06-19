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

function makeEastWestLine(lengthFeet, lon = -111.9, lat = 40.7) {
    const miles = lengthFeet / 5280;
    const lonDelta = miles / (69 * Math.cos((lat * Math.PI) / 180));
    return turf.lineString([[lon, lat], [lon + lonDelta, lat]]);
}

function makeProfile(startFeet = 0, totalLengthFt = 1000, extras = {}) {
    return {
        route_id: 'r1',
        route_name: extras.route_name || 'SR 145',
        route_direction: extras.route_direction || 'P',
        travel_direction: extras.travel_direction || '',
        start_station_feet: startFeet,
        start_station_label: '0+00',
        end_station_feet: startFeet + totalLengthFt,
        end_station_label: '10+00',
        total_length_ft: totalLengthFt,
        begin_milepost: extras.begin_milepost ?? 0,
        end_milepost: extras.end_milepost ?? 10,
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
        expect(output.eventPoints[0].properties.name).toBe('SR-145 NB MP 2');
        expect(output.eventPoints[0].properties.table_label).toBe('sign');
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
        expect(output.eventPoints[0].properties.name).toBe('SR-145 NB MP 2');
        expect(output.eventPoints[0].properties.travel_direction).toBe('NB');
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
            route_name: 'SR 145',
            start_station_feet: startFeet,
            start_station_label: '611+44',
            end_station_feet: startFeet + lineLengthFt,
            end_station_label: '840+80',
            total_length_ft: lineLengthFt,
            begin_milepost: 611.44,
            end_milepost: 840.8,
            station_interval_ft: 100,
            units: 'feet'
        };

        const output = await generateStationEventOutput(rows, line, profile, mapping);

        expect(output.eventPoints.length).toBe(32);
        expect(output.connectorLines.length).toBe(32);
        expect(output.unplottedRows.length).toBe(1);
        expect(output.summary.outsideRoute).toBe(1);
        expect(output.unplottedRows[0].station_raw).toBe('474+40.00');
        expect(output.eventPoints[0].properties.name).toBe('SR-145 NB MP 611.44');
        expect(output.sampleLocatorName).toBeTruthy();
        expect(output.milepostMetadataAvailable).toBe(true);
    });

    it('stores table label separately from generated locator map name', async () => {
        const line = makeLine(1000);
        const output = await generateStationEventOutput(
            [{ STA: '2+00', ID: 'sign-42', DESC: 'ignored' }],
            line,
            makeProfile(),
            { station: 'STA', label: 'ID' }
        );
        expect(output.eventPoints[0].properties.name).toBe('SR-145 NB MP 2');
        expect(output.eventPoints[0].properties.table_label).toBe('sign-42');
        expect(output.eventPoints[0].properties.stationing_station_label).toBe('2+00');
    });

    it('falls back to station in locator name when milepost bounds are missing', async () => {
        const line = makeLine(1000);
        const profile = {
            ...makeProfile(),
            begin_milepost: null,
            end_milepost: null
        };
        const output = await generateStationEventOutput(
            [{ STA: '2+00', ID: 'sign-42' }],
            line,
            profile,
            { station: 'STA', label: 'ID' }
        );
        expect(output.eventPoints[0].properties.name).toBe('SR-145 NB Sta 2+00');
        expect(output.milepostMetadataAvailable).toBe(false);
    });

    it('uses primary direction for centerline-only events on east-west route', async () => {
        const line = makeEastWestLine(1000);
        const output = await generateStationEventOutput(
            [{ STA: '2+00', ID: 'A1' }],
            line,
            makeProfile(0, 1000, { begin_milepost: 611.44, end_milepost: 700 }),
            { station: 'STA', label: 'ID' }
        );
        expect(output.travelDirection).toBe('EB');
        expect(output.eventPoints[0].properties.travel_direction).toBe('EB');
        expect(output.eventPoints[0].properties.name).toContain('SR-145 EB MP');
    });

    it('uses opposite travel direction for RT and LT on east-west centerline', async () => {
        const line = makeEastWestLine(5000);
        const profile = makeProfile(0, 5000, { begin_milepost: 611.44, end_milepost: 700 });
        const output = await generateStationEventOutput(
            [
                { STA: '2+00', OFF: '25 RT', ID: 'A1' },
                { STA: '4+00', OFF: '30 LT', ID: 'A2' },
                { STA: '6+00', OFF: '20 RT', ID: 'A3' }
            ],
            line,
            profile,
            { station: 'STA', offset: 'OFF', label: 'ID' }
        );
        const rtFeature = output.eventPoints.find((f) => f.properties.stationing_offset_side === 'RT');
        const ltFeature = output.eventPoints.find((f) => f.properties.stationing_offset_side === 'LT');
        expect(rtFeature.properties.travel_direction).toBe('EB');
        expect(ltFeature.properties.travel_direction).toBe('WB');
        expect(rtFeature.properties.name).toMatch(/^SR-145 EB MP /);
        expect(ltFeature.properties.name).toMatch(/^SR-145 WB MP /);
        expect(rtFeature.properties.name).not.toContain(' RT');
        expect(ltFeature.properties.name).not.toContain(' LT');
        expect(output.sampleLocatorNameRt).toMatch(/^SR-145 EB MP /);
        expect(output.sampleLocatorNameLt).toMatch(/^SR-145 WB MP /);
    });

    it('honors user RT/LT direction overrides', async () => {
        const line = makeEastWestLine(1000);
        const profile = makeProfile(0, 1000, { begin_milepost: 611.44, end_milepost: 700 });
        const output = await generateStationEventOutput(
            [{ STA: '2+00', OFF: '25 RT', ID: 'A1' }],
            line,
            profile,
            { station: 'STA', offset: 'OFF', label: 'ID' },
            {
                locatorNaming: {
                    routeName: 'SR 145',
                    rtDirection: 'WB',
                    ltDirection: 'EB',
                    clDirection: 'WB'
                }
            }
        );
        expect(output.eventPoints[0].properties.travel_direction).toBe('WB');
        expect(output.eventPoints[0].properties.name).toMatch(/^SR-145 WB MP /);
        expect(output.eventPoints[0].properties.name).not.toContain(' RT');
    });
});
