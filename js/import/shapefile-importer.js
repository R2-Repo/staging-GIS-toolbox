/**
 * Shapefile importer (zipped .shp+.dbf+.shx)
 */
import { createSpatialDataset, explodeGeometryCollectionsInFeatureCollectionAsync } from '../core/data-model.js';
import { AppError, ErrorCategory } from '../core/error-handler.js';
import { parseShapefileForImport } from './import-parse-service.js';

async function _normalizeFeatureCollection(fc, task) {
    fc.features = fc.features.map(f => ({
        type: 'Feature',
        geometry: f.geometry || null,
        properties: f.properties || {}
    }));
    return explodeGeometryCollectionsInFeatureCollectionAsync(fc, task);
}

export async function importShapefile(file, task, options = {}) {
    task.updateProgress(10, 'Loading shapefile library...');
    task.updateProgress(20, 'Reading ZIP...');
    const buffer = options.buffer ?? await file.arrayBuffer();

    task.updateProgress(40, 'Parsing shapefile...');
    let parsed;
    try {
        parsed = await parseShapefileForImport(buffer);
    } catch (e) {
        throw new AppError(e.message, ErrorCategory.PARSE_FAILED, {
            hint: 'Ensure the ZIP contains .shp, .dbf, and .shx files'
        });
    }

    task.updateProgress(80, 'Normalizing...');
    const baseName = file.name.replace(/\.zip$/i, '');

    if (parsed.layers) {
        const datasets = [];
        for (let i = 0; i < parsed.layers.length; i++) {
            const layer = parsed.layers[i];
            const normalized = await _normalizeFeatureCollection(layer.geojson, task);
            const layerName = layer.fileName
                ? layer.fileName.replace(/\.\w+$/, '')
                : (parsed.layers.length > 1 ? `${baseName}_${i + 1}` : baseName);
            datasets.push(createSpatialDataset(layerName, normalized, { file: file.name, format: 'shapefile' }));
        }
        if (datasets.length === 0) {
            throw new AppError('Shapefile ZIP contained no valid layers', ErrorCategory.PARSE_FAILED);
        }
        return datasets;
    }

    const normalized = await _normalizeFeatureCollection(parsed.geojson, task);
    return createSpatialDataset(baseName, normalized, { file: file.name, format: 'shapefile' });
}
