import { useState } from 'react';
import { LuArrowDown, LuArrowUp, LuPlus, LuTrash2 } from 'react-icons/lu';
import { Dialog } from '../ui/Dialog';
import Button from '../ui/Button';
import { Field, Input, Select } from '../ui/Field';
import { Alert } from '../ui/primitives';
import { ITEM_TYPES, MAX_ITEMS, cleanTemplate, newItem, templateProblem } from '../../features/checklists/checklist';

/**
 * Create or edit a checklist template. Editing never changes trips that
 * already use it: each trip keeps its own copy.
 * Render with a `key` per template so the form starts fresh.
 */
const ChecklistEditorDialog = ({ open, onOpenChange, template, onSave }) => {
    const [name, setName] = useState(template?.name ?? '');
    const [items, setItems] = useState(() => (template?.items?.length ? template.items : [newItem()]));
    const [problem, setProblem] = useState(null);
    const [saving, setSaving] = useState(false);

    const update = (id, fields) => setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...fields } : item)));
    const move = (index, step) => setItems((prev) => {
        const next = [...prev];
        [next[index], next[index + step]] = [next[index + step], next[index]];
        return next;
    });

    const handleSubmit = async (e) => {
        e.preventDefault();
        const issue = templateProblem({ name, items });
        setProblem(issue);
        if (issue) return;
        try {
            setSaving(true);
            await onSave({ id: template?.id, ...cleanTemplate({ name, items }) });
        } catch (error) {
            setProblem(error.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
            title={template ? 'Edit checklist' : 'New checklist'}
            description="Agents fill this in at each site. Required items must be done before they can check in."
            className="sm:max-w-2xl"
        >
            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                <Field label="Checklist name">
                    {(field) => <Input {...field} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. WiFi site audit" maxLength={100} />}
                </Field>

                <fieldset className="space-y-3">
                    <legend className="mb-2 text-sm font-semibold">Items</legend>
                    {items.map((item, index) => (
                        <div key={item.id} className="rounded-xl border border-border bg-surface-2/50 p-3">
                            <div className="flex items-start gap-2">
                                <span className="mt-3 w-5 shrink-0 text-right text-xs font-bold text-faint">{index + 1}</span>
                                <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_11rem]">
                                    <Input
                                        value={item.label}
                                        onChange={(e) => update(item.id, { label: e.target.value })}
                                        placeholder="e.g. Is the router powered on?"
                                        aria-label={`Item ${index + 1} question`}
                                        maxLength={120}
                                    />
                                    <Select
                                        value={item.type}
                                        onChange={(e) => update(item.id, { type: e.target.value })}
                                        aria-label={`Item ${index + 1} answer type`}
                                    >
                                        {Object.entries(ITEM_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                                    </Select>
                                </div>
                            </div>
                            <div className="mt-2 flex items-center gap-1 pl-7">
                                <label className="mr-auto inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={item.required}
                                        onChange={(e) => update(item.id, { required: e.target.checked })}
                                        className="size-5 accent-[var(--ro-accent)]"
                                    />
                                    Required
                                </label>
                                <Button variant="ghost" size="icon" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move item ${index + 1} up`}>
                                    <LuArrowUp className="size-4" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => move(index, 1)} disabled={index === items.length - 1} aria-label={`Move item ${index + 1} down`}>
                                    <LuArrowDown className="size-4" />
                                </Button>
                                <Button
                                    variant="danger-ghost"
                                    size="icon"
                                    onClick={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
                                    disabled={items.length === 1}
                                    aria-label={`Remove item ${index + 1}`}
                                >
                                    <LuTrash2 className="size-4" />
                                </Button>
                            </div>
                        </div>
                    ))}
                    <Button variant="secondary" className="w-full" onClick={() => setItems((prev) => [...prev, newItem()])} disabled={items.length >= MAX_ITEMS}>
                        <LuPlus className="size-4" aria-hidden /> Add item
                    </Button>
                </fieldset>

                {problem && <Alert tone="danger" title={problem} />}

                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button type="submit" loading={saving}>Save checklist</Button>
                </div>
            </form>
        </Dialog>
    );
};

export default ChecklistEditorDialog;
