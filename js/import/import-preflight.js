/**
 * Pre-import checks — file size warnings before heavy parse work.
 */

export const PREFLIGHT_SOFT_BYTES = 25 * 1024 * 1024;
export const PREFLIGHT_STRONG_BYTES = 100 * 1024 * 1024;
export const PREFLIGHT_HARD_BYTES = 250 * 1024 * 1024;

export const PREFLIGHT_LEVEL = {
    OK: 'ok',
    SOFT: 'soft',
    STRONG: 'strong',
    REJECT: 'reject'
};

/**
 * @param {File} file
 * @returns {{ level: string, message?: string, sizeBytes: number }}
 */
export function preflightFile(file) {
    const sizeBytes = file.size ?? 0;
    if (sizeBytes >= PREFLIGHT_HARD_BYTES) {
        return {
            level: PREFLIGHT_LEVEL.REJECT,
            sizeBytes,
            message: `"${file.name}" is ${formatBytes(sizeBytes)} — exceeds the ${formatBytes(PREFLIGHT_HARD_BYTES)} browser limit. Try a smaller file or simplify the data externally.`
        };
    }
    if (sizeBytes >= PREFLIGHT_STRONG_BYTES) {
        return {
            level: PREFLIGHT_LEVEL.STRONG,
            sizeBytes,
            message: `"${file.name}" is ${formatBytes(sizeBytes)}. Import may be very slow or cause the browser tab to run out of memory.`
        };
    }
    if (sizeBytes >= PREFLIGHT_SOFT_BYTES) {
        return {
            level: PREFLIGHT_LEVEL.SOFT,
            sizeBytes,
            message: `"${file.name}" is ${formatBytes(sizeBytes)}. Import may take a while.`
        };
    }
    return { level: PREFLIGHT_LEVEL.OK, sizeBytes };
}

/**
 * @param {File[]} files
 * @returns {{ level: string, messages: string[], reject: boolean, files: Array<{ name: string, sizeBytes: number, level: string }> }}
 */
export function preflightFiles(files) {
    const results = files.map((f) => ({ file: f, ...preflightFile(f) }));
    const messages = results.filter((r) => r.message).map((r) => r.message);
    const reject = results.some((r) => r.level === PREFLIGHT_LEVEL.REJECT);
    const level = reject
        ? PREFLIGHT_LEVEL.REJECT
        : results.some((r) => r.level === PREFLIGHT_LEVEL.STRONG)
            ? PREFLIGHT_LEVEL.STRONG
            : results.some((r) => r.level === PREFLIGHT_LEVEL.SOFT)
                ? PREFLIGHT_LEVEL.SOFT
                : PREFLIGHT_LEVEL.OK;

    return {
        level,
        messages,
        reject,
        files: results.map((r) => ({
            name: r.file.name,
            sizeBytes: r.sizeBytes,
            level: r.level
        }))
    };
}

export function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default { preflightFile, preflightFiles, formatBytes, PREFLIGHT_LEVEL };
