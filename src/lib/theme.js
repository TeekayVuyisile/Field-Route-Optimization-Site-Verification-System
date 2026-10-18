// Light/dark theme. index.html applies the saved choice before first paint
// (same key and logic, inlined there) so the page never flashes the wrong
// theme; this module handles changes after that.

export const THEME_KEY = 'routeops-theme';
const THEME_COLORS = { light: '#F8FAFC', dark: '#0B1220' };

/** The saved choice, or null to follow the system. Storage can throw (private mode). */
export const readStoredTheme = () => {
    try {
        const value = localStorage.getItem(THEME_KEY);
        return value === 'light' || value === 'dark' ? value : null;
    } catch {
        return null;
    }
};

export const storeTheme = (theme) => {
    try {
        localStorage.setItem(THEME_KEY, theme);
    } catch {
        // Not saved; the toggle still works for this visit
    }
};

export const systemTheme = () =>
    (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

export const applyTheme = (theme) => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
};
