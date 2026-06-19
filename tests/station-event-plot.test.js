import { beforeAll, describe, expect, it } from 'vitest';
import * as turf from '@turf/turf';
import { generateStationEventOutput } from '../js/widgets/project-stationing/table-import/station-event-plot.js';

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
    it('plots station-only row on centerline', () => {
        const line = makeLine(1000);
        const output = generateStationEventOutput(
            [{ STA: '2+00', DESC: 'sign' }],
            line,
            makeProfile(),
            { station: 'STA', label: 'DESC' }
        );
        expect(output.eventPoints.length).toBe(1);
        expect(output.eventPoints[0].properties.stationing_location_method).toBe('station');
        expect(output.unplottedRows.length).toBe(0);
    });

    it('plots station plus offset and creates connector line', () => {
        const line = makeLine(1000);
        const output = generateStationEventOutput(
            [{ STA: '2+00', OFF: '25 RT', DESC: 'pole' }],
            line,
            makeProfile(),
            { station: 'STA', offset: 'OFF', label: 'DESC' }
        );
        expect(output.eventPoints.length).toBe(1);
        expect(output.connectorLines.length).toBe(1);
        expect(output.eventPoints[0].properties.stationing_offset_feet).toBe(25);
    });

    it('plots coordinate-only row and calculates nearest station', () => {
        const line = makeLine(1000);
        const pt = turf.along(line, 300, { units: 'feet' });
        const [lon, lat] = pt.geometry.coordinates;
        const output = generateStationEventOutput(
            [{ LAT: String(lat), LON: String(lon), DESC: 'gps point' }],
            line,
            makeProfile(),
            { latitude: 'LAT', longitude: 'LON', label: 'DESC' }
        );
        expect(output.eventPoints.length).toBe(1);
        expect(output.eventPoints[0].properties.stationing_location_method).toBe('coordinates');
        expect(output.eventPoints[0].properties.stationing_station_label).toBe('3+00');
    });

    it('keeps outside-route station in unplotted report', () => {
        const line = makeLine(1000);
        const output = generateStationEventOutput(
            [{ STA: '20+00', DESC: 'bad' }],
            line,
            makeProfile(),
            { station: 'STA', label: 'DESC' }
        );
        expect(output.eventPoints.length).toBe(0);
        expect(output.unplottedRows.length).toBe(1);
        expect(output.summary.outsideRoute).toBe(1);
    });

    it('handles routes that start at non-zero station', () => {
        const line = makeLine(1000);
        const output = generateStationEventOutput(
            [{ STA: '101+50', DESC: 'offset route' }],
            line,
            makeProfile(10000, 1000),
            { station: 'STA', label: 'DESC' }
        );
        expect(output.eventPoints.length).toBe(1);
        expect(output.eventPoints[0].properties.stationing_route_distance_ft).toBe(150);
    });
});
