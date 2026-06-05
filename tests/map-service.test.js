import { describe, expect, it, vi } from 'vitest';
import { createMapService } from '../js/map/map-service.js';

function createMapAdapter() {
    const map = { id: 'map' };
    return {
        map,
        init: vi.fn(() => map),
        destroy: vi.fn(),
        getMap: vi.fn(() => map),
        currentBasemap: 'voyager',
        _3dEnabled: false,
        _layerStyles: new Map([['layer-1', { strokeColor: '#fff' }]]),
        hasImportFence: false,
        dataLayers: new Map([['layer-1', { geojson: { type: 'FeatureCollection', features: [] } }]]),
        resize: vi.fn(),
        addLayer: vi.fn(),
        removeLayer: vi.fn(),
        toggleLayer: vi.fn(),
        restyleLayer: vi.fn(),
        refreshLayerData: vi.fn(),
        syncLayerOrder: vi.fn(),
        getLayerStyle: vi.fn(() => ({ strokeColor: '#fff' })),
        setLayerStyle: vi.fn(),
        setBasemap: vi.fn(),
        enable3D: vi.fn(),
        disable3D: vi.fn(),
        fitToAll: vi.fn(),
        fitToLayers: vi.fn(),
        getBounds: vi.fn(() => [0, 0, 1, 1]),
        clearImportFence: vi.fn(),
        startImportFenceDraw: vi.fn(async () => [0, 0, 1, 1]),
        setImportFenceFromBbox: vi.fn(),
        getImportFenceEsriEnvelope: vi.fn(() => ({ xmin: 0, ymin: 0, xmax: 1, ymax: 1 })),
        getSearchLatLng: vi.fn(() => ({ lat: 1, lng: 2 })),
        _clearSearchMarker: vi.fn(),
        _popupHits: [{ id: 'hit-1' }],
        _popupIndex: 0,
        _renderCyclePopup: vi.fn(),
        _closePopup: vi.fn(),
        _findFeaturesNearClick: vi.fn(() => [{ id: 'nearby' }]),
        _showMultiPopup: vi.fn(),
        showPopup: vi.fn(),
        isOrbiting: false,
        startCameraOrbit: vi.fn(),
        stopCameraOrbit: vi.fn(),
        isSelectionMode: vi.fn(() => false),
        getSelectedIndices: vi.fn(() => [0]),
        getSelectedFeatures: vi.fn(() => []),
        getSelectionCount: vi.fn(() => 1),
        enterSelectionMode: vi.fn(),
        exitSelectionMode: vi.fn(),
        clearSelection: vi.fn(),
        selectAll: vi.fn(),
        invertSelection: vi.fn(),
        startPointPick: vi.fn(async () => ({ lng: 0, lat: 0 })),
        startTwoPointPick: vi.fn(async () => [{ lng: 0, lat: 0 }, { lng: 1, lat: 1 }]),
        startRectangleDraw: vi.fn(async () => [0, 0, 1, 1]),
        startSketchPolygon: vi.fn(async () => ({ type: 'Polygon' })),
        startSketchCirclePolygon: vi.fn(async () => ({ type: 'Polygon' })),
        showInteractionBanner: vi.fn(() => ({ close: vi.fn() })),
        cancelInteraction: vi.fn(),
        highlightFeature: vi.fn(),
        clearHighlight: vi.fn(),
        showTempFeature: vi.fn(() => ({ remove: vi.fn() }))
    };
}

