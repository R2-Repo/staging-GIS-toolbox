/**
 * Import registry — detects format and dispatches to the right importer
 */
import logger from '../core/logger.js';
import { TaskRunner } from '../core/task-runner.js';
import { AppError, ErrorCategory } from '../core/error-handler.js';
import { importGeoJSON } from './geojson-importer.js';
import { importCSV } from './csv-importer.js';
import { importExcel } from './excel-importer.js';
import { importKML } from './kml-importer.js';
import { importKMZ } from './kmz-importer.js';
import { importShapefile } from './shapefile-importer.js';
import { importJSON } from './json-importer.js';

function _xmlTextLooksLikeKml(text) {
    const head = text.trim().slice(0, 12000);
    if (/<kml[\s/>]/i.test(head)) return true;
    if (/http:\/\/www\.opengis\.net\/kml\/2\.[0-3]/i.test(head)) return true;
    if (/urn:googleearth:documentation:/i.test(head)) return true;
    return false;
}

async function importXML(file, task) {
    const text = await file.text();
    if (!_xmlTextLooksLikeKml(text)) {
        throw new AppError(
            'This XML file does not appear to be KML. Expected a root <kml> element (OGC KML namespace).',
            ErrorCategory.UNSUPPORTED_FORMAT,
            { fileName: file.name }
        );
    }
    return importKML(text, task, { sourceFileName: file.name });
}

const FORMAT_MAP = {
    'geojson': importGeoJSON,
    'json': importJSON,
    'csv': importCSV,
    'tsv': importCSV,
    'txt': importCSV,
    'xlsx': importExcel,
    'xls': importExcel,
    'kml': importKML,
    'kmz': importKMZ,
    'zip': importShapefile, // Assume zipped shapefile
    'xml': importXML
};

export function detectFormat(file) {
    const name = file.name.toLowerCase();
    const ext = name.split('.').pop();
    if (ext === 'geojson') return 'geojson';
    if (ext === 'json') return 'json'; // will auto-detect geojson vs table
    if (ext === 'csv' || ext === 'tsv' || ext === 'txt') return 'csv';
    if (ext === 'xlsx' || ext === 'xls') return 'xlsx';
    if (ext === 'kml') return 'kml';
    if (ext === 'kmz') return 'kmz';
    if (ext === 'zip') return 'zip';
    if (ext === 'xml') return 'xml';
    return null;
}

export async function importFile(file) {
    const format = detectFormat(file);
    if (!format) {
        throw new AppError(
            `Unsupported file format: ${file.name}`,
            ErrorCategory.UNSUPPORTED_FORMAT,
            { fileName: file.name }
        );
    }

    const importer = FORMAT_MAP[format];
    if (!importer) {
        throw new AppError(
            `No importer for format: ${format}`,
            ErrorCategory.UNSUPPORTED_FORMAT
        );
    }

    const task = new TaskRunner(`Import ${file.name}`, 'Importer');
    return task.run(async (t) => {
        t.updateProgress(10, `Reading ${file.name}...`);
        logger.info('Importer', 'Starting import', { file: file.name, format, size: file.size });

        const result = await importer(file, t);

        // Log results (handle array returns from multi-layer importers)
        if (Array.isArray(result)) {
            logger.info('Importer', 'Import complete (multi-layer)', {
                file: file.name, format, layers: result.length,
                totalFeatures: result.reduce((sum, r) => sum + (r.geojson?.features?.length || 0), 0)
            });
        } else {
            logger.info('Importer', 'Import complete', {
                file: file.name, format,
                type: result.type,
                features: result.type === 'spatial' ? result.geojson?.features?.length : result.rows?.length,
                fields: result.schema?.fields?.length
            });
        }

        return result;
    });
}

export async function importFiles(files) {
    const results = [];
    const errors = [];
    for (const file of files) {
        try {
            const ds = await importFile(file);
            if (ds) {
                // An importer may return an array of datasets (e.g. multi-layer shapefile)
                if (Array.isArray(ds)) results.push(...ds);
                else results.push(ds);
            }
        } catch (e) {
            errors.push({ file: file.name, error: e });
            logger.error('Importer', 'File import failed', { file: file.name, error: e.message });
        }
    }
    return { datasets: results, errors };
}

export default { importFile, importFiles, detectFormat };
