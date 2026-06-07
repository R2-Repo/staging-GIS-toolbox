/**
 * Shapefile importer (zipped .shp+.dbf+.shx)
 * Uses shpjs library
 */
import { createSpatialDataset, explodeGeometryCollectionsInFeatureCollectionAsync } from '../core/data-model.js';
import { AppError, ErrorCategory } from '../core/error-handler.js';
import { loadShpjs } from '../core/libs.js';

async function _normalizeFeatureCollection(fc, task) {
    fc.features = fc.features.map(f => ({
        type: 'Feature',
        geometry: f.geometry || null,
        properties: f.properties || {}
    }));
    return explodeGeometryCollectionsInFeatureCollectionAsync(fc, task);
}

export async function importShapefile(file, task) {
    task.updateProgress(10, 'Loading shapefile library...');

    const shp = await loadShpjs();
    if (typeof shp !== 'function') {
        throw new AppError('Shapefile (shpjs) library not loaded', ErrorCategory.PARSE_FAILED);
    }

    task.updateProgress(20, 'Reading ZIP...');
    const buffer = await file.arrayBuffer();

    task.updateProgress(40, 'Parsing shapefile...');
    let geojson;
    try {
        geojson = await shp(buffer);
    } catch (e) {
        throw new AppError('Failed to parse shapefile: ' + e.message, ErrorCategory.PARSE_FAILED, {
            hint: 'Ensure the ZIP contains .shp, .dbf, and .shx files'
        });
    }

    task.updateProgress(80, 'Normalizing...');

    const baseName = file.name.replace(/\.zip$/i, '');

    // shpjs can return a single FeatureCollection or array of them
    if (Array.isArray(geojson)) {
        const datasets = [];
        for (let i = 0; i < geojson.length; i++) {
            const fc = geojson[i];
            if (!fc || fc.type !== 'FeatureCollection' || !fc.features?.length) continue;
            const normalized = await _normalizeFeatureCollection(fc, task);
            const layerName = fc.fileName
                ? fc.fileName.replace(/\.\w+$/, '')
                : (geojson.length > 1 ? `${baseName}_${i + 1}` : baseName);
            datasets.push(createSpatialDataset(layerName, normalized, { file: file.name, format: 'shapefile' }));
        }
        if (datasets.length === 0) {
            throw new AppError('Shapefile ZIP contained no valid layers', ErrorCategory.PARSE_FAILED);
        }
        return datasets;
    }

    if (!geojson || geojson.type !== 'FeatureCollection') {
        throw new AppError('Shapefile produced invalid GeoJSON', ErrorCategory.PARSE_FAILED);
    }

    const normalized = await _normalizeFeatureCollection(geojson, task);

    return createSpatialDataset(
        baseName,
        normalized,
        { file: file.name, format: 'shapefile' }
    );
}
