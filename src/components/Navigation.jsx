import { Navbar, Nav, Container, Button } from 'react-bootstrap';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/useAuth';
import { FaRoute, FaSignOutAlt } from 'react-icons/fa';
import './Navigation.css';

const Navigation = () => {
    const { user, signOut } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const handleLogout = async () => {
        try {
            await signOut();
            navigate('/login');
        } catch (error) {
            console.error('Error logging out:', error.message);
        }
    };

    const isActive = (path) => location.pathname === path;

    return (
        <Navbar expand="lg" className="app-navbar" sticky="top">
            <Container>
                <Navbar.Brand as={Link} to="/" className="app-brand">
                    <motion.span
                        className="brand-mark"
                        whileHover={{ scale: 1.06, rotate: -4 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                    >
                        <FaRoute />
                    </motion.span>
                    RouteOps
                </Navbar.Brand>
                <Navbar.Toggle aria-controls="main-nav" />
                <Navbar.Collapse id="main-nav">
                    <Nav className="ms-auto align-items-lg-center gap-lg-1">
                        {user ? (
                            <>
                                <Nav.Link as={Link} to="/dashboard" className={`nav-pill ${isActive('/dashboard') ? 'is-active' : ''}`}>
                                    Dashboard
                                </Nav.Link>
                                <Nav.Link as={Link} to="/map" className={`nav-pill ${isActive('/map') ? 'is-active' : ''}`}>
                                    Map View
                                </Nav.Link>
                                <div className="user-chip">
                                    <span className="user-chip-avatar">{user.email?.[0]?.toUpperCase()}</span>
                                    <span className="user-chip-email d-none d-xl-inline">{user.email}</span>
                                    <button className="user-chip-logout" onClick={handleLogout} title="Log out" aria-label="Log out">
                                        <FaSignOutAlt />
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <Nav.Link as={Link} to="/login" className="nav-pill">Login</Nav.Link>
                                <Button as={Link} to="/register" variant="primary" size="sm" className="ms-lg-2 px-3">
                                    Get Started
                                </Button>
                            </>
                        )}
                    </Nav>
                </Navbar.Collapse>
            </Container>
        </Navbar>
    );
};

export default Navigation;
