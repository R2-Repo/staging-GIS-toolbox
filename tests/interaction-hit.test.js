import { describe, expect, it } from 'vitest';
import {
    LINE_HIT_MIN_WIDTH_PX,
    LINE_HIT_EXTRA_PX,
    buildLineHitWidth,
    isInteractionHitLayerId,
    lineHitLayerId,
    shouldSkipClickBinding
} from '../js/map/interaction-hit.js';

describe('interaction-hit', () => {
    describe('buildLineHitWidth', () => {
        it('clamps thin numeric widths to minimum hit size', () => {
            expect(buildLineHitWidth(2)).toBe(LINE_HIT_MIN_WIDTH_PX);
        });

        it('adds extra padding for wider numeric strokes', () => {
            expect(buildLineHitWidth(8)).toBe(8 + LINE_HIT_EXTRA_PX);
        });

        it('wraps MapLibre expressions with max and extra padding', () => {
            const expr = ['interpolate', ['linear'], ['zoom'], 10, 2, 16, 6];
            expect(buildLineHitWidth(expr)).toEqual([
                'max',
                LINE_HIT_MIN_WIDTH_PX,
                ['+', expr, LINE_HIT_EXTRA_PX]
            ]);
        });

        it('falls back to minimum for invalid values', () => {
            expect(buildLineHitWidth(null)).toBe(LINE_HIT_MIN_WIDTH_PX);
        });
    });

    describe('layer id helpers', () => {
        it('derives hit layer id from visible layer id', () => {
            expect(lineHitLayerId('roads-line')).toBe('roads-line-hit');
            expect(lineHitLayerId('parcels-outline')).toBe('parcels-outline-hit');
        });

        it('recognizes hit layer suffixes', () => {
            expect(isInteractionHitLayerId('layer-line-hit')).toBe(true);
            expect(isInteractionHitLayerId('layer-outline-hit')).toBe(true);
            expect(isInteractionHitLayerId('layer-line')).toBe(false);
        });

        it('skips visible stroke layers when hit layer is present', () => {
            const layerIds = ['layer-fill', 'layer-outline', 'layer-outline-hit', 'layer-line', 'layer-line-hit'];
            expect(shouldSkipClickBinding('layer-outline', layerIds)).toBe(true);
            expect(shouldSkipClickBinding('layer-line', layerIds)).toBe(true);
            expect(shouldSkipClickBinding('layer-fill', layerIds)).toBe(false);
            expect(shouldSkipClickBinding('layer-line-hit', layerIds)).toBe(false);
        });
    });
});
