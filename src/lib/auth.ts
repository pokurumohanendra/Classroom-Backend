import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '../db';
import * as authSchema from '../schema/auth';
import { teachers, students } from '../schema/app';
import { frontendOrigins } from './frontend-origins';

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
// Both process.env.NETLIFY and a netlify.toml context-environment var
// (IS_DEPLOYED) turned out to NOT be reliably present at actual Function
// runtime (only during the build step), despite being documented/expected
// to work -- confirmed by direct testing against the live deployment.
// BETTER_AUTH_URL, by contrast, is demonstrably read correctly at runtime
// (the whole app depends on it and works), so it's used here instead, and
// the check defaults to the secure/cross-site behavior unless it explicitly
// points at localhost.
const isCrossSiteDeployment = !process.env.BETTER_AUTH_URL.includes('localhost');

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
