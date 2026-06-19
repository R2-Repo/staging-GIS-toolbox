import { describe, it, expect, beforeAll } from 'vitest';
import {
    looksProjected,
    isDisplayReady,
    wktToEpsg,
    reprojectCoordinate,
    reprojectFeatureCollection,
    normalizeCrsCode,
    listPresetCrs,
    resetCrsRegistryForTests
} from '../js/crs/index.js';
import { resetLibLoadersForTests } from '../js/core/libs.js';

beforeAll(() => {
    globalThis.proj4 = null;
});

describe('crs detect', () => {
    it('looksProjected detects large coordinate values', () => {
        expect(looksProjected(500000, 4500000)).toBe(true);
        expect(looksProjected(-111.5, 40.5)).toBe(false);
    });

    it('isDisplayReady recognizes WGS84', () => {
        expect(isDisplayReady('EPSG:4326')).toBe(true);
        expect(isDisplayReady('EPSG:26912')).toBe(false);
        expect(isDisplayReady('UNKNOWN')).toBe(false);
    });

    it('wktToEpsg matches UTM 12N WKT hints', () => {
        const wkt = 'PROJCS["NAD_1983_UTM_Zone_12N",GEOGCS["GCS_North_American_1983"...]';
        expect(wktToEpsg(wkt)).toBe('EPSG:26912');
    });

    it('normalizeCrsCode handles numeric EPSG', () => {
        expect(normalizeCrsCode('4326')).toBe('EPSG:4326');
        expect(normalizeCrsCode('EPSG:26912')).toBe('EPSG:26912');
    });
});

describe('crs reproject', () => {
    beforeAll(() => {
        resetLibLoadersForTests();
        resetCrsRegistryForTests();
    });

    it('lists NAVD88 UTM presets via alias search metadata', () => {
        const presets = listPresetCrs();
        const utm12 = presets.find((p) => p.code === 'EPSG:6337');
        expect(utm12?.aliases).toContain('navd88');
        expect(utm12?.label.toLowerCase()).toContain('navd88');
    });

    it('round-trips a Utah point between 4326 and NAD83(2011) UTM 12N', async () => {
        const lon = -111.891;
        const lat = 40.7608;
        const utm = await reprojectCoordinate([lon, lat], 'EPSG:4326', 'EPSG:6337');
        expect(utm[0]).toBeGreaterThan(100000);
        expect(utm[1]).toBeGreaterThan(4000000);

        const back = await reprojectCoordinate(utm, 'EPSG:6337', 'EPSG:4326');
        expect(back[0]).toBeCloseTo(lon, 4);
        expect(back[1]).toBeCloseTo(lat, 4);
    });

    it('round-trips a Utah point between 4326 and legacy NAD83 UTM 12N', async () => {
        const lon = -111.891;
        const lat = 40.7608;
        const utm = await reprojectCoordinate([lon, lat], 'EPSG:4326', 'EPSG:26912');
        const back = await reprojectCoordinate(utm, 'EPSG:26912', 'EPSG:4326');
        expect(back[0]).toBeCloseTo(lon, 4);
        expect(back[1]).toBeCloseTo(lat, 4);
    });

    it('wktToEpsg maps NAVD88 UTM hints to NAD83(2011) UTM 12N', () => {
        expect(wktToEpsg('PROJCS["NAVD88_UTM_Zone_12N"')).toBe('EPSG:6337');
    });

    it('reprojects LineString vertices', async () => {
        const fc = {
            type: 'FeatureCollection',
            features: [{
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: [[-111.9, 40.76], [-111.89, 40.77]]
                },
                properties: {}
            }]
        };
        const out = await reprojectFeatureCollection(fc, 'EPSG:4326', 'EPSG:26912');
        const coords = out.features[0].geometry.coordinates;
        expect(coords[0][0]).toBeGreaterThan(100000);
        expect(coords[1][0]).toBeGreaterThan(100000);
    });

    it('throws for unknown CRS', async () => {
        await expect(
            reprojectCoordinate([0, 0], 'EPSG:4326', 'EPSG:99999')
        ).rejects.toThrow(/Cannot reproject/);
    });
});
