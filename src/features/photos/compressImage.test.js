import { describe, it, expect } from 'vitest';
import { compressImage, fitWithin } from './compressImage';

describe('fitWithin', () => {
    it('scales the long side down to the limit, keeping the shape', () => {
        expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
        expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    });

    it('never enlarges a small photo', () => {
        expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
    });
});

describe('compressImage', () => {
    it('passes through anything it cannot decode', async () => {
        const pdf = new Blob(['%PDF'], { type: 'application/pdf' });
        expect(await compressImage(pdf)).toBe(pdf);
        // jsdom has no createImageBitmap, like some older browsers
        const photo = new Blob(['x'], { type: 'image/jpeg' });
        expect(await compressImage(photo)).toBe(photo);
    });
});
