import { describe, expect, it } from 'vitest';
import {
    buildOptimizerReductionNotice,
    buildLargeDatasetNotice,
    buildArcgisLargeLayerNotice,
    scansNeedLargeDatasetNotice
} from '../js/import/import-size-notices.js';

describe('import-size-notices', () => {
    it('buildOptimizerReductionNotice names oversized files', () => {
        const notice = buildOptimizerReductionNotice([
            { fileName: 'big.csv', sizeLabel: '2.5 MB' }
        ]);
        expect(notice.heading).toMatch(/too large/i);
        expect(notice.intro).toContain('big.csv');
        expect(notice.bullets.length).toBeGreaterThan(2);
        expect(notice.footer).toMatch(/Import/i);
    });

    it('buildLargeDatasetNotice mentions feature estimate', () => {
        const notice = buildLargeDatasetNotice([{ featureEstimate: 20000 }]);
        expect(notice.heading).toMatch(/large dataset/i);
        expect(notice.intro).toContain('20,000');
    });

    it('scansNeedLargeDatasetNotice respects workspace threshold', () => {
        expect(scansNeedLargeDatasetNotice([{ featureEstimate: 1000 }])).toBe(false);
        expect(scansNeedLargeDatasetNotice([{ featureEstimate: 20000 }])).toBe(true);
    });

    it('buildArcgisLargeLayerNotice explains streaming plan', () => {
        const notice = buildArcgisLargeLayerNotice(250000);
        expect(notice.intro).toContain('250,000');
        expect(notice.bullets.some((b) => /local storage/i.test(b))).toBe(true);
    });
});
