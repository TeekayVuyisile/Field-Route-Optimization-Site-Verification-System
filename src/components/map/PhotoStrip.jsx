import { useEffect, useMemo } from 'react';
import { LuCloudUpload } from 'react-icons/lu';
import { countLabel } from '../../lib/format';

const thumbBox = 'relative size-14 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-2';

// A photo still on the phone: shown from its local copy until it uploads
const QueuedThumb = ({ blob }) => {
    const url = useMemo(() => URL.createObjectURL?.(blob), [blob]);
    useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
    return (
        <span className={thumbBox} title="Waiting to upload">
            {url && <img src={url} alt="" className="size-full object-cover opacity-60" />}
            <LuCloudUpload className="absolute inset-0 m-auto size-5 text-accent" aria-hidden />
        </span>
    );
};

/**
 * This stop's photos: uploaded ones open the viewer; queued ones show
 * locally with an upload badge until the outbox sends them.
 */
const PhotoStrip = ({ siteName, photos, queued, onOpen }) => {
    if (photos.length === 0 && queued.length === 0) return null;

    return (
        <section aria-label={`Photos of ${siteName}`} className="space-y-2">
            <p className="text-sm text-muted">
                {countLabel(photos.length + queued.length, 'photo')}
                {queued.length > 0 && <span className="text-accent"> · {queued.length} waiting to upload</span>}
            </p>
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {photos.map((photo, index) => (
                    <button
                        key={photo.id}
                        type="button"
                        onClick={() => onOpen(index)}
                        className={`${thumbBox} cursor-pointer transition-opacity duration-200 hover:opacity-80`}
                        aria-label={`View photo ${index + 1} of ${siteName}`}
                    >
                        {photo.thumbUrl && <img src={photo.thumbUrl} alt="" loading="lazy" className="size-full object-cover" />}
                    </button>
                ))}
                {queued.map((item) => <QueuedThumb key={item.id} blob={item.thumb ?? item.file} />)}
            </div>
        </section>
    );
};

export default PhotoStrip;
