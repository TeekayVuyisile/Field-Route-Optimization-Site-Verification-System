import { useState } from 'react';
import { Dialog } from '../ui/Dialog';
import Button from '../ui/Button';
import { Field, Input } from '../ui/Field';
import { parseCoordinate, validateCoordinates } from '../../utils/validation';
import { createLocalId } from '../../features/sites/siteIds';
import { withValidation } from '../../features/import/spreadsheet';
import { Alert } from '../ui/primitives';

const FORMAT_HINT = `Decimal (-26.2041 or -26,2041) or DMS (26°12'15"S)`;

const toText = (value) => (Number.isFinite(value) ? String(value) : '');

/**
 * Add or edit one site. Coordinate fields are text on purpose: number inputs
 * reject DMS and, on some SA-locale phones, decimal commas.
 * Render with a `key` that changes per site so the form resets.
 */
const SiteFormDialog = ({ open, onOpenChange, site, onSubmit }) => {
    const [name, setName] = useState(site?.name ?? '');
    const [lat, setLat] = useState(toText(site?.latitude));
    const [lng, setLng] = useState(toText(site?.longitude));
    const [touched, setTouched] = useState(false);

    const latValue = parseCoordinate(lat);
    const lngValue = parseCoordinate(lng);
    const errors = {
        name: name.trim() ? null : 'Give the site a name.',
        lat: Number.isNaN(latValue) ? FORMAT_HINT : null,
        lng: Number.isNaN(lngValue) ? FORMAT_HINT : null,
    };
    const hasErrors = Object.values(errors).some(Boolean);
    // Readable but not in South Africa: a warning, not an error (some teams
    // do work over the border), with a one-tap fix for swapped columns
    const region = errors.lat || errors.lng ? null : validateCoordinates(latValue, lngValue);

    const handleSubmit = (e) => {
        e.preventDefault();
        setTouched(true);
        if (hasErrors) return;
        onSubmit(withValidation({
            is_checked: false,
            notes: '',
            ...site,
            id: site?.id ?? createLocalId(),
            name: name.trim(),
            latitude: latValue,
            longitude: lngValue,
            rawLatitude: undefined,
            rawLongitude: undefined,
        }));
    };

    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
            title={site ? 'Edit site' : 'Add a site'}
            description="Paste coordinates from a spreadsheet, Google Maps or a GPS unit."
        >
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <Field label="Site name" error={touched ? errors.name : null}>
                    {(field) => <Input {...field} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />}
                </Field>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Latitude" error={touched ? errors.lat : null}>
                        {(field) => (
                            <Input {...field} value={lat} onChange={(e) => setLat(e.target.value)} placeholder="-26.2041" autoComplete="off" />
                        )}
                    </Field>
                    <Field label="Longitude" error={touched ? errors.lng : null}>
                        {(field) => (
                            <Input {...field} value={lng} onChange={(e) => setLng(e.target.value)} placeholder="28.0473" autoComplete="off" />
                        )}
                    </Field>
                </div>
                {region?.isInverted ? (
                    <Alert
                        tone="warning"
                        title="Latitude and longitude look swapped"
                        action={<Button variant="secondary" size="sm" onClick={() => { setLat(lng); setLng(lat); }}>Swap them</Button>}
                    />
                ) : region && !region.isValid ? (
                    <Alert tone="warning" title="This point is outside South Africa">
                        Check the coordinates. You can still save it.
                    </Alert>
                ) : null}
                <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                    <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button type="submit">{site ? 'Save changes' : 'Add site'}</Button>
                </div>
            </form>
        </Dialog>
    );
};

export default SiteFormDialog;
