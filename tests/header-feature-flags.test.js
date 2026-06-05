import { describe, expect, it } from 'vitest';
import { resolveReactHeaderFlag } from '../js/ui/header-feature-flags.js';

describe('react header feature flag', () => {
    it('defaults to enabled when unset', () => {
        expect(resolveReactHeaderFlag()).toBe(true);
    });

    it('allows explicit global override', () => {
        expect(resolveReactHeaderFlag({ globalValue: true })).toBe(true);
        expect(resolveReactHeaderFlag({ globalValue: false })).toBe(false);
    });

    it('reads query-string overrides', () => {
        expect(resolveReactHeaderFlag({ queryString: '?headerReact=1' })).toBe(true);
        expect(resolveReactHeaderFlag({ queryString: '?headerReact=true' })).toBe(true);
        expect(resolveReactHeaderFlag({ queryString: '?headerReact=0' })).toBe(false);
    });

    it('falls back to local-storage value when query is absent', () => {
        expect(resolveReactHeaderFlag({ storageValue: '1' })).toBe(true);
        expect(resolveReactHeaderFlag({ storageValue: 'off' })).toBe(false);
    });
});
