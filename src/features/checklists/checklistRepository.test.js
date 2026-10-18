import { describe, it, expect, vi, beforeEach } from 'vitest';

// Chainable stand-in for supabase-js: every method returns the builder,
// awaiting it yields `result`
let result;
const calls = [];
const builder = new Proxy({}, {
    get(_, prop) {
        if (prop === 'then') return (resolve) => resolve(result);
        return (...args) => { calls.push([prop, ...args]); return builder; };
    }
});
vi.mock('../../lib/supabase', () => ({ supabase: { from: (table) => { calls.push(['from', table]); return builder; } } }));

const repo = await import('./checklistRepository');

describe('checklistRepository', () => {
    beforeEach(() => { calls.length = 0; });

    it("returns null (feature hidden) when the database doesn't have checklists yet", async () => {
        result = { data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.checklist_templates'" } };
        expect(await repo.fetchChecklistTemplates()).toBeNull();

        result = { data: null, error: { code: '42501', message: 'denied' } };
        await expect(repo.fetchChecklistTemplates()).rejects.toMatchObject({ code: '42501' });
    });

    it('inserts a new template and updates an existing one', async () => {
        result = { data: [{ id: 't1', name: 'Audit', items: [] }], error: null };
        await repo.saveChecklistTemplate({ name: 'Audit', items: [] });
        expect(calls).toContainEqual(['insert', [{ name: 'Audit', items: [] }]]);

        calls.length = 0;
        await repo.saveChecklistTemplate({ id: 't1', name: 'Audit 2', items: [] });
        expect(calls.find(([op]) => op === 'update')[1]).toMatchObject({ name: 'Audit 2', updated_at: expect.any(String) });
        expect(calls).toContainEqual(['eq', 'id', 't1']);
    });

    it('reports a change RLS refused instead of pretending it saved', async () => {
        result = { data: [], error: null };
        await expect(repo.saveChecklistTemplate({ id: 't1', name: 'x', items: [] })).rejects.toThrow('Only a team manager');
        await expect(repo.deleteChecklistTemplate('t1')).rejects.toThrow('Only a team manager');
    });
});
