// This file only ever runs as the deployed Netlify Function -- never for
// local dev (that's src/index.ts). Setting this here, directly in code, is
// a guaranteed-correct signal for cross-site cookie mode in src/lib/auth.ts,
// unlike prior attempts that all relied on some environment variable
// actually being correct at runtime.
process.env.IS_DEPLOYED = "true";

import serverless from "serverless-http";

// Netlify's function bundler outputs CommonJS, which doesn't support
// top-level await -- so src/app (and everything it pulls in) is imported
// lazily inside the handler instead, and the resulting serverless-http
// handler is memoized across warm invocations of this same container.
let handlerPromise: Promise<ReturnType<typeof serverless>> | null = null;

const getHandler = () => {
  if (!handlerPromise) {
    handlerPromise = import("../../src/app").then(({ default: app }) => serverless(app));
  }
  return handlerPromise;
};

export const handler = async (event: object, context: object) => {
  const actualHandler = await getHandler();
  return actualHandler(event, context);
};
