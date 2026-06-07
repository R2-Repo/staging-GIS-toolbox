/**
 * User-facing copy when imports use size-reduction / optimized paths.
 * Inline text only — no toasts or extra modals.
 */
import { formatBytes, PREFLIGHT_LEVEL } from './import-preflight.js';
import { WORKSPACE_FEATURE_THRESHOLD } from '../workspace/workspace-store.js';

/** @param {File|{ name: string, size?: number }} file */
export function formatFileSizeLabel(file) {
    return formatBytes(file?.size ?? 0);
}

/**
 * Optimizer dialog — file exceeded soft size threshold.
 * @param {Array<{ fileName?: string, sizeLabel?: string, preflight?: { message?: string }, warnings?: string[] }>} [scans]
 */
export function buildOptimizerReductionNotice(scans = []) {
    const fileLines = scans.map((s) => {
        const name = s.fileName || 'File';
        const size = s.sizeLabel || '';
        return size ? `${name} (${size})` : name;
    });

    return {
        heading: 'File too large for a standard import',
        intro: fileLines.length
            ? `The following ${fileLines.length === 1 ? 'file is' : 'files are'} larger than recommended for loading entirely into browser memory: ${fileLines.join('; ')}.`
            : 'This file is larger than recommended for loading entirely into browser memory.',
        planIntro: 'To import safely, the app will reduce what is kept in memory:',
        bullets: [
            'Stream data to local storage instead of holding the full dataset in RAM',
            'Store only the attributes you select below',
            'Render the map from the current viewport (pan/zoom loads more as needed)',
            'For KML/KMZ, use GIS mode to strip styling, icons, and long descriptions'
        ],
        footer: 'Review the options below, then click Import to continue with the reduced import.'
    };
}

/**
 * Standard import flow — file size OK but feature count triggers workspace path.
 * @param {Array<{ featureEstimate?: number|null }>} [scans]
 */
export function buildLargeDatasetNotice(scans = []) {
    const estimates = scans
        .map((s) => s.featureEstimate)
        .filter((n) => n != null && n > 0);
    const maxEst = estimates.length ? Math.max(...estimates) : null;
    const estLabel = maxEst != null ? ` (~${maxEst.toLocaleString()} features detected)` : '';

    return {
        heading: 'Large dataset — optimized import',
        intro: `This dataset${estLabel} is large enough that a full in-memory import could fail or freeze the browser.`,
        planIntro: 'Import will automatically reduce memory use:',
        bullets: [
            'Stream features to local storage',
            'Store only the attributes you select below',
            'Draw the map from the visible area first'
        ],
        footer: null
    };
}

/** @param {Array<{ preflight?: { level?: string }, featureEstimate?: number|null }>} scans */
export function scansNeedLargeDatasetNotice(scans = []) {
    return scans.some((s) => (s.featureEstimate ?? 0) >= WORKSPACE_FEATURE_THRESHOLD);
}

/**
 * @param {number} featureCount
 */
export function buildArcgisLargeLayerNotice(featureCount) {
    const countLabel = Number(featureCount).toLocaleString();
    return {
        heading: 'Layer too large for a standard import',
        intro: `This ArcGIS layer has ${countLabel} features — too many to load entirely into browser memory at once.`,
        planIntro: 'To import safely, the download will be reduced:',
        bullets: [
            'Stream features to local storage on your device',
            'Store only the attributes you chose',
            'Render the map from the current viewport; pan and zoom to see more',
            'Import may take several minutes'
        ],
        footer: 'Click Continue to start the optimized download.'
    };
}

/**
 * Inline notice for ArcGIS field picker when layer is large but below hard confirm threshold.
 * @param {number|null|undefined} featureCount
 */
export function buildArcgisFieldPickerNotice(featureCount) {
    const count = Number(featureCount);
    if (!Number.isFinite(count) || count <= 0) return null;
    if (count >= 250_000) {
        return {
            heading: 'Large ArcGIS layer',
            intro: `This layer has ${count.toLocaleString()} features — too large for a standard in-memory import.`,
            planIntro: 'Select the attributes you need below. On the next step you will confirm an optimized download that streams data to local storage.',
            bullets: [],
            footer: null
        };
    }
    if (count >= WORKSPACE_FEATURE_THRESHOLD) {
        return {
            heading: 'Large layer — optimized import',
            intro: `This layer has ${count.toLocaleString()} features — too many to hold entirely in browser memory.`,
            planIntro: 'After you continue, the import will:',
            bullets: [
                'Download only the attributes you select below',
                'Stream features to local storage',
                'Draw the map from the visible area first'
            ],
            footer: null
        };
    }
    return null;
}

export function buildImportProgressReductionNotice() {
    return 'Using optimized import — streaming data and storing only what you selected.';
}

/**
 * Render notice fields as plain text lines (for progress step suffix).
 * @param {{ intro?: string, planIntro?: string, bullets?: string[] }} notice
 */
export function noticeToProgressHint(notice) {
    if (!notice?.intro) return buildImportProgressReductionNotice();
    return notice.intro;
}

export { PREFLIGHT_LEVEL };
