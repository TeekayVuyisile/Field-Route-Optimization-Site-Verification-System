/**
 * Reads required Vite env vars once, and fails fast with a readable message
 * instead of letting a missing key surface later as a cryptic 401 or
 * "Invalid URL" deep inside Supabase / ORS calls.
 */
const required = (name) => {
    const value = import.meta.env[name];
    if (!value) {
        throw new Error(`Missing environment variable ${name}. Copy .env.example to .env and fill it in.`);
    }
    return value;
};

export const env = {
    supabaseUrl: required('VITE_SUPABASE_URL'),
    supabaseAnonKey: required('VITE_SUPABASE_ANON_KEY'),
};
