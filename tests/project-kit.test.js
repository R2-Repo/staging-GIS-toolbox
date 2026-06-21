/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import {
    PROJECT_KIT_FORMAT,
    PROJECT_KIT_FORMAT_VERSION,
    validateProjectKitManifest,
    resolveLayerIdConflict,
    sanitizeProjectKitFilename,
    buildProjectKitSnapshot,
    packProjectKit,
    parseProjectKit,
    summarizeProjectKit
} from '../js/core/project-kit.js';
import { prepareLayersFromKitSection } from '../js/core/layer-restore.js';

const sampleSpatial = {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { name: 'A' } }]
};

const sampleLayers = [
    {
        id: 'layer-spatial',
        name: 'Points',
        type: 'spatial',
        geojson: sampleSpatial,
        visible: true,
        created: '2026-01-01T00:00:00.000Z',
        source: { file: 'points.geojson', format: 'geojson' }
    },
    {
        id: 'layer-table',
        name: 'Table',
        type: 'table',
        rows: [{ id: 1, label: 'row' }],
        visible: true,
        created: '2026-01-01T00:00:00.000Z',
        source: { file: 'table.csv', format: 'csv' }
    }
];

describe('project-kit format', () => {
    it('validates manifest format and version', () => {
        expect(validateProjectKitManifest({ format: PROJECT_KIT_FORMAT, formatVersion: PROJECT_KIT_FORMAT_VERSION }).ok).toBe(true);
        expect(validateProjectKitManifest({ format: 'other', formatVersion: 1 }).ok).toBe(false);
        expect(validateProjectKitManifest({ format: PROJECT_KIT_FORMAT, formatVersion: 99 }).ok).toBe(false);
    });

    it('sanitizes filenames with .gtbx extension', () => {
        expect(sanitizeProjectKitFilename('Highway 88')).toBe('Highway-88.gtbx');
        expect(sanitizeProjectKitFilename('already.gtbx')).toBe('already.gtbx');
    });

    it('resolves merge id conflicts with numeric suffix', () => {
        const existing = new Set(['layer-spatial', 'layer-spatial-2']);
        expect(resolveLayerIdConflict('layer-spatial', existing)).toBe('layer-spatial-3');
        expect(resolveLayerIdConflict('new-layer', existing)).toBe('new-layer');
    });
});

