# RouteOps design system (master)

Source of truth for UI decisions. Generated with UI/UX Pro Max
(`--design-system`, query "field operations logistics route navigation
dashboard mobile-first utility professional"), then adjusted to the existing
brand. Page-specific deviations go in `design-system/pages/<page>.md`.

## Direction
- **Style:** Minimalism & Swiss: clean, functional, high contrast, grid-based,
  generous whitespace. Calm SaaS feel (Linear/Vercel/Stripe), not decorative.
- **Primary user:** a field agent on a phone, often one-handed, sometimes in a
  moving vehicle or bright sun. Managers use desktop.

## Tokens (`src/styles/app.css`)
Semantic Tailwind colours backed by CSS variables, so every utility works in
light and `.dark`:

| Token | Use |
|---|---|
| `canvas` / `surface` / `surface-2` | page bg / cards / subtle fills |
| `border` / `border-strong` | hairlines / input borders |
| `fg` / `muted` / `faint` | text: primary / secondary (7.5:1) / smallest allowed (4.8:1) |
| `accent` (+ `-hover`, `-soft`, `-fg`) | the ONE brand colour (Electric Blue #2563EB) |
| `success` / `warning` / `danger` (+ `-soft`) | status only |
| `ink` | deep navy bands (auth panel, overlays) |

- **Deviation from the generated system:** it suggested Fira Code headings and
  an orange CTA. Kept **Plus Jakarta Sans** (existing brand) and a single blue
  accent. Map pins: next stop = accent, visited = success, others = faint.
- Radius: `rounded-xl` controls, `rounded-2xl` cards, `rounded-full` badges.
- Shadows: `shadow-card` (resting), `shadow-raised` (floating), `shadow-overlay` (dialogs).

## Rules
- Touch targets >= 44px (`Button` sizes md/lg/icon; `sm` only for dense desktop tables).
- Body/input text >= 16px on phones (prevents iOS zoom on focus).
- Icons: Lucide via `react-icons/lu`, never emojis; icon-only buttons need `aria-label`.
- Motion 150-300ms, colour/opacity/transform only; `prefers-reduced-motion` respected globally.
- Confirmations use `ConfirmDialog`, never `window.confirm` (blocks the page, can't be styled).
- Every async view has loading (`Skeleton`/`Spinner`), empty (`EmptyState`) and error (`Alert`) states.
- No horizontal scroll at 390px.

## Layout
- `AppShell`: sticky top bar (desktop nav + "New trip"), and on phones a bottom
  tab bar (Trips, Map, New trip, Team) within thumb reach.
- Content width `max-w-7xl`, side padding `px-4 sm:px-6`.

## Theme
Light and dark via a `.dark` class on `<html>`: follows the system until the
user picks one with the top-bar toggle (saved per device, `src/lib/theme.js`).
`index.html` applies the saved theme before first paint. Use semantic tokens,
never raw colours, so both themes work; `bg-ink` bands stay dark in both.
