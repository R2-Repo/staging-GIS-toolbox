import { describe, it, expect } from 'vitest';
import { LayerInputNode, FileImportNode } from '../js/workflow/nodes/input-nodes.js';

describe('input node canvas detail', () => {
    it('shows file name on file-import nodes when configured', () => {
        const node = new FileImportNode();
        expect(node.getCanvasDetail()).toBeNull();

        node.config.fileName = 'parcels.geojson';
        expect(node.getCanvasDetail()).toBe('parcels.geojson');
    });

    it('shows layer name on layer-input nodes when configured', () => {
        const node = new LayerInputNode();
        const getLayers = () => [
            { id: 'layer-1', name: 'Roads', type: 'spatial' },
            { id: 'layer-2', name: 'Stops', type: 'table' }
        ];

        expect(node.getCanvasDetail({ getLayers })).toBeNull();

        node.config.layerId = 'layer-2';
        expect(node.getCanvasDetail({ getLayers })).toBe('Stops');
    });
});
