import bus from '../../core/event-bus.js';
import { openReactIsland } from '../../ui/open-react-island.js';
import { getSpatialLayerOptions } from '../widget-context.js';
import { applyBulkUpdateToLayer } from './engine.js';
import { BulkUpdateWidget } from '../bulk-update.js';

let _legacyWidget = null;

export async function openBulkUpdate(ctx) {
    if (ctx.isReactToolDialogs) {
        await openReactIsland({
            title: 'Bulk Update',
            width: '560px',
            mountPath: '../../../react/widgets/mountBulkUpdateDialog.jsx',
            mountExport: 'mountBulkUpdateDialog',
            getProps: (close) => ({
                layers: getSpatialLayerOptions(ctx, { includeFields: true }),
                onCancel: () => {
                    ctx.updateSelectionUI?.();
                    close();
                },
                onLayerFocus: (layerId) => {
                    if (!layerId) return;
                    ctx.setActiveLayer?.(layerId);
                    ctx.mapService.setActiveLayerId?.(layerId);
                    ctx.refreshUI();
                },
                onSelectAll: (layerId) => {
                    const layer = ctx.getLayers().find((entry) => entry.id === layerId);
                    if (!layer) return;
                    ctx.mapService.selectAll(layer.id, layer.geojson);
                    ctx.updateSelectionUI?.();
                },
                onInvertSelection: (layerId) => {
                    const layer = ctx.getLayers().find((entry) => entry.id === layerId);
                    if (!layer) return;
                    ctx.mapService.invertSelection(layer.id, layer.geojson);
                    ctx.updateSelectionUI?.();
                },
                onClearSelection: (layerId) => {
                    ctx.mapService.clearSelection(layerId || null);
                    ctx.updateSelectionUI?.();
                },
                onSubscribeSelection: (layerId, callback) => {
                    const refresh = () => callback(ctx.mapService.getSelectionCount(layerId) || 0);
                    refresh();
                    const handler = () => refresh();
                    bus.on('selection:changed', handler);
                    return () => bus.off('selection:changed', handler);
                },
                onApply: ({ layerId, updates, applyTo }) => {
                    const layer = ctx.getLayers().find((entry) => entry.id === layerId);
                    if (!layer?.geojson?.features) throw new Error('Target layer not found.');

                    let selectedIndices;
                    if (applyTo === 'selection') {
                        selectedIndices = ctx.mapService.getSelectedIndices(layer.id) || [];
                        if (selectedIndices.length === 0) {
                            throw new Error('Select features on the map first.');
                        }
                    } else {
                        selectedIndices = layer.geojson.features
                            .map((f) => f.properties?._featureIndex)
                            .filter((idx) => idx !== undefined);
                    }

                    const result = applyBulkUpdateToLayer({ layer, selectedIndices, updates });

                    ctx.mapService.refreshLayerData(layer);
                    ctx.mapService.clearSelection(layer.id);
                    ctx.updateSelectionUI?.();
                    ctx.refreshUI();

                    ctx.showToast(
                        `Updated ${result.fieldCount} field${result.fieldCount === 1 ? '' : 's'} on ${result.updatedCount} feature${result.updatedCount === 1 ? '' : 's'}`,
                        'success'
                    );
                    return result;
                }
            })
        });
        return;
    }

    if (!_legacyWidget) {
        _legacyWidget = new BulkUpdateWidget();
    }
    _legacyWidget.getLayers = ctx.getLayers;
    _legacyWidget.getLayerById = ctx.getLayerById;
    _legacyWidget.mapService = ctx.mapService;
    _legacyWidget.refreshUI = ctx.refreshUI;
    _legacyWidget.showToast = ctx.showToast;
    _legacyWidget.toggle();
}
