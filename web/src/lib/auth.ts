import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db, schema } from "@/db";
import { sendEmail } from "./email";
import { MIN_PASSWORD, normLang, translate } from "./i18n";

function langOf(req?: Request) {
  const m = /(?:^|;\s*)lang=([^;]+)/.exec(req?.headers.get("cookie") ?? "");
  return normLang(m?.[1]);
}

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: MIN_PASSWORD,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }, request) => {
      const l = langOf(request);
      await sendEmail(user.email, translate(l, "mail.resetSubject"),
        `<p>${translate(l, "mail.resetBody")}</p><p><a href="${url}">${url}</a></p><p>${translate(l, "mail.ignore")}</p>`);
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }, request) => {
      const l = langOf(request);
      await sendEmail(user.email, translate(l, "mail.verifySubject"),
        `<p>${translate(l, "mail.verifyBody")}</p><p><a href="${url}">${url}</a></p>`);
    },
  },
  databaseHooks: {
    user: {
      create: {
        // Org is created at sign-up (plan §5 Stage 1).
        after: async (u) => {
          const orgId = crypto.randomUUID();
          await db.insert(schema.organizations).values({ id: orgId, name: `${u.name || u.email}` });
          await db.insert(schema.memberships).values({ orgId, userId: u.id, role: "owner" });
        },
      },
    },
  },
  plugins: [nextCookies()],
});
