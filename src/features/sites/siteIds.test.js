import { describe, it, expect } from 'vitest';
import { createLocalId, isPersistedId } from './siteIds';

describe('site ids', () => {
    it('local ids are never treated as persisted', () => {
        expect(isPersistedId(createLocalId())).toBe(false);
    });

    // Regression: the old `id.length === 36` check said a bare randomUUID
    // (what staged sites used) was a real database row
    it('a database UUID is persisted', () => {
        expect(isPersistedId('3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b')).toBe(true);
    });

    it('rejects missing or non-string ids', () => {
        expect(isPersistedId(undefined)).toBe(false);
        expect(isPersistedId('')).toBe(false);
        expect(isPersistedId(42)).toBe(false);
    });

    it('generates unique ids', () => {
        expect(createLocalId()).not.toBe(createLocalId());
    });
});
