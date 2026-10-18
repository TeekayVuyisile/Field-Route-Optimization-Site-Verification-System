import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { toast } from 'react-toastify';
import { LuArrowLeft, LuCamera, LuDownload, LuFileWarning, LuMap, LuSearch } from 'react-icons/lu';
import useTripStore from '../store/useTripStore';
import { fetchTripWithSites } from '../features/trips/tripRepository';
import { fetchSitePhotos, deleteSitePhoto, downloadSitePhoto } from '../features/sites/siteRepository';
import { buildTripCsv, fileSlug, summarizeReport } from '../features/trips/tripReport';
import { TRIP_STATUS_LABELS, TRIP_STATUS_TONE } from '../features/trips/tripStatus';
import { countLabel, formatDistance } from '../lib/format';
import { saveBlob } from '../lib/download';
import PhotoViewer from '../components/trips/PhotoViewer';
import Button from '../components/ui/Button';
import { Input, Select } from '../components/ui/Field';
import { Alert, Badge, Card, EmptyState, PageHeader, ProgressBar, Skeleton } from '../components/ui/primitives';
import { cn } from '../components/ui/cn';

const FILTERS = [
    { id: 'all', label: 'All', match: () => true },
    { id: 'visited', label: 'Visited', match: (s) => s.is_checked },
    { id: 'open', label: 'Not visited', match: (s) => !s.is_checked },
    { id: 'flagged', label: 'Flagged', match: (s) => s.is_checked && s.check_flagged },
];

const SORTS = {
    order: { label: 'Visiting order', compare: (a, b) => a.order - b.order },
    name: { label: 'Name', compare: (a, b) => a.name.localeCompare(b.name) },
    status: { label: 'Not visited first', compare: (a, b) => Number(a.is_checked) - Number(b.is_checked) || a.order - b.order },
};

// When and how far from the site the check-in was; the reason if flagged.
// Check-ins from before verification existed have none of this.
const CheckInLine = ({ site }) => {
    const parts = [
        site.checked_at && `Checked in ${dayjs(site.checked_at).format('D MMM, HH:mm')}`,
        site.check_distance_m != null
            ? `${formatDistance(site.check_distance_m)} from the site`
            : site.check_flagged && site.checked_at ? 'no location' : null,
    ].filter(Boolean);
    if (parts.length === 0 && !site.check_note) return null;

    return (
        <p className={cn('mt-1 text-sm', site.check_flagged ? 'text-warning' : 'text-muted')}>
            {parts.join(' · ')}
            {site.check_note && <span className="block text-fg">Reason: {site.check_note}</span>}
        </p>
    );
};

const Stat = ({ label, value, children }) => (
    <Card className="p-4 sm:p-5">
        <p className="text-sm font-semibold text-muted">{label}</p>
        <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums sm:text-3xl">{value}</p>
        {children}
    </Card>
);

/**
 * Reporting view for one trip: completion, the verification log with notes
 * and photos, and CSV export. Always reads fresh from the database (not the
 * store), so it also works for a trip someone else is driving.
 */
