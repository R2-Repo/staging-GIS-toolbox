import { describe, it, expect, vi } from 'vitest';
import { TaskRunner, processInChunks, yieldToUI } from '../js/core/task-runner.js';

describe('processInChunks', () => {
    it('processes all items and yields between chunks', async () => {
        const yields = [];
        const original = globalThis.setTimeout;
        vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn, ms) => {
            if (ms === 0) yields.push('yield');
            return original(fn, ms);
        });

        const items = [1, 2, 3, 4, 5];
        const out = await processInChunks(items, 2, (n) => n * 2);
        expect(out).toEqual([2, 4, 6, 8, 10]);
        expect(yields.length).toBeGreaterThan(0);

        vi.restoreAllMocks();
    });

    it('reports progress through an optional task', async () => {
        const task = new TaskRunner('Chunk test', 'Test');
        const steps = [];
        task.onProgress((p) => steps.push(p.percent));

        await task.run(async (t) => {
            await processInChunks([1, 2, 3, 4], 2, (n) => n, t);
        });

        expect(steps.some((p) => p > 0)).toBe(true);
    });
});

describe('yieldToUI', () => {
    it('resolves after a macrotask', async () => {
        let done = false;
        const p = yieldToUI();
        done = true;
        await p;
        expect(done).toBe(true);
    });
});
