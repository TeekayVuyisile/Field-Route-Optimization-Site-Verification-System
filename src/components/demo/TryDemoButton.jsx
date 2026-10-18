import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { LuPlay } from 'react-icons/lu';
import { startDemoSession } from '../../features/demo/demoSession';
import Button from '../ui/Button';

/**
 * Starts a private demo sandbox (no sign-up) and opens its trips. For
 * portfolio visitors: nothing they do touches real data or other visitors.
 */
const TryDemoButton = ({ children = 'Try the live demo', ...props }) => {
    const [starting, setStarting] = useState(false);
    const navigate = useNavigate();

    const start = async () => {
        setStarting(true);
        try {
            await startDemoSession();
            navigate('/dashboard');
        } catch (error) {
            toast.error(error.message);
            setStarting(false);
        }
    };

    return (
        <Button onClick={start} loading={starting} {...props}>
            {!starting && <LuPlay className="size-5" aria-hidden />}
            {starting ? 'Setting up your demo...' : children}
        </Button>
    );
};

export default TryDemoButton;
