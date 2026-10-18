import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LuMailCheck } from 'react-icons/lu';
import { useAuth } from '../context/useAuth';
import AuthLayout from '../components/layout/AuthLayout';
import Button from '../components/ui/Button';
import { Field, Input } from '../components/ui/Field';
import { Alert } from '../components/ui/primitives';

// Supabase Auth's default minimum
const MIN_PASSWORD_LENGTH = 6;

const Register = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [passwordConfirm, setPasswordConfirm] = useState('');
    const [error, setError] = useState(null);
    const [mismatch, setMismatch] = useState(false);
    const [loading, setLoading] = useState(false);
    const [sentTo, setSentTo] = useState(null);
    const { signUp } = useAuth();

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (password !== passwordConfirm) {
            setMismatch(true);
            return;
        }
        try {
            setError(null);
            setLoading(true);
            const { error } = await signUp({ email, password });
            if (error) throw error;
            // "Confirm email" is on: nothing works until the link is clicked,
            // and that click is also what puts the user in their team
            setSentTo(email);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (sentTo) {
        return (
            <AuthLayout eyebrow="Almost there" headline="One click and you're in.">
                <span className="grid size-12 place-items-center rounded-2xl bg-success-soft text-success">
                    <LuMailCheck className="size-6" aria-hidden />
                </span>
                <h2 className="mt-5 text-2xl font-bold tracking-tight">Check your inbox</h2>
                <p className="mt-2 text-muted">
                    We sent a confirmation link to <strong className="text-fg">{sentTo}</strong>. Open it on this
                    device to activate your account. If a teammate invited this address, you'll join their team.
                </p>
                <Button to="/login" variant="secondary" size="lg" className="mt-6 w-full">Back to log in</Button>
                <p className="mt-4 text-center text-sm text-faint">No email after a few minutes? Check your spam folder.</p>
            </AuthLayout>
        );
    }

    return (
        <AuthLayout eyebrow="Get started" headline="Plan, drive and verify every site with your team.">
            <h2 className="text-2xl font-bold tracking-tight">Create your account</h2>
            <p className="mt-1 text-muted">Free to start. You'll confirm your email next.</p>

            {error && <Alert tone="danger" className="mt-6">{error}</Alert>}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <Field label="Email address" hint="Use the address your team invited, if you have an invite.">
                    {(field) => (
                        <Input
                            {...field}
                            type="email"
                            autoComplete="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    )}
                </Field>
                <Field label="Password" hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}>
                    {(field) => (
                        <Input
                            {...field}
                            type="password"
                            autoComplete="new-password"
                            required
                            minLength={MIN_PASSWORD_LENGTH}
                            value={password}
                            onChange={(e) => { setPassword(e.target.value); setMismatch(false); }}
                        />
                    )}
                </Field>
                <Field label="Confirm password" error={mismatch ? "Passwords don't match." : null}>
                    {(field) => (
                        <Input
                            {...field}
                            type="password"
                            autoComplete="new-password"
                            required
                            value={passwordConfirm}
                            onChange={(e) => { setPasswordConfirm(e.target.value); setMismatch(false); }}
                        />
                    )}
                </Field>
                <Button type="submit" size="lg" className="w-full" loading={loading}>
                    {loading ? 'Creating account...' : 'Create account'}
                </Button>
            </form>

            <p className="mt-6 text-center text-sm text-muted">
                Already have an account?{' '}
                <Link to="/login" className="font-semibold text-accent hover:underline">Log in</Link>
            </p>
        </AuthLayout>
    );
};

export default Register;
