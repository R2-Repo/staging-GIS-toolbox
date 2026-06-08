import { describe, expect, it, vi } from 'vitest';
import {
    clampWidgetModalPosition,
    computeWidgetModalPlacement,
    getRightPanelDockRect,
    syncWidgetPanelDockReserve,
    WIDGET_MODAL_MARGIN,
    WIDGET_PANEL_DOCK_MARGIN
} from '../js/ui/widget-modal-placement.js';

describe('widget modal placement', () => {
    it('places in the lower-right of the right panel in single-screen mode', () => {
        const rightPanelRect = { left: 900, top: 52, right: 1200, bottom: 800, width: 300, height: 748 };
        const placement = computeWidgetModalPlacement({
            dualScreenActive: false,
            viewportWidth: 1200,
            viewportHeight: 800,
            modalWidth: 284,
            modalHeight: 320,
            rightPanelRect
        });

        expect(placement.left).toBe(1200 - 284 - WIDGET_PANEL_DOCK_MARGIN);
        expect(placement.top).toBe(800 - 320 - WIDGET_PANEL_DOCK_MARGIN);
    });

    it('falls back to viewport lower-right when no panel anchor is available', () => {
        const placement = computeWidgetModalPlacement({
            dualScreenActive: false,
            viewportWidth: 1200,
            viewportHeight: 800,
            modalWidth: 560,
            modalHeight: 420
        });

        expect(placement.left).toBe(1200 - 560 - WIDGET_MODAL_MARGIN);
        expect(placement.top).toBe(800 - 420 - WIDGET_MODAL_MARGIN);
    });

    it('centers in the map panel anchor during dual-screen mode', () => {
        const anchorRect = { left: 320, top: 52, width: 560, height: 696 };
        const placement = computeWidgetModalPlacement({
            dualScreenActive: true,
            viewportWidth: 1200,
            viewportHeight: 800,
            modalWidth: 560,
            modalHeight: 400,
            anchorRect
        });

        expect(placement.left).toBe(320);
        expect(placement.top).toBe(52 + (696 - 400) / 2);
    });

    it('clamps dragged positions inside the viewport', () => {
        const clamped = clampWidgetModalPosition({
            left: -40,
            top: 10,
            modalWidth: 560,
            modalHeight: 420,
            viewportWidth: 1200,
            viewportHeight: 800
        });

        expect(clamped.left).toBe(WIDGET_MODAL_MARGIN);
        expect(clamped.top).toBe(52 + WIDGET_MODAL_MARGIN);
    });

    it('returns null for collapsed right panel dock rects', () => {
        const doc = {
            querySelector(selector) {
                if (selector === '.panel-right') {
                    return { classList: { contains: (c) => c === 'collapsed' } };
                }
                return null;
            }
        };

        expect(getRightPanelDockRect(doc)).toBeNull();
    });

    it('reserves scroll space on the right panel while docked', () => {
        const panel = {
            classList: { add: vi.fn(), remove: vi.fn() },
            style: { setProperty: vi.fn(), removeProperty: vi.fn() }
        };

        syncWidgetPanelDockReserve(panel, 320);
        expect(panel.classList.add).toHaveBeenCalledWith('widget-panel-dock-active');
        expect(panel.style.setProperty).toHaveBeenCalledWith('--widget-dock-reserve', '320px');

        syncWidgetPanelDockReserve(panel, 0);
        expect(panel.classList.remove).toHaveBeenCalledWith('widget-panel-dock-active');
        expect(panel.style.removeProperty).toHaveBeenCalledWith('--widget-dock-reserve');
    });
});
