import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ManualSiteModal from './ManualSiteModal';

const fill = (label, value) => fireEvent.input(screen.getByLabelText(label), { target: { value } });

const renderModal = () => {
    const onAdd = vi.fn();
    render(<ManualSiteModal show onHide={() => {}} onAdd={onAdd} editData={null} />);
    return onAdd;
};

describe('ManualSiteModal', () => {
    it('accepts DMS and decimal-comma input and stores decimal degrees', async () => {
        const onAdd = renderModal();
        fill('Site Name', 'Tower 7');
        fill('Latitude', `26°12'15"S`);
        fill('Longitude', '28,0473');
        fireEvent.click(screen.getByRole('button', { name: 'Add Site' }));

        await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
        const site = onAdd.mock.calls[0][0];
        expect(site.latitude).toBeCloseTo(-26.204167, 5);
        expect(site.longitude).toBeCloseTo(28.0473, 5);
        expect(site.isValid).toBe(true);
        expect(site.id).toMatch(/^local-/);
    });

    it('shows a format hint and does not add a site for unreadable input', async () => {
        const onAdd = renderModal();
        fill('Site Name', 'Tower 7');
        fill('Latitude', '-26 abc');
        fill('Longitude', '28.0473');
        fireEvent.click(screen.getByRole('button', { name: 'Add Site' }));

        expect(await screen.findByText(/Use decimal/)).toBeInTheDocument();
        expect(onAdd).not.toHaveBeenCalled();
    });
});
