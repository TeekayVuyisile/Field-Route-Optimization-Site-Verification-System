import { createContext, useContext } from 'react';

// Kept apart from AuthContext.jsx so that file only exports a component,
// which React Fast Refresh needs to hot-reload it
export const AuthContext = createContext({});

export const useAuth = () => {
    return useContext(AuthContext);
};
