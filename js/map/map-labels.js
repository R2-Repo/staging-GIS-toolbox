/**
 * MapLibre text label layer config for GeoJSON sources.
 */

const DEFAULT_LABELS = {
    field: 'station',
    placement: 'point',
    minZoom: 11,
    size: 11,
    offset: [0, 1.1],
    anchor: 'top',
    color: '#111111',
    haloColor: '#ffffff',
    haloWidth: 1.5,
    verticalStack: false,
    rotateField: null,
    lineHeight: 0.95,
    allowOverlap: false,
    ignorePlacement: false
};

/**
 * @param {object} mapLabels
 */
export function normalizeMapLabels(mapLabels) {
    if (!mapLabels?.field) return null;
    return { ...DEFAULT_LABELS, ...mapLabels };
}

/**
 * @param {string} datasetId
 * @param {string} sourceId
 * @param {object} mapLabels
 * @param {boolean} [useCluster]
 */
export function buildMapLabelLayerSpec(datasetId, sourceId, mapLabels, useCluster = false) {
    const cfg = normalizeMapLabels(mapLabels);
    if (!cfg) return null;

    if (cfg.placement === 'line') {
        return buildMapLineLabelLayerSpec(datasetId, sourceId, cfg);
    }

    const labelId = `${datasetId}-labels`;
    const filter = useCluster
        ? ['all', ['==', ['geometry-type'], 'Point'], ['!', ['has', 'point_count']]]
        : ['==', ['geometry-type'], 'Point'];

    const layout = {
        'text-field': ['to-string', ['get', cfg.field]],
        'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
        'text-size': cfg.size,
        'text-offset': cfg.offset,
        'text-anchor': cfg.verticalStack ? (cfg.anchor || 'bottom') : (cfg.anchor || 'top'),
        'text-allow-overlap': cfg.allowOverlap,
        'text-ignore-placement': cfg.ignorePlacement
    };

    if (cfg.verticalStack || cfg.writingMode === 'vertical') {
        layout['text-line-height'] = cfg.lineHeight;
        layout['text-rotation-alignment'] = 'map';
        layout['text-pitch-alignment'] = 'map';
        layout['text-anchor'] = cfg.anchor || 'center';
        layout['text-offset'] = cfg.offset || [0, 0];
        if (cfg.writingMode === 'vertical') {
            layout['text-writing-mode'] = ['vertical'];
        }
        if (cfg.rotateField) {
            layout['text-rotate'] = ['get', cfg.rotateField];
        }
    }

    return {
        id: labelId,
        type: 'symbol',
        source: sourceId,
        filter,
        minzoom: cfg.minZoom,
        layout,
        paint: {
            'text-color': cfg.color,
            'text-halo-color': cfg.haloColor,
            'text-halo-width': cfg.haloWidth
        }
    };
}

/**
 * Line-following labels (symbol-placement: line).
 * @param {string} datasetId
 * @param {string} sourceId
 * @param {object} cfg normalized mapLabels config
 */
export function buildMapLineLabelLayerSpec(datasetId, sourceId, cfg) {
    const labelId = `${datasetId}-line-labels`;

    const layout = {
        'symbol-placement': 'line',
        'text-field': ['to-string', ['get', cfg.field]],
        'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
        'text-size': cfg.size,
        'text-rotation-alignment': 'map',
        'text-pitch-alignment': 'viewport',
        'text-keep-upright': cfg.writingMode === 'vertical' ? false : true,
        'text-allow-overlap': cfg.allowOverlap,
        'text-ignore-placement': cfg.ignorePlacement
    };

    if (cfg.writingMode === 'vertical') {
        layout['text-writing-mode'] = ['vertical'];
    }

    return {
        id: labelId,
        type: 'symbol',
        source: sourceId,
        filter: ['==', ['geometry-type'], 'LineString'],
        minzoom: cfg.minZoom,
        layout,
        paint: {
            'text-color': cfg.color,
            'text-halo-color': cfg.haloColor,
            'text-halo-width': cfg.haloWidth
        }
    };
}
