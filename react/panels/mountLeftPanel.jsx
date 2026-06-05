import { createRoot } from 'react-dom/client';
import { LayerListPanel, FieldListPanel, DataPrepToolsPanel } from './LeftPanel.jsx';

export function mountLeftPanel({
    layerElement,
    fieldElement,
    toolsElement,
    getSnapshot,
    actions,
    renderDataPrepTools
}) {
    if (!layerElement || !fieldElement || !toolsElement) {
        throw new Error('mountLeftPanel: panel target elements are required');
    }
    if (typeof getSnapshot !== 'function') {
        throw new Error('mountLeftPanel: getSnapshot is required');
    }

    const layerRoot = createRoot(layerElement);
    const fieldRoot = createRoot(fieldElement);
    const toolsRoot = createRoot(toolsElement);

    const render = () => {
        const snapshot = getSnapshot();
        const layers = snapshot?.layers || [];
        const activeLayer = snapshot?.activeLayer || null;
        const fields = activeLayer?.schema?.fields || [];

        layerRoot.render(
            <LayerListPanel
                layers={layers}
                activeLayerId={activeLayer?.id || null}
                actions={actions}
            />
        );

        fieldRoot.render(
            <FieldListPanel
                activeLayer={activeLayer}
                fields={fields}
                actions={actions}
            />
        );

        toolsRoot.render(
            <DataPrepToolsPanel html={renderDataPrepTools?.() || ''} />
        );
    };

    const unmount = () => {
        layerRoot.unmount();
        fieldRoot.unmount();
        toolsRoot.unmount();
    };

    return { render, unmount };
}
