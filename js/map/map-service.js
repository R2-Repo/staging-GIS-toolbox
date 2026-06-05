import mapManager from './map-manager.js';

export function createMapService({ mapAdapter = mapManager } = {}) {
    return {
        get map() {
            return mapAdapter.map;
        },
        get dataLayers() {
            return mapAdapter.dataLayers;
        },
        init(container) {
            if (!container) {
                throw new Error('MapService.init requires a container element or id');
            }
            return mapAdapter.init(container);
        },
        destroy() {
            return mapAdapter.destroy();
        },
        getMap() {
            return mapAdapter.getMap();
        },
        resize() {
            return mapAdapter.resize();
        },
        addLayer(dataset, colorIndex = 0, options = {}) {
            return mapAdapter.addLayer(dataset, colorIndex, options);
        },
        removeLayer(layerId) {
            return mapAdapter.removeLayer(layerId);
        },
        toggleLayer(layerId, visible) {
            return mapAdapter.toggleLayer(layerId, visible);
        },
        restyleLayer(layerId, dataset, style) {
            return mapAdapter.restyleLayer(layerId, dataset, style);
        },
        refreshLayerData(dataset) {
            return mapAdapter.refreshLayerData(dataset);
        },
        getLayerStyle(layerId) {
            return mapAdapter.getLayerStyle(layerId);
        },
        setLayerStyle(layerId, style) {
            return mapAdapter.setLayerStyle(layerId, style);
        },
        syncLayerOrder(orderedIds) {
            return mapAdapter.syncLayerOrder(orderedIds);
        },
        getCurrentBasemap() {
            return mapAdapter.currentBasemap;
        },
        setCurrentBasemap(key) {
            mapAdapter.currentBasemap = key;
            return mapAdapter.currentBasemap;
        },
        setBasemap(key) {
            return mapAdapter.setBasemap(key);
        },
        is3DEnabled() {
            return !!mapAdapter._3dEnabled;
        },
        set3DEnabled(enabled) {
            mapAdapter._3dEnabled = !!enabled;
            return !!mapAdapter._3dEnabled;
        },
        getLayerStyles() {
            return mapAdapter._layerStyles;
        },
        enable3D() {
            return mapAdapter.enable3D();
        },
        disable3D() {
            return mapAdapter.disable3D();
        },
        fitToAll() {
            return mapAdapter.fitToAll();
        },
        fitToLayers(layerIds) {
            return mapAdapter.fitToLayers(layerIds);
        },
        getBounds() {
            return mapAdapter.getBounds();
        },
        hasImportFence() {
            return !!mapAdapter.hasImportFence;
        },
        clearImportFence() {
            return mapAdapter.clearImportFence();
        },
        startImportFenceDraw() {
            return mapAdapter.startImportFenceDraw();
        },
        setImportFenceFromBbox(bbox) {
            return mapAdapter.setImportFenceFromBbox(bbox);
        },
        getImportFenceEsriEnvelope() {
            return mapAdapter.getImportFenceEsriEnvelope();
        },
        getSearchLatLng() {
            return mapAdapter.getSearchLatLng();
        },
        clearSearchMarker() {
            return mapAdapter._clearSearchMarker();
        },
        getLayerRecord(layerId) {
            return mapAdapter.dataLayers?.get?.(layerId) ?? null;
        },
        getLayerIds() {
            return [...(mapAdapter.dataLayers?.keys?.() ?? [])];
        },
        isSelectionMode() {
            return mapAdapter.isSelectionMode();
        },
        getSelectedIndices(layerId) {
            return mapAdapter.getSelectedIndices(layerId);
        },
        getSelectedFeatures(layerId, geojson) {
            return mapAdapter.getSelectedFeatures(layerId, geojson);
        },
        getSelectionCount(layerId) {
            return mapAdapter.getSelectionCount(layerId);
        },
        enterSelectionMode() {
            return mapAdapter.enterSelectionMode();
        },
        exitSelectionMode() {
            return mapAdapter.exitSelectionMode();
        },
        clearSelection(layerId = null) {
            return mapAdapter.clearSelection(layerId);
        },
        selectAll(layerId, geojson) {
            return mapAdapter.selectAll(layerId, geojson);
        },
        invertSelection(layerId, geojson) {
            return mapAdapter.invertSelection(layerId, geojson);
        },
        startPointPick(prompt) {
            return mapAdapter.startPointPick(prompt);
        },
        startTwoPointPick(prompt1, prompt2) {
            return mapAdapter.startTwoPointPick(prompt1, prompt2);
        },
        startRectangleDraw(prompt) {
            return mapAdapter.startRectangleDraw(prompt);
        },
        startSketchPolygon(options = {}) {
            return mapAdapter.startSketchPolygon(options);
        },
        startSketchCirclePolygon(options = {}) {
            return mapAdapter.startSketchCirclePolygon(options);
        },
        showInteractionBanner(text, onCancel) {
            return mapAdapter.showInteractionBanner?.(text, onCancel);
        },
        cancelInteraction() {
            return mapAdapter.cancelInteraction?.();
        },
        highlightFeature(layerId, featureIndex, originalColor) {
            return mapAdapter.highlightFeature?.(layerId, featureIndex, originalColor);
        },
        clearHighlight() {
            return mapAdapter.clearHighlight?.();
        },
        showTempFeature(geojson, duration) {
            return mapAdapter.showTempFeature(geojson, duration);
        },
        hasPopupHits() {
            return Array.isArray(mapAdapter._popupHits) && mapAdapter._popupHits.length > 0;
        },
        cyclePopup(dir = 1) {
            if (!Array.isArray(mapAdapter._popupHits) || mapAdapter._popupHits.length === 0) return;
            const len = mapAdapter._popupHits.length;
            mapAdapter._popupIndex = (mapAdapter._popupIndex + dir + len) % len;
            return mapAdapter._renderCyclePopup?.();
        },
        getActivePopupHit() {
            const hits = mapAdapter._popupHits;
            const idx = mapAdapter._popupIndex;
            return hits?.[idx] ?? null;
        },
        closePopup() {
            return mapAdapter._closePopup?.();
        },
        findFeaturesNearClick(latlng, clickedLayerId, clickedFeatureIndex) {
            return mapAdapter._findFeaturesNearClick(latlng, clickedLayerId, clickedFeatureIndex);
        },
        showMultiPopup(hits, latlng) {
            return mapAdapter._showMultiPopup(hits, latlng);
        },
        showPopup(feature, layer, latlng) {
            return mapAdapter.showPopup(feature, layer, latlng);
        },
        isOrbiting() {
            return !!mapAdapter.isOrbiting;
        },
        startCameraOrbit(center) {
            return mapAdapter.startCameraOrbit(center);
        },
        stopCameraOrbit() {
            return mapAdapter.stopCameraOrbit();
        },
        getLegacyMapManager() {
            return mapAdapter;
        }
    };
}

export const mapService = createMapService();
export default mapService;
