import { describe, expect, it } from 'vitest';
import {
    scaleToZoom,
    zoomToScale,
    resolveMapLibreZoomRange,
    normalizeScaleRange,
    isLayerVisibleAtScale,
    getCurrentMapScale,
    MAPLIBRE_MAX_ZOOM
} from '../js/map/scale-range.js';

describe('scale-range', () => {
    it('scaleToZoom and zoomToScale round-trip at equator', () => {
        const scale = 50000;
        const zoom = scaleToZoom(scale, 0);
        expect(zoom).toBeTypeOf('number');
        expect(zoomToScale(zoom, 0)).toBeCloseTo(scale, 0);
    });

    it('scaleToZoom and zoomToScale round-trip at ~45N', () => {
        const lat = 45;
        const scale = 25000;
        const zoom = scaleToZoom(scale, lat);
        expect(zoomToScale(zoom, lat)).toBeCloseTo(scale, 0);
    });

    it('treats 0 and null scale bounds as unbounded', () => {
        const onlyMin = resolveMapLibreZoomRange(
            { scaleRangeEnabled: true, minScale: 500000, maxScale: null },
            0
        );
        expect(onlyMin.minzoom).toBeGreaterThan(0);
        expect(onlyMin.maxzoom).toBe(MAPLIBRE_MAX_ZOOM);

        const onlyMax = resolveMapLibreZoomRange(
            { scaleRangeEnabled: true, minScale: null, maxScale: 10000 },
            0
        );
        expect(onlyMax.minzoom).toBe(0);
        expect(onlyMax.maxzoom).toBeLessThan(MAPLIBRE_MAX_ZOOM);
    });

    it('resolveMapLibreZoomRange returns null when disabled', () => {
        expect(resolveMapLibreZoomRange(
            { scaleRangeEnabled: false, minScale: 50000, maxScale: 10000 },
            0
        )).toBeNull();
    });

    it('resolveMapLibreZoomRange maps ArcGIS bounds to MapLibre zoom', () => {
        const range = resolveMapLibreZoomRange(
            { scaleRangeEnabled: true, minScale: 500000, maxScale: 10000 },
            0
        );
        expect(range.minzoom).toBeGreaterThan(0);
        expect(range.maxzoom).toBeLessThan(MAPLIBRE_MAX_ZOOM);
        expect(range.minzoom).toBeLessThanOrEqual(range.maxzoom);
    });

    it('normalizeScaleRange treats 0 as null and swaps inverted bounds', () => {
        const out = normalizeScaleRange({
            scaleRangeEnabled: true,
            minScale: 10000,
            maxScale: 500000
        });
        expect(out.minScale).toBe(500000);
        expect(out.maxScale).toBe(10000);
    });

    it('normalizeScaleRange clears invalid non-positive scales', () => {
        const out = normalizeScaleRange({
            scaleRangeEnabled: true,
            minScale: -1,
            maxScale: 0
        });
        expect(out.minScale).toBeNull();
        expect(out.maxScale).toBeNull();
    });

    it('isLayerVisibleAtScale respects ArcGIS semantics', () => {
        const layer = {
            scaleRangeEnabled: true,
            minScale: 500000,
            maxScale: 10000
        };
        const midZoom = scaleToZoom(50000, 0);
        expect(isLayerVisibleAtScale(layer, midZoom, 0)).toBe(true);

        const tooFarOut = scaleToZoom(1000000, 0);
        expect(isLayerVisibleAtScale(layer, tooFarOut, 0)).toBe(false);

        const tooFarIn = scaleToZoom(5000, 0);
        expect(isLayerVisibleAtScale(layer, tooFarIn, 0)).toBe(false);
    });

    it('isLayerVisibleAtScale returns true when range disabled', () => {
        expect(isLayerVisibleAtScale({ scaleRangeEnabled: false, minScale: 100 }, 5, 0)).toBe(true);
    });

    it('getCurrentMapScale matches zoomToScale', () => {
        expect(getCurrentMapScale(12, 39)).toBe(zoomToScale(12, 39));
    });
});
