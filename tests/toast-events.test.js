import { describe, expect, it, vi } from 'vitest';
import { showErrorToast, showToast, subscribeToasts } from '../js/ui/toast.js';

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

        unsubscribe();
    });
});
