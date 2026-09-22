// FRONTEND_URL can hold multiple comma-separated origins (e.g. local dev)
// so more than one works against this backend at once.
if (!process.env.FRONTEND_URL) {
  throw new Error('FRONTEND_URL is not set in .env file');
}

// The deployed frontend's URL is also hardcoded here directly, rather than
// relying solely on FRONTEND_URL being set correctly in the dashboard and a
// redeploy actually picking it up -- that round trip kept silently failing
// to take effect on Netlify. This guarantees it works regardless.
const KNOWN_PRODUCTION_ORIGINS = [
  'https://classroom-managemnet-web-application.netlify.app',
  'https://classroom-frontend-blue.vercel.app',
];

const clean = (origin: string) => origin.trim().replace(/\/+$/, '');

export const frontendOrigins = [
  ...process.env.FRONTEND_URL.split(',').map(clean).filter(Boolean),
  ...KNOWN_PRODUCTION_ORIGINS.map(clean),
].filter((origin, index, all) => all.indexOf(origin) === index);
