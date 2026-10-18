import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import dayjs from 'dayjs';
import { formatAnswer } from '../checklists/checklist';
import { TRIP_STATUS_LABELS } from '../trips/tripStatus';
import { countLabel } from '../../lib/format';
import { checkInText } from './reportData';

// Light theme only: a report is printed and filed
const C = {
    ink: '#0F172A', muted: '#475569', faint: '#64748B', border: '#E2E8F0', soft: '#F1F5F9',
    accent: '#2563EB', success: '#047857', successSoft: '#E7F9F1', warning: '#B45309', warningSoft: '#FEF3E2', danger: '#BE123C',
};

const s = StyleSheet.create({
    page: { paddingTop: 40, paddingBottom: 56, paddingHorizontal: 40, fontFamily: 'Helvetica', fontSize: 10, color: C.ink, lineHeight: 1.4 },
    brand: { flexDirection: 'row', alignItems: 'center', marginBottom: 28 },
    brandMark: { width: 18, height: 18, borderRadius: 5, backgroundColor: C.accent, marginRight: 8 },
    brandName: { fontFamily: 'Helvetica-Bold', fontSize: 12 },
    title: { fontFamily: 'Helvetica-Bold', fontSize: 22, lineHeight: 1.25, marginBottom: 6 },
    meta: { color: C.muted, marginBottom: 2 },
    stats: { flexDirection: 'row', marginTop: 20, marginBottom: 8 },
    stat: { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 6, padding: 10, marginRight: 8 },
    statLast: { marginRight: 0 },
    statLabel: { color: C.muted, fontSize: 9 },
    statValue: { fontFamily: 'Helvetica-Bold', fontSize: 18, marginTop: 2 },
    bar: { height: 5, borderRadius: 3, backgroundColor: C.soft, marginTop: 6 },
    barFill: { height: 5, borderRadius: 3 },
    sectionTitle: { fontFamily: 'Helvetica-Bold', fontSize: 13, marginTop: 22, marginBottom: 8 },
    site: { borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10, marginTop: 10 },
    siteHead: { flexDirection: 'row', alignItems: 'center' },
    siteNumber: { width: 20, height: 20, borderRadius: 10, textAlign: 'center', paddingTop: 5, fontSize: 8, fontFamily: 'Helvetica-Bold', marginRight: 8 },
    siteName: { fontFamily: 'Helvetica-Bold', fontSize: 11, flex: 1 },
    badge: { fontSize: 8, fontFamily: 'Helvetica-Bold', paddingVertical: 2, paddingHorizontal: 6, borderRadius: 8, marginLeft: 4 },
    body: { marginLeft: 28, marginTop: 4 },
    coords: { color: C.faint, fontSize: 8, fontFamily: 'Courier' },
    line: { marginTop: 3 },
    label: { color: C.muted },
    answers: { marginTop: 6, backgroundColor: C.soft, borderRadius: 4, padding: 6 },
    answerRow: { flexDirection: 'row', marginBottom: 1 },
    answerLabel: { width: '45%', color: C.muted },
    answerValue: { width: '55%', fontFamily: 'Helvetica-Bold' },
    photos: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
    photo: { width: 112, height: 84, objectFit: 'cover', borderRadius: 4, marginRight: 6, marginBottom: 6 },
    footer: { position: 'absolute', bottom: 24, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between', color: C.faint, fontSize: 8 },
});

const Badge = ({ tone, children }) => {
    const tones = {
        success: { color: C.success, backgroundColor: C.successSoft },
        warning: { color: C.warning, backgroundColor: C.warningSoft },
        neutral: { color: C.muted, backgroundColor: C.soft },
    };
    return <Text style={[s.badge, tones[tone]]}>{children}</Text>;
};

const Stat = ({ label, value, last, children }) => (
    <View style={[s.stat, last && s.statLast]}>
        <Text style={s.statLabel}>{label}</Text>
        <Text style={s.statValue}>{value}</Text>
        {children}
    </View>
);

const SiteSection = ({ site, number, checklist, photos, images }) => {
    const shown = photos.filter((p) => images.has(p.id));
    return (
        <View style={s.site}>
            {/* Name, status and check-in stay together on one page */}
            <View wrap={false}>
                <View style={s.siteHead}>
                    <Text style={[s.siteNumber, { backgroundColor: site.is_checked ? C.successSoft : C.soft, color: site.is_checked ? C.success : C.muted }]}>
                        {number}
                    </Text>
                    <Text style={s.siteName}>{site.name}</Text>
                    <Badge tone={site.is_checked ? 'success' : 'neutral'}>{site.is_checked ? 'Visited' : 'Not visited'}</Badge>
                    {site.is_checked && site.check_flagged && <Badge tone="warning">Flagged</Badge>}
                </View>
                <View style={s.body}>
                    <Text style={s.coords}>{site.latitude.toFixed(5)}, {site.longitude.toFixed(5)}</Text>
                    {site.is_checked && (
                        <Text style={[s.line, site.check_flagged && { color: C.warning }]}>{checkInText(site)}</Text>
                    )}
                    {site.check_note && <Text style={s.line}><Text style={s.label}>Reason: </Text>{site.check_note}</Text>}
                </View>
            </View>
            <View style={s.body}>
                {site.notes && <Text style={s.line}><Text style={s.label}>Notes: </Text>{site.notes}</Text>}
                {/* Unvisited and nothing answered yet: nothing to report */}
                {checklist && (site.is_checked || Object.keys(site.checklist_answers ?? {}).length > 0) && (
                    <View style={s.answers} wrap={false}>
                        {checklist.items.map((item) => {
                            const answer = formatAnswer(item, site.checklist_answers?.[item.id], photos.length);
                            // Only a visited site can have skipped a required item
                            const missing = !answer && item.required && site.is_checked;
                            return (
                                <View key={item.id} style={s.answerRow}>
                                    <Text style={s.answerLabel}>{item.label}</Text>
                                    <Text style={[s.answerValue, missing && { color: C.danger }, !answer && !missing && { color: C.faint }]}>
                                        {answer || (missing ? 'Missing' : '-')}
                                    </Text>
                                </View>
                            );
                        })}
                    </View>
                )}
                {shown.length > 0 && (
                    <View style={s.photos}>
                        {shown.map((photo) => <Image key={photo.id} src={images.get(photo.id)} style={s.photo} />)}
                    </View>
                )}
                {photos.length > shown.length && (
                    <Text style={[s.line, { color: C.faint, fontSize: 8 }]}>
                        {photos.length - shown.length} more photo{photos.length - shown.length === 1 ? '' : 's'} in RouteOps
                    </Text>
                )}
            </View>
        </View>
    );
};

/**
 * The trip report as a PDF: a summary, then every site in visiting order
 * with its check-in, notes, checklist answers and photos.
 * @param {Map<string, Array>} photosBySite all photos per site (for counts)
 * @param {Map<string, string>} images photo id -> embeddable data URL
 */
const TripReportDocument = ({ trip, sites, summary, photosBySite, images, reportPhotos, generatedAt }) => (
    <Document title={`${trip.title} – trip report`} author="RouteOps" creator="RouteOps">
        <Page size="A4" style={s.page}>
            <View style={s.brand}>
                <View style={s.brandMark} />
                <Text style={s.brandName}>RouteOps</Text>
            </View>
            <Text style={s.title}>{trip.title}</Text>
            <Text style={s.meta}>
                {TRIP_STATUS_LABELS[trip.status] ?? trip.status} · Created {dayjs(trip.created_at).format('D MMM YYYY')}
                {trip.completed_at ? ` · Completed ${dayjs(trip.completed_at).format('D MMM YYYY')}` : ''}
            </Text>
            {trip.checklist && <Text style={s.meta}>Checklist: {trip.checklist.name}</Text>}

            <View style={s.stats}>
                <Stat label="Completion" value={`${summary.percent}%`}>
                    <View style={s.bar}>
                        <View style={[s.barFill, { width: `${summary.percent}%`, backgroundColor: summary.percent === 100 ? C.success : C.accent }]} />
                    </View>
                </Stat>
                <Stat label="Visited" value={`${summary.visited} / ${summary.total}`} />
                <Stat label="Flagged" value={summary.flagged} />
                <Stat label="Photos" value={summary.photoCount} last />
            </View>

            <Text style={s.sectionTitle}>{countLabel(sites.length, 'site')} in visiting order</Text>
            {sites.map((site, index) => (
                <SiteSection
                    key={site.id}
                    site={site}
                    number={index + 1}
                    checklist={trip.checklist}
                    photos={photosBySite.get(site.id) ?? []}
                    images={new Map((reportPhotos.get(site.id) ?? []).filter((p) => images.has(p.id)).map((p) => [p.id, images.get(p.id)]))}
                />
            ))}

            <View style={s.footer} fixed>
                <Text>{trip.title} · Generated {dayjs(generatedAt).format('D MMM YYYY, HH:mm')}</Text>
                <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
            </View>
        </Page>
    </Document>
);

export default TripReportDocument;
