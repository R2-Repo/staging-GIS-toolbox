import { describe, it, expect } from 'vitest';
import { createLegacyBridge } from '../react/bridge.js';

class FakeBus {
    constructor() {
        this.handlers = {};
    }

    on(event, fn) {
        (this.handlers[event] ??= []).push(fn);
        return () => {
            this.handlers[event] = (this.handlers[event] || []).filter(h => h !== fn);
        };
    }

    emit(event, data) {
        for (const fn of (this.handlers[event] || [])) fn(data);
    }
}

function createLegacyState() {
    const state = {
        layers: [{ id: 'a', name: 'A' }],
        activeLayerId: 'a',
        agolCompatMode: false,
        transformHistory: [],
        historyIndex: -1,
        ui: { leftPanelOpen: true, rightPanelOpen: true }
    };

    return {
        getState() {
            return state;
        },
        setActiveLayer(id) {
            state.activeLayerId = id;
        },
        setUIState(key, value) {
            state.ui[key] = value;
        },
        toggleAGOLCompat() {
            state.agolCompatMode = !state.agolCompatMode;
        }
    };
}

describe('react legacy bridge', () => {
    it('seeds Zustand state from legacy state snapshot', () => {
        const legacyState = createLegacyState();
        const bus = new FakeBus();
        const bridge = createLegacyBridge({ legacyState, legacyBus: bus });

        expect(bridge.store.getState().activeLayerId).toBe('a');
        expect(bridge.store.getState().layers.length).toBe(1);
        expect(bridge.store.getState().ui.leftPanelOpen).toBe(true);

        bridge.destroy();
    });

    it('updates the bridge store when legacy bus emits sync events', () => {
        const legacyState = createLegacyState();
        const bus = new FakeBus();
        const bridge = createLegacyBridge({ legacyState, legacyBus: bus });

        legacyState.getState().layers.push({ id: 'b', name: 'B' });
        bus.emit('layers:changed');
        expect(bridge.store.getState().layers.length).toBe(2);

        legacyState.setActiveLayer('b');
        bus.emit('layer:active');
        expect(bridge.store.getState().activeLayerId).toBe('b');

        bridge.destroy();
    });

    it('forwards bridge actions to legacy state and syncs snapshot', () => {
        const legacyState = createLegacyState();
        const bus = new FakeBus();
        const bridge = createLegacyBridge({ legacyState, legacyBus: bus });
        const api = bridge.store.getState();

        api.setUIState('leftPanelOpen', false);
        expect(legacyState.getState().ui.leftPanelOpen).toBe(false);
        expect(bridge.store.getState().ui.leftPanelOpen).toBe(false);

        api.toggleAGOLCompat();
        expect(legacyState.getState().agolCompatMode).toBe(true);
        expect(bridge.store.getState().agolCompatMode).toBe(true);

        bridge.destroy();
    });
});
