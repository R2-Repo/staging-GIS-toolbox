import { openSpatialAnalyzer } from './spatial-analyzer/controller.js';
import { openBulkUpdate } from './bulk-update/controller.js';
import { openProximityJoin } from './proximity-join/controller.js';

/** @typedef {import('./widget-types.js').WidgetContext} WidgetContext */

export const GIS_WIDGETS = [
    {
        type: 'spatial-analyzer',
        action: 'openSpatialAnalyzer',
        label: 'Find Features in Area',
        icon: '🔎',
        mobileLabel: '📊 Spatial Analyzer',
        tip: 'Search for features from one layer that fall inside a drawn area or polygon layer.',
        open: openSpatialAnalyzer
    },
    {
        type: 'bulk-update',
        action: 'openBulkUpdate',
        label: 'Bulk Update',
        icon: '✏️',
        mobileLabel: '✏️ Bulk Update',
        tip: 'Select multiple features and update their attribute fields in bulk.',
        open: openBulkUpdate
    },
    {
        type: 'proximity-join',
        action: 'openProximityJoin',
        label: 'Proximity Join',
        icon: '↔️',
        mobileLabel: '📍 Proximity Join',
        tip: 'Copy attributes from the nearest feature in a target layer to each source feature.',
        open: openProximityJoin
    }
];

/**
 * Render GIS Widget buttons for the left panel.
 * @returns {string}
 */
export function renderWidgetPanelHtml() {
    return GIS_WIDGETS.map((widget) => (
        `<span class="geo-tool-btn"><button class="btn btn-sm btn-secondary" data-app-action="${widget.action}">${widget.icon} ${widget.label}</button><span class="geo-tip">${widget.tip}</span></span>`
    )).join('');
}

/**
 * Build APP_ACTIONS entries for all registered widgets.
 * @param {() => WidgetContext} getCtx
 * @returns {Record<string, () => void>}
 */
export function buildWidgetActions(getCtx) {
    const actions = {};
    for (const widget of GIS_WIDGETS) {
        actions[widget.action] = () => widget.open(getCtx());
    }
    return actions;
}

/**
 * @param {string} type
 * @param {WidgetContext} ctx
 */
export function openWidget(type, ctx) {
    const widget = GIS_WIDGETS.find((entry) => entry.type === type);
    if (!widget) return;
    widget.open(ctx);
}
