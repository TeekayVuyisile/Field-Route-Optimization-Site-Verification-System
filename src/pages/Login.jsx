import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import AuthLayout from '../components/layout/AuthLayout';
import Button from '../components/ui/Button';
import { Field, Input } from '../components/ui/Field';
import { Alert } from '../components/ui/primitives';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const { signIn } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            setError(null);
            setLoading(true);
            const { error } = await signIn({ email, password });
            if (error) throw error;
            navigate('/dashboard');
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout eyebrow="Welcome back" headline="Sign in to pick up your next trip.">
            <h2 className="text-2xl font-bold tracking-tight">Log in</h2>
            <p className="mt-1 text-muted">Enter your email and password to continue.</p>

            {error && <Alert tone="danger" className="mt-6">{error}</Alert>}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <Field label="Email address">
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
                <Field label="Password">
                    {(field) => (
                        <Input
                            {...field}
                            type="password"
                            autoComplete="current-password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    )}
                </Field>
                <Button type="submit" size="lg" className="w-full" loading={loading}>
                    {loading ? 'Logging in...' : 'Log in'}
                </Button>
            </form>

            <p className="mt-6 text-center text-sm text-muted">
                Don't have an account?{' '}
                <Link to="/register" className="font-semibold text-accent hover:underline">Create one</Link>
            </p>
        </AuthLayout>
    );
};

export default Login;
