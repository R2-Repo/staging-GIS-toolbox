import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectZipKindFromBuffer } from '../js/import/importer.js';
import { loadJSZip } from '../js/core/libs.js';

const arrayBufferCalls = { geojson: 0, zip: 0 };

vi.mock('../js/import/geojson-importer.js', () => ({
    importGeoJSON: vi.fn(async (file, task, opts) => {
        if (!opts?.text) await file.text();
        return {
            type: 'spatial',
            name: file.name,
            geojson: { type: 'FeatureCollection', features: [] },
            schema: { fields: [], geometryType: null, featureCount: 0, crs: 'EPSG:4326' }
        };
    }),
    importGeoJSONFromParsed: vi.fn()
}));

vi.mock('../js/import/kmz-importer.js', () => ({
    importKMZ: vi.fn(async (file, task, opts) => {
        if (!opts?.buffer) {
            arrayBufferCalls.zip++;
            await file.arrayBuffer();
        }
        return {
            type: 'spatial',
            name: file.name.replace(/\.kmz$/i, ''),
            geojson: { type: 'FeatureCollection', features: [] },
            schema: { fields: [], geometryType: null, featureCount: 0, crs: 'EPSG:4326' },
            source: { file: file.name, format: 'kmz' }
        };
    })
}));

vi.mock('../js/import/shapefile-importer.js', () => ({
    importShapefile: vi.fn(async (file, task, opts) => {
        if (!opts?.buffer) {
            arrayBufferCalls.zip++;
            await file.arrayBuffer();
        }
        return {
            type: 'spatial',
            name: file.name,
            geojson: { type: 'FeatureCollection', features: [] },
            schema: { fields: [], geometryType: null, featureCount: 0, crs: 'EPSG:4326' }
        };
    })
}));

vi.mock('../js/import/json-importer.js', () => ({ importJSON: vi.fn() }));
vi.mock('../js/import/csv-importer.js', () => ({ importCSV: vi.fn() }));
vi.mock('../js/import/excel-importer.js', () => ({ importExcel: vi.fn() }));
vi.mock('../js/import/kml-importer.js', () => ({ importKML: vi.fn() }));

const { importFileCore } = await import('../js/import/importer.js');

describe('import buffer reuse', () => {
    beforeEach(() => {
        arrayBufferCalls.zip = 0;
        vi.clearAllMocks();
    });

    it('importFileCore passes pre-read text to geojson importer', async () => {
        const { importGeoJSON } = await import('../js/import/geojson-importer.js');
        const file = new File(['{"type":"FeatureCollection","features":[]}'], 'a.geojson', {
            type: 'application/geo+json'
        });
        const task = { updateProgress: vi.fn(), throwIfCancelled: vi.fn() };

        await importFileCore(file, task, {
            format: 'geojson',
            payload: { kind: 'text', data: '{"type":"FeatureCollection","features":[]}' }
        });

        expect(importGeoJSON).toHaveBeenCalledWith(
            file,
            task,
            expect.objectContaining({ text: '{"type":"FeatureCollection","features":[]}' })
        );
    });

    it('importFileCore reads zip buffer once for kmz zip', async () => {
        const JSZip = await loadJSZip();
        const zip = new JSZip();
        zip.file('doc.kml', '<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document/></kml>');
        const buffer = await zip.generateAsync({ type: 'arraybuffer' });
        const file = new File([buffer], 'test.zip', { type: 'application/zip' });
        const task = { updateProgress: vi.fn(), throwIfCancelled: vi.fn() };

        const kind = await detectZipKindFromBuffer(buffer);
        expect(kind).toBe('kmz');

        await importFileCore(file, task, {
            format: 'zip',
            payload: { kind: 'buffer', data: buffer }
        });

        expect(arrayBufferCalls.zip).toBe(0);
    });
});
