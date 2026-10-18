/** Scales (width, height) down to fit within `max` on the long side; never up. */
export const fitWithin = (width, height, max) => {
    const scale = Math.min(1, max / Math.max(width, height));
    return { width: Math.round(width * scale), height: Math.round(height * scale) };
};

/**
 * Re-encodes a camera photo as a JPEG of at most `maxSize` px on the long
 * side. A 12 MP phone photo (3-5 MB) becomes roughly 200-400 KB, which
 * matters on prepaid data and in the offline queue. Returns the original
 * when the browser can't decode it (e.g. HEIC on some devices) or when the
 * result wouldn't be smaller.
 */
export const compressImage = async (file, { maxSize = 1600, quality = 0.8 } = {}) => {
    if (!file?.type?.startsWith('image/') || typeof createImageBitmap !== 'function') return file;

    let bitmap;
    try {
        bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
        return file;
    }

    const { width, height } = fitWithin(bitmap.width, bitmap.height, maxSize);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    return blob && blob.size < file.size ? blob : file;
};
