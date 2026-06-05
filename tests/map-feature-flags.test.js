import { describe, expect, it } from 'vitest';
import { resolveReactMapViewFlag } from '../js/map/map-feature-flags.js';

describe('react map view feature flag', () => {
    it('defaults to disabled when unset', () => {
        expect(resolveReactMapViewFlag()).toBe(false);
    });

    it('allows explicit global override', () => {
        expect(resolveReactMapViewFlag({ globalValue: true })).toBe(true);
        expect(resolveReactMapViewFlag({ globalValue: false })).toBe(false);
    });

    it('reads query-string overrides', () => {
        expect(resolveReactMapViewFlag({ queryString: '?mapReactView=1' })).toBe(true);
        expect(resolveReactMapViewFlag({ queryString: '?mapReactView=true' })).toBe(true);
        expect(resolveReactMapViewFlag({ queryString: '?mapReactView=0' })).toBe(false);
    });

    it('falls back to local-storage value when query is absent', () => {
        expect(resolveReactMapViewFlag({ storageValue: '1' })).toBe(true);
        expect(resolveReactMapViewFlag({ storageValue: 'off' })).toBe(false);
    });
});
