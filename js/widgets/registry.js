import { openSpatialAnalyzer } from './spatial-analyzer/controller.js';
import { openBulkUpdate } from './bulk-update/controller.js';
import { openProximityJoin } from './proximity-join/controller.js';
import { openRouteMilepostSegment } from './route-milepost-segment/controller.js';
import { openProjectStationing } from './project-stationing/controller.js';
import { openCrsManager } from './crs-manager/controller.js';

/** @typedef {import('./widget-types.js').WidgetContext} WidgetContext */

export const GIS_WIDGETS = [
    {
        type: 'spatial-analyzer',
        action: 'openSpatialAnalyzer',
        label: 'Find Features in Area',
        icon: '🔎',
        tip: 'Search for features from one layer that fall inside a drawn area or polygon layer.',
        open: openSpatialAnalyzer
    },
    {
        type: 'bulk-update',
        action: 'openBulkUpdate',
        label: 'Bulk Update',
        icon: '✏️',
        tip: 'Select multiple features and update their attribute fields in bulk.',
        open: openBulkUpdate
    },
    {
        type: 'proximity-join',
        action: 'openProximityJoin',
        label: 'Proximity Join',
        icon: '↔️',
        tip: 'Copy attributes from the nearest feature in a target layer to each source feature.',
        open: openProximityJoin
    },
    {
        type: 'route-milepost-segment',
        action: 'openRouteMilepostSegment',
        label: 'Route Centerline',
        icon: '🛣️',
        tip: 'Build a road centerline between two UDOT mileposts.',
        open: openRouteMilepostSegment
    },
    {
        type: 'project-stationing',
        action: 'openProjectStationing',
        label: 'Project Stationing',
        icon: '📐',
        tip: 'Generate 100-ft project station segments along a UDOT route centerline.',
        open: openProjectStationing
    },
    {
        type: 'crs-manager',
        action: 'openCrsManager',
        label: 'CRS Manager',
        icon: '🌐',
        tip: 'Audit layer coordinate systems, batch reproject, and manage CRS favorites.',
        open: openCrsManager
    }
];

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
