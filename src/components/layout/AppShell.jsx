import { NavLink, Link, useNavigate, useLocation } from 'react-router-dom';
import { LuLayoutDashboard, LuMap, LuUsers, LuPlus, LuLogOut, LuMoon, LuSun } from 'react-icons/lu';
import { useAuth } from '../../context/useAuth';
import { useTeam } from '../../context/useTeam';
import useTripStore from '../../store/useTripStore';
import Logo from '../ui/Logo';
import Button from '../ui/Button';
import { cn } from '../ui/cn';
import { useTheme } from '../../lib/useTheme';

const NAV_ITEMS = [
    { to: '/dashboard', label: 'Trips', icon: LuLayoutDashboard },
    { to: '/map', label: 'Map', icon: LuMap },
    { to: '/team', label: 'Team', icon: LuUsers },
];

/**
 * App chrome. Desktop: sticky top bar with nav. Phones: compact top bar plus
 * a bottom tab bar within thumb reach (the main nav for drivers).
 */
const AppShell = ({ children }) => {
    const { user, signOut } = useAuth();
    const { membership } = useTeam();
    const clearStore = useTripStore((s) => s.clearStore);
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const { theme, toggleTheme } = useTheme();

    const themeButton = (
        <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
        >
            {theme === 'dark' ? <LuSun className="size-5" /> : <LuMoon className="size-5" />}
        </Button>
    );

    const startNewTrip = () => {
        clearStore();
        navigate('/create-trip');
    };

    const handleSignOut = async () => {
        await signOut();
        navigate('/login');
    };

    return (
        <div className="min-h-dvh bg-canvas text-fg">
            <header className="sticky top-0 z-40 border-b border-border bg-surface/85 backdrop-blur-md">
                <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:gap-6 sm:px-6">
                    <Link to={user ? '/dashboard' : '/'} className="shrink-0 rounded-lg" aria-label="RouteOps home">
                        <Logo />
                    </Link>

                    {user ? (
                        <>
                            <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
                                {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
                                    <NavLink
                                        key={to}
                                        to={to}
                                        className={({ isActive }) => cn(
                                            'inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors duration-200',
                                            isActive ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg'
                                        )}
                                    >
                                        <Icon className="size-4" aria-hidden />
                                        {label}
                                    </NavLink>
                                ))}
                            </nav>

                            <div className="ml-auto flex items-center gap-2">
                                <Button className="hidden md:inline-flex" onClick={startNewTrip}>
                                    <LuPlus className="size-4" aria-hidden /> New trip
                                </Button>
                                <div className="hidden items-center gap-2.5 border-l border-border pl-3 lg:flex">
                                    <span className="grid size-9 place-items-center rounded-full bg-surface-2 text-sm font-bold text-muted" aria-hidden>
                                        {user.email?.[0]?.toUpperCase()}
                                    </span>
                                    <div className="max-w-48 leading-tight">
                                        <p className="truncate text-sm font-semibold">{user.email}</p>
                                        {membership && (
                                            <p className="truncate text-xs text-faint">
                                                {membership.role === 'manager' ? 'Manager' : 'Field agent'} · {membership.orgName}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                {themeButton}
                                <Button variant="ghost" size="icon" onClick={handleSignOut} aria-label="Sign out" title="Sign out">
                                    <LuLogOut className="size-5" />
                                </Button>
                            </div>
                        </>
                    ) : (
                        // On the auth pages, only offer the other one; phones get
                        // compact buttons so the bar never scrolls sideways
                        <div className="ml-auto flex items-center gap-1 sm:gap-2">
                            {themeButton}
                            {pathname !== '/login' && (
                                <Button variant="ghost" to="/login" className="h-10 px-3 sm:h-11 sm:px-4">Log in</Button>
                            )}
                            {pathname !== '/register' && (
                                // The landing hero has its own big Get started; on phones the
                                // header can't fit both buttons plus the theme toggle
                                <Button to="/register" className={cn('h-10 px-3 sm:h-11 sm:px-4', pathname === '/' && 'max-sm:hidden')}>Get started</Button>
                            )}
                        </div>
                    )}
                </div>
            </header>

            {/* Bottom padding keeps content clear of the phone tab bar */}
            <main className={cn(user && 'pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0')}>
                {children}
            </main>

            {user && (
                <nav
                    className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
                    aria-label="Main"
                >
                    <div className="mx-auto grid h-16 max-w-md grid-cols-4">
                        {NAV_ITEMS.slice(0, 2).map((item) => <TabLink key={item.to} {...item} />)}
                        <button
                            type="button"
                            onClick={startNewTrip}
                            className="flex cursor-pointer flex-col items-center justify-center gap-1 text-xs font-semibold text-accent"
                        >
                            <span className="grid size-9 place-items-center rounded-full bg-accent text-accent-fg shadow-raised">
                                <LuPlus className="size-5" aria-hidden />
                            </span>
                            New trip
                        </button>
                        {NAV_ITEMS.slice(2).map((item) => <TabLink key={item.to} {...item} />)}
                    </div>
                </nav>
            )}
        </div>
    );
};

const TabLink = ({ to, label, icon: Icon }) => (
    <NavLink
        to={to}
        className={({ isActive }) => cn(
            'flex flex-col items-center justify-center gap-1 text-xs font-semibold transition-colors duration-200',
            isActive ? 'text-accent' : 'text-faint hover:text-fg'
        )}
    >
        {/* Same 36px icon box as the centre "New trip" button so labels line up */}
        <span className="grid size-9 place-items-center">
            <Icon className="size-6" aria-hidden />
        </span>
        {label}
    </NavLink>
);

export default AppShell;
