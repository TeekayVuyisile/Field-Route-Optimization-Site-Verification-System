import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const startDemoSession = vi.fn();
vi.mock('../../features/demo/demoSession', () => ({ startDemoSession: (...a) => startDemoSession(...a) }));
const toastError = vi.fn();
vi.mock('react-toastify', () => ({ toast: { error: (...a) => toastError(...a) } }));
const { default: TryDemoButton } = await import('./TryDemoButton');

const renderButton = () => render(
    <MemoryRouter initialEntries={['/']}>
        <Routes>
            <Route path="/" element={<TryDemoButton />} />
            <Route path="/dashboard" element={<p>dashboard</p>} />
        </Routes>
    </MemoryRouter>
);

describe('TryDemoButton', () => {
    it('sets up the sandbox, then opens the dashboard', async () => {
        let finish;
        startDemoSession.mockReturnValue(new Promise((r) => { finish = r; }));
        renderButton();
        fireEvent.click(screen.getByRole('button', { name: /Try the live demo/ }));
        expect(screen.getByRole('button', { name: /Setting up your demo/ })).toBeDisabled();
        finish();
        expect(await screen.findByText('dashboard')).toBeInTheDocument();
    });

    it('says why it failed and lets the visitor try again', async () => {
        startDemoSession.mockRejectedValue(new Error('The demo is busy right now.'));
        renderButton();
        fireEvent.click(screen.getByRole('button', { name: /Try the live demo/ }));
        await waitFor(() => expect(toastError).toHaveBeenCalledWith('The demo is busy right now.'));
        expect(screen.getByRole('button', { name: /Try the live demo/ })).toBeEnabled();
    });
});
