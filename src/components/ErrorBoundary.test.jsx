import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from './ErrorBoundary';

let shouldThrow;
const Bomb = () => {
    if (shouldThrow) throw new Error('boom');
    return <p>page content</p>;
};

describe('ErrorBoundary', () => {
    beforeEach(() => {
        shouldThrow = true;
        // React logs caught render errors; keep test output clean
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => vi.restoreAllMocks());

    it('shows a recovery screen instead of a blank page', () => {
        render(<ErrorBoundary resetKey="/map"><Bomb /></ErrorBoundary>);
        expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
    });

    it('"Try again" re-renders the page', () => {
        render(<ErrorBoundary resetKey="/map"><Bomb /></ErrorBoundary>);
        shouldThrow = false;
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
        expect(screen.getByText('page content')).toBeInTheDocument();
    });

    it('clears the error when the route changes', () => {
        const { rerender } = render(<ErrorBoundary resetKey="/map"><Bomb /></ErrorBoundary>);
        shouldThrow = false;
        rerender(<ErrorBoundary resetKey="/dashboard"><Bomb /></ErrorBoundary>);
        expect(screen.getByText('page content')).toBeInTheDocument();
    });
});
