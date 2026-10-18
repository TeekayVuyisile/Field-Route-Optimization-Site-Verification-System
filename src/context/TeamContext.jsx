import { useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { TeamContext } from './useTeam';
import { fetchMyMembership, ensureMembership, fetchMyPendingInvitation } from '../features/team/teamRepository';

/**
 * Loads the signed-in user's team and role (migration 0005). Membership is
 * normally created by a database trigger on email confirmation; if it's
 * missing (e.g. the trigger failed), ensure_my_membership repairs it.
 */
export const TeamProvider = ({ children }) => {
    const { user } = useAuth();
    // Results are tagged with the user they belong to, so a sign-out or user
    // switch never shows the previous user's team
    const [state, setState] = useState({ userId: null, membership: null, pendingInvitation: null, error: null });
    const [reloadKey, setReloadKey] = useState(0);

    // Keyed on the id: auth hands out a new user object on every token
    // refresh, which must not reload the team (and everything below it)
    const userId = user?.id;

    useEffect(() => {
        if (!userId) return;
        let cancelled = false;

        // Membership and invitation in parallel: on a slow connection the
        // sequential version doubled the time before the app could render
        const load = () => Promise.all([fetchMyMembership(userId), fetchMyPendingInvitation()]);

        (async () => {
            try {
                let [membership, pendingInvitation] = await load();
                if (!membership) {
                    await ensureMembership();
                    [membership, pendingInvitation] = await load();
                }
                if (!cancelled) setState({ userId, membership, pendingInvitation, error: null });
            } catch (error) {
                console.error('Loading team failed:', error);
                if (!cancelled) setState({ userId, membership: null, pendingInvitation: null, error });
            }
        })();

        return () => { cancelled = true; };
    }, [userId, reloadKey]);

    const current = user && state.userId === user.id ? state : null;

    const value = {
        membership: current?.membership ?? null,
        isManager: current?.membership?.role === 'manager',
        pendingInvitation: current?.pendingInvitation ?? null,
        loading: Boolean(user) && !current,
        error: current?.error ?? null,
        refresh: () => setReloadKey((k) => k + 1),
    };

    return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>;
};
