import { supabase } from '../../lib/supabase';

// The table doesn't exist yet: migration 0007 not applied to this database
const isMissingTable = (error) => error?.code === '42P01' || error?.code === 'PGRST205';

/**
 * The team's checklist templates (RLS: the user's own team), by name.
 * @returns {Promise<Array|null>} null when checklists aren't available on
 *   this database yet, so the app hides the feature instead of failing
 */
export const fetchChecklistTemplates = async () => {
    const { data, error } = await supabase
        .from('checklist_templates')
        .select('id, name, items, updated_at')
        .order('name');
    if (error) {
        if (isMissingTable(error)) return null;
        throw error;
    }
    return data;
};

/** Creates or updates a template (managers only: RLS) */
export const saveChecklistTemplate = async ({ id, name, items }) => {
    const query = id
        ? supabase.from('checklist_templates').update({ name, items, updated_at: new Date().toISOString() }).eq('id', id)
        : supabase.from('checklist_templates').insert([{ name, items }]);
    const { data, error } = await query.select('id, name, items, updated_at');
    if (error) throw error;
    if (!data?.length) throw new Error('Only a team manager can change checklists.');
    return data[0];
};

export const deleteChecklistTemplate = async (id) => {
    const { data, error } = await supabase.from('checklist_templates').delete().eq('id', id).select('id');
    if (error) throw error;
    if (!data?.length) throw new Error('Only a team manager can delete checklists.');
};
