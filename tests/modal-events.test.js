import { describe, expect, it, vi } from 'vitest';
import {
    dismissModal,
    showModal,
    showProgressModal,
    subscribeModalEvents,
    triggerProgressCancel
} from '../js/ui/modals.js';

describe('modal events', () => {
    it('emits modal show/remove and resolves with dismissal value', async () => {
        const events = [];
        const unsubscribe = subscribeModalEvents((event) => events.push(event));

        const promise = showModal('Test Modal', '<p>Hello</p>');
        expect(events.length).toBe(1);
        expect(events[0].type).toBe('showModal');
        expect(events[0].modal.title).toBe('Test Modal');

        dismissModal(events[0].modal.id, true);
        const result = await promise;

        expect(result).toBe(true);
        expect(events.some((e) => e.type === 'removeModal')).toBe(true);

        unsubscribe();
    });

    it('emits progress lifecycle and invokes cancel handlers', () => {
        const events = [];
        const unsubscribe = subscribeModalEvents((event) => events.push(event));

        const progress = showProgressModal('Working');
        progress.update(42, 'Halfway');

        const onCancel = vi.fn();
        progress.onCancel(onCancel);
        const progressId = events.find((e) => e.type === 'showProgress')?.progress?.id;
        triggerProgressCancel(progressId);
        progress.close();

        expect(events.some((e) => e.type === 'showProgress')).toBe(true);
        expect(events.some((e) => e.type === 'updateProgress')).toBe(true);
        expect(events.some((e) => e.type === 'removeProgress')).toBe(true);
        expect(onCancel).toHaveBeenCalledTimes(1);

        unsubscribe();
    });
});
