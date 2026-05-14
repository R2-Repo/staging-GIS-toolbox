import { describe, it, expect } from 'vitest';
import {
    bboxDiagonalMeetsMinDragPx,
    markMapInteractionHandled,
    RECT_DRAG_MIN_DIAGONAL_PX
} from '../js/map/map-interaction-utils.js';

describe('bboxDiagonalMeetsMinDragPx', () => {
    const identProject = ([lng, lat]) => ({ x: lng * 100, y: lat * 100 });

    it('accepts diagonal >= minPx', () => {
        expect(bboxDiagonalMeetsMinDragPx(0, 0, 0.2, 0.2, identProject, RECT_DRAG_MIN_DIAGONAL_PX)).toBe(true);
    });

    it('rejects degenerate/zero bbox', () => {
        expect(bboxDiagonalMeetsMinDragPx(5, -3, 5, -3, identProject, RECT_DRAG_MIN_DIAGONAL_PX)).toBe(false);
    });

    it('respects custom minPx', () => {
        const project = ([lng, lat]) => ({ x: lng, y: lat });
        expect(bboxDiagonalMeetsMinDragPx(0, 0, 3, 4, project, 5)).toBe(true);
        expect(bboxDiagonalMeetsMinDragPx(0, 0, 3, 4, project, 6)).toBe(false);
    });
});

describe('markMapInteractionHandled', () => {
    it('marks event and originalEvent', () => {
        const oe = {};
        const e = { originalEvent: oe };
        markMapInteractionHandled(e);
        expect(e._drawHandled).toBe(true);
        expect(oe._drawHandled).toBe(true);
    });

    it('ignores missing event', () => {
        expect(() => markMapInteractionHandled(null)).not.toThrow();
    });
});
