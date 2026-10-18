import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { LuClipboardList, LuPencil, LuPlus, LuTrash2 } from 'react-icons/lu';
import { deleteChecklistTemplate, fetchChecklistTemplates, saveChecklistTemplate } from '../../features/checklists/checklistRepository';
import { countLabel } from '../../lib/format';
import ChecklistEditorDialog from '../checklists/ChecklistEditorDialog';
import Button from '../ui/Button';
import { ConfirmDialog } from '../ui/Dialog';
import { Card, Skeleton } from '../ui/primitives';

/** Managers' list of checklist templates, with create / edit / delete. */
const ChecklistsCard = ({ orgId }) => {
    const [templates, setTemplates] = useState(undefined); // undefined: loading; null: not available
    const [editing, setEditing] = useState(null); // { template } | { template: null } for new
    const [toDelete, setToDelete] = useState(null);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        let cancelled = false;
        fetchChecklistTemplates()
            .then((rows) => { if (!cancelled) setTemplates(rows); })
            .catch((error) => {
                if (cancelled) return;
                setTemplates([]);
                toast.error(`Couldn't load checklists: ${error.message}`);
            });
        return () => { cancelled = true; };
    }, [orgId]);

    // Checklists aren't on this database yet (migration 0007 pending)
    if (templates === null) return null;

    const handleSave = async (template) => {
        const saved = await saveChecklistTemplate(template);
        setTemplates((prev) => [...prev.filter((t) => t.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name)));
        setEditing(null);
        toast.success(`"${saved.name}" saved`);
    };

    const handleDelete = async () => {
        try {
            setDeleting(true);
            await deleteChecklistTemplate(toDelete.id);
            setTemplates((prev) => prev.filter((t) => t.id !== toDelete.id));
            toast.success(`"${toDelete.name}" deleted`);
            setToDelete(null);
        } catch (error) {
            toast.error(error.message);
        } finally {
            setDeleting(false);
        }
    };

    return (
        <Card as="section" aria-labelledby="checklists-heading" className="p-5">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h2 id="checklists-heading" className="flex items-center gap-2 font-bold">
                        <LuClipboardList className="size-5 text-accent" aria-hidden /> Site checklists
                    </h2>
                    <p className="mt-1 text-sm text-muted">Questions agents answer at every site. Pick one when creating a trip.</p>
                </div>
                <Button variant="secondary" size="icon" onClick={() => setEditing({ template: null })} aria-label="New checklist" title="New checklist">
                    <LuPlus className="size-5" />
                </Button>
            </div>

            {templates === undefined ? (
                <Skeleton className="mt-4 h-12" />
            ) : templates.length === 0 ? (
                <p className="mt-4 rounded-xl bg-surface-2 p-3 text-sm text-muted">No checklists yet.</p>
            ) : (
                <ul className="mt-4 divide-y divide-border">
                    {templates.map((template) => (
                        <li key={template.id} className="flex items-center gap-2 py-2">
                            <div className="min-w-0 flex-1">
                                <p className="truncate font-semibold">{template.name}</p>
                                <p className="text-sm text-faint">
                                    {countLabel(template.items.length, 'item')}
                                    {' · '}
                                    {template.items.filter((i) => i.required).length} required
                                </p>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => setEditing({ template })} aria-label={`Edit ${template.name}`}>
                                <LuPencil className="size-4" />
                            </Button>
                            <Button variant="danger-ghost" size="icon" onClick={() => setToDelete(template)} aria-label={`Delete ${template.name}`}>
                                <LuTrash2 className="size-4" />
                            </Button>
                        </li>
                    ))}
                </ul>
            )}

            {editing && (
                <ChecklistEditorDialog
                    key={editing.template?.id ?? 'new'}
                    open
                    onOpenChange={(open) => { if (!open) setEditing(null); }}
                    template={editing.template}
                    onSave={handleSave}
                />
            )}
            <ConfirmDialog
                open={Boolean(toDelete)}
                onOpenChange={(open) => { if (!open) setToDelete(null); }}
                title={`Delete "${toDelete?.name}"?`}
                description="Trips that already use it keep their copy and their answers. It just won't be offered for new trips."
                confirmLabel="Delete checklist"
                loading={deleting}
                onConfirm={handleDelete}
            />
        </Card>
    );
};

export default ChecklistsCard;
