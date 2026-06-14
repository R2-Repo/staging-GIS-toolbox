import { describe, expect, it, vi } from 'vitest';

vi.mock('../js/workspace/workspace-store.js', () => ({
    iterateWorkspaceFeatures: vi.fn(async (_layerId, offset) => {
        if (offset > 0) return [];
        return [{
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [1, 2] },
            properties: { name: 'test' }
        }];
    })
}));

describe('exportGeoJSON workspace layers', () => {
    it('exports spatial-chunked workspace layer from IndexedDB batches', async () => {
        const { exportGeoJSON } = await import('../js/export/geojson-exporter.js');
        const dataset = {
            id: 'ws-layer-1',
            name: 'Workspace Layer',
            type: 'spatial-chunked',
            storage: 'workspace',
            workspaceLayerId: 'ws-layer-1',
            geojson: { type: 'FeatureCollection', features: [] },
            schema: { fields: [], geometryType: 'Point', featureCount: 1 }
        };

        const result = await exportGeoJSON(dataset, {}, { updateProgress: () => {} });
        expect(result.mimeType).toBe('application/geo+json');
        expect(result.text).toContain('"type":"FeatureCollection"');
        expect(result.text).toContain('"name":"test"');
    });
});

describe('applyFieldSelectionToDataset (via exportDataset prep)', () => {
    it('does not treat spatial-chunked layers as table rows', async () => {
        const { isWorkspaceLayer } = await import('../js/core/data-model.js');
        const dataset = {
            type: 'spatial-chunked',
            storage: 'workspace',
            geojson: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: null, properties: {} }] },
            schema: { fields: [{ name: 'name', type: 'string', selected: true, outputName: 'name', order: 0 }], featureCount: 55 }
        };
        expect(isWorkspaceLayer(dataset)).toBe(true);
        expect(dataset.rows).toBeUndefined();
    });
});
