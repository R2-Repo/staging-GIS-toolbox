/**
 * CSV importer using PapaParse
 * Delimiter detection, headers, type inference, coordinate detection
 */
import { createTableDataset, createSpatialDataset } from '../core/data-model.js';
import { AppError, ErrorCategory } from '../core/error-handler.js';
import { loadPapaParse } from '../core/libs.js';
import { dmsToDd } from '../tools/coordinates.js';
import { yieldToUI } from '../core/task-runner.js';

export const CSV_BATCH_SIZE = 5000;
export const CSV_STEP_YIELD_EVERY = 2000;

/** Parse a coordinate value — handles DD numbers and DMS strings */
function parseCoordValue(val) {
    if (val == null || val === '') return NaN;
    if (typeof val === 'number' && isFinite(val)) return val;
    const s = String(val).trim();
    const n = parseFloat(s);
    if (!isNaN(n) && /^-?\d+\.?\d*$/.test(s)) return n;
    const dms = dmsToDd(s);
    if (dms != null && isFinite(dms)) return dms;
    return n;
}

function _rowHasData(row) {
    return Object.values(row).some((v) => v != null && v !== '');
}

function _buildSpatialDataset(name, file, rows, coordInfo, parseErrors) {
    const features = rows.map((row) => {
        const lat = parseCoordValue(row[coordInfo.latField]);
        const lon = parseCoordValue(row[coordInfo.lonField]);
        const geom = (!isNaN(lat) && !isNaN(lon))
            ? { type: 'Point', coordinates: [lon, lat] }
            : null;
        return { type: 'Feature', geometry: geom, properties: { ...row } };
    });
    const fc = { type: 'FeatureCollection', features };
    const ds = createSpatialDataset(name, fc, {
        file: file.name, format: 'csv',
        coordDetected: coordInfo,
        parseErrors: parseErrors || 0
    });
    ds._coordInfo = coordInfo;
    return ds;
}

export async function importCSV(file, task, options = {}) {
    task.updateProgress(20, 'Loading PapaParse...');

    const papa = await loadPapaParse();
    if (!papa?.parse) {
        throw new AppError('PapaParse library not loaded', ErrorCategory.PARSE_FAILED);
    }

    task.updateProgress(30, 'Parsing CSV...');
    const text = options.text ?? await file.text();
    const name = file.name.replace(/\.(csv|tsv|txt)$/i, '');

    return new Promise((resolve, reject) => {
        const rows = [];
        const errors = [];
        let fields = null;
        let rowCount = 0;
        let coordInfo = null;
        let coordChecked = false;

        papa.parse(text, {
            header: true,
            dynamicTyping: true,
            skipEmptyLines: 'greedy',
            transformHeader: (h) => h.trim(),
            step: (result, parser) => {
                if (result.errors?.length) {
                    errors.push(...result.errors);
                }
                const row = result.data;
                if (!_rowHasData(row)) return;

                if (!fields) {
                    fields = result.meta?.fields || Object.keys(row);
                }

                if (!coordChecked && rows.length < 20) {
                    rows.push(row);
                    if (rows.length === 20) {
                        coordInfo = detectCoordinateColumns(fields, rows);
                        coordChecked = true;
                    }
                } else {
                    if (!coordChecked) {
                        coordInfo = detectCoordinateColumns(fields, rows);
                        coordChecked = true;
                    }
                    rows.push(row);
                }

                rowCount++;
                if (rowCount % CSV_STEP_YIELD_EVERY === 0) {
                    parser.pause();
                    task.updateProgress(
                        30 + Math.min(40, Math.round((rowCount / Math.max(rowCount + 1000, 1)) * 40)),
                        `Parsing CSV… ${rowCount.toLocaleString()} rows`
                    );
                    yieldToUI().then(() => parser.resume());
                }
            },
            complete: async () => {
                try {
                    task.updateProgress(70, 'Building dataset...');

                    if (!coordChecked) {
                        coordInfo = detectCoordinateColumns(fields || [], rows);
                    }

                    const criticalErrors = errors.filter((e) => e.type === 'FieldMismatch');
                    if (criticalErrors.length > rows.length * 0.5 && rows.length > 0) {
                        reject(new AppError('Too many CSV parsing errors', ErrorCategory.PARSE_FAILED, {
                            errors: errors.slice(0, 10)
                        }));
                        return;
                    }

                    if (rows.length === 0) {
                        reject(new AppError('CSV file is empty or has no data rows', ErrorCategory.PARSE_FAILED));
                        return;
                    }

                    const fieldList = fields || Object.keys(rows[0]);

                    if (coordInfo) {
                        let ds;
                        if (rows.length > CSV_BATCH_SIZE) {
                            ds = await _buildSpatialDatasetBatched(name, file, rows, coordInfo, errors.length, task);
                        } else {
                            ds = _buildSpatialDataset(name, file, rows, coordInfo, errors.length);
                        }
                        task.updateProgress(100, 'Done');
                        resolve(ds);
                    } else {
                        const ds = createTableDataset(name, rows, fieldList, {
                            file: file.name, format: 'csv',
                            parseErrors: errors.length || 0
                        });
                        task.updateProgress(100, 'Done');
                        resolve(ds);
                    }
                } catch (err) {
                    reject(err);
                }
            },
            error(err) {
                reject(new AppError('CSV parsing failed: ' + err.message, ErrorCategory.PARSE_FAILED));
            }
        });
    });
}

