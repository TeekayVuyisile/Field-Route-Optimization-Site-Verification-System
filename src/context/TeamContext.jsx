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

    useEffect(() => {
        if (!user) return;
        let cancelled = false;

        (async () => {
            try {
                let membership = await fetchMyMembership(user.id);
                if (!membership) {
                    await ensureMembership();
                    membership = await fetchMyMembership(user.id);
                }
                const pendingInvitation = await fetchMyPendingInvitation();
                if (!cancelled) setState({ userId: user.id, membership, pendingInvitation, error: null });
            } catch (error) {
                console.error('Loading team failed:', error);
                if (!cancelled) setState({ userId: user.id, membership: null, pendingInvitation: null, error });
            }
        })();

        return () => { cancelled = true; };
    }, [user, reloadKey]);

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
