import { describe, expect, it, vi } from 'vitest';
import {
    DEFAULT_DURATIONS,
    DEDUPE_MS,
    showErrorToast,
    showToast,
    subscribeToasts
} from '../js/ui/toast.js';

describe('toast events', () => {
    it('emits add/remove events through subscribers', () => {
        vi.useFakeTimers();
        const events = [];
        const unsubscribe = subscribeToasts((event) => events.push(event));

        showToast('Hello', 'success', { duration: 20 });

        expect(events.length).toBe(1);
        expect(events[0].type).toBe('add');
        expect(events[0].toast.message).toBe('Hello');
        expect(events[0].toast.type).toBe('success');
        expect(events[0].toast.duration).toBe(20);

        vi.advanceTimersByTime(25);
        expect(events.length).toBe(2);
        expect(events[1]).toEqual({ type: 'remove', id: events[0].toast.id });

        unsubscribe();
        vi.useRealTimers();
    });

    it('formats error toasts via showErrorToast', () => {
        const events = [];
        const unsubscribe = subscribeToasts((event) => events.push(event));

        showErrorToast({
            title: 'Import failed',
            message: 'Could not parse file',
            guidance: 'Check file format'
        });

        expect(events.length).toBe(1);
        expect(events[0].type).toBe('add');
        expect(events[0].toast.type).toBe('error');
        expect(events[0].toast.message).toContain('Import failed');
        expect(events[0].toast.details).toContain('Check file format');
        expect(events[0].toast.duration).toBe(DEFAULT_DURATIONS.error);

        unsubscribe();
    });

    it('uses shorter default durations by type', () => {
        const events = [];
        const unsubscribe = subscribeToasts((event) => events.push(event));

        showToast('Done', 'success');
        showToast('Heads up', 'info');
        showToast('Careful', 'warning');

        expect(events[0].toast.duration).toBe(DEFAULT_DURATIONS.success);
        expect(events[1].toast.duration).toBe(DEFAULT_DURATIONS.info);
        expect(events[2].toast.duration).toBe(DEFAULT_DURATIONS.warning);

        unsubscribe();
    });

    it('dedupes identical toasts within the dedupe window', () => {
        vi.useFakeTimers();
        const events = [];
        const unsubscribe = subscribeToasts((event) => events.push(event));

        const first = showToast('Added Point', 'success');
        const second = showToast('Added Point', 'success');

        expect(second.id).toBe(first.id);
        expect(events.filter((event) => event.type === 'add')).toHaveLength(1);

        vi.advanceTimersByTime(DEDUPE_MS - 1);
        showToast('Added Point', 'success');
        expect(events.filter((event) => event.type === 'add')).toHaveLength(1);

        vi.advanceTimersByTime(DEFAULT_DURATIONS.success);
        expect(events.some((event) => event.type === 'remove' && event.id === first.id)).toBe(true);

        unsubscribe();
        vi.useRealTimers();
    });
});
