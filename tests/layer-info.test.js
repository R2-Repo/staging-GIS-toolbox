import { describe, expect, it } from 'vitest';
import { getLayerInfoSummary } from '../js/core/layer-info.js';

describe('getLayerInfoSummary', () => {
    it('returns empty array for null layer', () => {
        expect(getLayerInfoSummary(null)).toEqual([]);
    });

    it('summarizes an in-memory spatial layer', () => {
        const layer = {
            type: 'spatial',
            created: '2026-01-15T12:00:00.000Z',
            source: { file: 'points.geojson', format: 'geojson' },
            geojson: {
                type: 'FeatureCollection',
                features: [
                    { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { a: 1 } }
                ]
            },
            schema: {
                featureCount: 1,
                geometryType: 'Point',
                crs: 'EPSG:4326',
                fields: [{ name: 'a' }]
            }
        };

        const rows = getLayerInfoSummary(layer);
        const byId = Object.fromEntries(rows.map((row) => [row.id, row]));

        expect(byId.type.value).toBe('Spatial layer');
        expect(byId.records.value).toBe('1');
        expect(byId.fields.value).toBe('1');
        expect(byId.geometry.value).toBe('Point');
        expect(byId.crs.value).toContain('EPSG:4326');
        expect(byId.crs.warning).toBeUndefined();
        expect(byId.source.value).toBe('points.geojson (GeoJSON)');
        expect(byId.added.value).toBeTruthy();
        expect(byId.storage.value).toBe('In memory');
    });

    it('summarizes a table layer without geometry or CRS rows', () => {
        const layer = {
            type: 'table',
            created: '2026-01-15T12:00:00.000Z',
            source: { file: 'data.csv', format: 'csv' },
            rows: [{ a: 1 }, { a: 2 }],
            schema: { fields: [{ name: 'a' }, { name: 'b' }] }
        };

        const rows = getLayerInfoSummary(layer);
        const ids = rows.map((row) => row.id);

        expect(ids).toContain('type');
        expect(ids).toContain('records');
        expect(ids).not.toContain('geometry');
        expect(ids).not.toContain('crs');
        expect(ids).not.toContain('storage');

        const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
        expect(byId.type.value).toBe('Table');
        expect(byId.records.label).toBe('Rows');
        expect(byId.records.value).toBe('2');
        expect(byId.source.value).toBe('data.csv (CSV)');
    });

    it('uses schema.featureCount and workspace storage for chunked layers', () => {
        const layer = {
            type: 'spatial-chunked',
            storage: 'workspace',
            source: { file: 'big.geojson', format: 'geojson' },
            geojson: { type: 'FeatureCollection', features: [] },
            schema: {
                featureCount: 125000,
                geometryType: 'Point',
                crs: 'EPSG:4326',
                fields: []
            }
        };

        const rows = getLayerInfoSummary(layer);
        const byId = Object.fromEntries(rows.map((row) => [row.id, row]));

        expect(byId.records.value).toBe('125,000');
        expect(byId.storage.value).toBe('Workspace (IndexedDB)');
    });

    it('shows CRS warning when layer is not display-ready', () => {
        const layer = {
            type: 'spatial',
            source: { format: 'geojson' },
            geojson: { type: 'FeatureCollection', features: [] },
            schema: {
                featureCount: 0,
                geometryType: 'Point',
                crs: 'EPSG:3857',
                fields: []
            }
        };

        const rows = getLayerInfoSummary(layer);
        const crsRow = rows.find((row) => row.id === 'crs');

        expect(crsRow?.warning).toBeTruthy();
    });

    it('shows source size when fileSize is present', () => {
        const layer = {
            type: 'table',
            source: { file: 'data.csv', format: 'csv', fileSize: 2048 },
            rows: [],
            schema: { fields: [] }
        };

        const rows = getLayerInfoSummary(layer);
        const sizeRow = rows.find((row) => row.id === 'sourceSize');

        expect(sizeRow?.value).toBe('2.0 KB');
    });

    it('omits added row when created is invalid', () => {
        const layer = {
            type: 'table',
            created: 'not-a-date',
            rows: [],
            schema: { fields: [] }
        };

        const rows = getLayerInfoSummary(layer);
        expect(rows.some((row) => row.id === 'added')).toBe(false);
    });
});
