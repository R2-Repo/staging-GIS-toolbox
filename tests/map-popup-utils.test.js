/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { resetMapPopupScroll } from '../js/map/map-popup-utils.js';

describe('resetMapPopupScroll', () => {
    it('resets scroll on attributes and outer popup content', () => {
        const attrs = document.createElement('div');
        attrs.className = 'map-popup-attributes';
        attrs.scrollTop = 120;

        const content = document.createElement('div');
        content.className = 'maplibregl-popup-content';
        content.scrollTop = 80;
        content.appendChild(attrs);

        const root = document.createElement('div');
        root.appendChild(content);

        resetMapPopupScroll({ getElement: () => root });

        expect(attrs.scrollTop).toBe(0);
        expect(content.scrollTop).toBe(0);
    });

    it('handles missing popup or elements without throwing', () => {
        expect(() => resetMapPopupScroll(null)).not.toThrow();
        expect(() => resetMapPopupScroll({ getElement: () => document.createElement('div') })).not.toThrow();
        expect(() => resetMapPopupScroll({})).not.toThrow();
    });
});
