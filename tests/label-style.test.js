import { describe, it, expect } from 'vitest';
import { normalizeStyle } from '../js/map/style-engine.js';
import {
    normalizeLayerLabels,
    pickLabelField,
    resolveLayerLabels,
    sampleFieldValues,
    fieldEmptyRatio
} from '../js/map/map-labels.js';

describe('label style schema', () => {
    it('normalizeStyle preserves labels block', () => {
        const stored = {
            mode: 'simple',
            strokeColor: '#ff0000',
            labels: {
                enabled: true,
                field: 'route_name',
                size: 14,
                offset: [0, 2]
            }
        };
        const normalized = normalizeStyle(stored);
        expect(normalized.labels).toEqual({
            enabled: true,
            field: 'route_name',
            size: 14,
            offset: [0, 2]
        });
        expect(normalized.strokeColor).toBe('#ff0000');
    });

    it('normalizeStyle preserves labels on smart mode', () => {
        const stored = {
            mode: 'smart',
            labels: { enabled: true, field: 'id' },
            smart: { defaultStyle: {}, visualVariables: [], filterRules: [] }
        };
        const normalized = normalizeStyle(stored);
        expect(normalized.labels.field).toBe('id');
        expect(normalized.mode).toBe('smart');
    });

    it('normalizeLayerLabels fills defaults', () => {
        const labels = normalizeLayerLabels({ enabled: true, field: 'name' });
        expect(labels.placement).toBe('point');
        expect(labels.minZoom).toBe(11);
        expect(labels.offset).toEqual([0, 1.1]);
    });
});

describe('label field helpers', () => {
    const fields = [
        { name: 'OBJECTID', type: 'number', selected: true },
        { name: 'ROUTE_NAME', type: 'string', selected: true },
        { name: 'hidden', type: 'string', selected: false }
    ];

    it('pickLabelField prefers name-like string fields', () => {
        expect(pickLabelField(fields)?.name).toBe('ROUTE_NAME');
    });

    it('sampleFieldValues returns distinct examples', () => {
        const features = [
            { properties: { label: 'A' } },
            { properties: { label: 'A' } },
            { properties: { label: 'B' } },
            { properties: { label: 'C' } }
        ];
        expect(sampleFieldValues(features, 'label', 3)).toEqual(['A', 'B', 'C']);
    });

    it('fieldEmptyRatio measures empty values in sample', () => {
        const features = [
            { properties: { x: '' } },
            { properties: { x: 'ok' } }
        ];
        expect(fieldEmptyRatio(features, 'x', 2)).toBe(0.5);
    });
});

describe('resolveLayerLabels', () => {
    it('prefers enabled style labels over dataset._mapLabels', () => {
        const style = { labels: { enabled: true, field: 'from_style', size: 12 } };
        const dataset = { _mapLabels: { field: 'legacy' } };
        expect(resolveLayerLabels(style, dataset)?.field).toBe('from_style');
    });

    it('falls back to dataset._mapLabels when style labels disabled', () => {
        const style = { labels: { enabled: false, field: 'from_style' } };
        const dataset = { _mapLabels: { field: 'legacy', minZoom: 10 } };
        expect(resolveLayerLabels(style, dataset)?.field).toBe('legacy');
    });

    it('returns null when no labels configured', () => {
        expect(resolveLayerLabels({}, {})).toBeNull();
    });
});
