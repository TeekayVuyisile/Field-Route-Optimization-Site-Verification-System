import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import useTripStore from '../store/useTripStore';
import { AuthContext } from './useAuth';

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Single source of truth: onAuthStateChange fires INITIAL_SESSION on
        // subscribe, so a separate getSession() call isn't needed. Having both
        // let a slow getSession() overwrite a newer sign-in/sign-out.
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            setUser(session?.user ?? null);
            setLoading(false);

            // The active trip is persisted on the device; don't hand it to
            // whoever signs in next on a shared phone
            if (event === 'SIGNED_OUT') useTripStore.getState().clearStore();
        });

        return () => subscription.unsubscribe();
    }, []);

    const value = {
        signUp: (data) => supabase.auth.signUp(data),
        signIn: (data) => supabase.auth.signInWithPassword(data),
        signOut: () => supabase.auth.signOut(),
        user,
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
};
