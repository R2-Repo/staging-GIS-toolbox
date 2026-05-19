import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskRunner, getActiveTask, processInChunks } from '../js/core/task-runner.js';

describe('TaskRunner', () => {
    beforeEach(() => {
        const t = getActiveTask();
        if (t && !t.cancelled) t.cancel();
    });

    it('registers as active task while run() is in progress', async () => {
        const task = new TaskRunner('Test', 'TestModule');
        let seenDuringRun = null;

        const result = await task.run(async (t) => {
            seenDuringRun = getActiveTask();
            return 42;
        });

        expect(result).toBe(42);
        expect(seenDuringRun).toBe(task);
        expect(getActiveTask()).toBeNull();
        expect(task.state).toBe('completed');
    });

    it('cancel() aborts run and returns null', async () => {
        const task = new TaskRunner('Slow', 'TestModule');

        const runPromise = task.run(async (t) => {
            await new Promise((r) => setTimeout(r, 50));
            t.throwIfCancelled();
            return { done: true };
        });

        await new Promise((r) => setTimeout(r, 5));
        task.cancel();

        const result = await runPromise;
        expect(result).toBeNull();
        expect(task.state).toBe('cancelled');
        expect(task.cancelled).toBe(true);
    });

    it('throwIfCancelled throws with cancelled flag', () => {
        const task = new TaskRunner('X', 'TestModule');
        task.cancel();
        expect(() => task.throwIfCancelled()).toThrow(/cancelled/i);
        try {
            task.throwIfCancelled();
        } catch (e) {
            expect(e.cancelled).toBe(true);
        }
    });

    it('processInChunks respects cancellation', async () => {
        const task = new TaskRunner('Chunk', 'TestModule');
        const items = Array.from({ length: 50 }, (_, i) => i);

        const promise = processInChunks(items, 5, (n) => n, task);
        task.cancel();

        await expect(promise).rejects.toMatchObject({ cancelled: true });
    });
});
