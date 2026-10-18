/**
 * Reads required Vite env vars once, and fails fast with a readable message
 * instead of letting a missing key surface later as a cryptic 401 or
 * "Invalid URL" deep inside Supabase calls.
 *
 * Each var MUST be accessed statically (import.meta.env.VITE_X). A dynamic
 * import.meta.env[name] makes Vite inline every VITE_* var into the bundle.
 */
const required = (name, value) => {
    if (!value) {
        throw new Error(`Missing environment variable ${name}. Copy .env.example to .env and fill it in.`);
    }
    return value;
};

export const env = {
    supabaseUrl: required('VITE_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL),
    supabaseAnonKey: required('VITE_SUPABASE_ANON_KEY', import.meta.env.VITE_SUPABASE_ANON_KEY),
};
