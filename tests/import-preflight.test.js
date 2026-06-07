import { describe, it, expect } from 'vitest';
import {
    preflightFile,
    preflightFiles,
    PREFLIGHT_LEVEL,
    PREFLIGHT_SOFT_BYTES,
    PREFLIGHT_HARD_BYTES
} from '../js/import/import-preflight.js';
import { buildImportSummary } from '../js/import/import-summary.js';

describe('import-preflight', () => {
    it('flags soft warning for large files', () => {
        const file = new File([new Uint8Array(PREFLIGHT_SOFT_BYTES)], 'big.geojson');
        Object.defineProperty(file, 'size', { value: PREFLIGHT_SOFT_BYTES });
        const r = preflightFile(file);
        expect(r.level).toBe(PREFLIGHT_LEVEL.SOFT);
    });

    it('rejects files over hard limit', () => {
        const file = new File(['x'], 'huge.geojson');
        Object.defineProperty(file, 'size', { value: PREFLIGHT_HARD_BYTES + 1 });
        const r = preflightFiles([file]);
        expect(r.reject).toBe(true);
        expect(r.level).toBe(PREFLIGHT_LEVEL.REJECT);
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
        expect(summary.errors.length).toBe(1);
        expect(summary.lines[0]).toMatch(/Imported 1 layer/);
    });
});
