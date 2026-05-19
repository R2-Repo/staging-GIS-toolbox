/**
 * Dual Screen Mode — cross-window message protocol
 * @see docs/DUAL_SCREEN_MODE.md
 */

export const CHANNEL_NAME = 'gis-toolbox-dual-screen';
export const PROTOCOL_VERSION = 1;

export const MessageType = {
    HELLO: 'HELLO',
    SNAPSHOT: 'SNAPSHOT',
    LAYER_ADD: 'LAYER_ADD',
    LAYER_UPDATE: 'LAYER_UPDATE',
    LAYER_REMOVE: 'LAYER_REMOVE',
    LAYER_ORDER: 'LAYER_ORDER',
    LAYER_STYLE: 'LAYER_STYLE',
    LAYER_VISIBILITY: 'LAYER_VISIBILITY',
    VIEWPORT: 'VIEWPORT',
    SELECTION: 'SELECTION',
    MAP_CHROME: 'MAP_CHROME',
    DRAW_CMD: 'DRAW_CMD',
    DRAW_EVENT: 'DRAW_EVENT',
    FENCE_SET: 'FENCE_SET',
    FENCE_CLEAR: 'FENCE_CLEAR',
    FILE_DROP: 'FILE_DROP',
    POPUP_ACTION: 'POPUP_ACTION',
    TOAST: 'TOAST',
    BYE: 'BYE',
    PING: 'PING',
    PONG: 'PONG'
};

let _msgCounter = 0;

export function createMessage(role, type, payload = {}) {
    _msgCounter += 1;
    return {
        v: PROTOCOL_VERSION,
        role,
        msgId: `${role}-${Date.now()}-${_msgCounter}`,
        type,
        payload,
        ts: Date.now()
    };
}

export function parseMessage(data) {
    if (!data || typeof data !== 'object') return null;
    if (data.v !== PROTOCOL_VERSION) return null;
    if (!data.type || !data.msgId) return null;
    return data;
}

/**
 * Returns true if an incoming viewport message should be applied (not an echo).
 */
export function shouldApplyViewport(incoming, localRole, lastAppliedMsgId) {
    if (incoming.type !== MessageType.VIEWPORT) return true;
    if (incoming.msgId === lastAppliedMsgId) return false;
    const source = incoming.payload?.source;
    if (source && source === localRole) return false;
    return true;
}

export function serializeLayerForSync(layer, index) {
    return {
        id: layer.id,
        name: layer.name,
        type: layer.type,
        visible: layer.visible !== false,
        geojson: layer.geojson ? JSON.parse(JSON.stringify(layer.geojson)) : null,
        style: layer._mapStyle || null,
        colorIndex: index,
        source: layer.source
    };
}

export function buildSnapshotPayload({ layers, viewport, basemap, is3d, layerStyles }) {
    return {
        layers: layers.map((l, i) => {
            const entry = serializeLayerForSync(l, i);
            const style = layerStyles?.get?.(l.id);
            if (style) entry.style = style;
            return entry;
        }),
        viewport: viewport || null,
        basemap: basemap || 'voyager',
        is3d: !!is3d
    };
}
