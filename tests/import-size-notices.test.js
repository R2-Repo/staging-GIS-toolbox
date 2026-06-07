import { describe, expect, it } from 'vitest';
import {
    buildNoticeForRoute,
    buildOptimizerReductionNotice,
    buildLargeDatasetNotice,
    buildArcgisLargeLayerNotice,
    shouldShowImportProgressNotice
} from '../js/import/import-size-notices.js';
import { assessImportRouteFromScans } from '../js/import/import-routing.js';

describe('import-size-notices', () => {
    it('buildNoticeForRoute names files for peak memory reason', () => {
        const notice = buildNoticeForRoute({
            route: 'optimizer',
            reasons: ['peak_memory'],
            scans: [{ fileName: 'big.csv', sizeLabel: '2.5 MB' }]
        });
        expect(notice.heading).toMatch(/memory/i);
        expect(notice.intro).toContain('big.csv');
        expect(notice.bullets.length).toBeGreaterThan(0);
    });

    it('buildOptimizerReductionNotice names oversized files', () => {
        const notice = buildOptimizerReductionNotice([
            { fileName: 'big.csv', sizeLabel: '2.5 MB' }
        ]);
        expect(notice.heading).toMatch(/memory/i);
        expect(notice.intro).toContain('big.csv');
    });

    it('buildLargeDatasetNotice mentions feature estimate', () => {
        const notice = buildLargeDatasetNotice([{ featureEstimate: 20000 }]);
        expect(notice.heading).toMatch(/large dataset/i);
        expect(notice.intro).toContain('20,000');
    });

    it('shouldShowImportProgressNotice only when optimizer uses workspace', () => {
        expect(shouldShowImportProgressNotice({ route: 'optimizer', useWorkspace: true })).toBe(true);
        expect(shouldShowImportProgressNotice({ route: 'optimizer', useWorkspace: false })).toBe(false);
        expect(shouldShowImportProgressNotice({ route: 'standard', useWorkspace: false })).toBe(false);
    });

    it('assessImportRouteFromScans gates large-dataset notice material', () => {
        expect(assessImportRouteFromScans([{ featureEstimate: 1000 }]).route).toBe('standard');
        expect(assessImportRouteFromScans([{ featureEstimate: 20000 }]).route).toBe('optimizer');
    });

    it('buildArcgisLargeLayerNotice explains streaming plan', () => {
        const notice = buildArcgisLargeLayerNotice(250000);
        expect(notice.intro).toContain('250,000');
        expect(notice.bullets.some((b) => /local storage/i.test(b))).toBe(true);
    });
});
