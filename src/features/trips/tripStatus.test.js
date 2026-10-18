import { describe, it, expect } from 'vitest';
import { statusAfterAssignment, statusFromProgress } from './tripStatus';

describe('statusAfterAssignment', () => {
    it('assigning a draft makes it assigned, unassigning returns it to draft', () => {
        expect(statusAfterAssignment('draft', 'user-1')).toBe('assigned');
        expect(statusAfterAssignment('assigned', null)).toBe('draft');
    });

    it('never rewinds a trip that is under way or done', () => {
        expect(statusAfterAssignment('in_progress', null)).toBe('in_progress');
        expect(statusAfterAssignment('completed', 'user-2')).toBe('completed');
    });
});

describe('statusFromProgress', () => {
    const site = (is_checked) => ({ is_checked });

    it('first check starts the trip', () => {
        expect(statusFromProgress('assigned', [site(true), site(false)])).toBe('in_progress');
    });

    it('last check completes it', () => {
        expect(statusFromProgress('in_progress', [site(true), site(true)])).toBe('completed');
    });

    it('unchecking a site reopens a completed trip', () => {
        expect(statusFromProgress('completed', [site(true), site(false)])).toBe('in_progress');
        expect(statusFromProgress('completed', [site(false)])).toBe('in_progress');
    });

    it('leaves untouched trips alone', () => {
        expect(statusFromProgress('draft', [site(false)])).toBe('draft');
        expect(statusFromProgress('in_progress', [site(false)])).toBe('in_progress');
        expect(statusFromProgress('draft', [])).toBe('draft');
    });
});
