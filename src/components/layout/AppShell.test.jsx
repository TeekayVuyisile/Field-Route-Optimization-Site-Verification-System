import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

let authValue;
const signOut = vi.fn().mockResolvedValue({});
vi.mock('../../context/useAuth', () => ({ useAuth: () => authValue }));
vi.mock('../../context/useTeam', () => ({
    useTeam: () => ({ membership: { orgName: 'Ops Team', role: 'manager' } })
}));

const { default: AppShell } = await import('./AppShell');
const { default: useTripStore } = await import('../../store/useTripStore');

const renderAt = (path) => render(
    <MemoryRouter initialEntries={[path]}>
        <AppShell>
            <Routes>
                <Route path="*" element={<p>page</p>} />
                <Route path="/create-trip" element={<p>create page</p>} />
            </Routes>
        </AppShell>
    </MemoryRouter>
);

describe('AppShell', () => {
    beforeEach(() => {
        signOut.mockClear();
        useTripStore.getState().clearStore();
    });

    describe('signed in', () => {
        beforeEach(() => {
            authValue = { user: { id: 'u1', email: 'me@x.co' }, signOut };
        });

        it('has a phone tab bar with Trips, Map, New trip and Team', () => {
            renderAt('/dashboard');
            const navs = screen.getAllByRole('navigation', { name: 'Main' });
            const tabBar = navs[navs.length - 1];
            expect(within(tabBar).getAllByRole('link').map((l) => l.textContent)).toEqual(['Trips', 'Map', 'Team']);
            expect(within(tabBar).getByRole('button', { name: 'New trip' })).toBeInTheDocument();
        });

        it('marks the current section, including nested map routes', () => {
            renderAt('/map/abc');
            const mapLinks = screen.getAllByRole('link', { name: 'Map' });
            expect(mapLinks.every((l) => l.getAttribute('aria-current') === 'page')).toBe(true);
        });

        it('shows the role and team next to the user', () => {
            renderAt('/dashboard');
            expect(screen.getByText('Manager · Ops Team')).toBeInTheDocument();
        });

        it('"New trip" clears any staged trip before opening the wizard', () => {
            useTripStore.getState().loadTrip({ id: 't1', title: 'Old' }, [{ id: 's1' }]);
            renderAt('/dashboard');
            const navs = screen.getAllByRole('navigation', { name: 'Main' });
            fireEvent.click(within(navs[navs.length - 1]).getByRole('button', { name: 'New trip' }));
            expect(useTripStore.getState().currentTrip).toBeNull();
            expect(screen.getByText('create page')).toBeInTheDocument();
        });

        it('signs out from the icon button', () => {
            renderAt('/dashboard');
            fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
            expect(signOut).toHaveBeenCalled();
        });
    });

    describe('signed out', () => {
        beforeEach(() => {
            authValue = { user: null, signOut };
        });

        it('offers both auth links elsewhere, and only the other one on auth pages', () => {
            const { unmount } = renderAt('/');
            expect(screen.getByRole('link', { name: 'Log in' })).toBeInTheDocument();
            expect(screen.getByRole('link', { name: 'Get started' })).toBeInTheDocument();
            unmount();

            renderAt('/login');
            expect(screen.queryByRole('link', { name: 'Log in' })).not.toBeInTheDocument();
            expect(screen.getByRole('link', { name: 'Get started' })).toBeInTheDocument();
        });

        it('has no tab bar', () => {
            renderAt('/');
            expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
        });
    });
});
