import { createStore } from 'zustand/vanilla';

const DEFAULT_SYNC_EVENTS = [
    'layers:changed',
    'layer:added',
    'layer:removed',
    'layer:updated',
    'layer:active',
    'layer:visibility',
    'layers:reordered',
    'history:changed',
    'ui:changed',
    'ui:responsive',
    'agol:toggled'
];

function getSnapshot(legacyState) {
    const source = legacyState.getState?.() || {};
    return {
        layers: Array.isArray(source.layers) ? [...source.layers] : [],
        activeLayerId: source.activeLayerId ?? null,
        transformHistory: Array.isArray(source.transformHistory) ? [...source.transformHistory] : [],
        historyIndex: Number.isInteger(source.historyIndex) ? source.historyIndex : -1,
        filters: Array.isArray(source.filters) ? [...source.filters] : [],
        agolCompatMode: Boolean(source.agolCompatMode),
        ui: source.ui ? { ...source.ui } : {}
    };
}

function bindAction(legacyState, methodName, ...args) {
    const method = legacyState[methodName];
    if (typeof method !== 'function') {
        throw new Error(`Legacy state method "${methodName}" is not available`);
    }
    method(...args);
}

/**
 * Create a Zustand-backed bridge that mirrors legacy state/bus.
 * This keeps React islands and legacy modules in sync during migration.
 */
export function createLegacyBridge({
    legacyState,
    legacyBus,
    syncEvents = DEFAULT_SYNC_EVENTS
}) {
    if (!legacyState?.getState) {
        throw new Error('createLegacyBridge requires legacyState.getState');
    }
    if (!legacyBus?.on) {
        throw new Error('createLegacyBridge requires legacyBus.on');
    }

    const store = createStore((set) => {
        const syncFromLegacy = () => set(getSnapshot(legacyState));

        return {
            ...getSnapshot(legacyState),
            syncFromLegacy,
            setActiveLayer: (layerId) => {
                bindAction(legacyState, 'setActiveLayer', layerId);
                syncFromLegacy();
            },
            setUIState: (key, value) => {
                bindAction(legacyState, 'setUIState', key, value);
                syncFromLegacy();
            },
            toggleAGOLCompat: () => {
                bindAction(legacyState, 'toggleAGOLCompat');
                syncFromLegacy();
            }
        };
    });

    const unsubs = syncEvents.map((eventName) =>
        legacyBus.on(eventName, () => {
            store.getState().syncFromLegacy();
        })
    );

    return {
        store,
        syncEvents: [...syncEvents],
        destroy: () => {
            for (const off of unsubs) {
                try { off(); } catch { /* noop */ }
            }
        }
    };
}

let singletonBridge = null;

/**
 * Lazy initialize a bridge against the existing legacy state/bus modules.
 */
export async function initLegacyBridge() {
    if (singletonBridge) return singletonBridge;

    const [stateModule, busModule] = await Promise.all([
        import('../js/core/state.js'),
        import('../js/core/event-bus.js')
    ]);

    const legacyState = stateModule.default ?? stateModule;
    const legacyBus = busModule.default ?? busModule.bus;

    singletonBridge = createLegacyBridge({ legacyState, legacyBus });
    return singletonBridge;
}

export function getLegacyBridge() {
    return singletonBridge;
}
