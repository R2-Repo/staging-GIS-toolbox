import { describe, expect, it } from 'vitest';
import { resolveReactLeftPanelFlag } from '../js/ui/left-panel-feature-flags.js';

describe('react left panel feature flag', () => {
    it('defaults to enabled when unset', () => {
        expect(resolveReactLeftPanelFlag()).toBe(true);
    });

    it('allows explicit global override', () => {
        expect(resolveReactLeftPanelFlag({ globalValue: true })).toBe(true);
        expect(resolveReactLeftPanelFlag({ globalValue: false })).toBe(false);
    });

    it('reads query-string overrides', () => {
        expect(resolveReactLeftPanelFlag({ queryString: '?leftPanelReact=1' })).toBe(true);
        expect(resolveReactLeftPanelFlag({ queryString: '?leftPanelReact=true' })).toBe(true);
        expect(resolveReactLeftPanelFlag({ queryString: '?leftPanelReact=0' })).toBe(false);
    });

    it('falls back to local-storage value when query is absent', () => {
        expect(resolveReactLeftPanelFlag({ storageValue: '1' })).toBe(true);
        expect(resolveReactLeftPanelFlag({ storageValue: 'off' })).toBe(false);
    });
});