describe('map service', () => {
    it('delegates map lifecycle and layer operations', () => {
        const adapter = createMapAdapter();
        const service = createMapService({ mapAdapter: adapter });
        const dataset = { id: 'layer-1' };

        service.init('map-container');
        service.addLayer(dataset, 2, { fit: true });
        service.toggleLayer(dataset.id, true);
        service.removeLayer(dataset.id);
        service.restyleLayer(dataset.id, dataset, { color: '#fff' });
        service.refreshLayerData(dataset);
        service.syncLayerOrder([dataset.id]);
        service.setBasemap('voyager');
        service.enable3D();
        service.disable3D();
        service.fitToAll();
        service.fitToLayers([dataset.id]);
        service.resize();
        service.destroy();

        expect(adapter.init).toHaveBeenCalledWith('map-container');
        expect(adapter.addLayer).toHaveBeenCalledWith(dataset, 2, { fit: true });
        expect(adapter.toggleLayer).toHaveBeenCalledWith(dataset.id, true);
        expect(adapter.removeLayer).toHaveBeenCalledWith(dataset.id);
        expect(adapter.restyleLayer).toHaveBeenCalledWith(dataset.id, dataset, { color: '#fff' });
        expect(adapter.refreshLayerData).toHaveBeenCalledWith(dataset);
        expect(adapter.syncLayerOrder).toHaveBeenCalledWith([dataset.id]);
        expect(adapter.setBasemap).toHaveBeenCalledWith('voyager');
        expect(adapter.enable3D).toHaveBeenCalledTimes(1);
        expect(adapter.disable3D).toHaveBeenCalledTimes(1);
        expect(adapter.fitToAll).toHaveBeenCalledTimes(1);
        expect(adapter.fitToLayers).toHaveBeenCalledWith([dataset.id]);
        expect(adapter.resize).toHaveBeenCalledTimes(1);
        expect(adapter.destroy).toHaveBeenCalledTimes(1);
    });

    it('throws when init is called without a container', () => {
        const adapter = createMapAdapter();
        const service = createMapService({ mapAdapter: adapter });

        expect(() => service.init()).toThrow('MapService.init requires a container element or id');
        expect(adapter.init).not.toHaveBeenCalled();
    });

    it('exposes map and bounds from the underlying adapter', () => {
        const adapter = createMapAdapter();
        const service = createMapService({ mapAdapter: adapter });

        expect(service.getMap()).toEqual({ id: 'map' });
        expect(service.map).toEqual({ id: 'map' });
        expect(service.dataLayers).toBe(adapter.dataLayers);
        expect(service.getBounds()).toEqual([0, 0, 1, 1]);
    });

    it('delegates style, fence, search, and selection helpers', async () => {
        const adapter = createMapAdapter();
        const service = createMapService({ mapAdapter: adapter });
        const dataset = { id: 'layer-1', geojson: { type: 'FeatureCollection', features: [] } };

        expect(service.getCurrentBasemap()).toBe('voyager');
        service.setCurrentBasemap('satellite');
        expect(service.getCurrentBasemap()).toBe('satellite');
        expect(service.is3DEnabled()).toBe(false);
        service.set3DEnabled(true);
        expect(service.is3DEnabled()).toBe(true);
        expect(service.getLayerStyles()).toEqual(new Map([['layer-1', { strokeColor: '#fff' }]]));
        expect(service.getLayerStyle('layer-1')).toEqual({ strokeColor: '#fff' });
        service.setLayerStyle('layer-1', { strokeColor: '#000' });

        expect(service.hasImportFence()).toBe(false);
        service.clearImportFence();
        await service.startImportFenceDraw();
        service.setImportFenceFromBbox([0, 0, 1, 1]);
        expect(service.getImportFenceEsriEnvelope()).toEqual({ xmin: 0, ymin: 0, xmax: 1, ymax: 1 });

        expect(service.getSearchLatLng()).toEqual({ lat: 1, lng: 2 });
        service.clearSearchMarker();

        expect(service.isSelectionMode()).toBe(false);
        expect(service.getSelectedIndices('layer-1')).toEqual([0]);
        expect(service.getSelectedFeatures('layer-1', dataset.geojson)).toEqual([]);
        expect(service.getSelectionCount('layer-1')).toBe(1);
        expect(service.getLayerIds()).toEqual(['layer-1']);
        service.enterSelectionMode();
        service.exitSelectionMode();
        service.clearSelection('layer-1');
        service.selectAll('layer-1', dataset.geojson);
        service.invertSelection('layer-1', dataset.geojson);

        expect(service.getLayerRecord('layer-1')).toEqual({ geojson: { type: 'FeatureCollection', features: [] } });

        await service.startPointPick('pick');
        await service.startTwoPointPick('p1', 'p2');
        await service.startRectangleDraw('rect');
        await service.startSketchPolygon({ prompt: 'poly' });
        await service.startSketchCirclePolygon({ prompt: 'circle' });
        expect(service.showInteractionBanner('hello', () => {})).toBeTruthy();
        service.cancelInteraction();
        service.highlightFeature('layer-1', 0);
        service.clearHighlight();
        expect(service.showTempFeature(dataset.geojson, 1000)).toBeTruthy();

        expect(adapter.setLayerStyle).toHaveBeenCalledWith('layer-1', { strokeColor: '#000' });
        expect(adapter.clearImportFence).toHaveBeenCalledTimes(1);
        expect(adapter.startImportFenceDraw).toHaveBeenCalledTimes(1);
        expect(adapter.setImportFenceFromBbox).toHaveBeenCalledWith([0, 0, 1, 1]);
        expect(adapter._clearSearchMarker).toHaveBeenCalledTimes(1);
        expect(adapter.enterSelectionMode).toHaveBeenCalledTimes(1);
        expect(adapter.exitSelectionMode).toHaveBeenCalledTimes(1);
        expect(adapter.clearSelection).toHaveBeenCalledWith('layer-1');
        expect(adapter.selectAll).toHaveBeenCalledWith('layer-1', dataset.geojson);
        expect(adapter.invertSelection).toHaveBeenCalledWith('layer-1', dataset.geojson);
        expect(adapter.startPointPick).toHaveBeenCalledWith('pick');
        expect(adapter.startTwoPointPick).toHaveBeenCalledWith('p1', 'p2');
        expect(adapter.startRectangleDraw).toHaveBeenCalledWith('rect');
        expect(adapter.startSketchPolygon).toHaveBeenCalledWith({ prompt: 'poly' });
        expect(adapter.startSketchCirclePolygon).toHaveBeenCalledWith({ prompt: 'circle' });
        expect(adapter.showInteractionBanner).toHaveBeenCalledTimes(1);
        expect(adapter.cancelInteraction).toHaveBeenCalledTimes(1);
        expect(adapter.highlightFeature).toHaveBeenCalledWith('layer-1', 0, undefined);
        expect(adapter.clearHighlight).toHaveBeenCalledTimes(1);
        expect(adapter.showTempFeature).toHaveBeenCalledWith(dataset.geojson, 1000);
    });

    it('delegates popup-cycle and camera orbit helpers', () => {
        const adapter = createMapAdapter();
        const service = createMapService({ mapAdapter: adapter });

        expect(service.hasPopupHits()).toBe(true);
        service.cyclePopup(1);
        expect(adapter._popupIndex).toBe(0);
        expect(service.getActivePopupHit()).toEqual({ id: 'hit-1' });
        service.closePopup();
        expect(service.findFeaturesNearClick({ lat: 1, lng: 2 }, 'layer-1', 0)).toEqual([{ id: 'nearby' }]);
        service.showMultiPopup([{ id: 'nearby' }], { lat: 1, lng: 2 });
        service.showPopup({ properties: {} }, null, { lat: 1, lng: 2 });

        expect(service.isOrbiting()).toBe(false);
        service.startCameraOrbit({ lat: 1, lng: 2 });
        service.stopCameraOrbit();

        expect(adapter._renderCyclePopup).toHaveBeenCalledTimes(1);
        expect(adapter._closePopup).toHaveBeenCalledTimes(1);
        expect(adapter._findFeaturesNearClick).toHaveBeenCalledWith({ lat: 1, lng: 2 }, 'layer-1', 0);
        expect(adapter._showMultiPopup).toHaveBeenCalledWith([{ id: 'nearby' }], { lat: 1, lng: 2 });
        expect(adapter.showPopup).toHaveBeenCalledWith({ properties: {} }, null, { lat: 1, lng: 2 });
        expect(adapter.startCameraOrbit).toHaveBeenCalledWith({ lat: 1, lng: 2 });
        expect(adapter.stopCameraOrbit).toHaveBeenCalledTimes(1);
    });
});
