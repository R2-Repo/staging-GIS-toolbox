import { describe, expect, it, vi } from 'vitest';
import { installDualScreenMapServiceDecorator } from '../js/dual-screen/dual-screen-map-service.js';

function createMapApi() {
    return {
        addLayer: vi.fn(() => 'add'),
        removeLayer: vi.fn(() => 'remove'),
        toggleLayer: vi.fn(() => 'toggle'),
        syncLayerOrder: vi.fn(() => 'order'),
        refreshLayerData: vi.fn(() => 'refresh'),
        setLayerStyle: vi.fn(() => 'style'),
        fitToAll: vi.fn(() => 'fitAll'),
        fitToLayers: vi.fn(() => 'fitLayers'),
        setBasemap: vi.fn(() => 'setBasemap'),
        enable3D: vi.fn(() => 'enable3d'),
        disable3D: vi.fn(() => 'disable3d'),
        setCurrentBasemap: vi.fn(),
        set3DEnabled: vi.fn(),
        getBounds: vi.fn(() => ({ source: 'map' })),
        resize: vi.fn(() => 'resize'),
        getMap: vi.fn(() => ({ id: 'map' })),
        getImportFenceEsriEnvelope: vi.fn(() => ({ source: 'mapFence' }))
    };
}

function createCoordinator() {
    return {
        isActive: false,
        _fenceBbox: null,
        broadcastLayerAdd: vi.fn(),
        broadcastLayerRemove: vi.fn(),
        broadcastLayerOrder: vi.fn(),
        broadcastFit: vi.fn(),
        syncLayersChanged: vi.fn(),
        getBounds: vi.fn(() => ({ source: 'coordinator' }))
    };
}

describe('dual-screen map service decorator', () => {
    it('delegates to map service methods when dual-screen is inactive', () => {
        const mapApi = createMapApi();
        const coordinator = createCoordinator();
        installDualScreenMapServiceDecorator(mapApi, coordinator);

        expect(mapApi.addLayer('dataset', 1, { fit: false })).toBe('add');
        expect(mapApi.removeLayer('id')).toBe('remove');
        expect(mapApi.toggleLayer('id', true)).toBe('toggle');
        expect(mapApi.syncLayerOrder(['a', 'b'])).toBe('order');
        expect(mapApi.refreshLayerData('dataset')).toBe('refresh');
        expect(mapApi.setLayerStyle('id', { color: '#fff' })).toBe('style');
        expect(mapApi.fitToAll()).toBe('fitAll');
        expect(mapApi.fitToLayers(['a'])).toBe('fitLayers');
        expect(mapApi.setBasemap('voyager')).toBe('setBasemap');
        expect(mapApi.enable3D()).toBe('enable3d');
        expect(mapApi.disable3D()).toBe('disable3d');
        expect(mapApi.getBounds()).toEqual({ source: 'map' });
        expect(mapApi.getMap()).toEqual({ id: 'map' });
        expect(mapApi.getImportFenceEsriEnvelope()).toEqual({ source: 'mapFence' });
        expect(mapApi.resize()).toBe('resize');

        expect(coordinator.broadcastLayerAdd).not.toHaveBeenCalled();
        expect(coordinator.syncLayersChanged).not.toHaveBeenCalled();
    });

    it('relays map mutations to coordinator while dual-screen is active', () => {
        const mapApi = createMapApi();
        const coordinator = createCoordinator();
        coordinator.isActive = true;
        installDualScreenMapServiceDecorator(mapApi, coordinator);

        mapApi.addLayer({ id: 'layer-1' }, 3, { fit: true });
        mapApi.removeLayer('layer-1');
        mapApi.toggleLayer('layer-1', false);
        mapApi.syncLayerOrder(['layer-1', 'layer-2']);
        mapApi.refreshLayerData({ id: 'layer-1' });
        mapApi.fitToAll();
        mapApi.fitToLayers(['layer-1']);
        expect(mapApi.resize()).toBe('resize');

        expect(coordinator.broadcastLayerAdd).toHaveBeenCalledWith({ id: 'layer-1' }, 3, { fit: true });
        expect(coordinator.broadcastFit).toHaveBeenCalledWith('fitLayer', { layerId: 'layer-1' });
        expect(coordinator.broadcastLayerRemove).toHaveBeenCalledWith('layer-1');
        expect(coordinator.broadcastLayerOrder).toHaveBeenCalledWith(['layer-1', 'layer-2']);
        expect(coordinator.syncLayersChanged).toHaveBeenCalledTimes(2);
        expect(mapApi.refreshLayerData).toBeTypeOf('function');

        expect(mapApi.addLayer.mock?.calls).toBeUndefined();
    });

    it('overrides bounds/map/fence behavior while active and can uninstall', () => {
        const mapApi = createMapApi();
        const coordinator = createCoordinator();
        coordinator.isActive = true;
        coordinator._fenceBbox = [-105.1, 39.6, -105.0, 39.7];
        const uninstall = installDualScreenMapServiceDecorator(mapApi, coordinator);

        mapApi.setBasemap('satellite');
        mapApi.enable3D();
        mapApi.disable3D();

        expect(mapApi.setCurrentBasemap).toHaveBeenCalledWith('satellite');
        expect(mapApi.set3DEnabled).toHaveBeenCalledWith(true);
        expect(mapApi.set3DEnabled).toHaveBeenCalledWith(false);
        expect(mapApi.getBounds()).toEqual({ source: 'coordinator' });
        expect(mapApi.getMap()).toBeNull();
        expect(mapApi.getImportFenceEsriEnvelope()).toEqual({
            xmin: -105.1,
            ymin: 39.6,
            xmax: -105,
            ymax: 39.7,
            spatialReference: { wkid: 4326 }
        });
        expect(mapApi.resize()).toBe('resize');

        coordinator.isActive = false;
        uninstall();
        expect(mapApi.getMap()).toEqual({ id: 'map' });
        expect(mapApi.resize()).toBe('resize');
    });
});

