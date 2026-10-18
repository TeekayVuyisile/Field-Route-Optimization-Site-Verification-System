import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { LuArrowLeftRight, LuFlaskConical } from 'react-icons/lu';
import { switchDemoAccount } from '../../features/demo/demoSession';
import { Dialog } from '../ui/Dialog';
import Button from '../ui/Button';

const hoursLeft = (expiresAt) => Math.max(1, Math.round((new Date(expiresAt) - Date.now()) / 3600000));

/**
 * Top-bar control for demo sandboxes: says it's a demo, and lets the
 * visitor flip between the manager and agent views of the same team.
 */
const DemoSwitch = ({ role, expiresAt, onEnd }) => {
    const [open, setOpen] = useState(false);
    const [switching, setSwitching] = useState(false);
    const navigate = useNavigate();
    const other = role === 'manager' ? 'agent' : 'manager';

    const handleSwitch = async () => {
        setSwitching(true);
        try {
            await switchDemoAccount();
            setOpen(false);
            navigate('/dashboard');
            toast.success(`You're now the demo ${other}`);
        } catch (error) {
            toast.error(error.message);
        } finally {
            setSwitching(false);
        }
    };

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-warning-soft px-3 text-sm font-semibold whitespace-nowrap text-warning transition-opacity duration-200 hover:opacity-80"
                aria-label={`Demo sandbox, signed in as the ${role}. Options`}
            >
                <LuFlaskConical className="size-4" aria-hidden />
                Demo<span className="hidden sm:inline"> · {role === 'manager' ? 'Manager' : 'Agent'}</span>
            </button>

            <Dialog
                open={open}
                onOpenChange={setOpen}
                title="You're in a demo sandbox"
                description={`A private team with sample trips, just for you. It's deleted in about ${hoursLeft(expiresAt)} hours; nothing here is real or shared.`}
            >
                <div className="space-y-4 text-sm">
                    <p className="rounded-xl bg-surface-2 p-3">
                        {role === 'manager'
                            ? 'As the manager you plan trips, assign them, build checklists and read reports. Switch to see what the field agent gets on their phone.'
                            : 'As the agent you drive assigned trips: optimize, navigate, check in, answer checklists and take photos. Switch back to see it all land in the manager\'s reports.'}
                    </p>
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <Button variant="ghost" onClick={onEnd}>End demo</Button>
                        <Button onClick={handleSwitch} loading={switching}>
                            {!switching && <LuArrowLeftRight className="size-4" aria-hidden />} View as {other}
                        </Button>
                    </div>
                </div>
            </Dialog>
        </>
    );
};

export default DemoSwitch;
