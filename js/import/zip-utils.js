/**
 * Shared ZIP path helpers for KMZ import and in-archive link resolution.
 */

export function normalizeZipPath(p) {
    return p.replace(/\\/g, '/');
}

export function dirnameInZip(p) {
    const n = normalizeZipPath(p);
    const i = n.lastIndexOf('/');
    return i <= 0 ? '' : n.slice(0, i + 1);
}

export function resolveZipInternalHref(mainKmlPath, href) {
    const h = href.trim();
    if (!h || /^(https?:|data:|blob:|\/\/)/i.test(h) || h.startsWith('#')) return null;
    const dir = dirnameInZip(mainKmlPath);
    const combined = dir + h.replace(/^\.\//, '');
    const parts = combined.split('/').filter(Boolean);
    const stack = [];
    for (const part of parts) {
        if (part === '..') stack.pop();
        else if (part !== '.') stack.push(part);
    }
    return stack.join('/');
}

/**
 * Read a .kml file from a KMZ zip by relative href (one hop, same archive).
 * @param {import('jszip')} zip
 * @param {string} mainKmlPath
 * @param {string} href
 */
export async function readKmlFromKmzZip(zip, mainKmlPath, href) {
    const resolved = resolveZipInternalHref(mainKmlPath, href);
    if (!resolved || !resolved.toLowerCase().endsWith('.kml')) return null;

    const pathMap = new Map();
    zip.forEach((relPath, entry) => {
        if (!entry.dir) pathMap.set(normalizeZipPath(relPath).toLowerCase(), entry);
    });

    const entry = pathMap.get(resolved.toLowerCase());
    if (!entry) return null;
    return entry.async('string');
}

/**
 * @param {import('jszip')} zip
 * @param {string} mainKmlPath
 */
export function createKmzLinkResolver(zip, mainKmlPath) {
    return (href) => readKmlFromKmzZip(zip, mainKmlPath, href);
}
