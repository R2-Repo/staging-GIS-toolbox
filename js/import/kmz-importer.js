/**
 * KMZ importer — unzip and extract KML
 */
import { importKML } from './kml-importer.js';
import { AppError, ErrorCategory } from '../core/error-handler.js';
import { loadJSZip } from '../core/libs.js';
import logger from '../core/logger.js';
import { createKmzLinkResolver, normalizeZipPath, resolveZipInternalHref } from './zip-utils.js';

/**
 * Pick the primary KML entry inside a KMZ (doc.kml at root, then nested doc.kml, then heuristic).
 * @param {import('jszip').JSZip.JSZipObject[]} kmlEntries
 */
function _chooseMainKmlEntry(kmlEntries) {
    if (kmlEntries.length === 1) {
        return { entry: kmlEntries[0], reason: 'only-kml' };
    }
    const norm = e => normalizeZipPath(e.name);
    const rootDoc = kmlEntries.find(e => norm(e).toLowerCase() === 'doc.kml');
    if (rootDoc) return { entry: rootDoc, reason: 'root-doc.kml' };
    const nestedDoc = kmlEntries.find(e => norm(e).toLowerCase().endsWith('/doc.kml'));
    if (nestedDoc) return { entry: nestedDoc, reason: 'nested-doc.kml' };
    const sorted = [...kmlEntries].sort((a, b) => {
        const da = norm(a).split('/').filter(Boolean).length;
        const db = norm(b).split('/').filter(Boolean).length;
        if (da !== db) return da - db;
        const sa = a._data?.uncompressedSize ?? 0;
        const sb = b._data?.uncompressedSize ?? 0;
        if (sb !== sa) return sb - sa;
        return norm(a).length - norm(b).length;
    });
    return { entry: sorted[0], reason: 'heuristic-shallow-largest' };
}

function _guessMimeFromPath(p) {
    const low = p.toLowerCase();
    if (low.endsWith('.png')) return 'image/png';
    if (low.endsWith('.jpg') || low.endsWith('.jpeg')) return 'image/jpeg';
    if (low.endsWith('.gif')) return 'image/gif';
    if (low.endsWith('.webp')) return 'image/webp';
    if (low.endsWith('.svg')) return 'image/svg+xml';
    if (low.endsWith('.kml')) return 'application/vnd.google-earth.kml+xml';
    return 'application/octet-stream';
}

/**
 * Rewrite relative <href> targets inside KML to blob: URLs for files found in the KMZ.
 * @param {string[]} [blobUrls] - collects created blob URLs for later revoke
 */
async function _rewriteKmzEmbeddedHrefs(kmlText, zip, mainKmlPath, task, blobUrls = []) {
    const pathMap = new Map();
    zip.forEach((relPath, entry) => {
        if (entry.dir) return;
        pathMap.set(normalizeZipPath(relPath).toLowerCase(), entry);
    });

    const re = /<href>\s*([^<]+?)\s*<\/href>/gi;
    const targets = [];
    const seenRaw = new Set();
    let m;
    while ((m = re.exec(kmlText)) !== null) {
        const raw = m[1].trim();
        if (/^(https?:|data:|blob:)/i.test(raw) || raw.startsWith('#')) continue;
        if (seenRaw.has(raw)) continue;
        seenRaw.add(raw);
        const resolved = resolveZipInternalHref(mainKmlPath, raw);
        if (resolved) targets.push({ raw, resolved });
    }

    let out = kmlText;
    let n = 0;
    for (const { raw, resolved } of targets) {
        const entry = pathMap.get(resolved.toLowerCase());
        if (!entry) continue;
        try {
            const buf = await entry.async('arraybuffer');
            const blob = new Blob([buf], { type: _guessMimeFromPath(resolved) });
            const url = URL.createObjectURL(blob);
            blobUrls.push(url);
            const escRaw = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            out = out.replace(new RegExp(`<href>\\s*${escRaw}\\s*</href>`, 'gi'), `<href>${url}</href>`);
            n++;
            if (n <= 5) {
                task?.updateProgress(52 + n, `Resolved in-archive asset (${n})…`);
            }
        } catch {
            /* skip unreadable entry */
        }
    }
    if (n > 0) {
        logger.info('Importer', 'KMZ embedded hrefs rewritten', { count: n, mainKmlPath });
    }
    return out;
}

export async function importKMZ(file, task) {
    task.updateProgress(10, 'Loading JSZip...');

    const JSZipLib = await loadJSZip();
    if (!JSZipLib?.loadAsync) {
        throw new AppError('JSZip library not loaded', ErrorCategory.PARSE_FAILED);
    }

    task.updateProgress(20, 'Extracting KMZ...');
    const buffer = await file.arrayBuffer();
    let zip;
    try {
        zip = await JSZipLib.loadAsync(buffer);
    } catch (e) {
        throw new AppError('Failed to unzip KMZ: ' + e.message, ErrorCategory.PARSE_FAILED);
    }

    const kmlFiles = [];
    zip.forEach((path, entry) => {
        if (path.toLowerCase().endsWith('.kml') && !entry.dir) {
            kmlFiles.push(entry);
        }
    });

    if (kmlFiles.length === 0) {
        throw new AppError('KMZ contains no KML file', ErrorCategory.PARSE_FAILED);
    }

    task.updateProgress(50, 'Reading KML from KMZ...');
    const { entry: mainKml, reason } = _chooseMainKmlEntry(kmlFiles);
    logger.info('Importer', 'KMZ main KML chosen', { entry: mainKml.name, reason });

    const blobUrls = [];
    let kmlContent = await mainKml.async('string');
    kmlContent = await _rewriteKmzEmbeddedHrefs(kmlContent, zip, mainKml.name, task, blobUrls);

    task.updateProgress(70, 'Parsing KML...');
    const dataset = await importKML(kmlContent, task, { sourceFileName: file.name });
    dataset.name = file.name.replace(/\.kmz$/i, '');
    dataset.source.file = file.name;
    dataset.source.format = 'kmz';

    if (blobUrls.length > 0) {
        dataset._blobUrls = blobUrls;
    }
    dataset._kmzLinkResolver = createKmzLinkResolver(zip, mainKml.name);

    return dataset;
}
