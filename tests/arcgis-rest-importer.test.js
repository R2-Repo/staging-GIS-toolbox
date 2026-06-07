import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    ArcGISRestImporter,
    esriFeatureToGeoJSON,
    ARCGIS_MAX_FEATURES,
    arcgisNeedsLargeDownloadConfirm,
    appendArcgisFeaturesToWorkspace
} from '../js/arcgis/rest-importer.js';
import { AppError } from '../js/core/error-handler.js';

const workspaceMocks = vi.hoisted(() => ({
    createWorkspaceLayer: vi.fn().mockResolvedValue(undefined),
    appendWorkspaceBatch: vi.fn().mockResolvedValue(undefined),
    flushSpatialIndexSave: vi.fn().mockResolvedValue(undefined),
    WORKSPACE_CHUNK_SIZE: 1000
}));

vi.mock('../js/workspace/workspace-store.js', () => workspaceMocks);

describe('esriFeatureToGeoJSON', () => {
    const importer = new ArcGISRestImporter();

    it('converts point geometry and attributes', () => {
        const feature = esriFeatureToGeoJSON(
            { geometry: { x: -122.4, y: 37.8 }, attributes: { OBJECTID: 1, name: 'A' } },
            (g) => importer.convertGeometry(g)
        );
        expect(feature.geometry).toEqual({ type: 'Point', coordinates: [-122.4, 37.8] });
        expect(feature.properties).toEqual({ OBJECTID: 1, name: 'A' });
    });

    it('handles missing geometry', () => {
        const feature = esriFeatureToGeoJSON({ attributes: { id: 2 } }, (g) => importer.convertGeometry(g));
        expect(feature.geometry).toBeNull();
        expect(feature.properties.id).toBe(2);
    });
});

describe('ArcGISRestImporter.downloadFeatures', () => {
    let importer;
    let fetchMock;

    beforeEach(() => {
        importer = new ArcGISRestImporter();
        importer.metadata = {
            name: 'Test Layer',
            url: 'https://example.com/arcgis/rest/services/test/FeatureServer/0',
            maxRecordCount: 2,
            totalCount: 3
        };
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        workspaceMocks.createWorkspaceLayer.mockClear();
        workspaceMocks.appendWorkspaceBatch.mockClear();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    function esriPoint(id) {
        return {
            geometry: { x: id, y: id },
            attributes: { OBJECTID: id }
        };
    }

    it('streams spatial pages into workspace without holding all features in memory', async () => {
        fetchMock
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    features: [esriPoint(1), esriPoint(2)],
                    exceededTransferLimit: true
                })
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    features: [esriPoint(3)],
                    exceededTransferLimit: false
                })
            });

        const dataset = await importer.downloadFeatures({ returnGeometry: true });

        expect(dataset.type).toBe('spatial-chunked');
        expect(dataset.storage).toBe('workspace');
        expect(dataset.geojson.features).toEqual([]);
        expect(dataset.schema.featureCount).toBe(3);
        expect(workspaceMocks.createWorkspaceLayer).toHaveBeenCalledTimes(1);
        expect(workspaceMocks.appendWorkspaceBatch).toHaveBeenCalledTimes(2);
        expect(workspaceMocks.appendWorkspaceBatch.mock.calls[0][2]).toBe(0);
        expect(workspaceMocks.appendWorkspaceBatch.mock.calls[1][2]).toBe(2);
        expect(workspaceMocks.flushSpatialIndexSave).toHaveBeenCalledTimes(1);
    });

    it('returns in-memory table dataset when returnGeometry is false', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                features: [{ attributes: { OBJECTID: 1, label: 'row' } }],
                exceededTransferLimit: false
            })
        });

        const dataset = await importer.downloadFeatures({ returnGeometry: false });

        expect(dataset.type).toBe('table');
        expect(dataset.rows).toHaveLength(1);
        expect(workspaceMocks.createWorkspaceLayer).not.toHaveBeenCalled();
    });

    it('rejects layers above ARCGIS_MAX_FEATURES before download', async () => {
        importer.metadata.totalCount = ARCGIS_MAX_FEATURES + 1;

        await expect(importer.downloadFeatures()).rejects.toBeInstanceOf(AppError);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('allows large layers when allowLargeDownload is set', async () => {
        importer.metadata.totalCount = ARCGIS_MAX_FEATURES + 1;
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                features: [esriPoint(1)],
                exceededTransferLimit: false
            })
        });

        const dataset = await importer.downloadFeatures({
            returnGeometry: true,
            allowLargeDownload: true
        });

        expect(dataset.type).toBe('spatial-chunked');
        expect(fetchMock).toHaveBeenCalled();
    });

    it('skips preflight cap when spatial filter is active', async () => {
        importer.metadata.totalCount = ARCGIS_MAX_FEATURES + 1;
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                features: [esriPoint(1)],
                exceededTransferLimit: false
            })
        });

        await importer.downloadFeatures({
            returnGeometry: true,
            spatialFilter: { xmin: 0, ymin: 0, xmax: 1, ymax: 1, spatialReference: { wkid: 4326 } }
        });

        expect(fetchMock).toHaveBeenCalled();
    });
});

describe('appendArcgisFeaturesToWorkspace', () => {
    it('splits oversized pages into workspace chunk batches', async () => {
        workspaceMocks.appendWorkspaceBatch.mockClear();
        const esriFeatures = Array.from({ length: 2500 }, (_, i) => ({
            geometry: { x: i, y: i },
            attributes: { OBJECTID: i }
        }));
        const importer = new ArcGISRestImporter();
        const count = await appendArcgisFeaturesToWorkspace(
            'layer-1',
            esriFeatures,
            (g) => importer.convertGeometry(g),
            0
        );
        expect(count).toBe(2500);
        expect(workspaceMocks.appendWorkspaceBatch).toHaveBeenCalledTimes(3);
    });
});

describe('arcgisNeedsLargeDownloadConfirm', () => {
    it('returns true when over cap without fence or override', () => {
        expect(arcgisNeedsLargeDownloadConfirm(
            { totalCount: ARCGIS_MAX_FEATURES + 1 },
            {}
        )).toBe(true);
    });

    it('returns false when import fence or allowLargeDownload is set', () => {
        expect(arcgisNeedsLargeDownloadConfirm(
            { totalCount: ARCGIS_MAX_FEATURES + 1 },
            { spatialFilter: { xmin: 0 } }
        )).toBe(false);
        expect(arcgisNeedsLargeDownloadConfirm(
            { totalCount: ARCGIS_MAX_FEATURES + 1 },
            { allowLargeDownload: true }
        )).toBe(false);
    });
});
