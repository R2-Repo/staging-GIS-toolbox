/**
 * Shared post-import pipeline — normalize importer output, expand mixed geometry,
 * apply fence/style prep before map render. Used by main import, workflow, dual-screen.
 */
import booleanIntersects from '@turf/boolean-intersects';
import bboxPolygon from '@turf/bbox-polygon';
import logger from '../core/logger.js';
import { analyzeSchema, splitByGeometryType } from '../core/data-model.js';
import { isSmartStyleActive } from '../map/style-engine.js';
import { getLayerDefaultColor } from '../map/layer-palette.js';
import { detectEmbeddedSimpleStyle, convertLayerSimpleStyleToSmart } from '../map/style-import.js';

/**
 * @param {object|object[]|null|undefined} result
 * @returns {object[]}
 */
export function normalizeImporterResult(result) {
    if (!result) return [];
    return Array.isArray(result) ? result : [result];
}

/**
 * @param {object[]} datasets
 * @returns {object[]}
 */
export function expandMixedGeometryDatasets(datasets) {
    const expanded = [];
    for (const ds of datasets) {
        if (ds.type === 'spatial' && ds.schema?.geometryType === 'Mixed') {
            expanded.push(...splitByGeometryType(ds));
        } else {
            expanded.push(ds);
        }
    }
    return expanded;
}

/**
 * @param {object} dataset
 * @param {[number, number, number, number]|null} bbox [west, south, east, north]
 */
export function filterDatasetByFence(dataset, bbox) {
    if (!bbox || dataset.type !== 'spatial' || !dataset.geojson?.features?.length) return dataset;

    const [west, south, east, north] = bbox;
    const fencePoly = bboxPolygon([west, south, east, north]);

    const before = dataset.geojson.features.length;
    dataset.geojson.features = dataset.geojson.features.filter((f) => {
        try {
            return booleanIntersects(f, fencePoly);
        } catch {
            return true;
        }
    });
    const after = dataset.geojson.features.length;

    if (before !== after) {
        logger.info('ImportFence', `Filtered ${before} → ${after} features (${before - after} outside fence)`);
        dataset.schema = analyzeSchema(dataset.geojson);
    }

    return dataset;
}

/**
 * Revoke blob: URLs created during KMZ asset rewriting.
 * @param {object} dataset
 */
export function revokeKmzBlobUrls(dataset) {
    const urls = dataset?._blobUrls;
    if (!Array.isArray(urls)) return;
    for (const url of urls) {
        try {
            URL.revokeObjectURL(url);
        } catch {
            /* ignore */
        }
    }
    delete dataset._blobUrls;
}

/**
 * Copy import-time metadata from a full dataset onto a target (e.g. workflow cache).
 * @param {object} source
 * @returns {object}
 */
export function extractImportMetadata(source) {
    const meta = {};
    if (source._kmlStyle) meta._kmlStyle = { ...source._kmlStyle };
    if (source._importWarning) meta._importWarning = source._importWarning;
    if (source._networkLinkHrefs?.length) meta._networkLinkHrefs = [...source._networkLinkHrefs];
    if (source._blobUrls?.length) meta._blobUrls = [...source._blobUrls];
    return meta;
}

/**
 * @param {object} target
 * @param {object} meta
 */
export function applyImportMetadata(target, meta) {
    if (!meta) return target;
    if (meta._kmlStyle) target._kmlStyle = meta._kmlStyle;
    if (meta._importWarning) target._importWarning = meta._importWarning;
    if (meta._networkLinkHrefs) target._networkLinkHrefs = meta._networkLinkHrefs;
    if (meta._blobUrls) target._blobUrls = meta._blobUrls;
    return target;
}

/**
 * Build a workflow-safe cache object from an imported dataset.
 * @param {object} dataset
 */
export function serializeImportedDataset(dataset) {
    if (dataset.type === 'spatial') {
        return {
            type: 'spatial',
            geojson: dataset.geojson,
            schema: dataset.schema,
            name: dataset.name,
            ...extractImportMetadata(dataset)
        };
    }
    return {
        type: 'table',
        rows: dataset.rows,
        schema: dataset.schema,
        name: dataset.name
    };
}

/**
 * Apply KML uniform style, then smart categorical style when per-feature colors vary.
 * Call after the layer is on the map (restyleLayer re-renders the map layer).
 * KML _kmlStyle is the layer default; varying stroke/fill/marker-color wins via smart mode.
 *
 * @param {object} ds spatial dataset
 * @param {{ mapService: object, getLayers: () => object[], layerIndex?: number }} options
 */
export function applyImportLayerStyles(ds, options) {
    const { mapService, getLayers, layerIndex } = options;
    if (ds.type !== 'spatial') return ds;

    if (ds._kmlStyle && !mapService.getLayerStyle(ds.id)) {
        mapService.setLayerStyle(ds.id, { ...ds._kmlStyle });
    }

    if (ds.geojson?.features?.length) {
        const detection = detectEmbeddedSimpleStyle(ds.geojson.features);
        if (detection?.hasSimpleStyle && detection.varyingProperty) {
            const existing = mapService.getLayerStyle(ds.id);
            if (!isSmartStyleActive(existing)) {
                const idx = layerIndex ?? getLayers().indexOf(ds);
                const defaultColor = getLayerDefaultColor(idx);
                const converted = convertLayerSimpleStyleToSmart(ds, defaultColor);
                if (converted) {
                    mapService.restyleLayer(ds.id, ds, converted);
                }
            }
        }
    }

    return ds;
}

/** @deprecated alias — use applyImportLayerStyles after map add */
export const prepareSpatialDatasetForMap = applyImportLayerStyles;

/**
 * @param {object[]} datasets
 * @param {{ fenceBbox?: [number,number,number,number]|null }} [options]
 * @returns {{ expanded: object[], totalFiltered: number }}
 */
export function finalizeImportedDatasets(datasets, options = {}) {
    const { fenceBbox } = options;
    const expanded = expandMixedGeometryDatasets(datasets);
    let totalFiltered = 0;

    for (const ds of expanded) {
        if (fenceBbox && ds.type === 'spatial') {
            const before = ds.geojson?.features?.length || 0;
            filterDatasetByFence(ds, fenceBbox);
            totalFiltered += before - (ds.geojson?.features?.length || 0);
        }
    }

    return { expanded, totalFiltered };
}

export default {
    normalizeImporterResult,
    expandMixedGeometryDatasets,
    filterDatasetByFence,
    revokeKmzBlobUrls,
    extractImportMetadata,
    applyImportMetadata,
    serializeImportedDataset,
    applyImportLayerStyles,
    prepareSpatialDatasetForMap,
    finalizeImportedDatasets
};
