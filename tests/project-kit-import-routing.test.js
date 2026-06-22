/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isProjectKitFile } from '../js/core/project-kit.js';
import { detectFormat } from '../js/import/importer.js';

describe('project kit import routing', () => {
    it('detects .gis-toolbox as project kit, not a data import format', () => {
        const file = { name: 'toolbox-project(6-21-26).gis-toolbox' };
        expect(isProjectKitFile(file)).toBe(true);
        expect(detectFormat(file)).toBeNull();
    });

    it('still detects legacy .gtbx extension', () => {
        expect(isProjectKitFile({ name: 'legacy.gtbx' })).toBe(true);
    });
});
