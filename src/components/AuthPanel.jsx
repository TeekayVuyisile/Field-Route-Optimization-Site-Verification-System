import { FaRoute, FaCheckCircle } from 'react-icons/fa';

const AuthPanel = ({ tagline, headline }) => (
    <div className="auth-brand-side d-none d-lg-flex">
        <div className="auth-brand-content">
            <div className="auth-brand-mark">
                <FaRoute />
            </div>
            <span className="auth-tagline">{tagline}</span>
            <h2>{headline}</h2>
            <ul className="auth-points">
                <li><FaCheckCircle /> Optimized multi-stop routes</li>
                <li><FaCheckCircle /> Photo evidence, synced automatically</li>
                <li><FaCheckCircle /> Hands-free voice navigation</li>
            </ul>
        </div>
        <svg viewBox="0 0 400 200" className="auth-brand-svg" fill="none">
            <path
                d="M20,160 C90,60 160,180 220,90 C260,30 320,80 380,40"
                stroke="rgba(255,255,255,0.35)"
                strokeWidth="3"
                strokeLinecap="round"
            />
            <circle cx="20" cy="160" r="6" fill="#10B981" />
            <circle cx="380" cy="40" r="7" fill="#2563EB" />
        </svg>
    </div>
);

export default AuthPanel;
