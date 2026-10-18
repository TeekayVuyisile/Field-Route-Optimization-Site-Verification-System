import { lazy, Suspense, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
    LuFileSpreadsheet, LuKeyboard, LuUpload, LuArrowLeft, LuArrowRight, LuPlus,
    LuPencil, LuTrash2, LuArrowLeftRight, LuCheck, LuMapPin
} from 'react-icons/lu';
import useTripStore from '../store/useTripStore';
import { useAuth } from '../context/useAuth';
import { useTeam } from '../context/useTeam';
import {
    ACCEPTED_FILE_TYPES, readSpreadsheet, guessColumnMapping, rowsToSites,
    swapCoordinates, summarizeSites, isReadable
} from '../features/import/spreadsheet';
import { createTripWithSites, updateTrip } from '../features/trips/tripRepository';
import { fetchChecklistTemplates } from '../features/checklists/checklistRepository';
import { fetchTeamMembers } from '../features/team/teamRepository';
import { statusAfterAssignment } from '../features/trips/tripStatus';
import SiteFormDialog from '../components/trips/SiteFormDialog';
import Button from '../components/ui/Button';
import { Field, Input, Select } from '../components/ui/Field';
import { Alert, Badge, Card, EmptyState, PageHeader, Skeleton } from '../components/ui/primitives';
import { cn } from '../components/ui/cn';
import { countLabel } from '../lib/format';

// Leaflet only downloads when the review step is reached
const SitesPreviewMap = lazy(() => import('../components/trips/SitesPreviewMap'));

const STEPS = ['Add sites', 'Review', 'Save'];

const Stepper = ({ step }) => (
    <ol className="mb-6 flex items-center gap-2 sm:mb-8" aria-label="Progress">
        {STEPS.map((label, index) => {
            const state = index < step ? 'done' : index === step ? 'current' : 'todo';
            return (
                <li key={label} className="flex flex-1 items-center gap-2" aria-current={state === 'current' ? 'step' : undefined}>
                    <span className={cn(
                        'grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold',
                        state === 'done' && 'bg-success text-white',
                        state === 'current' && 'bg-accent text-accent-fg',
                        state === 'todo' && 'bg-surface-2 text-faint'
                    )}>
                        {state === 'done' ? <LuCheck className="size-4" aria-hidden /> : index + 1}
                    </span>
                    <span className={cn('text-sm font-semibold', state === 'todo' ? 'text-faint' : 'text-fg', state !== 'current' && 'hidden sm:inline')}>
                        {label}
                    </span>
                    {index < STEPS.length - 1 && <span className="h-px flex-1 bg-border" aria-hidden />}
                </li>
            );
        })}
    </ol>
);

const coordText = (value, raw) => (Number.isFinite(value) ? value.toFixed(5) : null) ?? (String(raw ?? '').trim() || '(empty)');

