import { useState } from 'react';
import { toast } from 'react-toastify';
import { LuMapPinCheck } from 'react-icons/lu';
import { updateCheckinRadius } from '../../features/team/teamRepository';
import { CHECKIN_RADIUS_LIMITS } from '../../features/checkins/checkIn';
import Button from '../ui/Button';
import { Field, Input } from '../ui/Field';
import { Card } from '../ui/primitives';

/**
 * Managers set how far from a site a check-in may be before it's flagged.
 * Rural sites with rough pins may need more; dense areas less.
 */
const CheckinRadiusCard = ({ orgId, radius, onSaved }) => {
    const [value, setValue] = useState(String(radius));
    const [saving, setSaving] = useState(false);
    const meters = Number(value);
    const valid = Number.isInteger(meters) && meters >= CHECKIN_RADIUS_LIMITS.min && meters <= CHECKIN_RADIUS_LIMITS.max;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!valid) return;
        try {
            setSaving(true);
            await updateCheckinRadius(orgId, meters);
            toast.success(`Check-ins more than ${meters} m from a site will be flagged`);
            onSaved();
        } catch (error) {
            toast.error(`Couldn't save: ${error.message}`);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card as="section" aria-labelledby="checkin-heading" className="p-5">
            <h2 id="checkin-heading" className="flex items-center gap-2 font-bold">
                <LuMapPinCheck className="size-5 text-accent" aria-hidden /> Check-in distance
            </h2>
            <p className="mt-1 text-sm text-muted">
                Check-ins further than this from the site are flagged in reports, with the agent's reason.
            </p>
            <form onSubmit={handleSubmit} className="mt-4 flex items-start gap-2">
                <Field
                    label="Distance in metres"
                    className="flex-1"
                    error={value !== '' && !valid ? `Between ${CHECKIN_RADIUS_LIMITS.min} and ${CHECKIN_RADIUS_LIMITS.max} m` : null}
                >
                    {(field) => (
                        <Input
                            {...field}
                            type="number"
                            inputMode="numeric"
                            min={CHECKIN_RADIUS_LIMITS.min}
                            max={CHECKIN_RADIUS_LIMITS.max}
                            step={5}
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                        />
                    )}
                </Field>
                <Button type="submit" variant="secondary" className="mt-7" loading={saving} disabled={!valid || meters === radius}>
                    Save
                </Button>
            </form>
        </Card>
    );
};

export default CheckinRadiusCard;
