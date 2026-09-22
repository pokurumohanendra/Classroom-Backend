import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '../db/index.js';
import * as authSchema from '../schema/auth.js';
import { teachers, students } from '../schema/app.js';
import { frontendOrigins } from './frontend-origins.js';

if (!process.env.BETTER_AUTH_SECRET) {
  throw new Error('BETTER_AUTH_SECRET is not set in .env file');
}
if (!process.env.BETTER_AUTH_URL) {
  throw new Error('BETTER_AUTH_URL is not set in .env file');
}

// Frontend and backend are on different registrable domains once deployed
// (e.g. netlify.app subdomains are each their own "site") -- browsers won't
// send a SameSite=Lax cookie on those cross-site fetch calls. SameSite=None
// (which requires Secure, i.e. HTTPS) fixes that.
// IS_DEPLOYED is set directly in each platform's function entrypoint
// (netlify/functions/api.ts, api/[...path].ts) -- the files that only ever
// run when actually deployed, never for local dev -- so this can't drift
// out of sync with a dashboard-configured value the way three prior
// attempts (a platform env var, a netlify.toml context var, and
// BETTER_AUTH_URL's content) all did.
const isCrossSiteDeployment = process.env.IS_DEPLOYED === 'true';

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: authSchema,
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: frontendOrigins,
  advanced: isCrossSiteDeployment
    ? {
        useSecureCookies: true,
        defaultCookieAttributes: { sameSite: 'none', secure: true },
      }
    : undefined,
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      role: {
        type: 'string',
        required: true,
        defaultValue: 'student',
        input: true,
      },
      imageCldPubId: {
        type: 'string',
        required: false,
        input: true,
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        // A Teacher/Student profile row is how the rest of the schema (Class,
        // Enrollments) links to a user, per the ER diagram -- keep it in sync
        // automatically instead of relying on every user-creation path to
        // remember to insert one.
        after: async (user) => {
          const role = (user as { role?: string }).role;

          if (role === 'teacher') {
            await db.insert(teachers).values({ userId: user.id });
          } else if (role === 'student') {
            await db.insert(students).values({ userId: user.id });
          }
        },
      },
    },
  },
});
