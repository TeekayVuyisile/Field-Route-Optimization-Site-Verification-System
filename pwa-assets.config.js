import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// App icons for the install prompt and home screen, generated from the
// favicon: `npm run generate-pwa-assets` (output is committed in public/).
// Maskable and Apple icons sit on the brand blue so platform masks (circle,
// squircle) never show a white edge.
const brand = { background: '#2563EB' }

export default defineConfig({
    headLinkOptions: { preset: '2023' },
    preset: {
        ...minimal2023Preset,
        maskable: { ...minimal2023Preset.maskable, resizeOptions: brand },
        apple: { ...minimal2023Preset.apple, resizeOptions: brand },
    },
    images: ['public/favicon.svg'],
})
