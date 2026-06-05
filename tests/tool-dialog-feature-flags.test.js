import { describe, expect, it } from 'vitest';
import { resolveReactToolDialogsFlag } from '../js/ui/tool-dialog-feature-flags.js';

describe('react tool dialogs feature flag', () => {
    it('defaults to disabled when unset', () => {
        expect(resolveReactToolDialogsFlag()).toBe(false);
    });

    it('allows explicit global override', () => {
        expect(resolveReactToolDialogsFlag({ globalValue: true })).toBe(true);
        expect(resolveReactToolDialogsFlag({ globalValue: false })).toBe(false);
    });

    it('reads query-string overrides', () => {
        expect(resolveReactToolDialogsFlag({ queryString: '?toolDialogsReact=1' })).toBe(true);
        expect(resolveReactToolDialogsFlag({ queryString: '?toolDialogsReact=true' })).toBe(true);
        expect(resolveReactToolDialogsFlag({ queryString: '?toolDialogsReact=0' })).toBe(false);
    });

    it('falls back to local-storage value when query is absent', () => {
        expect(resolveReactToolDialogsFlag({ storageValue: '1' })).toBe(true);
        expect(resolveReactToolDialogsFlag({ storageValue: 'off' })).toBe(false);
    });
});
