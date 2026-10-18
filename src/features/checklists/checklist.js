/**
 * Site checklists. A template is { name, items }; a trip carries a copy as
 * `trips.checklist`; each site's answers are `sites.checklist_answers`
 * ({ [item.id]: value }). Answer rules match public.checklist_answered
 * (migration 0007), except photo items, which only the app can judge.
 */

export const ITEM_TYPES = {
    check: 'Tick box',
    text: 'Short answer',
    number: 'Number',
    photo: 'Photo of the site',
};

export const MAX_ITEMS = 50;

export const newItem = () => ({ id: crypto.randomUUID().slice(0, 8), label: '', type: 'check', required: true });

export const isAnswered = (item, value, photoCount = 0) => {
    switch (item.type) {
        case 'check': return value === true;
        case 'text': return typeof value === 'string' && value.trim() !== '';
        case 'number': return typeof value === 'number' && Number.isFinite(value);
        case 'photo': return photoCount > 0;
        default: return true;
    }
};

/** Required items still unanswered (they block check-in) */
export const missingRequired = (checklist, answers = {}, photoCount = 0) =>
    (checklist?.items ?? []).filter((item) => item.required && !isAnswered(item, answers[item.id], photoCount));

export const checklistProgress = (checklist, answers = {}, photoCount = 0) => {
    const items = checklist?.items ?? [];
    return { done: items.filter((item) => isAnswered(item, answers[item.id], photoCount)).length, total: items.length };
};

/** Trimmed copy without blank items, ready to save */
export const cleanTemplate = ({ name, items }) => ({
    name: name.trim(),
    items: items
        .map((item) => ({ ...item, label: item.label.trim() }))
        .filter((item) => item.label),
});

/** What's wrong with a template before saving, or null */
export const templateProblem = ({ name, items }) => {
    if (!name.trim()) return 'Give the checklist a name.';
    const filled = items.filter((item) => item.label.trim());
    if (filled.length === 0) return 'Add at least one item.';
    if (filled.length > MAX_ITEMS) return `A checklist can have at most ${MAX_ITEMS} items.`;
    return null;
};

/** An answer as text, for the report and CSV */
export const formatAnswer = (item, value, photoCount = 0) => {
    switch (item.type) {
        case 'check': return value === true ? 'Yes' : value === false ? 'No' : '';
        case 'text': return typeof value === 'string' ? value.trim() : '';
        case 'number': return typeof value === 'number' ? String(value) : '';
        case 'photo': return photoCount > 0 ? `${photoCount} photo${photoCount === 1 ? '' : 's'}` : '';
        default: return value == null ? '' : String(value);
    }
};
