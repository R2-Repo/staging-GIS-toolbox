/**
 * Layer-level CRS helpers.
 */
import { AppError, ErrorCategory } from '../core/error-handler.js';
import { isSpatialLayer } from '../core/data-model.js';
import { buildCrsWarning, isDisplayReady } from './detect.js';
import { crsLabel, normalizeCrsCode } from './registry.js';

/**
 * @param {object} layer
 * @returns {string}
 */
export function getLayerCrs(layer) {
    if (!layer?.schema?.crs) return 'EPSG:4326';
    return normalizeCrsCode(layer.schema.crs);
}

/**
 * @param {object} layer
 * @returns {boolean}
 */
export function isLayerDisplayReady(layer) {
    if (!isSpatialLayer(layer)) return true;
    return isDisplayReady(getLayerCrs(layer));
}

/**
 * @param {object} layer
 * @returns {string}
 */
export function layerCrsWarning(layer) {
    if (!isSpatialLayer(layer)) return '';
    if (layer.source?.crsWarning) return layer.source.crsWarning;
    const crs = getLayerCrs(layer);
    return buildCrsWarning(crs);
}

/**
 * @param {object} layer
 * @param {string} [context]
 */
export function assertDisplayReady(layer, context = 'This operation') {
    if (isLayerDisplayReady(layer)) return;
    const crs = getLayerCrs(layer);
    throw new AppError(
        `${context} requires WGS84 coordinates. Layer "${layer.name}" uses ${crsLabel(crs)}. Reproject to EPSG:4326 first.`,
        ErrorCategory.VALIDATION,
        { layerId: layer.id, crs }
    );
}

/**
 * @param {object} layer
 * @returns {string}
 */
export function requireDisplayReadyLayer(layer) {
    assertDisplayReady(layer);
    return layer;
}
