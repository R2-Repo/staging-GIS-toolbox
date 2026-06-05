import { describe, expect, it } from 'vitest';
import { resolveReactModalFlag } from '../js/ui/modal-feature-flags.js';

describe('react modal feature flag', () => {
    it('defaults to enabled when unset', () => {
        expect(resolveReactModalFlag()).toBe(true);
    });

    it('allows explicit global override', () => {
        expect(resolveReactModalFlag({ globalValue: true })).toBe(true);
        expect(resolveReactModalFlag({ globalValue: false })).toBe(false);
    });

    it('reads query-string overrides', () => {
        expect(resolveReactModalFlag({ queryString: '?modalReact=1' })).toBe(true);
        expect(resolveReactModalFlag({ queryString: '?modalReact=true' })).toBe(true);
        expect(resolveReactModalFlag({ queryString: '?modalReact=0' })).toBe(false);
    });

    it('falls back to local-storage value when query is absent', () => {
        expect(resolveReactModalFlag({ storageValue: '1' })).toBe(true);
        expect(resolveReactModalFlag({ storageValue: 'off' })).toBe(false);
    });
});
