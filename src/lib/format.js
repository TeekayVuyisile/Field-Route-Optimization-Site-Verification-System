/** "1 site", "3 sites". Pass `plural` for irregular words. */
export const countLabel = (count, singular, plural = `${singular}s`) =>
    `${count} ${count === 1 ? singular : plural}`;

/** "850 m" under a kilometre, then "1.2 km" (whole km from 100 km) */
export const formatDistance = (meters) => {
    if (!Number.isFinite(meters)) return '';
    if (Math.round(meters) < 1000) return `${Math.round(meters)} m`;
    const km = meters / 1000;
    return `${km >= 100 ? Math.round(km) : km.toFixed(1)} km`;
};
