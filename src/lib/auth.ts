import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '../db';
import * as authSchema from '../schema/auth';
import { teachers, students } from '../schema/app';

if (!process.env.BETTER_AUTH_SECRET) {
  throw new Error('BETTER_AUTH_SECRET is not set in .env file');
}
if (!process.env.FRONTEND_URL) {
  throw new Error('FRONTEND_URL is not set in .env file');
}
if (!process.env.BETTER_AUTH_URL) {
  throw new Error('BETTER_AUTH_URL is not set in .env file');
}

// Frontend and backend are on different registrable domains once deployed
// (e.g. localhost vs. netlify.app), not just different ports like in local
// dev -- browsers won't send a SameSite=Lax cookie on those cross-site fetch
// calls. SameSite=None (which requires Secure, i.e. HTTPS) fixes that.
// `NETLIFY` is set to 'true' automatically by Netlify's own build/runtime
// for every deploy context -- unlike BETTER_AUTH_URL, it can't be typo'd or
// left stale in the dashboard, so it's the more reliable signal here.
const isCrossSiteDeployment = process.env.NETLIFY === 'true';

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: authSchema,
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: [process.env.FRONTEND_URL],
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
