import { describe, it, expect } from 'vitest';
import {
    evaluateFilterRule,
    evaluateFilterGroup,
    compileFilterGroupExpression
} from '../js/map/style-filters.js';
import {
    autoClassifyRange,
    autoClassifyQuantile,
    createVisualVariable,
    compilePaint,
    normalizeStyle
} from '../js/map/style-engine.js';
import { detectEmbeddedSimpleStyle, convertSimpleStyleToSmart } from '../js/map/style-import.js';

describe('style-filters', () => {
    it('evaluates equals rule', () => {
        expect(evaluateFilterRule({ status: 'Open' }, { field: 'status', operator: 'equals', value: 'Open' })).toBe(true);
        expect(evaluateFilterRule({ status: 'Closed' }, { field: 'status', operator: 'equals', value: 'Open' })).toBe(false);
    });

    it('evaluates filter group with AND logic', () => {
        const ok = evaluateFilterGroup({ a: '1', b: '2' }, {
            logic: 'AND',
            rules: [
                { field: 'a', operator: 'equals', value: '1' },
                { field: 'b', operator: 'equals', value: '2' }
            ]
        });
        expect(ok).toBe(true);
    });

    it('compiles filter group expression', () => {
        const expr = compileFilterGroupExpression({
            logic: 'AND',
            rules: [{ field: 'x', operator: 'equals', value: '1' }]
        });
        expect(expr[0]).toBe('==');
    });
});

describe('class breaks', () => {
    const features = [
        { properties: { pop: 10 } },
        { properties: { pop: 20 } },
        { properties: { pop: 90 } },
        { properties: { pop: 100 } }
    ];

    it('builds equal interval classes', () => {
        const result = autoClassifyRange('pop', features, 4);
        expect(result.classes).toHaveLength(4);
        expect(result.min).toBe(10);
        expect(result.max).toBe(100);
    });

    it('builds quantile classes', () => {
        const result = autoClassifyQuantile('pop', features, 2);
        expect(result.classes).toHaveLength(2);
    });
});

describe('multi visual variables', () => {
    it('stacks color and size expressions', () => {
        const style = normalizeStyle({
            mode: 'smart',
            smart: {
                defaultStyle: {},
                visualVariables: [
                    { type: 'unique', field: 'type', channel: 'fill', classes: [{ value: 'A', color: '#f00' }], defaultColor: '#ccc' },
                    { type: 'size', field: 'pop', min: 0, max: 100, sizeMin: 4, sizeMax: 12 }
                ]
            }
        });
        const paint = compilePaint(style, 'point');
        expect(Array.isArray(paint.fillColor)).toBe(true);
        expect(Array.isArray(paint.circleRadius)).toBe(true);
        expect(paint.hasDataDriven).toBe(true);
    });
});

describe('createVisualVariable', () => {
    it('creates size variable with extent', () => {
        const features = [{ properties: { pop: 5 } }, { properties: { pop: 50 } }];
        const vv = createVisualVariable('size', 'pop', features);
        expect(vv.type).toBe('size');
        expect(vv.min).toBe(5);
        expect(vv.max).toBe(50);
    });
});

describe('style-import', () => {
    it('detects varying stroke colors', () => {
        const features = [
            { properties: { stroke: '#ff0000' } },
            { properties: { stroke: '#0000ff' } }
        ];
        const d = detectEmbeddedSimpleStyle(features);
        expect(d?.hasSimpleStyle).toBe(true);
        expect(d?.varyingProperty).toBe('stroke');
    });

    it('converts to smart unique style', () => {
        const features = [
            { properties: { stroke: '#ff0000' } },
            { properties: { stroke: '#0000ff' } }
        ];
        const style = convertSimpleStyleToSmart(features, 'stroke');
        expect(style.mode).toBe('smart');
        expect(style.smart.visualVariables[0].classes.length).toBe(2);
    });
});
