import { describe, expect, it } from 'vitest';
import { resolveWorkflowReactFlowFlag } from '../js/workflow/workflow-feature-flags.js';

describe('workflow react flow feature flag', () => {
    it('defaults to enabled when unset', () => {
        expect(resolveWorkflowReactFlowFlag()).toBe(true);
    });

    it('allows explicit global override', () => {
        expect(resolveWorkflowReactFlowFlag({ globalValue: true })).toBe(true);
        expect(resolveWorkflowReactFlowFlag({ globalValue: false })).toBe(false);
    });

    it('reads query-string overrides', () => {
        expect(resolveWorkflowReactFlowFlag({ queryString: '?wfReactFlow=1' })).toBe(true);
        expect(resolveWorkflowReactFlowFlag({ queryString: '?wfReactFlow=true' })).toBe(true);
        expect(resolveWorkflowReactFlowFlag({ queryString: '?wfReactFlow=0' })).toBe(false);
    });

    it('falls back to local-storage value when query is absent', () => {
        expect(resolveWorkflowReactFlowFlag({ storageValue: '1' })).toBe(true);
        expect(resolveWorkflowReactFlowFlag({ storageValue: 'false' })).toBe(false);
    });
});
