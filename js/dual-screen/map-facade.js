/**
 * Dual Screen Mode — delegate mapManager calls to secondary window when active
 */
import dualScreenCoordinator from './coordinator.js';

/**
 * @param {import('../map/map-manager.js').default} mapManager
 */
export function installDualScreenMapFacade(mapManager) {
    const coord = dualScreenCoordinator;

    const originals = {
        addLayer: mapManager.addLayer.bind(mapManager),
        removeLayer: mapManager.removeLayer.bind(mapManager),
        toggleLayer: mapManager.toggleLayer.bind(mapManager),
        syncLayerOrder: mapManager.syncLayerOrder.bind(mapManager),
        refreshLayerData: mapManager.refreshLayerData.bind(mapManager),
        setLayerStyle: mapManager.setLayerStyle.bind(mapManager),
        fitToAll: mapManager.fitToAll.bind(mapManager),
        fitToLayers: mapManager.fitToLayers.bind(mapManager),
        setBasemap: mapManager.setBasemap.bind(mapManager),
        enable3D: mapManager.enable3D.bind(mapManager),
        disable3D: mapManager.disable3D.bind(mapManager),
        getBounds: mapManager.getBounds.bind(mapManager),
        getImportFenceBbox: mapManager.getImportFenceBbox.bind(mapManager),
        getImportFenceEsriEnvelope: mapManager.getImportFenceEsriEnvelope.bind(mapManager),
        resize: mapManager.resize.bind(mapManager),
        getMap: mapManager.getMap.bind(mapManager)
    };

    mapManager.addLayer = function (dataset, colorIndex = 0, options = {}) {
        if (!coord.isActive) return originals.addLayer(dataset, colorIndex, options);
        coord.broadcastLayerAdd(dataset, colorIndex, options);
        if (options.fit) coord.broadcastFit('fitLayer', { layerId: dataset.id });
    };

    mapManager.removeLayer = function (id) {
        if (!coord.isActive) return originals.removeLayer(id);
        coord.broadcastLayerRemove(id);
    };

    mapManager.toggleLayer = function (id, visible) {
        if (!coord.isActive) return originals.toggleLayer(id, visible);
        coord.syncLayersChanged();
    };

    mapManager.syncLayerOrder = function (orderedIds) {
        if (!coord.isActive) return originals.syncLayerOrder(orderedIds);
        coord.broadcastLayerOrder(orderedIds);
    };

    mapManager.setLayerStyle = function (layerId, style) {
        originals.setLayerStyle(layerId, style);
        if (coord.isActive) coord.syncLayersChanged();
    };

    mapManager.refreshLayerData = function (dataset) {
        if (!coord.isActive) return originals.refreshLayerData(dataset);
        coord.syncLayersChanged();
    };

    mapManager.fitToAll = function () {
        if (!coord.isActive) return originals.fitToAll();
        coord.broadcastFit('fitAll');
    };

    mapManager.fitToLayers = function (layerIds) {
        if (!coord.isActive) return originals.fitToLayers(layerIds);
        coord.broadcastFit('fitLayers', { layerIds });
    };

    mapManager.setBasemap = function (key) {
        if (!coord.isActive) return originals.setBasemap(key);
        mapManager.currentBasemap = key;
        coord.syncLayersChanged();
    };

    mapManager.enable3D = function () {
        if (!coord.isActive) return originals.enable3D();
        mapManager._3dEnabled = true;
        coord.syncLayersChanged();
    };

    mapManager.disable3D = function () {
        if (!coord.isActive) return originals.disable3D();
        mapManager._3dEnabled = false;
        coord.syncLayersChanged();
    };

    mapManager.getBounds = function () {
        if (!coord.isActive) return originals.getBounds();
        return coord.getBounds();
    };

    mapManager.resize = function () {
        if (!coord.isActive) return;
        return originals.resize();
    };

    mapManager.getMap = function () {
        if (coord.isActive) return null;
        return originals.getMap();
    };

    mapManager.getImportFenceBbox = function () {
        if (coord.isActive && coord._fenceBbox) return coord._fenceBbox;
        return originals.getImportFenceBbox();
    };

    mapManager.getImportFenceEsriEnvelope = function () {
        if (coord.isActive && coord._fenceBbox) {
            const [west, south, east, north] = coord._fenceBbox;
            return { xmin: west, ymin: south, xmax: east, ymax: north, spatialReference: { wkid: 4326 } };
        }
        return originals.getImportFenceEsriEnvelope();
    };
}
