import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { sendTransactionalEmail, type TransactionalEmail } from "./email";

// The optional sender is only used by integration tests; production always uses Resend.
export function createAuth(sendEmail: TransactionalEmail = sendTransactionalEmail) {
  return betterAuth({
    database: drizzleAdapter(db, { provider: "pg", schema }),
    user: {
      modelName: "users",
      additionalFields: {
        role: { type: "string", required: false, defaultValue: "learner", input: false },
        timezone: { type: "string", required: false, defaultValue: "UTC", input: false },
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendEmail({ to: user.email, subject: "Restablece tu contraseña", url });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendVerificationEmail: async ({ user, url }) => {
        await sendEmail({ to: user.email, subject: "Verifica tu correo", url });
      },
    },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24, cookieCache: { enabled: false } },
    rateLimit: { enabled: true, storage: "database", modelName: "rateLimit" },
    advanced: { database: { generateId: () => crypto.randomUUID() } },
  });
}

export const auth = createAuth();
