import {
    LuArrowRight, LuCamera, LuCheck, LuFileSpreadsheet, LuMapPin, LuNavigation, LuRoute, LuSatellite,
    LuShieldCheck, LuUsers, LuVolume2
} from 'react-icons/lu';
import { useAuth } from '../context/useAuth';
import Button from '../components/ui/Button';
import Logo from '../components/ui/Logo';

const STEPS = [
    { title: 'Import', text: 'Drop in a CSV or Excel sheet of sites, or add them by hand. Bad coordinates are caught before you save.' },
    { title: 'Optimize', text: 'RouteOps orders the stops for the shortest drive from wherever you are.' },
    { title: 'Drive', text: 'Turn-by-turn voice guidance, then check in and take photos at each stop.' },
    { title: 'Report', text: 'See what was visited, read the field notes and photos, and export a CSV.' },
];

const FEATURES = [
    { icon: LuRoute, title: 'Route optimization', text: 'Stop order from OpenRouteService, with a local fallback so a routing outage never leaves a driver without a plan.' },
    { icon: LuVolume2, title: 'Hands-free guidance', text: 'Spoken turn-by-turn directions and arrival alerts, so eyes stay on the road.' },
    { icon: LuSatellite, title: 'Field-grade GPS', text: 'Jumpy fixes are filtered out, and going off route recalculates from where you actually are.' },
    { icon: LuCamera, title: 'Photo evidence', text: 'Photos per site go straight to private storage that only your team can open.' },
    { icon: LuUsers, title: 'Teams', text: 'Managers plan and assign trips; agents see their own and drive them. Progress shows up live.' },
    { icon: LuFileSpreadsheet, title: 'Reports', text: 'Completion, notes and photos for every site, with a CSV export that opens cleanly in Excel.' },
];

// The hero shows the product itself: a route and the stop card a driver sees
const HeroPreview = () => (
    <div className="relative mx-auto w-full max-w-md" aria-hidden>
        <div className="overflow-hidden rounded-3xl border border-border bg-surface-2 shadow-overlay">
            <svg viewBox="0 0 400 260" className="block w-full" fill="none">
                <defs>
                    <pattern id="landing-grid" width="28" height="28" patternUnits="userSpaceOnUse">
                        <path d="M28 0H0V28" stroke="currentColor" className="text-border" strokeWidth="1" />
                    </pattern>
                </defs>
                <rect width="400" height="260" fill="url(#landing-grid)" />
                <path
                    d="M48 214 C110 70 168 236 222 132 C256 64 304 104 352 54"
                    stroke="#2563EB"
                    strokeWidth="5"
                    strokeLinecap="round"
                />
                <circle cx="48" cy="214" r="9" fill="#2563EB" stroke="#fff" strokeWidth="3" />
                <circle cx="150" cy="150" r="9" fill="#047857" stroke="#fff" strokeWidth="3" />
                <circle cx="222" cy="132" r="11" fill="#2563EB" stroke="#fff" strokeWidth="3" />
                <circle cx="352" cy="54" r="9" fill="#64748B" stroke="#fff" strokeWidth="3" />
            </svg>
        </div>
        <div className="animate-fade-in relative -mt-16 mr-4 ml-auto w-72 rounded-2xl border border-border bg-surface p-4 shadow-raised">
            <div className="flex items-center gap-2 text-xs font-semibold">
                <span className="rounded-full bg-accent-soft px-2 py-0.5 text-accent">Next stop</span>
                <span className="text-faint">Stop 2 of 4</span>
            </div>
            <p className="mt-1.5 font-bold">Melrose Arch POP</p>
            <p className="text-sm text-muted">1.2 km away</p>
            <div className="mt-3 flex h-10 items-center justify-center gap-2 rounded-xl bg-accent text-sm font-semibold text-accent-fg">
                <LuCheck className="size-4" /> Check in
            </div>
        </div>
    </div>
);

const Landing = () => {
    const { user } = useAuth();

    return (
        <div className="overflow-x-clip">
            <section className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-4 pt-12 pb-16 sm:px-6 sm:pt-20 lg:grid-cols-2 lg:pb-24">
                <div className="animate-fade-in">
                    <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-sm font-semibold text-muted">
                        <LuMapPin className="size-4 text-accent" aria-hidden /> Built for field teams in South Africa
                    </p>
                    <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-balance sm:text-5xl lg:text-6xl">
                        Plan smarter routes. <span className="text-accent">Verify every site.</span>
                    </h1>
                    <p className="mt-5 max-w-xl text-lg text-muted">
                        Import your sites, get the fastest visiting order, guide drivers turn by turn and collect photo evidence, from one app that works on any phone.
                    </p>
                    <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                        {user ? (
                            <Button size="lg" to="/dashboard">Open your trips <LuArrowRight className="size-5" aria-hidden /></Button>
                        ) : (
                            <>
                                <Button size="lg" to="/register">Get started <LuArrowRight className="size-5" aria-hidden /></Button>
                                <Button size="lg" variant="secondary" to="/login">Log in</Button>
                            </>
                        )}
                    </div>
                </div>
                <HeroPreview />
            </section>

            <section aria-labelledby="how-heading" className="border-y border-border bg-surface">
                <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
                    <h2 id="how-heading" className="text-3xl font-bold tracking-tight">How it works</h2>
                    <ol className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
                        {STEPS.map((step, index) => (
                            <li key={step.title}>
                                <span className="grid size-10 place-items-center rounded-full bg-accent text-sm font-bold text-accent-fg">{index + 1}</span>
                                <h3 className="mt-4 text-lg font-bold">{step.title}</h3>
                                <p className="mt-1 text-muted">{step.text}</p>
                            </li>
                        ))}
                    </ol>
                </div>
            </section>

            <section aria-labelledby="features-heading" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
                <h2 id="features-heading" className="text-3xl font-bold tracking-tight">Built for real conditions in the field</h2>
                <p className="mt-2 max-w-2xl text-muted">Weak signal, big routes and coordinates from every kind of spreadsheet.</p>
                <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {FEATURES.map(({ icon: Icon, title, text }) => (
                        <li key={title} className="rounded-2xl border border-border bg-surface p-6 shadow-card">
                            <span className="grid size-11 place-items-center rounded-xl bg-accent-soft text-accent">
                                <Icon className="size-5" aria-hidden />
                            </span>
                            <h3 className="mt-4 font-bold">{title}</h3>
                            <p className="mt-1 text-sm text-muted">{text}</p>
                        </li>
                    ))}
                </ul>
            </section>

            <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 sm:pb-20">
                <div className="flex flex-col items-start gap-6 rounded-3xl bg-ink p-8 text-white sm:p-12 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Ready for your next site run?</h2>
                        <p className="mt-2 flex items-center gap-2 text-white/70">
                            <LuShieldCheck className="size-5 shrink-0" aria-hidden /> Your team's trips and photos stay private to your team.
                        </p>
                    </div>
                    <Button size="lg" to={user ? '/dashboard' : '/register'} className="shrink-0">
                        {user ? 'Open your trips' : 'Create your team'} <LuNavigation className="size-5" aria-hidden />
                    </Button>
                </div>
            </section>

            <footer className="border-t border-border">
                <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-8 text-sm text-faint sm:flex-row sm:items-center sm:justify-between sm:px-6">
                    <Logo />
                    <p>© {new Date().getFullYear()} RouteOps. Map data © OpenStreetMap contributors.</p>
                </div>
            </footer>
        </div>
    );
};

export default Landing;
