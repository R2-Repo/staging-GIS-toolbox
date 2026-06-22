import { describe, it, expect } from 'vitest';
import {
    GIS_WIDGETS,
    GIS_WIDGETS_HIDDEN,
    ALL_GIS_WIDGETS,
    buildWidgetActions
} from '../js/widgets/registry.js';

describe('widget registry', () => {
    it('keeps CRS Manager hidden from the visible widget list', () => {
        expect(GIS_WIDGETS.some((w) => w.type === 'crs-manager')).toBe(false);
        expect(GIS_WIDGETS_HIDDEN.some((w) => w.type === 'crs-manager')).toBe(true);
        expect(ALL_GIS_WIDGETS.some((w) => w.type === 'crs-manager')).toBe(true);
    });

    it('does not register hidden widget actions in APP_ACTIONS', () => {
        const actions = buildWidgetActions(() => ({}));
        expect(actions.openCrsManager).toBeUndefined();
        expect(actions.openSpatialAnalyzer).toBeTypeOf('function');
    });
});