const CreateTrip = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { isManager } = useTeam();
    const { currentTrip, sites, setCurrentTrip, setSites, loadTrip, clearStore } = useTripStore();

    // Arriving with a *saved* trip in the store (e.g. a typed URL after using
    // the map) must not offer to save it again: start a fresh draft instead.
    // A staged draft (no id), e.g. after a refresh, resumes at review.
    // Decided once, on arrival: after this page saves, the store DOES hold a
    // saved trip (for the map), and clearing it then would break the hand-off.
    const [hasSavedTrip] = useState(() => Boolean(currentTrip?.id));
    useEffect(() => {
        if (hasSavedTrip) clearStore();
    }, [hasSavedTrip, clearStore]);

    const [step, setStep] = useState(() => (!hasSavedTrip && sites.length > 0 ? 1 : 0));
    const [title, setTitle] = useState(hasSavedTrip ? '' : currentTrip?.title ?? '');
    const [titleTouched, setTitleTouched] = useState(false);

    const [file, setFile] = useState(null); // { name, headers, rows }
    const [mapping, setMapping] = useState({ name: '', lat: '', lng: '' });
    const [reading, setReading] = useState(false);
    const [dragging, setDragging] = useState(false);

    const [dialog, setDialog] = useState(null); // { site } | { site: null } for add
    const [members, setMembers] = useState(null);
    const [assignee, setAssignee] = useState('');
    const [templates, setTemplates] = useState(undefined); // undefined: not loaded; null: unavailable
    const [templateId, setTemplateId] = useState('');
    const [saving, setSaving] = useState(false);

    const summary = summarizeSites(sites);
    const titleError = titleTouched && !title.trim() ? 'Name the trip so your team can find it.' : null;

    // The draft trip is just its title until saved; kept in the store so a
    // refresh doesn't lose it
    const persistTitle = (value) => {
        setTitle(value);
        setCurrentTrip({ title: value });
    };

    const handleFile = async (picked) => {
        if (!picked) return;
        try {
            setReading(true);
            const { headers, rows } = await readSpreadsheet(picked);
            if (rows.length === 0) throw new Error('That file has no rows under its header line.');
            setFile({ name: picked.name, headers, rows });
            setMapping(guessColumnMapping(headers));
        } catch (error) {
            toast.error(error.message);
        } finally {
            setReading(false);
        }
    };

    const requireTitle = () => {
        setTitleTouched(true);
        return Boolean(title.trim());
    };

    const importRows = () => {
        if (!requireTitle()) return;
        setSites(rowsToSites(file.rows, mapping));
        setStep(1);
    };

    const startManual = () => {
        if (!requireTitle()) return;
        setStep(1);
        if (sites.length === 0) setDialog({ site: null });
    };

    const upsertSite = (site) => {
        const exists = sites.some((s) => s.id === site.id);
        setSites(exists ? sites.map((s) => (s.id === site.id ? site : s)) : [...sites, site]);
        setDialog(null);
    };

    const goToSave = async () => {
        setStep(2);
        if (templates === undefined) {
            fetchChecklistTemplates().then(setTemplates).catch(() => setTemplates(null));
        }
        if (isManager && members === null) {
            try {
                setMembers(await fetchTeamMembers());
            } catch {
                setMembers([]);
            }
        }
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            // Single transaction: either the trip and every site are saved, or nothing is
            let { trip, sites: savedSites } = await createTripWithSites(title.trim(), sites);
            // Assignee and checklist in one follow-up update. The trip keeps a
            // copy of the checklist, so later template edits don't change it.
            const template = templates?.find((t) => t.id === templateId);
            const extra = {
                ...(assignee && { assigned_to: assignee, status: statusAfterAssignment(trip.status, assignee) }),
                ...(template && { checklist: { name: template.name, items: template.items } }),
            };
            if (Object.keys(extra).length > 0) {
                try {
                    trip = await updateTrip(trip.id, extra);
                } catch (error) {
                    toast.warn(`Trip saved, but adding the assignee or checklist failed: ${error.message}`);
                }
            }
            // Swap the staged copy for the persisted one so the map syncs edits
            // against real database ids
            loadTrip(trip, savedSites);
            toast.success(`"${trip.title}" saved with ${countLabel(savedSites.length, 'site')}`);
            navigate(`/map/${trip.id}`);
        } catch (error) {
            toast.error(`Couldn't save the trip: ${error.message}`);
            setSaving(false);
        }
    };

    const startOver = () => {
        clearStore();
        setTitle('');
        setFile(null);
        setStep(0);
    };

    return (
        <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
            <PageHeader title="New trip" description="Import or add your sites, check them on the map, then save." />
            <Stepper step={step} />

            {step === 0 && (
                <div className="space-y-6">
                    <Card className="p-5 sm:p-6">
                        <Field label="Trip name" error={titleError} hint="e.g. Soweto WiFi audit, week 43">
                            {(field) => (
                                <Input
                                    {...field}
                                    value={title}
                                    onChange={(e) => persistTitle(e.target.value)}
                                    onBlur={() => setTitleTouched(true)}
                                    autoFocus
                                    autoComplete="off"
                                />
                            )}
                        </Field>
                    </Card>

                    {!file ? (
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                            <label
                                className={cn(
                                    'flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-surface px-6 py-10 text-center transition-colors duration-200',
                                    dragging ? 'border-accent bg-accent-soft' : 'border-border-strong hover:border-accent'
                                )}
                                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                                onDragLeave={() => setDragging(false)}
                                onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
                            >
                                <span className="grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent">
                                    <LuFileSpreadsheet className="size-6" aria-hidden />
                                </span>
                                <span className="mt-4 font-bold">Import a spreadsheet</span>
                                <span className="mt-1 text-sm text-muted">Drop a CSV or Excel file here, or tap to choose one.</span>
                                <span className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-fg">
                                    <LuUpload className="size-4" aria-hidden /> {reading ? 'Reading file...' : 'Choose file'}
                                </span>
                                <input
                                    type="file"
                                    accept={ACCEPTED_FILE_TYPES}
                                    className="sr-only"
                                    onChange={(e) => { handleFile(e.target.files[0]); e.target.value = ''; }}
                                />
                            </label>
                            <button
                                type="button"
                                onClick={startManual}
                                className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-border bg-surface px-6 py-10 text-center shadow-card transition-colors duration-200 hover:border-accent"
                            >
                                <span className="grid size-12 place-items-center rounded-2xl bg-surface-2 text-muted">
                                    <LuKeyboard className="size-6" aria-hidden />
                                </span>
                                <span className="mt-4 font-bold">Add sites by hand</span>
                                <span className="mt-1 text-sm text-muted">Type or paste coordinates one site at a time.</span>
                            </button>
                        </div>
                    ) : (
                        <Card className="p-5 sm:p-6">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <h2 className="font-bold">Match your columns</h2>
                                    <p className="mt-1 truncate text-sm text-muted">
                                        {file.name} · {file.rows.length} rows. We guessed the columns; check them before continuing.
                                    </p>
                                </div>
                                <Button variant="ghost" onClick={() => setFile(null)}>Choose another file</Button>
                            </div>
                            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
                                {[['name', 'Site name'], ['lat', 'Latitude'], ['lng', 'Longitude']].map(([key, label]) => (
                                    <Field key={key} label={label}>
                                        {(field) => (
                                            <Select
                                                {...field}
                                                value={mapping[key]}
                                                invalid={key !== 'name' && !mapping[key]}
                                                onChange={(e) => setMapping({ ...mapping, [key]: e.target.value })}
                                            >
                                                <option value="">{key === 'name' ? 'Number them (Site 1, 2...)' : 'Choose a column'}</option>
                                                {file.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                                            </Select>
                                        )}
                                    </Field>
                                ))}
                            </div>
                            <div className="mt-6 flex justify-end">
                                <Button onClick={importRows} disabled={!mapping.lat || !mapping.lng || mapping.lat === mapping.lng}>
                                    Import {countLabel(file.rows.length, 'site')} <LuArrowRight className="size-4" aria-hidden />
                                </Button>
                            </div>
                        </Card>
                    )}

                    {sites.length > 0 && !file && (
                        <Alert
                            tone="info"
                            title={`You have ${countLabel(sites.length, 'site')} from before`}
                            action={<Button variant="secondary" onClick={() => setStep(1)}>Review them</Button>}
                        >
                            Importing a file replaces them.
                        </Alert>
                    )}
                </div>
            )}

            {step === 1 && (
                <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="neutral">{countLabel(summary.total, 'site')}</Badge>
                        <Badge tone="success">{summary.ready} ready</Badge>
                        {summary.outOfRegion > 0 && <Badge tone="warning">{summary.outOfRegion} outside South Africa</Badge>}
                        {summary.unreadable > 0 && <Badge tone="danger">{summary.unreadable} unreadable</Badge>}
                    </div>

                    {sites.length > 0 && (
                        <Card className="isolate h-64 overflow-hidden sm:h-80">
                            <Suspense fallback={<Skeleton className="h-full rounded-none" />}>
                                <SitesPreviewMap sites={sites} />
                            </Suspense>
                        </Card>
                    )}

                    {summary.unreadable > 0 && (
                        <Alert tone="danger" title="Some coordinates couldn't be read">
                            Fix or remove the rows marked in red to continue. The original cell text is shown so you can see what's wrong.
                        </Alert>
                    )}

                    {sites.length === 0 ? (
                        <EmptyState
                            icon={LuMapPin}
                            title="No sites yet"
                            action={<Button onClick={() => setDialog({ site: null })}><LuPlus className="size-4" aria-hidden /> Add a site</Button>}
                        >
                            Add the places this trip needs to visit.
                        </EmptyState>
                    ) : (
                        <Card as="section" aria-label="Sites">
                            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
                                <h2 className="font-bold">Sites</h2>
                                <Button variant="secondary" onClick={() => setDialog({ site: null })}>
                                    <LuPlus className="size-4" aria-hidden /> Add site
                                </Button>
                            </div>
                            <ul className="max-h-[28rem] divide-y divide-border overflow-y-auto">
                                {sites.map((site, index) => {
                                    const readable = isReadable(site);
                                    return (
                                        <li key={site.id} className="flex items-center gap-3 px-5 py-3">
                                            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-bold text-muted">
                                                {index + 1}
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate font-semibold">{site.name}</p>
                                                <p className={cn('truncate font-mono text-xs', readable ? 'text-faint' : 'text-danger')}>
                                                    {coordText(site.latitude, site.rawLatitude)}, {coordText(site.longitude, site.rawLongitude)}
                                                </p>
                                            </div>
                                            {!readable ? (
                                                <Badge tone="danger">Unreadable</Badge>
                                            ) : site.isInverted ? (
                                                <Button variant="secondary" size="sm" onClick={() => setSites(sites.map((s) => (s.id === site.id ? swapCoordinates(s) : s)))}>
                                                    <LuArrowLeftRight className="size-4" aria-hidden /> Swap
                                                </Button>
                                            ) : !site.isValid ? (
                                                <Badge tone="warning">Outside SA</Badge>
                                            ) : null}
                                            <Button variant="ghost" size="icon" aria-label={`Edit ${site.name}`} onClick={() => setDialog({ site })}>
                                                <LuPencil className="size-4" />
                                            </Button>
                                            <Button variant="danger-ghost" size="icon" aria-label={`Remove ${site.name}`} onClick={() => setSites(sites.filter((s) => s.id !== site.id))}>
                                                <LuTrash2 className="size-4" />
                                            </Button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </Card>
                    )}

                    <div className="flex items-center justify-between gap-3 pt-2">
                        <Button variant="ghost" onClick={() => setStep(0)}>
                            <LuArrowLeft className="size-4" aria-hidden /> Back
                        </Button>
                        <Button onClick={goToSave} disabled={sites.length === 0 || summary.unreadable > 0}>
                            Continue <LuArrowRight className="size-4" aria-hidden />
                        </Button>
                    </div>
                </div>
            )}

            {step === 2 && (
                <div className="space-y-4">
                    <Card className="p-5 sm:p-6">
                        <h2 className="text-lg font-bold">{title.trim()}</h2>
                        <p className="mt-1 text-muted">{countLabel(summary.total, 'site')}, ready to optimize and drive.</p>
                        {summary.outOfRegion > 0 && (
                            <Alert tone="warning" className="mt-4" title={`${countLabel(summary.outOfRegion, 'site')} ${summary.outOfRegion === 1 ? 'is' : 'are'} outside South Africa`}>
                                They'll be kept. Go back if they're mistakes.
                            </Alert>
                        )}
                        {isManager && (
                            <Field label="Assign to" hint="Optional. You can also assign it later from the dashboard." className="mt-5">
                                {(field) => (
                                    <Select {...field} value={assignee} onChange={(e) => setAssignee(e.target.value)} disabled={members === null}>
                                        <option value="">Unassigned</option>
                                        {(members ?? []).map((m) => (
                                            <option key={m.user_id} value={m.user_id}>{m.user_id === user.id ? `${m.email} (you)` : m.email}</option>
                                        ))}
                                    </Select>
                                )}
                            </Field>
                        )}
                        {templates?.length > 0 && (
                            <Field label="Checklist" hint="Agents answer it at every site before checking in." className="mt-5">
                                {(field) => (
                                    <Select {...field} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                                        <option value="">No checklist</option>
                                        {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                                    </Select>
                                )}
                            </Field>
                        )}
                    </Card>
                    <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:items-center sm:justify-between">
                        <Button variant="ghost" onClick={() => setStep(1)} disabled={saving}>
                            <LuArrowLeft className="size-4" aria-hidden /> Back
                        </Button>
                        <Button size="lg" onClick={handleSave} loading={saving}>
                            {saving ? 'Saving...' : 'Save and open map'}
                        </Button>
                    </div>
                </div>
            )}

            {step > 0 && (
                <p className="mt-8 text-center text-sm text-faint">
                    Wrong file or starting over?{' '}
                    <button type="button" onClick={startOver} className="cursor-pointer font-semibold text-accent hover:underline">
                        Discard and start again
                    </button>
                </p>
            )}

            {dialog && (
                <SiteFormDialog
                    key={dialog.site?.id ?? 'new'}
                    open
                    onOpenChange={(open) => { if (!open) setDialog(null); }}
                    site={dialog.site}
                    onSubmit={upsertSite}
                />
            )}
        </div>
    );
};

export default CreateTrip;
