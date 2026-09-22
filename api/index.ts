import type { IncomingMessage, ServerResponse } from "http";
import app from "../src/app.js";

// Express apps are directly callable as a (req, res) handler, which is
// exactly what Vercel's Node runtime expects -- no serverless-http wrapper
// needed here, simpler than the Netlify setup.
//
// This must be a static import, not a dynamic import("../src/app"): Vercel's
// builder only bundles the local files it can statically trace from the
// entrypoint, so a dynamic import of a local (non-node_modules) module was
// silently left out of the deployed function entirely (ERR_MODULE_NOT_FOUND
// at runtime). IS_DEPLOYED is set as a real Vercel project env var (not
// assigned in code here) since a static import can't guarantee running
// before anything else reads it.
export default function handler(req: IncomingMessage, res: ServerResponse) {
  app(req, res);
}
