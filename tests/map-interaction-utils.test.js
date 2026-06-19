import { describe, it, expect } from 'vitest';
import {
    bboxDiagonalMeetsMinDragPx,
    markMapInteractionHandled,
    RECT_DRAG_MIN_DIAGONAL_PX,
    shouldStartBoxSelectDrag,
    isDoubleClickZoomEnabled,
    disableDoubleClickZoom,
    enableDoubleClickZoom,
    suspendDoubleClickZoom
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

describe('shouldStartBoxSelectDrag', () => {
    it('allows Shift+primary-button drag', () => {
        expect(shouldStartBoxSelectDrag({ button: 0, shiftKey: true })).toBe(true);
    });

    it('rejects plain drag without Shift', () => {
        expect(shouldStartBoxSelectDrag({ button: 0, shiftKey: false })).toBe(false);
    });

    it('rejects non-primary mouse buttons', () => {
        expect(shouldStartBoxSelectDrag({ button: 1, shiftKey: true })).toBe(false);
        expect(shouldStartBoxSelectDrag({ button: 2, shiftKey: true })).toBe(false);
    });

    it('rejects touch events without Shift', () => {
        expect(shouldStartBoxSelectDrag({ touches: [{ clientX: 0, clientY: 0 }] })).toBe(false);
    });

    it('rejects missing event', () => {
        expect(shouldStartBoxSelectDrag(null)).toBe(false);
        expect(shouldStartBoxSelectDrag(undefined)).toBe(false);
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

describe('suspendDoubleClickZoom', () => {
    it('disables and restores when isEnabled reports true', () => {
        let enabled = true;
        const map = {
            doubleClickZoom: {
                isEnabled: () => enabled,
                disable: () => { enabled = false; },
                enable: () => { enabled = true; }
            }
        };
        const suspended = suspendDoubleClickZoom(map);
        expect(enabled).toBe(false);
        suspended.restore();
        expect(enabled).toBe(true);
    });

    it('works when only disable/enable exist (MapLibre)', () => {
        let disabled = false;
        const map = {
            doubleClickZoom: {
                disable: () => { disabled = true; },
                enable: () => { disabled = false; }
            }
        };
        expect(() => suspendDoubleClickZoom(map).restore()).not.toThrow();
        expect(disabled).toBe(false);
    });
});
