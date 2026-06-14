import { describe, it, expect } from 'vitest';
import {
    GIS_TOOL_V1_MODE,
    MAP_GIS_TOOLS,
    V1_MAP_TOOL_IDS,
    V1_PIPELINE_NODE_TYPES,
    isMapToolEnabled,
    isPipelineNodeEnabled,
    getEnabledMapGisTools,
    renderMapGisToolsPanelHtml
} from '../js/tools/tool-catalog.js';

describe('tool-catalog', () => {
    it('V1 mode is enabled for testing', () => {
        expect(GIS_TOOL_V1_MODE).toBe(true);
    });

    it('map tool ids are unique', () => {
        const ids = MAP_GIS_TOOLS.map((t) => t.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('V1 map set is a subset of full catalog', () => {
        const allIds = new Set(MAP_GIS_TOOLS.map((t) => t.id));
        for (const id of V1_MAP_TOOL_IDS) {
            expect(allIds.has(id)).toBe(true);
        }
    });

    it('exposes seven core map GIS tools in V1', () => {
        expect(V1_MAP_TOOL_IDS.size).toBe(7);
        expect(getEnabledMapGisTools().map((t) => t.id).sort()).toEqual([
            'bbox-clip',
            'buffer',
            'clip-extent',
            'dissolve',
            'line-offset',
            'points-in-poly',
            'simplify'
        ]);
    });

    it('hides non-V1 map tools when V1 mode is on', () => {
        expect(isMapToolEnabled('distance')).toBe(false);
        expect(isMapToolEnabled('buffer')).toBe(true);
    });

    it('pipeline V1 set includes io and spatial chain nodes', () => {
        expect(V1_PIPELINE_NODE_TYPES.has('layer-input')).toBe(true);
        expect(V1_PIPELINE_NODE_TYPES.has('add-to-map')).toBe(true);
        expect(V1_PIPELINE_NODE_TYPES.has('spatial-join')).toBe(true);
        expect(V1_PIPELINE_NODE_TYPES.has('line-offset')).toBe(true);
        expect(isPipelineNodeEnabled('nearest-join')).toBe(false);
        expect(isPipelineNodeEnabled('union')).toBe(false);
    });

    it('renderMapGisToolsPanelHtml includes line offset in V1', () => {
        const html = renderMapGisToolsPanelHtml();
        expect(html).toContain('data-app-action="openLineOffset"');
    });

    it('renderMapGisToolsPanelHtml includes V1 actions only', () => {
        const html = renderMapGisToolsPanelHtml();
        expect(html).toContain('data-app-action="openBuffer"');
        expect(html).toContain('data-app-action="openPointsWithinPolygon"');
        expect(html).not.toContain('data-app-action="openDistanceTool"');
        expect(html).not.toContain('data-app-action="openCoordConverter"');
        expect(html).toContain('Points in Poly (filter)');
    });
});
