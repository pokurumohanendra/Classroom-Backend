// This file only ever runs as the deployed Netlify Function -- never for
// local dev (that's src/index.ts). Setting this here, directly in code, is
// a guaranteed-correct signal for cross-site cookie mode in src/lib/auth.ts,
// unlike the three prior attempts that all relied on some environment
// variable (a platform var, a netlify.toml context var, then BETTER_AUTH_URL
// from the dashboard) actually being correct at runtime.
process.env.IS_DEPLOYED = "true";

import serverless from "serverless-http";

const { default: app } = await import("../../src/app");

export const handler = serverless(app);
