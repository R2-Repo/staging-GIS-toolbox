import { describe, it, expect } from 'vitest';
import { buildMapLabelLayerSpec, normalizeMapLabels, resolvePlacemarkLabel } from '../js/map/map-labels.js';

describe('map-labels', () => {
    it('returns null when field missing', () => {
        expect(normalizeMapLabels(null)).toBeNull();
        expect(buildMapLabelLayerSpec('ds-1', 'src-ds-1', null)).toBeNull();
    });

    it('builds point symbol layer spec with text-field from attribute', () => {
        const spec = buildMapLabelLayerSpec('sta-1', 'src-sta-1', { field: 'station', minZoom: 12 });
        expect(spec.id).toBe('sta-1-labels');
        expect(spec.type).toBe('symbol');
        expect(spec.source).toBe('src-sta-1');
        expect(spec.minzoom).toBe(12);
        expect(spec.layout['text-field']).toEqual(['to-string', ['get', 'station']]);
    });

    it('builds line label layer spec with symbol-placement line', () => {
        const spec = buildMapLabelLayerSpec('seg-1', 'src-seg-1', {
            field: 'station_start',
            placement: 'line',
            minZoom: 11
        });
        expect(spec.id).toBe('seg-1-line-labels');
        expect(spec.layout['symbol-placement']).toBe('line');
        expect(spec.filter).toEqual(['==', ['geometry-type'], 'LineString']);
    });

    it('resolvePlacemarkLabel uses configured label field when enabled', () => {
        const feature = { properties: { route: 'US-89', name: 'fallback' } };
        const style = { labels: { enabled: true, field: 'route' } };
        expect(resolvePlacemarkLabel(feature, 0, style)).toBe('US-89');
    });

    it('resolvePlacemarkLabel falls back to name properties', () => {
        const feature = { properties: { name: 'Site A' } };
        expect(resolvePlacemarkLabel(feature, 0, null)).toBe('Site A');
    });
});
