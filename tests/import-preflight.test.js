import { describe, it, expect } from 'vitest';
import {
    preflightFile,
    preflightFiles,
    PREFLIGHT_LEVEL,
    TEXT_SOFT_BYTES,
    TEXT_HARD_BYTES,
    TEXT_STRONG_BYTES,
    BINARY_HARD_BYTES
} from '../js/import/import-preflight.js';
import {
    estimateImportPeakBytes,
    checkEstimatedMemoryBudget,
    ESTIMATED_PEAK_REJECT_BYTES
} from '../js/import/import-memory-budget.js';
import { buildImportSummary } from '../js/import/import-summary.js';

describe('import-preflight', () => {
    it('flags soft warning for moderately large text files', () => {
        const file = new File([new Uint8Array(TEXT_SOFT_BYTES)], 'big.geojson');
        Object.defineProperty(file, 'size', { value: TEXT_SOFT_BYTES });
        const r = preflightFile(file);
        expect(r.level).toBe(PREFLIGHT_LEVEL.SOFT);
    });

    it('rejects text files at strong threshold', () => {
        const file = new File(['x'], 'big.geojson');
        Object.defineProperty(file, 'size', { value: TEXT_STRONG_BYTES });
        const r = preflightFile(file);
        expect(r.level).toBe(PREFLIGHT_LEVEL.REJECT);
    });

    it('rejects text files over text hard limit', () => {
        const file = new File(['x'], 'huge.geojson');
        Object.defineProperty(file, 'size', { value: TEXT_HARD_BYTES + 1 });
        const r = preflightFiles([file]);
        expect(r.reject).toBe(true);
    });

    it('rejects binary files over binary hard limit', () => {
        const file = new File(['x'], 'huge.zip');
        Object.defineProperty(file, 'size', { value: BINARY_HARD_BYTES + 1 });
        const r = preflightFiles([file]);
        expect(r.reject).toBe(true);
    });
});

describe('import-memory-budget', () => {
    it('estimates higher peak for csv than raw bytes', () => {
        const file = { name: 'a.csv', size: 1024 * 1024 };
        expect(estimateImportPeakBytes(file)).toBeGreaterThan(file.size);
    });

    it('rejects when estimated peak exceeds cap', async () => {
        const file = new File(['x'], 'big.geojson');
        Object.defineProperty(file, 'size', { value: Math.ceil(ESTIMATED_PEAK_REJECT_BYTES / 12) + 1 });
        const r = await checkEstimatedMemoryBudget([file]);
        expect(r.ok).toBe(false);
    });
});

describe('import-summary', () => {
    it('builds summary lines', () => {
        const summary = buildImportSummary({
            expanded: [{ type: 'spatial', name: 'a', geojson: { features: [{}, {}] } }],
            totalFiltered: 1,
            errors: [{ file: 'b.csv', error: new Error('bad') }],
            fenceBbox: [0, 0, 1, 1]
        });
        expect(summary.layerCount).toBe(1);
        expect(summary.featureCount).toBe(2);
    });
});
