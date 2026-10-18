import { createContext, useContext } from 'react';

// Kept apart from TeamContext.jsx so that file only exports a component
// (React Fast Refresh), same as useAuth.js
export const TeamContext = createContext({
    membership: null,
    isManager: false,
    pendingInvitation: null,
    loading: false,
    error: null,
    refresh: () => {},
});

export const useTeam = () => useContext(TeamContext);
