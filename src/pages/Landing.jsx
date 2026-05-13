import { Container, Row, Col, Button, Card } from 'react-bootstrap';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { 
    FaRoute, 
    FaMapMarkedAlt, 
    FaMobileAlt, 
    FaCamera, 
    FaFileInvoice, 
    FaSatellite, 
    FaUndoAlt,
    FaArrowRight,
    FaCheckCircle
} from 'react-icons/fa';
import './Landing.css';

const Landing = () => {
    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.2
            }
        }
    };

    const itemVariants = {
        hidden: { y: 20, opacity: 0 },
        visible: {
            y: 0,
            opacity: 1,
            transition: {
                duration: 0.5
            }
        }
    };

    const features = [
        {
            icon: <FaSatellite className="feature-icon" />,
            title: "Field-Grade GPS",
            description: "Advanced signal filtering and jitter smoothing for precise site location tracking even in challenging environments."
        },
        {
            icon: <FaRoute className="feature-icon" />,
            title: "Route Optimization",
            description: "Dynamic TSP optimization powered by OpenRouteService to minimize travel time and fuel costs."
        },
        {
            icon: <FaUndoAlt className="feature-icon" />,
            title: "Auto-Pilot Rerouting",
            description: "Instant 'Off-Route' detection and automatic re-optimization from your current location if you take a detour."
        },
        {
            icon: <FaCamera className="feature-icon" />,
            title: "Photo Evidence",
            description: "High-quality background syncing to Supabase Storage with multiple photos supported per site verification."
        },
        {
            icon: <FaMobileAlt className="feature-icon" />,
            title: "Hands-Free Voice",
            description: "Professional turn-by-turn voice guidance allowing field teams to focus on driving and safety."
        },
        {
            icon: <FaFileInvoice className="feature-icon" />,
            title: "Professional Reporting",
            description: "Detailed trip completion analytics, verification logs, and CSV data export for management review."
        }
    ];

    return (
        <div className="landing-page">
            {/* Hero Section */}
            <header className="hero-section">
                <Container>
                    <Row className="align-items-center min-vh-75">
                        <Col lg={6}>
                            <motion.div
                                initial={{ x: -50, opacity: 0 }}
                                animate={{ x: 0, opacity: 1 }}
                                transition={{ duration: 0.8 }}
                            >
                                <div className="badge bg-primary-soft text-primary mb-3 px-3 py-2 rounded-pill">
                                    <FaCheckCircle className="me-2" /> Professional Field Operations
                                </div>
                                <h1 className="display-4 fw-bold mb-4">
                                    RouteOps: The Ultimate <span className="text-primary">Site Verification</span> Platform
                                </h1>
                                <p className="lead text-muted mb-5">
                                    Streamline your field operations with professional-grade route optimization, 
                                    real-time evidence collection, and hands-free voice guidance.
                                </p>
                                <div className="d-flex gap-3">
                                    <Button as={Link} to="/register" variant="primary" size="lg" className="px-4 py-3 shadow">
                                        Get Started <FaArrowRight className="ms-2" />
                                    </Button>
                                    <Button as={Link} to="/login" variant="outline-primary" size="lg" className="px-4 py-3">
                                        Login
                                    </Button>
                                </div>
                            </motion.div>
                        </Col>
                        <Col lg={6} className="d-none d-lg-block">
                            <motion.div
                                initial={{ scale: 0.8, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ duration: 1 }}
                                className="hero-image-container"
                            >
                                <div className="hero-card-decorator">
                                    <div className="card shadow-lg p-3">
                                        <div className="d-flex align-items-center mb-3">
                                            <FaMapMarkedAlt className="text-primary fs-3 me-3" />
                                            <div>
                                                <h6 className="mb-0">Live Optimization</h6>
                                                <small className="text-muted">Calculating fastest route...</small>
                                            </div>
                                        </div>
                                        <div className="progress mb-2" style={{ height: '8px' }}>
                                            <div className="progress-bar progress-bar-striped progress-bar-animated" style={{ width: '75%' }}></div>
                                        </div>
                                    </div>
                                </div>
                                <div className="hero-main-visual">
                                    <FaRoute className="route-main-icon" />
                                </div>
                            </motion.div>
                        </Col>
                    </Row>
                </Container>
            </header>

            {/* How It Works Section */}
            <section className="how-it-works py-5 bg-light">
                <Container>
                    <div className="text-center mb-5">
                        <h2 className="fw-bold">How It Works</h2>
                        <p className="text-muted">Four simple steps to professional field management</p>
                    </div>
                    <Row>
                        {[
                            { step: 1, title: "Import Data", text: "Upload CSV or Excel files with site coordinates." },
                            { step: 2, title: "Optimize", text: "RouteOps calculates the most efficient sequence." },
                            { step: 3, title: "Execute", text: "Follow voice guidance and collect site evidence." },
                            { step: 4, title: "Report", text: "Export professional logs and analytics." }
                        ].map((item, index) => (
                            <Col md={3} key={index}>
                                <motion.div
                                    whileHover={{ y: -10 }}
                                    className="text-center p-4"
                                >
                                    <div className="step-number mb-3 mx-auto">{item.step}</div>
                                    <h5>{item.title}</h5>
                                    <p className="text-muted small">{item.text}</p>
                                </motion.div>
                            </Col>
                        ))}
                    </Row>
                </Container>
            </section>

            {/* Features Grid */}
            <section className="features-section py-5">
                <Container>
                    <div className="text-center mb-5">
                        <h2 className="fw-bold">Powerful Features</h2>
                        <p className="text-muted">Built for reliability in the field</p>
                    </div>
                    <motion.div
                        variants={containerVariants}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true }}
                    >
                        <Row className="g-4">
                            {features.map((feature, index) => (
                                <Col lg={4} md={6} key={index}>
                                    <motion.div variants={itemVariants}>
                                        <Card className="h-100 feature-card border-0 shadow-sm p-3">
                                            <Card.Body>
                                                <div className="icon-wrapper mb-4">
                                                    {feature.icon}
                                                </div>
                                                <h5 className="fw-bold">{feature.title}</h5>
                                                <Card.Text className="text-muted">
                                                    {feature.description}
                                                </Card.Text>
                                            </Card.Body>
                                        </Card>
                                    </motion.div>
                                </Col>
                            ))}
                        </Row>
                    </motion.div>
                </Container>
            </section>

            {/* CTA Section */}
            <section className="cta-section py-5 bg-primary text-white text-center">
                <Container>
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.5 }}
                    >
                        <h2 className="display-5 fw-bold mb-4">Ready to optimize your field operations?</h2>
                        <p className="lead mb-5 opacity-75">Join professional teams using RouteOps for site verification.</p>
                        <Button as={Link} to="/register" variant="light" size="lg" className="px-5 py-3 fw-bold text-primary">
                            Create Free Account
                        </Button>
                    </motion.div>
                </Container>
            </section>

            {/* Footer */}
            <footer className="py-4 border-top">
                <Container>
                    <div className="d-flex justify-content-between align-items-center">
                        <div className="d-flex align-items-center">
                            <FaRoute className="text-primary me-2" />
                            <span className="fw-bold">RouteOps</span>
                        </div>
                        <div className="text-muted small">
                            © 2026 RouteOps. All rights reserved.
                        </div>
                    </div>
                </Container>
            </footer>
        </div>
    );
};

export default Landing;
