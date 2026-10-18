import { useState } from 'react';
import { Form, Button, Alert, Spinner } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FaRoute } from 'react-icons/fa';
import { useAuth } from '../context/useAuth';
import AuthPanel from '../components/AuthPanel';
import './Auth.css';

const Register = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [passwordConfirm, setPasswordConfirm] = useState('');
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const { signUp } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (password !== passwordConfirm) {
            return setError('Passwords do not match');
        }

        try {
            setError(null);
            setLoading(true);
            const { error } = await signUp({ email, password });
            if (error) throw error;
            alert('Registration successful! Please check your email for verification if enabled.');
            navigate('/login');
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-shell">
            <AuthPanel
                tagline="Get started"
                headline="Create an account to start optimizing trips."
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
                    <h2 className="auth-title">Register</h2>
                    <p className="auth-subtitle">Set up your field operations account.</p>

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
                        <Form.Group className="mb-3">
                            <Form.Label>Password</Form.Label>
                            <Form.Control
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </Form.Group>
                        <Form.Group className="mb-4">
                            <Form.Label>Confirm Password</Form.Label>
                            <Form.Control
                                type="password"
                                required
                                value={passwordConfirm}
                                onChange={(e) => setPasswordConfirm(e.target.value)}
                            />
                        </Form.Group>
                        <Button disabled={loading} className="w-100" type="submit" size="lg">
                            {loading ? <Spinner size="sm" animation="border" className="me-2" /> : null}
                            {loading ? 'Registering...' : 'Register'}
                        </Button>
                    </Form>
                    <div className="auth-switch">
                        Already have an account? <Link to="/login">Log In</Link>
                    </div>
                </motion.div>
            </div>
        </div>
    );
};

export default Register;
