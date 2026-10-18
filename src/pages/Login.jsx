import { useState } from 'react';
import { Form, Button, Alert, Spinner } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FaRoute } from 'react-icons/fa';
import { useAuth } from '../context/useAuth';
import AuthPanel from '../components/AuthPanel';
import './Auth.css';

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
        <div className="auth-shell">
            <AuthPanel
                tagline="Welcome back"
                headline="Sign in to pick up your next trip."
            />
            <div className="auth-form-side">
                <motion.div
                    className="auth-form-card"
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                >
                    <div className="auth-mobile-brand d-lg-none">
                        <span className="brand-mark"><FaRoute /></span> RouteOps
                    </div>
                    <h2 className="auth-title">Log In</h2>
                    <p className="auth-subtitle">Enter your credentials to continue.</p>

                    {error && <Alert variant="danger">{error}</Alert>}

                    <Form onSubmit={handleSubmit}>
                        <Form.Group className="mb-3">
                            <Form.Label>Email Address</Form.Label>
                            <Form.Control
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </Form.Group>
                        <Form.Group className="mb-4">
                            <Form.Label>Password</Form.Label>
                            <Form.Control
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </Form.Group>
                        <Button disabled={loading} className="w-100" type="submit" size="lg">
                            {loading ? <Spinner size="sm" animation="border" className="me-2" /> : null}
                            {loading ? 'Logging in...' : 'Log In'}
                        </Button>
                    </Form>
                    <div className="auth-switch">
                        Don't have an account? <Link to="/register">Register</Link>
                    </div>
                </motion.div>
            </div>
        </div>
    );
};

export default Login;