async function _buildSpatialDatasetBatched(name, file, rows, coordInfo, parseErrors, task) {
    const features = [];
    for (let i = 0; i < rows.length; i += CSV_BATCH_SIZE) {
        task.throwIfCancelled?.();
        const chunk = rows.slice(i, i + CSV_BATCH_SIZE);
        for (const row of chunk) {
            const lat = parseCoordValue(row[coordInfo.latField]);
            const lon = parseCoordValue(row[coordInfo.lonField]);
            const geom = (!isNaN(lat) && !isNaN(lon))
                ? { type: 'Point', coordinates: [lon, lat] }
                : null;
            features.push({ type: 'Feature', geometry: geom, properties: { ...row } });
        }
        task.updateProgress(
            70 + Math.round(((i + chunk.length) / rows.length) * 25),
            `Building features… ${Math.min(i + chunk.length, rows.length).toLocaleString()}/${rows.length.toLocaleString()}`
        );
        await yieldToUI();
    }
    const fc = { type: 'FeatureCollection', features };
    const ds = createSpatialDataset(name, fc, {
        file: file.name, format: 'csv',
        coordDetected: coordInfo,
        parseErrors: parseErrors || 0
    });
    ds._coordInfo = coordInfo;
    return ds;
}

function detectCoordinateColumns(fields, rows) {
    const lower = fields.map((f) => f.toLowerCase());
    const latPatterns = ['lat', 'latitude', 'y', 'lat_dd', 'latitude_dd'];
    const lonPatterns = ['lon', 'lng', 'long', 'longitude', 'x', 'lon_dd', 'longitude_dd'];

    let latField = null;
    let lonField = null;
    for (const p of latPatterns) {
        const idx = lower.findIndex((f) => f === p || f === p.replace('_', ''));
        if (idx >= 0) { latField = fields[idx]; break; }
    }
    for (const p of lonPatterns) {
        const idx = lower.findIndex((f) => f === p || f === p.replace('_', ''));
        if (idx >= 0) { lonField = fields[idx]; break; }
    }

    if (latField && lonField) {
        const sample = rows.slice(0, 20);
        const validCount = sample.filter((r) => {
            const lat = parseCoordValue(r[latField]);
            const lon = parseCoordValue(r[lonField]);
            return !isNaN(lat) && !isNaN(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
        }).length;
        if (validCount >= sample.length * 0.5) {
            return { latField, lonField };
        }
    }
    return null;
}
