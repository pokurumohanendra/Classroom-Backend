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

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: authSchema,
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: [process.env.FRONTEND_URL],
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
