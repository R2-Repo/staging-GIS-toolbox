import { WorkflowPalette } from './workflow-palette.js';
import { clientToFlowPosition } from './workflow-canvas-bridge.js';
import { bus } from '../core/event-bus.js';

const GRID_SIZE = 20;
const NODE_W = 180;
const NODE_H = 56;
const NUDGE = GRID_SIZE * 2;

function snapToGrid(value) {
    return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

function nudgeAwayFromCollisions(engine, x, y) {
    let nextX = x;
    let nextY = y;
    let attempts = 0;

    while (attempts < 20) {
        let collision = false;
        for (const existing of engine.nodes.values()) {
            if (Math.abs(existing.position.x - nextX) < NODE_W * 0.5
                && Math.abs(existing.position.y - nextY) < NODE_H * 0.5) {
                collision = true;
                break;
            }
        }
        if (!collision) break;
        nextX += NUDGE;
        nextY += NUDGE;
        attempts += 1;
    }

    return { x: nextX, y: nextY };
}

/**
 * Add a palette node at a screen coordinate. Works before and after React Flow mounts.
 */
export function addPaletteNodeAt(engine, canvasEl, type, { clientX, clientY } = {}) {
    const def = WorkflowPalette.findDef(type);
    if (!def) return null;

    const node = def.create();
    const hasScreenPoint = Number.isFinite(clientX) && Number.isFinite(clientY);
    const point = hasScreenPoint
        ? clientToFlowPosition(clientX, clientY, canvasEl)
        : { x: 100, y: 100 };

    const snapped = nudgeAwayFromCollisions(
        engine,
        snapToGrid(point.x),
        snapToGrid(point.y)
    );

    node.position = snapped;
    engine.addNode(node);
    bus.emit('workflow:node-selected', { nodeId: node.id });
    bus.emit('workflow:engine-changed');
    return node;
}
