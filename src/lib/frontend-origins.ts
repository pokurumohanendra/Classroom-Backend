// FRONTEND_URL can hold multiple comma-separated origins (e.g. local dev +
// the deployed frontend) so both work against this backend at once.
if (!process.env.FRONTEND_URL) {
  throw new Error('FRONTEND_URL is not set in .env file');
}

export const frontendOrigins = process.env.FRONTEND_URL.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
