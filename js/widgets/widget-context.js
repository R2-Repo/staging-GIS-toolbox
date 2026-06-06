/**
 * Shared helpers for building widget layer options and context.
 */

const DEFAULT_FIELD_SAMPLE = 200;

function collectFieldNames(features, sampleSize = DEFAULT_FIELD_SAMPLE) {
    const fields = new Set();
    (features || []).slice(0, sampleSize).forEach((feature) => {
        Object.keys(feature?.properties || {}).forEach((key) => fields.add(key));
    });
    return [...fields].sort();
}

/**
 * @param {import('./widget-types.js').WidgetContext} ctx
 * @param {object} [opts]
 * @param {boolean} [opts.includeFields]
 * @param {boolean} [opts.requirePolygons]
 * @param {boolean} [opts.includeSelectionCount]
 * @returns {import('./widget-types.js').LayerOption[]}
 */
export function getSpatialLayerOptions(ctx, opts = {}) {
    const { includeFields = false, requirePolygons = false, includeSelectionCount = false } = opts;
    const spatialLayers = (ctx.getLayers() || []).filter((layer) => layer.type === 'spatial');

    return spatialLayers.map((layer) => {
        const features = layer.geojson?.features || [];
        const option = {
            id: layer.id,
            name: layer.name,
            featureCount: features.length
        };

        if (requirePolygons || includeFields) {
            option.hasPolygons = features.some((feature) =>
                feature?.geometry?.type === 'Polygon' || feature?.geometry?.type === 'MultiPolygon'
            );
        }

        if (includeFields) {
            option.fields = collectFieldNames(features);
        }

        if (includeSelectionCount) {
            option.selectedCount = ctx.mapService.getSelectionCount?.(layer.id) || 0;
        }

        return option;
    });
}

/**
 * @param {Partial<import('./widget-types.js').WidgetContext>} deps
 * @returns {import('./widget-types.js').WidgetContext}
 */
export function createWidgetContext(deps) {
    return /** @type {import('./widget-types.js').WidgetContext} */ (deps);
}
