import { describe, it, expect } from 'vitest';
import { guardFilesBeforeImport } from '../js/import/import-guard.js';
import {
    TEXT_HARD_BYTES,
    BINARY_HARD_BYTES,
    TEXT_STRONG_BYTES
} from '../js/import/import-preflight.js';
import {
    estimateImportPeakBytes,
    ESTIMATED_PEAK_REJECT_BYTES,
    MAX_READ_BYTES_TEXT,
    assertFileReadable
} from '../js/import/import-memory-budget.js';
import { AppError } from '../js/core/error-handler.js';

describe('import-guard', () => {
    it('throws AppError for rejected file sizes', async () => {
        const file = new File(['x'], 'huge.geojson');
        Object.defineProperty(file, 'size', { value: TEXT_HARD_BYTES + 1 });

        await expect(guardFilesBeforeImport([file])).rejects.toBeInstanceOf(AppError);
    });

    it('throws when estimated peak memory exceeds budget', async () => {
        const file = new File(['x'], 'dense.geojson');
        const size = Math.ceil(ESTIMATED_PEAK_REJECT_BYTES / 12) + 1;
        Object.defineProperty(file, 'size', { value: size });

        expect(estimateImportPeakBytes(file)).toBeGreaterThan(ESTIMATED_PEAK_REJECT_BYTES);

        await expect(guardFilesBeforeImport([file])).rejects.toBeInstanceOf(AppError);
    });

    it('allows small files through', async () => {
        const file = new File(['{"type":"FeatureCollection","features":[]}'], 'tiny.geojson');
        Object.defineProperty(file, 'size', { value: 1024 });

        const result = await guardFilesBeforeImport([file], { skipMemoryBudget: true });
        expect(result.cancelled).toBe(false);
    });

    it('rejects binary files over binary hard limit', async () => {
        const file = new File(['x'], 'huge.zip');
        Object.defineProperty(file, 'size', { value: BINARY_HARD_BYTES + 1 });

        await expect(guardFilesBeforeImport([file])).rejects.toBeInstanceOf(AppError);
    });

    it('rejects at text strong threshold', async () => {
        const file = new File(['x'], 'big.geojson');
        Object.defineProperty(file, 'size', { value: TEXT_STRONG_BYTES });
        await expect(guardFilesBeforeImport([file])).rejects.toBeInstanceOf(AppError);
    });
});

describe('assertFileReadable', () => {
    it('blocks reads above text cap', () => {
        const file = new File(['x'], 'big.geojson');
        Object.defineProperty(file, 'size', { value: MAX_READ_BYTES_TEXT + 1 });
        expect(() => assertFileReadable(file, 'geojson')).toThrow(AppError);
    });
});
