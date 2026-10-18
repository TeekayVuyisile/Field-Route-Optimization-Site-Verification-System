import { useEffect, useState } from 'react';
import { applyTheme, readStoredTheme, storeTheme, systemTheme } from './theme';

/**
 * Current theme plus a toggle. Follows the system setting until the user
 * picks one; after that their choice sticks (per device).
 */
export const useTheme = () => {
    const [theme, setTheme] = useState(() => readStoredTheme() ?? systemTheme());

    useEffect(() => {
        applyTheme(theme);
    }, [theme]);

    useEffect(() => {
        const media = window.matchMedia?.('(prefers-color-scheme: dark)');
        if (!media) return;
        const follow = (e) => { if (!readStoredTheme()) setTheme(e.matches ? 'dark' : 'light'); };
        media.addEventListener('change', follow);
        return () => media.removeEventListener('change', follow);
    }, []);

    const toggleTheme = () => {
        const next = theme === 'dark' ? 'light' : 'dark';
        storeTheme(next);
        setTheme(next);
    };

    return { theme, toggleTheme };
};
