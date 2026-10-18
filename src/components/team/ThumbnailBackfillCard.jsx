import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { LuImages } from 'react-icons/lu';
import { fetchPhotosWithoutThumbnails } from '../../features/sites/siteRepository';
import { backfillThumbnails } from '../../features/photos/backfillThumbnails';
import { countLabel } from '../../lib/format';
import Button from '../ui/Button';
import { Card, ProgressBar } from '../ui/primitives';

/**
 * Managers: one-off thumbnails for photos taken before thumbnails existed,
 * so lists and reports stop downloading full-size originals. Hidden once
 * every photo has one.
 */
const ThumbnailBackfillCard = ({ userId }) => {
    const [photos, setPhotos] = useState([]);
    const [progress, setProgress] = useState(null); // { done, total } while running

    useEffect(() => {
        let cancelled = false;
        fetchPhotosWithoutThumbnails()
            .then((rows) => { if (!cancelled) setPhotos(rows); })
            .catch((error) => console.error('Counting photos without thumbnails failed:', error));
        return () => { cancelled = true; };
    }, [userId]);

    if (photos.length === 0) return null;

    const run = async () => {
        setProgress({ done: 0, total: photos.length });
        try {
            const { made, skipped } = await backfillThumbnails(photos, {
                userId,
                onProgress: (done, total) => setProgress({ done, total }),
            });
            toast[skipped ? 'warn' : 'success'](
                skipped
                    ? `Made ${countLabel(made, 'thumbnail')}; ${skipped} couldn't be made (try again with better signal).`
                    : `Made ${countLabel(made, 'thumbnail')}`
            );
            setPhotos(await fetchPhotosWithoutThumbnails());
        } catch (error) {
            toast.error(error.message);
        } finally {
            setProgress(null);
        }
    };

    return (
        <Card as="section" aria-labelledby="thumbs-heading" className="p-5">
            <h2 id="thumbs-heading" className="flex items-center gap-2 font-bold">
                <LuImages className="size-5 text-accent" aria-hidden /> Older photos
            </h2>
            <p className="mt-1 text-sm text-muted">
                {countLabel(photos.length, 'photo')} from before thumbnails existed load at full size in reports.
                Making thumbnails downloads each one once; best on Wi-Fi.
            </p>
            {progress ? (
                <div className="mt-4 space-y-1.5">
                    <p className="text-sm font-semibold tabular-nums">Photo {progress.done} of {progress.total}</p>
                    <ProgressBar value={progress.done} max={progress.total} label="Making thumbnails" />
                </div>
            ) : (
                <Button variant="secondary" className="mt-4 w-full" onClick={run}>Make thumbnails</Button>
            )}
        </Card>
    );
};

export default ThumbnailBackfillCard;
