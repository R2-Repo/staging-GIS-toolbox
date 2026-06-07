import { describe, expect, it, vi } from 'vitest';
import {
    resolveMapLibreZoomRange,
    normalizeScaleRange,
    MAPLIBRE_MIN_ZOOM,
    MAPLIBRE_MAX_ZOOM
} from '../js/map/scale-range.js';

describe('map scale range application', () => {
    it('applies zoom range to all sub-layer ids like toggleLayer does', () => {
        const setLayerZoomRange = vi.fn();
        const getLayer = vi.fn((id) => (id ? { id } : undefined));

        const layerIds = ['layer-1-fill', 'layer-1-outline', 'layer-1-line', 'layer-1-point', 'layer-1-c1-fill'];
        const config = normalizeScaleRange({
            scaleRangeEnabled: true,
            minScale: 500000,
            maxScale: 10000
        });
        const zoomRange = resolveMapLibreZoomRange(config, 0);

        for (const lid of layerIds) {
            if (getLayer(lid)) {
                setLayerZoomRange(lid, zoomRange.minzoom, zoomRange.maxzoom);
            }
        }

        expect(setLayerZoomRange).toHaveBeenCalledTimes(5);
        expect(setLayerZoomRange.mock.calls[0][1]).toBeGreaterThanOrEqual(MAPLIBRE_MIN_ZOOM);
        expect(setLayerZoomRange.mock.calls[0][2]).toBeLessThanOrEqual(MAPLIBRE_MAX_ZOOM);
    });

    it('resets to full zoom span when scale range disabled', () => {
        const minz = MAPLIBRE_MIN_ZOOM;
        const maxz = MAPLIBRE_MAX_ZOOM;
        expect(resolveMapLibreZoomRange({
            scaleRangeEnabled: false,
            minScale: 500000,
            maxScale: 10000
        }, 0)).toBeNull();
        expect({ minz, maxz }).toEqual({ minz: 0, maxz: 24 });
    });
});
