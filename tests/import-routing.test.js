import { describe, expect, it } from 'vitest';
import {
    OPTIMIZER_PEAK_BYTES,
    ROUTE_REASON,
    assessImportRouteFromScans,
    arcgisShouldUseWorkspace,
    shouldConvertToWorkspace
} from '../js/import/import-routing.js';
import { WORKSPACE_FEATURE_THRESHOLD } from '../js/workspace/workspace-store.js';
import { TEXT_SOFT_BYTES } from '../js/import/import-preflight.js';

describe('import-routing', () => {
    it('routes soft-sized file with low estimates to standard', () => {
        const assessment = assessImportRouteFromScans([{
            fileName: 'medium.geojson',
            sizeBytes: TEXT_SOFT_BYTES,
            estimatedPeakBytes: 1024 * 1024,
            featureEstimate: 500
        }]);
        expect(assessment.route).toBe('standard');
        expect(assessment.useWorkspace).toBe(false);
    });

    it('routes high feature estimate to optimizer with workspace', () => {
        const assessment = assessImportRouteFromScans([{
            featureEstimate: WORKSPACE_FEATURE_THRESHOLD
        }]);
        expect(assessment.route).toBe('optimizer');
        expect(assessment.reasons).toContain(ROUTE_REASON.FEATURE_COUNT);
        expect(assessment.useWorkspace).toBe(true);
    });

    it('routes high peak estimate to optimizer without workspace when features are low', () => {
        const assessment = assessImportRouteFromScans([{
            estimatedPeakBytes: OPTIMIZER_PEAK_BYTES,
            featureEstimate: 1000
        }]);
        expect(assessment.route).toBe('optimizer');
        expect(assessment.reasons).toContain(ROUTE_REASON.PEAK_MEMORY);
        expect(assessment.useWorkspace).toBe(false);
    });

    it('shouldConvertToWorkspace is opt-in unless feature threshold met', () => {
        expect(shouldConvertToWorkspace(100, {})).toBe(false);
        expect(shouldConvertToWorkspace(100, { useWorkspace: true })).toBe(true);
        expect(shouldConvertToWorkspace(WORKSPACE_FEATURE_THRESHOLD, {})).toBe(true);
    });

    it('arcgisShouldUseWorkspace respects feature count and spatial filter', () => {
        expect(arcgisShouldUseWorkspace(500)).toBe(false);
        expect(arcgisShouldUseWorkspace(WORKSPACE_FEATURE_THRESHOLD)).toBe(true);
        expect(arcgisShouldUseWorkspace(500, { spatialFilter: {} })).toBe(true);
        expect(arcgisShouldUseWorkspace(null)).toBe(false);
    });
});
