import { openReactIsland } from '../../ui/open-react-island.js';
import { getSpatialLayerOptions } from '../widget-context.js';
import {
    auditLayers,
    buildBatchReprojectPlan,
    getAvailablePresets,
    loadCrsFavorites,
    saveCrsFavorites,
    validateCustomWkt
} from './engine.js';
import { registerWkt } from '../../crs/registry.js';
import { reprojectLayer } from '../../tools/reproject.js';
import { getLayerCrs } from '../../crs/layer-crs.js';

export async function openCrsManager(ctx) {
    await openReactIsland({
        title: 'CRS Manager',
        width: '620px',
        mountPath: '../../../react/widgets/mountCrsManagerDialog.jsx',
        mountExport: 'mountCrsManagerDialog',
        getProps: (close) => ({
            layers: getSpatialLayerOptions(ctx),
            audit: auditLayers(ctx.getLayers()),
            presets: getAvailablePresets(),
            favorites: loadCrsFavorites(),
            onCancel: close,
            onSaveFavorites: (favorites) => saveCrsFavorites(favorites),
            onRegisterWkt: async (wkt) => {
                const check = validateCustomWkt(wkt);
                if (!check.valid) throw new Error(check.message);
                await registerWkt(check.code, wkt);
                return check.code;
            },
            onReprojectLayers: async (layerIds, targetCrs) => {
                const plan = buildBatchReprojectPlan(layerIds, targetCrs);
                const created = [];
                for (const step of plan) {
                    const layer = ctx.getLayers().find((entry) => entry.id === step.layerId);
                    if (!layer) continue;
                    const result = await reprojectLayer(layer, {
                        fromCrs: getLayerCrs(layer),
                        toCrs: step.toCrs,
                        name: `${layer.name}${step.outputSuffix}`
                    });
                    ctx.addLayer(result);
                    ctx.mapService.addLayer(result, ctx.getLayers().indexOf(result), { fit: false });
                    created.push(result.name);
                }
                ctx.refreshUI();
                ctx.showToast(`Reprojected ${created.length} layer(s)`, 'success');
                return created;
            }
        })
    });
}
