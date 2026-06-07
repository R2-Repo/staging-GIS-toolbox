import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import {
    sumZipUncompressedBytes,
    measureZipUncompressedBytes,
    assertZipUncompressedBudget,
    MAX_ZIP_UNCOMPRESSED_BYTES
} from '../js/import/zip-utils.js';
import { AppError } from '../js/core/error-handler.js';

describe('zip-preflight', () => {
    it('sums uncompressed sizes from zip entries', async () => {
        const zip = new JSZip();
        zip.file('a.kml', 'x'.repeat(1000));
        zip.file('b.txt', 'y'.repeat(500));
        const buf = await zip.generateAsync({ type: 'arraybuffer' });
        const loaded = await JSZip.loadAsync(buf);
        const total = sumZipUncompressedBytes(loaded);
        expect(total).toBeGreaterThanOrEqual(1500);
    });

    it('measureZipUncompressedBytes reads from buffer', async () => {
        const zip = new JSZip();
        zip.file('doc.kml', '<kml></kml>');
        const buf = await zip.generateAsync({ type: 'arraybuffer' });
        const total = await measureZipUncompressedBytes(buf, JSZip);
        expect(total).toBeGreaterThan(0);
    });

    it('assertZipUncompressedBudget throws when over limit', () => {
        expect(() => assertZipUncompressedBudget(MAX_ZIP_UNCOMPRESSED_BYTES + 1, 'huge.kmz'))
            .toThrow(AppError);
    });

    it('assertZipUncompressedBudget allows under limit', () => {
        expect(() => assertZipUncompressedBudget(1024, 'tiny.kmz')).not.toThrow();
    });
});
