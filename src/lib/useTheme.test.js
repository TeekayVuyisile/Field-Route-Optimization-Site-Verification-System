import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTheme } from './useTheme';
import { THEME_KEY } from './theme';

const mockSystem = (dark) => {
    window.matchMedia = vi.fn(() => ({ matches: dark, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
};

describe('useTheme', () => {
    beforeEach(() => {
        localStorage.clear();
        document.documentElement.className = '';
        document.head.innerHTML = '<meta name="theme-color" content="">';
    });

    it('follows the system until the user chooses', () => {
        mockSystem(true);
        const { result } = renderHook(() => useTheme());
        expect(result.current.theme).toBe('dark');
        expect(document.documentElement).toHaveClass('dark');
        expect(localStorage.getItem(THEME_KEY)).toBeNull();
    });

    it('toggles, saves the choice and updates the browser colour', () => {
        mockSystem(false);
        const { result } = renderHook(() => useTheme());
        act(() => result.current.toggleTheme());

        expect(result.current.theme).toBe('dark');
        expect(localStorage.getItem(THEME_KEY)).toBe('dark');
        expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute('content', '#0B1220');
    });

    it('a saved choice beats the system setting', () => {
        mockSystem(true);
        localStorage.setItem(THEME_KEY, 'light');
        const { result } = renderHook(() => useTheme());
        expect(result.current.theme).toBe('light');
        expect(document.documentElement).not.toHaveClass('dark');
    });
});
