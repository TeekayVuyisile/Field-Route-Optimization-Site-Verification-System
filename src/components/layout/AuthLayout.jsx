import { LuCheck } from 'react-icons/lu';

const POINTS = [
    'Optimized multi-stop routes',
    'Photo evidence, stored privately per team',
    'Hands-free, turn-by-turn voice guidance',
];

/**
 * Split auth screen: brand panel (desktop only) + form column. The panel's
 * route illustration echoes the logo mark.
 */
const AuthLayout = ({ eyebrow, headline, children }) => (
    <div className="ui grid min-h-[calc(100dvh-4rem)] lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <aside className="relative hidden overflow-hidden bg-ink text-white lg:flex lg:flex-col lg:justify-center lg:px-14 xl:px-20">
            <div
                className="pointer-events-none absolute -top-32 -left-24 size-[28rem] rounded-full bg-accent/25 blur-3xl"
                aria-hidden
            />
            <div className="relative max-w-md">
                <p className="text-xs font-bold tracking-[0.16em] text-blue-300 uppercase">{eyebrow}</p>
                <h1 className="mt-3 text-4xl leading-tight font-bold tracking-tight text-balance">{headline}</h1>
                <ul className="mt-8 space-y-3">
                    {POINTS.map((point) => (
                        <li key={point} className="flex items-center gap-3 text-slate-300">
                            <span className="grid size-6 place-items-center rounded-full bg-emerald-400/15 text-emerald-300">
                                <LuCheck className="size-4" aria-hidden />
                            </span>
                            {point}
                        </li>
                    ))}
                </ul>
            </div>
            <svg viewBox="0 0 400 160" className="relative mt-14 w-full max-w-md" fill="none" aria-hidden>
                <path
                    d="M16 132C86 40 150 150 214 74S330 38 384 24"
                    stroke="rgb(255 255 255 / 0.28)"
                    strokeWidth="3"
                    strokeDasharray="2 10"
                    strokeLinecap="round"
                />
                <circle cx="16" cy="132" r="7" fill="#34D399" />
                <circle cx="214" cy="74" r="5" fill="#93C5FD" />
                <circle cx="384" cy="24" r="8" fill="#3B82F6" />
            </svg>
        </aside>

        <div className="flex items-center justify-center px-4 py-10 sm:px-6">
            <div className="w-full max-w-sm animate-fade-in">{children}</div>
        </div>
    </div>
);

export default AuthLayout;
