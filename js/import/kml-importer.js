/**
 * KML importer using toGeoJSON library
 * Preserves KML inline styles (stroke, fill, icon) as dataset._kmlStyle
 */
import { createSpatialDataset, explodeGeometryCollectionsInFeatureCollectionAsync } from '../core/data-model.js';
import { AppError, ErrorCategory } from '../core/error-handler.js';
import { loadToGeoJSON } from '../core/libs.js';
import { collectNetworkLinkHrefs } from './kml-networklink.js';

/**
 * @param {File|string} file - File or KML string (e.g. from KMZ)
 * @param {import('../core/task-runner.js').TaskRunner} task
 * @param {{ sourceFileName?: string }} [meta]
 */
export async function importKML(file, task, meta = {}) {
    task.updateProgress(20, 'Reading KML...');

    let text;
    if (typeof file === 'string') {
        text = file;
    } else {
        text = await file.text();
    }

    task.updateProgress(50, 'Parsing KML to GeoJSON...');

    const parser = new DOMParser();
    const kmlDoc = parser.parseFromString(text, 'text/xml');

    const parseError = kmlDoc.querySelector('parsererror');
    if (parseError) {
        throw new AppError('Invalid KML/XML', ErrorCategory.PARSE_FAILED, {
            detail: parseError.textContent?.slice(0, 200)
        });
    }

    const toGeoJsonLib = await loadToGeoJSON();
    if (!toGeoJsonLib?.kml) {
        throw new AppError('toGeoJSON library not loaded', ErrorCategory.PARSE_FAILED);
    }

    let geojson;
    try {
        geojson = toGeoJsonLib.kml(kmlDoc);
    } catch (e) {
        throw new AppError('Failed to convert KML to GeoJSON: ' + e.message, ErrorCategory.PARSE_FAILED);
    }

    if (!geojson || !Array.isArray(geojson.features)) {
        geojson = { type: 'FeatureCollection', features: [] };
    }

    // KML MultiGeometry → GeoJSON GeometryCollection; explode at import so the layer
    // schema and all map/dataprep paths see plain LineString / Polygon features.
    geojson = await explodeGeometryCollectionsInFeatureCollectionAsync(geojson, task);

    const networkHrefs = collectNetworkLinkHrefs(kmlDoc);
    const featCount = geojson.features.length;

    task.updateProgress(80, 'Extracting styles...');

    const kmlStyle = featCount > 0 ? _extractKmlStyle(geojson.features) : null;

    task.updateProgress(90, 'Building dataset...');
    const defaultName = typeof file === 'string'
        ? (meta.sourceFileName || 'KML_Layer').replace(/\.(kml|xml|kmz)$/i, '')
        : file.name.replace(/\.(kml|xml)$/i, '');
    const sourceFile = typeof file === 'string'
        ? (meta.sourceFileName || 'extracted.kml')
        : file.name;

    const dataset = createSpatialDataset(defaultName, geojson, {
        file: sourceFile,
        format: 'kml'
    });

    if (kmlStyle) dataset._kmlStyle = kmlStyle;

    if (featCount === 0 && networkHrefs.length > 0) {
        dataset._networkLinkHrefs = networkHrefs;
        dataset._importWarning =
            'KML has no direct features but contains network links. You can try resolving them (CORS may block some URLs).';
    } else if (featCount === 0) {
        dataset._importWarning = 'KML contains no placemarks or geometries. An empty layer was created.';
    }

    return dataset;
}

/**
 * Extract a unified style object from KML feature properties.
 * toGeoJSON puts KML style info into feature props: stroke, stroke-width,
 * stroke-opacity, fill, fill-opacity.
 */
function _extractKmlStyle(features) {
    let strokeColor = null, fillColor = null;
    let strokeWidth = null, strokeOpacity = null, fillOpacity = null;

    for (const f of features) {
        const p = f.properties || {};
        if (!strokeColor && p.stroke) strokeColor = p.stroke;
        if (!fillColor && p.fill) fillColor = p.fill;
        if (strokeWidth == null && p['stroke-width'] != null) strokeWidth = parseFloat(p['stroke-width']);
        if (strokeOpacity == null && p['stroke-opacity'] != null) strokeOpacity = parseFloat(p['stroke-opacity']);
        if (fillOpacity == null && p['fill-opacity'] != null) fillOpacity = parseFloat(p['fill-opacity']);
        if (strokeColor && fillColor && strokeWidth != null && strokeOpacity != null && fillOpacity != null) break;
    }

    if (!strokeColor && !fillColor && strokeWidth == null) return null;

    const style = {};
    if (strokeColor) style.strokeColor = strokeColor;
    if (fillColor) style.fillColor = fillColor;
    else if (strokeColor) style.fillColor = strokeColor;
    if (strokeWidth != null && !isNaN(strokeWidth)) {
        // KML often carries width 0; MapLibre draws nothing visible at 0px.
        style.strokeWidth = strokeWidth > 0 ? strokeWidth : 1;
    }
    // stroke-opacity 0 is common when outline is disabled in KML; keep map default visibility.
    if (strokeOpacity != null && !isNaN(strokeOpacity) && strokeOpacity > 0) {
        style.strokeOpacity = strokeOpacity;
    }
    if (fillOpacity != null && !isNaN(fillOpacity)) style.fillOpacity = fillOpacity;

    return style;
}
