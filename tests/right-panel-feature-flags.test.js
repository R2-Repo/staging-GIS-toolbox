import { describe, expect, it } from 'vitest';
import { resolveReactRightPanelFlag } from '../js/ui/right-panel-feature-flags.js';

describe('react right panel feature flag', () => {
    it('defaults to enabled when unset', () => {
        expect(resolveReactRightPanelFlag()).toBe(true);
    });

    it('allows explicit global override', () => {
        expect(resolveReactRightPanelFlag({ globalValue: true })).toBe(true);
        expect(resolveReactRightPanelFlag({ globalValue: false })).toBe(false);
    });

    it('reads query-string overrides', () => {
        expect(resolveReactRightPanelFlag({ queryString: '?rightPanelReact=1' })).toBe(true);
        expect(resolveReactRightPanelFlag({ queryString: '?rightPanelReact=true' })).toBe(true);
        expect(resolveReactRightPanelFlag({ queryString: '?rightPanelReact=0' })).toBe(false);
    });

    it('falls back to local-storage value when query is absent', () => {
        expect(resolveReactRightPanelFlag({ storageValue: '1' })).toBe(true);
        expect(resolveReactRightPanelFlag({ storageValue: 'off' })).toBe(false);
    });
});