const TripReview = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const loadTrip = useTripStore((s) => s.loadTrip);

    const [data, setData] = useState(null); // { trip, sites, photos, urlsFailed }
    const [loadError, setLoadError] = useState(null);
    const [reloadKey, setReloadKey] = useState(0);
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState('all');
    const [sort, setSort] = useState('order');
    const [viewer, setViewer] = useState(null); // { siteId, index, key }

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const { trip, sites } = await fetchTripWithSites(id);
                const { photos, urlsFailed } = await fetchSitePhotos(sites.map((s) => s.id));
                if (!cancelled) setData({ trip, sites, photos, urlsFailed });
            } catch (error) {
                console.error('Loading trip report failed:', error);
                if (!cancelled) setLoadError(error);
            }
        })();
        return () => { cancelled = true; };
    }, [id, reloadKey]);

    const photosBySite = useMemo(() => {
        const map = new Map();
        for (const photo of data?.photos ?? []) map.set(photo.site_id, [...(map.get(photo.site_id) ?? []), photo]);
        return map;
    }, [data]);

    if (loadError) {
        return (
            <div className="mx-auto max-w-lg px-4 py-10">
                <EmptyState
                    icon={LuFileWarning}
                    title="Couldn't load this report"
                    action={(
                        <div className="flex flex-wrap justify-center gap-2">
                            <Button variant="secondary" to="/dashboard">Back to trips</Button>
                            <Button onClick={() => { setLoadError(null); setReloadKey((k) => k + 1); }}>Try again</Button>
                        </div>
                    )}
                >
                    The trip may have been deleted, or you may be offline.
                </EmptyState>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-10" aria-busy="true">
                <Skeleton className="h-10 w-2/3 max-w-md" />
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                    {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
                </div>
                <Skeleton className="h-80" />
            </div>
        );
    }

    const { trip, sites, photos, urlsFailed } = data;
    const summary = summarizeReport(sites, photos);
    const needle = query.trim().toLowerCase();
    const counts = Object.fromEntries(FILTERS.map((f) => [f.id, sites.filter(f.match).length]));
    const rows = sites
        .map((site, index) => ({ ...site, order: index + 1 }))
        .filter(FILTERS.find((f) => f.id === filter).match)
        .filter((s) => !needle || s.name.toLowerCase().includes(needle) || (s.notes ?? '').toLowerCase().includes(needle))
        .sort(SORTS[sort].compare);

    const openMap = () => {
        loadTrip(trip, sites);
        navigate(`/map/${trip.id}`);
    };

    const exportCsv = () => {
        saveBlob(new Blob([buildTripCsv(sites, photos)], { type: 'text/csv;charset=utf-8' }), `${fileSlug(trip.title)}-report.csv`);
    };

    const downloadPhoto = async (photo) => {
        try {
            saveBlob(await downloadSitePhoto(photo), photo.file_name || `photo-${photo.id}.jpg`);
        } catch {
            toast.error("Couldn't download the photo. Try again.");
        }
    };

    const deletePhoto = async (photo) => {
        try {
            await deleteSitePhoto(photo);
            const remaining = photos.filter((p) => p.id !== photo.id);
            setData({ ...data, photos: remaining });
            if (!remaining.some((p) => p.site_id === photo.site_id)) setViewer(null);
            toast.success('Photo deleted');
        } catch (error) {
            console.error('Deleting photo failed:', error);
            toast.error("Couldn't delete the photo. Only its uploader or a manager can.");
            throw error;
        }
    };

    const viewerSite = viewer && sites.find((s) => s.id === viewer.siteId);

    return (
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
            <Button variant="ghost" to="/dashboard" className="-ml-3 mb-4">
                <LuArrowLeft className="size-4" aria-hidden /> All trips
            </Button>

            <PageHeader
                title={trip.title}
                description={(
                    <span className="inline-flex flex-wrap items-center gap-2">
                        <Badge tone={TRIP_STATUS_TONE[trip.status] ?? 'neutral'}>{TRIP_STATUS_LABELS[trip.status] ?? trip.status}</Badge>
                        Created {dayjs(trip.created_at).format('D MMM YYYY')} · {countLabel(sites.length, 'site')}
                        {trip.completed_at && <> · Completed {dayjs(trip.completed_at).format('D MMM YYYY')}</>}
                    </span>
                )}
                actions={(
                    <>
                        <Button variant="secondary" onClick={exportCsv} disabled={sites.length === 0}>
                            <LuDownload className="size-4" aria-hidden /> Export CSV
                        </Button>
                        <Button onClick={openMap} disabled={sites.length === 0}>
                            <LuMap className="size-4" aria-hidden /> Open map
                        </Button>
                    </>
                )}
            />

            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                <Stat label="Completion" value={`${summary.percent}%`}>
                    <ProgressBar
                        className="mt-3"
                        value={summary.visited}
                        max={summary.total}
                        tone={summary.percent === 100 ? 'success' : 'accent'}
                        label={`${summary.visited} of ${countLabel(summary.total, 'site')} visited`}
                    />
                </Stat>
                <Stat label="Visited" value={summary.visited}>
                    {summary.flagged > 0 && (
                        <p className="mt-1 text-sm font-semibold text-warning">{summary.flagged} flagged</p>
                    )}
                </Stat>
                <Stat label="Not visited" value={summary.remaining} />
                <Stat label="Photos" value={summary.photoCount} />
            </div>

            {urlsFailed && (
                <Alert tone="warning" className="mt-4" title="Photos couldn't be loaded right now">
                    The rest of the report is up to date. Reload the page to try again.
                </Alert>
            )}

            <Card as="section" aria-labelledby="log-heading" className="mt-6">
                <div className="space-y-3 border-b border-border p-4 sm:p-5">
                    <h2 id="log-heading" className="text-lg font-bold">Verification log</h2>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center">
                        <div className="relative">
                            <LuSearch className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-faint" aria-hidden />
                            <Input
                                type="search"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search sites or notes"
                                aria-label="Search sites or notes"
                                className="pl-10"
                            />
                        </div>
                        <div role="group" aria-label="Filter sites" className="flex flex-wrap gap-1 rounded-xl bg-surface-2 p-1 sm:inline-flex sm:w-fit sm:flex-nowrap sm:gap-0">
                            {FILTERS.filter((f) => f.id !== 'flagged' || counts.flagged > 0 || filter === 'flagged').map((f) => (
                                <button
                                    key={f.id}
                                    type="button"
                                    aria-pressed={filter === f.id}
                                    onClick={() => setFilter(f.id)}
                                    className={cn(
                                        'inline-flex h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold whitespace-nowrap transition-colors duration-200 sm:h-9 sm:flex-none',
                                        filter === f.id ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg',
                                        f.id === 'flagged' && filter !== f.id && 'text-warning'
                                    )}
                                >
                                    {f.label}{' '}
                                    <span className="tabular-nums text-faint">{counts[f.id]}</span>
                                </button>
                            ))}
                        </div>
                        <Select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort sites" className="md:w-48">
                            {Object.entries(SORTS).map(([key, s]) => <option key={key} value={key}>{s.label}</option>)}
                        </Select>
                    </div>
                </div>

                {rows.length === 0 ? (
                    <p className="p-8 text-center text-sm text-muted">
                        {sites.length === 0 ? 'This trip has no sites.' : 'No sites match.'}
                    </p>
                ) : (
                    <ul className="divide-y divide-border">
                        {rows.map((site) => {
                            const sitePhotos = photosBySite.get(site.id) ?? [];
                            return (
                                <li key={site.id} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 gap-y-3 p-4 sm:p-5 lg:grid-cols-[2rem_minmax(0,2fr)_minmax(0,3fr)_12rem] lg:items-start">
                                    <span className={cn(
                                        'grid size-8 place-items-center rounded-full text-xs font-bold',
                                        site.is_checked ? 'bg-success-soft text-success' : 'bg-surface-2 text-muted'
                                    )}>
                                        {site.order}
                                    </span>
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h3 className="font-semibold break-words">{site.name}</h3>
                                            <Badge tone={site.is_checked ? 'success' : 'neutral'}>{site.is_checked ? 'Visited' : 'Not visited'}</Badge>
                                            {site.is_checked && site.check_flagged && <Badge tone="warning">Flagged</Badge>}
                                        </div>
                                        <p className="mt-0.5 font-mono text-xs text-faint">{site.latitude.toFixed(5)}, {site.longitude.toFixed(5)}</p>
                                        {site.is_checked && <CheckInLine site={site} />}
                                    </div>
                                    <p className={cn('col-start-2 text-sm whitespace-pre-line lg:col-start-auto', site.notes ? 'text-fg' : 'text-faint')}>
                                        {site.notes || 'No notes'}
                                    </p>
                                    <div className="col-start-2 flex flex-wrap gap-2 lg:col-start-auto lg:justify-end">
                                        {sitePhotos.length === 0 ? (
                                            <span className="text-sm text-faint">No photos</span>
                                        ) : sitePhotos.map((photo, index) => (
                                            <button
                                                key={photo.id}
                                                type="button"
                                                onClick={() => setViewer({ siteId: site.id, index, key: Date.now() })}
                                                className="grid size-14 cursor-pointer place-items-center overflow-hidden rounded-lg border border-border bg-surface-2 text-faint transition-opacity duration-200 hover:opacity-80"
                                                aria-label={`View photo ${index + 1} of ${site.name}`}
                                            >
                                                {photo.thumbUrl
                                                    ? <img src={photo.thumbUrl} alt="" loading="lazy" className="size-full object-cover" />
                                                    : <LuCamera className="size-5" aria-hidden />}
                                            </button>
                                        ))}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </Card>

            {viewerSite && (
                <PhotoViewer
                    key={viewer.key}
                    open
                    onOpenChange={(open) => { if (!open) setViewer(null); }}
                    siteName={viewerSite.name}
                    photos={photosBySite.get(viewerSite.id) ?? []}
                    startIndex={viewer.index}
                    onDownload={downloadPhoto}
                    onDelete={deletePhoto}
                />
            )}
        </div>
    );
};

export default TripReview;
