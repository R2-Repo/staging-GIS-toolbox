import { describe, it, expect, vi } from 'vitest';
import {
    normalizeImporterResult,
    expandMixedGeometryDatasets,
    filterDatasetByFence,
    finalizeImportedDatasets,
    applyImportLayerStyles,
    serializeImportedDataset,
    revokeKmzBlobUrls
} from '../js/import/post-import.js';
import { createSpatialDataset } from '../js/core/data-model.js';

describe('post-import pipeline', () => {
    it('normalizeImporterResult flattens arrays', () => {
        const a = { id: '1', type: 'spatial' };
        const b = { id: '2', type: 'table' };
        expect(normalizeImporterResult(a)).toEqual([a]);
        expect(normalizeImporterResult([a, b])).toEqual([a, b]);
        expect(normalizeImporterResult(null)).toEqual([]);
    });

    it('expandMixedGeometryDatasets splits mixed layers', () => {
        const fc = {
            type: 'FeatureCollection',
            features: [
                { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: {} },
                { type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] }, properties: {} }
            ]
        };
        const ds = createSpatialDataset('mixed', fc, { format: 'kml' });
        const expanded = expandMixedGeometryDatasets([ds]);
        expect(expanded.length).toBe(2);
        expect(expanded[0].name).toContain('Points');
        expect(expanded[1].name).toContain('Lines');
    });

    it('filterDatasetByFence removes features outside bbox', () => {
        const fc = {
            type: 'FeatureCollection',
            features: [
                { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: {} },
                { type: 'Feature', geometry: { type: 'Point', coordinates: [10, 10] }, properties: {} }
            ]
        };
        const ds = createSpatialDataset('pts', fc);
        filterDatasetByFence(ds, [-1, -1, 1, 1]);
        expect(ds.geojson.features.length).toBe(1);
    });

    it('finalizeImportedDatasets expands and fences', async () => {
        const inside = { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: {} };
        const outside = { type: 'Feature', geometry: { type: 'Point', coordinates: [5, 5] }, properties: {} };
        const ds = createSpatialDataset('f', { type: 'FeatureCollection', features: [inside, outside] });
        const { expanded, totalFiltered } = await finalizeImportedDatasets([ds], {
            fenceBbox: [-1, -1, 1, 1]
        });
        expect(expanded.length).toBe(1);
        expect(totalFiltered).toBe(1);
        expect(expanded[0].geojson.features.length).toBe(1);
        expect(expanded[0]._geometryExploded).toBe(true);
    });

    it('applyImportLayerStyles converts varying simplestyle to smart', () => {
        const fc = {
            type: 'FeatureCollection',
            features: [
                { type: 'Feature', properties: { stroke: '#ff0000' }, geometry: { type: 'Point', coordinates: [0, 0] } },
                { type: 'Feature', properties: { stroke: '#00ff00' }, geometry: { type: 'Point', coordinates: [1, 1] } }
            ]
        };
        const ds = createSpatialDataset('styled', fc);
        const mapService = {
            getLayerStyle: vi.fn(() => null),
            setLayerStyle: vi.fn(),
            restyleLayer: vi.fn()
        };
        applyImportLayerStyles(ds, { mapService, getLayers: () => [ds], layerIndex: 0 });
        expect(mapService.restyleLayer).toHaveBeenCalled();
        const style = mapService.restyleLayer.mock.calls[0][2];
        expect(style.mode).toBe('smart');
    });

    it('serializeImportedDataset carries import metadata', () => {
        const ds = createSpatialDataset('k', { type: 'FeatureCollection', features: [] });
        ds._kmlStyle = { strokeColor: '#111' };
        ds._importWarning = 'warn';
        ds._networkLinkHrefs = ['http://x'];
        const cached = serializeImportedDataset(ds);
        expect(cached._kmlStyle).toEqual({ strokeColor: '#111' });
        expect(cached._importWarning).toBe('warn');
        expect(cached._networkLinkHrefs).toEqual(['http://x']);
    });

    it('revokeKmzBlobUrls revokes tracked URLs', () => {
        const revoke = vi.fn();
        const original = URL.revokeObjectURL;
        URL.revokeObjectURL = revoke;
        try {
            const ds = { _blobUrls: ['blob:a', 'blob:b'] };
            revokeKmzBlobUrls(ds);
            expect(revoke).toHaveBeenCalledTimes(2);
            expect(ds._blobUrls).toBeUndefined();
        } finally {
            URL.revokeObjectURL = original;
        }
    });
});
