import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const updateCheckinRadius = vi.fn();
vi.mock('../../features/team/teamRepository', () => ({ updateCheckinRadius: (...a) => updateCheckinRadius(...a) }));

const { default: CheckinRadiusCard } = await import('./CheckinRadiusCard');

describe('CheckinRadiusCard', () => {
    beforeEach(() => updateCheckinRadius.mockReset().mockResolvedValue(300));

    it('saves a new radius and tells the team context to reload', async () => {
        const onSaved = vi.fn();
        render(<CheckinRadiusCard orgId="o1" radius={150} onSaved={onSaved} />);
        const save = screen.getByRole('button', { name: 'Save' });
        expect(save).toBeDisabled(); // unchanged

        fireEvent.change(screen.getByLabelText('Distance in metres'), { target: { value: '300' } });
        fireEvent.click(save);
        await waitFor(() => expect(onSaved).toHaveBeenCalled());
        expect(updateCheckinRadius).toHaveBeenCalledWith('o1', 300);
    });

    it('refuses values the database would reject', () => {
        render(<CheckinRadiusCard orgId="o1" radius={150} onSaved={() => {}} />);
        fireEvent.change(screen.getByLabelText('Distance in metres'), { target: { value: '10' } });
        expect(screen.getByText('Between 25 and 5000 m')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });
});
