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
// (e.g. localhost vs. netlify.app), not just different ports like in local
// dev -- browsers won't send a SameSite=Lax cookie on those cross-site fetch
// calls. SameSite=None (which requires Secure, i.e. HTTPS) fixes that.
// IS_DEPLOYED is set in netlify.toml itself (not the dashboard), so it's
// guaranteed present at function runtime rather than relying on a platform
// env var whose runtime availability isn't documented.
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
