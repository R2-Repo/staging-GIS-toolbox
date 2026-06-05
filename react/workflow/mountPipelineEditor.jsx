import { mountIsland } from '../mountIsland.jsx';
import { initLegacyBridge } from '../bridge.js';
import { PipelineEditor } from './PipelineEditor.jsx';

export function mountPipelineEditor(element, props = {}) {
    // Start the legacy<->React bridge so React islands can read/write shared state.
    void initLegacyBridge();
    return mountIsland(element, PipelineEditor, props);
}
