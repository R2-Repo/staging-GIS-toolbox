import { describe, expect, it } from 'vitest';
import { resolveReactToastFlag } from '../js/ui/toast-feature-flags.js';

describe('react toast feature flag', () => {
    it('defaults to enabled when unset', () => {
        expect(resolveReactToastFlag()).toBe(true);
    });

    it('allows explicit global override', () => {
        expect(resolveReactToastFlag({ globalValue: true })).toBe(true);
        expect(resolveReactToastFlag({ globalValue: false })).toBe(false);
    });

    it('reads query-string overrides', () => {
        expect(resolveReactToastFlag({ queryString: '?toastReact=1' })).toBe(true);
        expect(resolveReactToastFlag({ queryString: '?toastReact=true' })).toBe(true);
        expect(resolveReactToastFlag({ queryString: '?toastReact=0' })).toBe(false);
    });

    it('falls back to local-storage value when query is absent', () => {
        expect(resolveReactToastFlag({ storageValue: '1' })).toBe(true);
        expect(resolveReactToastFlag({ storageValue: 'off' })).toBe(false);
    });
});
