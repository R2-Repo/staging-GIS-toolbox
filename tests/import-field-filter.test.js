import { describe, it, expect } from 'vitest';
import {
    filterProperties,
    filterFeatureProperties,
    filterImportResult,
    arcgisOutFieldsParam,
    mergeScanFieldNames,
    shouldFilterFields
} from '../js/import/import-field-filter.js';
import { sniffPropertyKeysFromGeoJsonText, sniffKmlFieldNames } from '../js/import/import-field-sniff.js';

describe('import-field-filter', () => {
    it('filterProperties keeps only selected keys', () => {
        const out = filterProperties({ a: 1, b: 2, c: 3 }, ['a', 'c']);
        expect(out).toEqual({ a: 1, c: 3 });
    });

    it('filterProperties returns copy when no selection', () => {
        const src = { a: 1 };
        expect(filterProperties(src, null)).toEqual({ a: 1 });
        expect(filterProperties(src, [])).toEqual({ a: 1 });
    });

    it('filterImportResult filters spatial dataset features', () => {
        const ds = {
            type: 'spatial',
            geojson: {
                type: 'FeatureCollection',
                features: [{ type: 'Feature', geometry: null, properties: { a: 1, b: 2 } }]
            },
            schema: {
                fields: [
                    { name: 'a', selected: true, order: 0 },
                    { name: 'b', selected: true, order: 1 }
                ]
            },
            source: {}
        };
        const out = filterImportResult(ds, ['a']);
        expect(out.geojson.features[0].properties).toEqual({ a: 1 });
        expect(out.schema.fields.find((f) => f.name === 'b').selected).toBe(false);
    });

    it('arcgisOutFieldsParam includes object id', () => {
        expect(arcgisOutFieldsParam(['NAME'], 'OBJECTID')).toBe('OBJECTID,NAME');
        expect(arcgisOutFieldsParam(null)).toBe('*');
    });

    it('mergeScanFieldNames unions scan lists', () => {
        expect(mergeScanFieldNames([
            { fields: ['b', 'a'] },
            { fields: ['c', 'a'] }
        ])).toEqual(['a', 'b', 'c']);
    });

    it('shouldFilterFields is false for null or empty selection list meaning all', () => {
        expect(shouldFilterFields(null)).toBe(false);
        expect(shouldFilterFields([])).toBe(false);
        expect(shouldFilterFields(['x'])).toBe(true);
    });
});

describe('import-field-sniff', () => {
    it('sniffs geojson property keys from text sample', () => {
        const keys = sniffPropertyKeysFromGeoJsonText(
            '{"type":"Feature","properties":{"id":1,"name":"A"},"geometry":null}'
        );
        expect(keys).toContain('id');
        expect(keys).toContain('name');
    });

    it('sniffs kml SimpleData names', () => {
        const keys = sniffKmlFieldNames('<SimpleData name="ROUTE_ID">1</SimpleData>');
        expect(keys).toContain('ROUTE_ID');
    });
});

describe('filterFeatureProperties', () => {
    it('returns same feature when not filtering', () => {
        const f = { type: 'Feature', geometry: null, properties: { x: 1 } };
        expect(filterFeatureProperties(f, null)).toBe(f);
    });
});
