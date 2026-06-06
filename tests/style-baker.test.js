import { describe, it, expect } from 'vitest';
import {
    bakeFeatureSimpleStyle,
    bakeFeatureKmlStyle,
    styleHash,
    withBakedSimpleStyle
} from '../js/export/style-baker.js';
import { normalizeStyle } from '../js/map/style-engine.js';

const smartStyle = normalizeStyle({
    mode: 'smart',
    smart: {
        defaultStyle: {},
        visualVariables: [{
            type: 'unique',
            field: 'type',
            channel: 'both',
            classes: [
                { value: 'A', color: '#ff0000' },
                { value: 'B', color: '#0000ff' }
            ],
            defaultColor: '#999999'
        }]
    }
});

describe('style-baker', () => {
    it('bakes simplestyle props for matched feature', () => {
        const feature = {
            type: 'Feature',
            properties: { type: 'A' },
            geometry: { type: 'Point', coordinates: [0, 0] }
        };
        const baked = bakeFeatureSimpleStyle(feature, smartStyle);
        expect(baked.stroke).toBe('#ff0000');
        expect(baked.fill).toBe('#ff0000');
        expect(baked['marker-color']).toBe('#ff0000');
    });

    it('uses default color for unmatched feature', () => {
        const feature = {
            type: 'Feature',
            properties: { type: 'Z' },
            geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }
        };
        const baked = bakeFeatureKmlStyle(feature, smartStyle);
        expect(baked.fillColor).toBe('#999999');
    });

    it('returns null for simple mode style', () => {
        const feature = { properties: {}, geometry: { type: 'Point', coordinates: [0, 0] } };
        expect(bakeFeatureSimpleStyle(feature, { mode: 'simple', fillColor: '#111' })).toBeNull();
    });

    it('withBakedSimpleStyle merges properties', () => {
        const feature = {
            type: 'Feature',
            properties: { type: 'B', name: 'Test' },
            geometry: { type: 'Point', coordinates: [0, 0] }
        };
        const out = withBakedSimpleStyle(feature, smartStyle);
        expect(out.properties.name).toBe('Test');
        expect(out.properties.stroke).toBe('#0000ff');
    });

    it('styleHash is stable for identical styles', () => {
        const a = { strokeColor: '#1', fillColor: '#2', strokeWidth: 2, strokeOpacity: 1, fillOpacity: 0.5, pointSize: 6 };
        const b = { ...a };
        expect(styleHash(a)).toBe(styleHash(b));
    });
});
