import { useState } from 'react';
import dayjs from 'dayjs';
import { LuChevronLeft, LuChevronRight, LuDownload, LuTrash2 } from 'react-icons/lu';
import { Dialog } from '../ui/Dialog';
import Button from '../ui/Button';

const navButton = 'absolute top-1/2 grid size-11 -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-black/50 text-white transition-colors duration-200 hover:bg-black/70';

/**
 * Full-size view of one site's photos, with previous/next, download and
 * delete. Delete asks inline (a second modal on top of this one would fight
 * it for focus). Render with a `key` per opening so it starts fresh.
 */
const PhotoViewer = ({ open, onOpenChange, siteName, photos, startIndex = 0, onDownload, onDelete }) => {
    const [index, setIndex] = useState(startIndex);
    const [confirming, setConfirming] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const photo = photos[Math.min(index, photos.length - 1)];
    if (!photo) return null;
    // When the photo was taken (offline photos upload later); older ones only have the upload time
    const takenAt = photo.taken_at ?? photo.created_at;

    const go = (step) => {
        setConfirming(false);
        setIndex((i) => (i + step + photos.length) % photos.length);
    };

    const handleDelete = async () => {
        setDeleting(true);
        try {
            await onDelete(photo);
            setConfirming(false);
            setIndex((i) => Math.max(0, Math.min(i, photos.length - 2)));
        } finally {
            setDeleting(false);
        }
    };

    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
            title={siteName}
            description={`Photo ${index + 1} of ${photos.length}${takenAt ? ` · ${dayjs(takenAt).format('D MMM YYYY, HH:mm')}` : ''}`}
            className="sm:max-w-3xl"
        >
            <div className="relative -mx-6 bg-ink">
                {photo.url ? (
                    <img src={photo.url} alt={`${siteName}, photo ${index + 1}`} className="mx-auto max-h-[60dvh] w-full object-contain" />
                ) : (
                    <p className="grid h-64 place-items-center text-sm text-white/70">This photo can't be shown right now.</p>
                )}
                {photos.length > 1 && (
                    <>
                        <button type="button" className={`${navButton} left-3`} onClick={() => go(-1)} aria-label="Previous photo">
                            <LuChevronLeft className="size-5" />
                        </button>
                        <button type="button" className={`${navButton} right-3`} onClick={() => go(1)} aria-label="Next photo">
                            <LuChevronRight className="size-5" />
                        </button>
                    </>
                )}
            </div>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                {confirming ? (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center" role="alert">
                        <span className="text-sm font-semibold">Delete this photo for everyone?</span>
                        <div className="flex gap-2">
                            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={deleting}>Keep it</Button>
                            <Button variant="danger" onClick={handleDelete} loading={deleting}>Delete photo</Button>
                        </div>
                    </div>
                ) : (
                    <Button variant="danger-ghost" onClick={() => setConfirming(true)}>
                        <LuTrash2 className="size-4" aria-hidden /> Delete
                    </Button>
                )}
                <Button variant="secondary" onClick={() => onDownload(photo)}>
                    <LuDownload className="size-4" aria-hidden /> Download original
                </Button>
            </div>
        </Dialog>
    );
};

export default PhotoViewer;
