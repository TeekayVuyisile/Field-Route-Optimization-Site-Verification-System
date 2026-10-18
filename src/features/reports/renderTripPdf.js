import { createElement } from 'react';
import { pdf } from '@react-pdf/renderer';
import TripReportDocument from './TripReportDocument';
import { pickReportPhotos, preparePhotos } from './reportData';
import { summarizeReport } from '../trips/tripReport';

/**
 * Builds the trip report PDF in the browser (no server, works offline for
 * everything but photos). Loaded on demand: the PDF library is large.
 * @returns {Promise<{ blob: Blob, missingPhotos: number }>}
 */
export const renderTripPdf = async ({ trip, sites, photos, onProgress = () => {}, generatedAt = new Date() }) => {
    const photosBySite = new Map();
    for (const photo of photos) photosBySite.set(photo.site_id, [...(photosBySite.get(photo.site_id) ?? []), photo]);

    const reportPhotos = pickReportPhotos(photos);
    const wanted = [...reportPhotos.values()].flat();
    const images = await preparePhotos(wanted, { onProgress });

    const doc = createElement(TripReportDocument, {
        trip, sites, summary: summarizeReport(sites, photos), photosBySite, images, reportPhotos, generatedAt,
    });
    return { blob: await pdf(doc).toBlob(), missingPhotos: wanted.length - images.size };
};
