// Small helpers for Web-standard (Request/Response) Vercel functions.
// Files under api/_lib are not deployed as endpoints (underscore prefix).

export const json = (status, body, headers = {}) =>
    Response.json(body, { status, headers });

const MAX_BODY_BYTES = 64 * 1024;

/** Parses a JSON body, or returns null if it's missing, too large or malformed. */
export const readJson = async (request) => {
    const text = await request.text();
    if (!text || text.length > MAX_BODY_BYTES) return null;
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
};
