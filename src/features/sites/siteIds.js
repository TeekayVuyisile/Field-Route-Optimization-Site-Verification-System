/**
 * Sites staged on the client (CSV import, manual entry before the trip is
 * saved) get a `local-` prefixed id. Supabase rows use plain UUIDs.
 *
 * This replaces the old `id.length === 36` check, which never worked:
 * crypto.randomUUID() is also 36 characters, so staged sites looked persisted.
 */
const LOCAL_PREFIX = 'local-';

export const createLocalId = () => `${LOCAL_PREFIX}${crypto.randomUUID()}`;

export const isPersistedId = (id) => typeof id === 'string' && id.length > 0 && !id.startsWith(LOCAL_PREFIX);
