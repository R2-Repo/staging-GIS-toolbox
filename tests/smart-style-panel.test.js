import { describe, it, expect } from 'vitest';
import {
    pickSmartField,
    suggestVariableType,
    extractDefaultStyle,
    mergeDefaultStyleForDisplay,
    applyPaletteToVariables
} from '../js/map/style-panel-helpers.js';

describe('style-panel-helpers', () => {
    const fields = [
        { name: 'id', type: 'number', uniqueCount: 100, selected: true },
        { name: 'status', type: 'string', uniqueCount: 4, selected: true },
        { name: 'hidden', type: 'string', uniqueCount: 2, selected: false }
    ];

    it('pickSmartField prefers low-cardinality string fields', () => {
        expect(pickSmartField(fields)?.name).toBe('status');
    });

    it('pickSmartField skips deselected fields', () => {
        expect(pickSmartField([fields[2]])).toBeNull();
    });

    it('suggestVariableType returns range for high-cardinality numbers', () => {
        expect(suggestVariableType(fields[0])).toBe('range');
        expect(suggestVariableType(fields[1])).toBe('unique');
    });

    it('extractDefaultStyle preserves geometry overrides', () => {
        const result = extractDefaultStyle({
            mode: 'smart',
            smart: { visualVariables: [] },
            strokeColor: '#f00',
            point: { pointSize: 10 }
        });
        expect(result.mode).toBeUndefined();
        expect(result.smart).toBeUndefined();
        expect(result.strokeColor).toBe('#f00');
        expect(result.point).toEqual({ pointSize: 10 });
    });

    it('mergeDefaultStyleForDisplay prefers defaultStyle geometry keys', () => {
        const merged = mergeDefaultStyleForDisplay(
            { strokeColor: '#000', point: { pointSize: 4 } },
            { strokeColor: '#111', point: { pointSize: 12 } }
        );
        expect(merged.strokeColor).toBe('#111');
        expect(merged.point).toEqual({ pointSize: 12 });
        expect(merged.mode).toBe('simple');
    });

    it('applyPaletteToVariables updates first unique/range classes', () => {
        const vars = [
            { type: 'size', field: 'pop' },
            { type: 'unique', field: 'type', classes: [{ value: 'A', color: '#000' }, { value: 'B', color: '#111' }] }
        ];
        const next = applyPaletteToVariables(vars, ['#f00', '#0f0', '#00f']);
        expect(next).not.toBeNull();
        expect(next[1].classes[0].color).toBe('#f00');
        expect(next[1].classes[1].color).toBe('#0f0');
    });

    it('applyPaletteToVariables returns null when no color variable', () => {
        expect(applyPaletteToVariables([{ type: 'size', field: 'x' }], ['#f00'])).toBeNull();
    });
});
