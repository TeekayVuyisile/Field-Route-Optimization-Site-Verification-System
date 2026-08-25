import { Container, Row, Col, Button } from 'react-bootstrap';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
    FaRoute,
    FaCamera,
    FaFileInvoice,
    FaSatellite,
    FaUndoAlt,
    FaVolumeUp,
    FaArrowRight,
    FaMapMarkerAlt
} from 'react-icons/fa';
import './Landing.css';

const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.12 } }
};

const itemVariants = {
    hidden: { y: 22, opacity: 0 },
    visible: { y: 0, opacity: 1, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } }
};

const steps = [
    { step: 1, title: 'Import', text: 'Upload a CSV or Excel file of site coordinates.' },
    { step: 2, title: 'Optimize', text: 'RouteOps sequences the fastest path between stops.' },
    { step: 3, title: 'Execute', text: 'Follow voice guidance and capture site evidence.' },
    { step: 4, title: 'Report', text: 'Export verification logs for management review.' }
];

const features = [
    {
        icon: <FaRoute />,
        title: 'Route Optimization',
        description: 'Dynamic TSP optimization powered by OpenRouteService, minimizing drive time across every stop on the trip.',
        featured: true
    },
    {
        icon: <FaSatellite />,
        title: 'Field-Grade GPS',
        description: 'Signal filtering and jitter smoothing keep your position accurate even between tall structures.'
    },
    {
        icon: <FaUndoAlt />,
        title: 'Auto-Pilot Rerouting',
        description: 'Off-route detection triggers an automatic recalculation from wherever you actually are.'
    },
    {
        icon: <FaCamera />,
        title: 'Photo Evidence',
        description: 'Background photo sync to secure storage, with multiple images supported per site.'
    },
    {
        icon: <FaVolumeUp />,
        title: 'Hands-Free Voice',
        description: 'Turn-by-turn audio guidance so your team can keep their eyes on the road.'
    },
    {
        icon: <FaFileInvoice />,
        title: 'Professional Reporting',
        description: 'Completion analytics and CSV export, ready for a client or compliance review.',
        wide: true
    }
];

const RouteGraphic = () => (
    <motion.div
        className="route-graphic"
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
    >
        <svg viewBox="0 0 400 320" className="route-graphic-svg" fill="none">
            <motion.path
                d="M50,250 C110,90 170,270 220,150 C255,65 300,120 350,70"
                stroke="#2563EB"
                strokeWidth="4"
                strokeLinecap="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1.6, ease: 'easeInOut', delay: 0.3 }}
            />
            <circle cx="50" cy="250" r="8" fill="#10B981" />
            <circle cx="220" cy="150" r="8" fill="#fff" stroke="#94A3B8" strokeWidth="3" />
            <circle cx="350" cy="70" r="10" fill="#2563EB" />
            <circle cx="350" cy="70" r="16" fill="#2563EB" opacity="0.18" />
        </svg>
        <motion.div
            className="route-chip"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 1.4 }}
        >
            <span className="route-chip-icon"><FaMapMarkerAlt /></span>
            <div>
                <strong>4 stops</strong>
                <small>Fastest sequence found</small>
            </div>
        </motion.div>
    </motion.div>
);

const Landing = () => {
    return (
        <div className="landing-page">
            {/* Hero */}
            <header className="hero-section">
                <Container>
                    <Row className="align-items-center gy-5">
                        <Col lg={6}>
                            <motion.div
                                initial={{ x: -40, opacity: 0 }}
                                animate={{ x: 0, opacity: 1 }}
                                transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                            >
                                <h1 className="hero-headline">
                                    Plan smarter routes.<br />Verify every site.
                                </h1>
                                <p className="hero-subtext">
                                    Optimize field visits, capture photo evidence, and guide your team hands-free from one dashboard.
                                </p>
                                <div className="d-flex flex-wrap gap-3">
                                    <Button as={Link} to="/register" variant="primary" size="lg" className="px-4">
                                        Get Started <FaArrowRight className="ms-2" />
                                    </Button>
                                    <Button as={Link} to="/login" variant="outline-secondary" size="lg" className="px-4">
                                        Log In
                                    </Button>
                                </div>
                            </motion.div>
                        </Col>
                        <Col lg={6} className="d-none d-lg-block">
                            <RouteGraphic />
                        </Col>
                    </Row>
                </Container>
            </header>

            {/* How It Works */}
            <section className="steps-section">
                <Container>
                    <h2 className="section-heading text-center">How It Works</h2>
                    <div className="steps-strip">
                        {steps.map((item) => (
                            <motion.div
                                key={item.step}
                                className="step-node"
                                initial={{ opacity: 0, y: 16 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true, amount: 0.5 }}
                                transition={{ duration: 0.45, delay: item.step * 0.08 }}
                            >
                                <div className="step-circle">{item.step}</div>
                                <h5>{item.title}</h5>
                                <p>{item.text}</p>
                            </motion.div>
                        ))}
                    </div>
                </Container>
            </section>

            {/* Features Bento */}
            <section className="features-section">
                <Container>
                    <h2 className="section-heading text-center">Built For Reliability In The Field</h2>
                    <motion.div
                        className="features-bento"
                        variants={containerVariants}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true, amount: 0.15 }}
                    >
                        {features.map((feature, index) => (
                            <motion.div
                                key={index}
                                variants={itemVariants}
                                className={`bento-feature ${feature.featured ? 'is-featured' : ''} ${feature.wide ? 'is-wide' : ''}`}
                            >
                                <div className="bento-icon">{feature.icon}</div>
                                <h5>{feature.title}</h5>
                                <p>{feature.description}</p>
                            </motion.div>
                        ))}
                    </motion.div>
                </Container>
            </section>

            {/* CTA */}
            <section className="cta-section">
                <Container>
                    <motion.div
                        className="cta-panel"
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5 }}
                    >
                        <h2>Ready to optimize your field operations?</h2>
                        <p>Join field teams already using RouteOps for site verification.</p>
                        <Button as={Link} to="/register" variant="light" size="lg" className="px-4 fw-bold">
                            Get Started
                        </Button>
                    </motion.div>
                </Container>
            </section>

            <footer className="landing-footer">
                <Container>
                    <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
                        <div className="d-flex align-items-center gap-2">
                            <FaRoute className="text-primary" />
                            <span className="fw-bold">RouteOps</span>
                        </div>
                        <div className="text-muted small">© 2026 RouteOps. All rights reserved.</div>
                    </div>
                </Container>
            </footer>
        </div>
    );
};

export default Landing;
