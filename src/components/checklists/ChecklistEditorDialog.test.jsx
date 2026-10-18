import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import ChecklistEditorDialog from './ChecklistEditorDialog';

const renderEditor = (props = {}) => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<ChecklistEditorDialog open onOpenChange={() => {}} template={null} onSave={onSave} {...props} />);
    return { onSave, dialog: screen.getByRole('dialog', { name: props.template ? 'Edit checklist' : 'New checklist' }) };
};

describe('ChecklistEditorDialog', () => {
    it('builds a checklist: items, types, required and order', async () => {
        const { onSave, dialog } = renderEditor();
        fireEvent.change(within(dialog).getByLabelText('Checklist name'), { target: { value: ' WiFi audit ' } });
        fireEvent.change(within(dialog).getByLabelText('Item 1 question'), { target: { value: 'Power on?' } });

        fireEvent.click(within(dialog).getByRole('button', { name: 'Add item' }));
        fireEvent.change(within(dialog).getByLabelText('Item 2 question'), { target: { value: 'Router photo' } });
        fireEvent.change(within(dialog).getByLabelText('Item 2 answer type'), { target: { value: 'photo' } });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Move item 2 up' }));
        fireEvent.click(within(dialog).getAllByLabelText('Required')[1]); // now "Power on?"

        fireEvent.click(within(dialog).getByRole('button', { name: 'Save checklist' }));
        await waitFor(() => expect(onSave).toHaveBeenCalled());
        expect(onSave.mock.calls[0][0]).toEqual({
            id: undefined,
            name: 'WiFi audit',
            items: [
                expect.objectContaining({ label: 'Router photo', type: 'photo', required: true }),
                expect.objectContaining({ label: 'Power on?', type: 'check', required: false }),
            ],
        });
    });

    it('explains what is missing instead of saving', () => {
        const { onSave, dialog } = renderEditor();
        fireEvent.click(within(dialog).getByRole('button', { name: 'Save checklist' }));
        expect(within(dialog).getByText('Give the checklist a name.')).toBeInTheDocument();
        expect(onSave).not.toHaveBeenCalled();
    });

    it('edits an existing template in place', async () => {
        const template = { id: 't1', name: 'Audit', items: [{ id: 'a', label: 'Gate', type: 'check', required: true }] };
        const { onSave, dialog } = renderEditor({ template });
        expect(within(dialog).getByLabelText('Item 1 question')).toHaveValue('Gate');
        fireEvent.click(within(dialog).getByRole('button', { name: 'Save checklist' }));
        await waitFor(() => expect(onSave).toHaveBeenCalledWith({ id: 't1', name: 'Audit', items: template.items }));
    });
});
