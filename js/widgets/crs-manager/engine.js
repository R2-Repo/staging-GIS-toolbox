/**
 * CRS Manager widget — layer audit, batch reproject planning, favorites.
 */
import { isSpatialLayer } from '../../core/data-model.js';
import { crsLabel, listPresetCrs, normalizeCrsCode } from '../../crs/registry.js';
import { isLayerDisplayReady, layerCrsWarning, getLayerCrs } from '../../crs/layer-crs.js';

const FAVORITES_KEY = 'gis-toolbox-crs-favorites';

export function loadCrsFavorites() {
    try {
        const raw = localStorage.getItem(FAVORITES_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

export function saveCrsFavorites(favorites = []) {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites.slice(0, 20)));
}

export function auditLayers(layers = []) {
    return layers
        .filter(isSpatialLayer)
        .map((layer) => {
            const crs = getLayerCrs(layer);
            return {
                id: layer.id,
                name: layer.name,
                crs,
                crsLabel: crsLabel(crs),
                displayReady: isLayerDisplayReady(layer),
                warning: layerCrsWarning(layer),
                featureCount: layer.schema?.featureCount ?? layer.geojson?.features?.length ?? 0
            };
        });
}

export function buildBatchReprojectPlan(layerIds = [], targetCrs = 'EPSG:4326') {
    const normalized = normalizeCrsCode(targetCrs);
    return layerIds.map((id) => ({
        layerId: id,
        toCrs: normalized,
        outputSuffix: `_reproject_${normalized.replace(':', '')}`
    }));
}

export function getAvailablePresets() {
    return listPresetCrs();
}

export function validateCustomWkt(wkt) {
    const trimmed = String(wkt || '').trim();
    if (!trimmed) return { valid: false, message: 'WKT is required.' };
    if (trimmed.length < 20) return { valid: false, message: 'WKT looks too short.' };
    return { valid: true, code: `CUSTOM:${Date.now()}` };
}
