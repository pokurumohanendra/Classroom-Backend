// FRONTEND_URL can hold multiple comma-separated origins (e.g. local dev +
// the deployed frontend) so both work against this backend at once.
if (!process.env.FRONTEND_URL) {
  throw new Error('FRONTEND_URL is not set in .env file');
}

export const frontendOrigins = process.env.FRONTEND_URL.split(',')
  // Origin headers never carry a trailing slash or path, but it's an easy
  // typo to make when pasting a URL into the dashboard -- strip it so a
  // stray "/" doesn't silently break the exact-string CORS/origin match.
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean);