describe('project-kit pack/parse', () => {
    it('round-trips full snapshot', async () => {
        const snapshot = await buildProjectKitSnapshot({
            sections: ['layers', 'map', 'workflow', 'preferences'],
            layers: sampleLayers,
            activeLayerId: 'layer-spatial',
            layerStyles: { 'layer-spatial': { color: '#ff0000' } },
            map: { basemap: 'satellite', is3d: true, viewport: { center: [1, 2], zoom: 10 } },
            workflow: {
                pipeline: { nodes: [{ id: 'node-1', type: 'file-import' }], wires: [] },
                nodeCache: { 'node-1': { rows: [{ a: 1 }] } }
            },
            preferences: { paletteFavorites: [{ id: 'pal-1', name: 'Warm', colors: ['#f00'] }] },
            projectName: 'Demo Project'
        });

        const blob = await packProjectKit(snapshot, JSZip);
        const parsed = await parseProjectKit(blob, JSZip);

        expect(parsed.manifest.format).toBe(PROJECT_KIT_FORMAT);
        expect(parsed.manifest.projectName).toBe('Demo Project');
        expect(parsed.layers.index).toHaveLength(2);
        expect(parsed.layers.spatial['layer-spatial'].features).toHaveLength(1);
        expect(parsed.layers.tables['layer-table']).toHaveLength(1);
        expect(parsed.layers.styles['layer-spatial'].color).toBe('#ff0000');
        expect(parsed.map.basemap).toBe('satellite');
        expect(parsed.workflow.pipeline.pipeline.nodes).toHaveLength(1);
        expect(parsed.workflow.pipeline.nodeCache['node-1'].rows).toHaveLength(1);
        expect(parsed.preferences.paletteFavorites[0].name).toBe('Warm');
    });

    it('selective export omits unselected sections', async () => {
        const snapshot = await buildProjectKitSnapshot({
            sections: ['layers'],
            layers: sampleLayers,
            activeLayerId: 'layer-spatial',
            layerStyles: {},
            map: { basemap: 'voyager' },
            workflow: { pipeline: { nodes: [{ id: 'node-1' }], wires: [] } },
            preferences: { paletteFavorites: [] }
        });

        const blob = await packProjectKit(snapshot, JSZip);
        const zip = await JSZip.loadAsync(blob);
        expect(zip.file('layers/index.json')).toBeTruthy();
        expect(zip.file('map.json')).toBeNull();
        expect(zip.file('workflow/pipeline.json')).toBeNull();
        expect(zip.file('preferences.json')).toBeNull();
    });

    it('exports workspace bundles via injectable helper', async () => {
        const workspaceLayer = {
            id: 'layer-ws',
            name: 'Big Layer',
            type: 'spatial-chunked',
            storage: 'workspace',
            workspaceLayerId: 'layer-ws',
            schema: { geometryType: 'Point', featureCount: 2 },
            visible: true,
            created: '2026-01-01T00:00:00.000Z'
        };

        const snapshot = await buildProjectKitSnapshot({
            sections: ['layers'],
            layers: [workspaceLayer],
            activeLayerId: 'layer-ws',
            layerStyles: {},
            exportWorkspaceLayerBundle: async (layerId) => ({
                meta: { id: layerId, name: 'Big Layer', chunkIds: ['layer-ws:c:0'] },
                chunks: [{ id: 'layer-ws:c:0', layerId, bbox: [0, 0, 1, 1], featureCount: 2, geojson: '{"type":"FeatureCollection","features":[]}' }],
                attributes: [{ id: 'layer-ws:f:0', layerId, featureIndex: 0, properties: { x: 1 } }]
            })
        });

        const blob = await packProjectKit(snapshot, JSZip);
        const parsed = await parseProjectKit(blob, JSZip);
        expect(parsed.layers.workspace['layer-ws'].chunks).toHaveLength(1);
        expect(parsed.layers.workspace['layer-ws'].attributes).toHaveLength(1);
    });

    it('summarizeProjectKit reports section counts', async () => {
        const snapshot = await buildProjectKitSnapshot({
            sections: ['layers', 'map'],
            layers: sampleLayers,
            activeLayerId: 'layer-spatial',
            layerStyles: {},
            map: { basemap: 'voyager' }
        });
        const summary = summarizeProjectKit(snapshot);
        expect(summary.layerCount).toBe(2);
        expect(summary.sections).toContain('layers');
        expect(summary.hasMap).toBe(true);
        expect(summary.hasWorkflow).toBe(false);
    });
});

describe('project-kit layer merge', () => {
    it('suffixes duplicate layer ids on merge', async () => {
        const imported = [];
        const importWorkspace = async (bundle, opts) => ({ ...bundle.meta, id: opts.newLayerId || bundle.meta.id });

        const { datasets, styles, activeLayerId } = await prepareLayersFromKitSection({
            mode: 'merge',
            existingLayerIds: new Set(['layer-spatial']),
            importWorkspaceLayerBundle: importWorkspace,
            layersSection: {
                index: sampleLayers,
                activeLayerId: 'layer-spatial',
                styles: { 'layer-spatial': { color: '#00ff00' } },
                spatial: { 'layer-spatial': sampleSpatial },
                tables: { 'layer-table': [{ id: 1 }] },
                workspace: {}
            }
        });

        expect(datasets.some((d) => d.id === 'layer-spatial-2')).toBe(true);
        expect(styles['layer-spatial-2']?.color).toBe('#00ff00');
        expect(activeLayerId).toBe('layer-spatial-2');
        expect(imported).toBeDefined();
    });
});
