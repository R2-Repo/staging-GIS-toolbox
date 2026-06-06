import { renderWidgetPanelHtml } from '../widgets/registry.js';

/**
 * HTML for Layer Data Tools / GIS Widgets / GIS Tools sections in the left panel.
 * @param {() => import('../core/data-model.js').Dataset | null | undefined} getActiveLayer
 */
export function renderDataPrepToolsHtml(getActiveLayer) {
    const layer = typeof getActiveLayer === 'function' ? getActiveLayer() : null;
    const hasFilter = !!layer?._activeFilter;
    return `
        <div class="panel-section">
            <div class="panel-section-header" data-collapsible="true">
                Layer Data Tools <span class="arrow">▼</span>
            </div>
            <div class="panel-section-body">
                <div style="display:flex; flex-wrap:wrap; gap:4px;">
                    <button class="btn btn-sm btn-secondary" data-app-action="openSplitColumn">Split Column</button>
                    <button class="btn btn-sm btn-secondary" data-app-action="openCombineColumns">Combine</button>
                    <button class="btn btn-sm btn-secondary" data-app-action="openTemplateBuilder">Template</button>
                    <button class="btn btn-sm btn-secondary" data-app-action="openReplaceClean">Replace/Clean</button>
                    <button class="btn btn-sm btn-secondary" data-app-action="openTypeConvert">Type Convert</button>
                    <button class="btn btn-sm ${hasFilter ? 'btn-primary' : 'btn-secondary'}" data-app-action="openFilterBuilder">${hasFilter ? '⚙ Filter ✓' : 'Filter'}</button>
                    <button class="btn btn-sm btn-secondary" data-app-action="openDeduplicate">Dedup</button>
                    <button class="btn btn-sm btn-secondary" data-app-action="openJoinTool">Join</button>
                    <button class="btn btn-sm btn-secondary" data-app-action="openValidation">Validate</button>
                    <button class="btn btn-sm btn-secondary" data-app-action="addUID">Add UID</button>
                </div>
            </div>
        </div>

        <div class="panel-section">
            <div class="panel-section-header" data-collapsible="true">
                GIS Widgets <span class="arrow">▼</span>
            </div>
            <div class="panel-section-body">
                <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px;">Pre-built workflows for common GIS tasks.</div>
                <div style="display:flex; flex-wrap:wrap; gap:4px;">
                    ${renderWidgetPanelHtml()}
                </div>
            </div>
        </div>`;
}
