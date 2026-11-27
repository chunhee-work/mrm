import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { after } from "next/server";
import { and, eq, gt } from "drizzle-orm";
import { db, schema } from "@/db";
import { sendEmail } from "./email";
import { MAX_PASSWORD, MIN_PASSWORD, normLang, translate } from "./i18n";

function langOf(req?: Request) {
  const m = /(?:^|;\s*)lang=([^;]+)/.exec(req?.headers.get("cookie") ?? "");
  return normLang(m?.[1]);
}

function sendVerifyMail(to: string, url: string, l: ReturnType<typeof langOf>) {
  return sendEmail(to, translate(l, "mail.verifySubject"), `<p>${translate(l, "mail.verifyBody")}</p><p><a href="${url}">${url}</a></p>`, "verify");
}

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: MIN_PASSWORD,
    maxPasswordLength: MAX_PASSWORD, // the same limit the forms check
    requireEmailVerification: true,
    // A reset is what people do when they think someone else is in: sign every device out.
    revokeSessionsOnPasswordReset: true,
    // Sign-up with an address that already has an account answers "check your email" like a new one (no account probing),
    // so an email must really arrive: a password reset link if never verified, else a "you already have an account" note.
    onExistingUserSignUp: async ({ user }, request) => {
      // at most one such email per address every 10 minutes, so this cannot be used to fill someone's inbox
      const key = `signup-again:${user.email.toLowerCase()}`;
      const recent = await db.select({ id: schema.verification.id }).from(schema.verification)
        .where(and(eq(schema.verification.identifier, key), gt(schema.verification.expiresAt, new Date()))).limit(1);
      if (recent.length) return;
      await db.insert(schema.verification).values({ id: crypto.randomUUID(), identifier: key, value: "1", expiresAt: new Date(Date.now() + 10 * 60_000) });
      const l = langOf(request);
      if (!user.emailVerified) {
        // That account's password was chosen by whoever signed up first, who may not own this mailbox. A verify link would sign
        // the owner into an account someone else can open; a reset link lets the owner choose the password (and a finished
        // reset confirms the address, onPasswordReset below). The reset mail goes out through sendResetPassword.
        await auth.api.requestPasswordReset({ body: { email: user.email, redirectTo: "/reset-password" }, headers: request?.headers, request });
        return;
      }
      const origin = new URL((await auth.$context).baseURL).origin;
      await sendEmail(user.email, translate(l, "mail.existsSubject"),
        `<p>${translate(l, "mail.existsBody")}</p><p><a href="${origin}/login">${origin}/login</a></p><p>${translate(l, "mail.existsForgot")} <a href="${origin}/forgot-password">${origin}/forgot-password</a></p><p>${translate(l, "mail.ignore")}</p>`, "other");
    },
    // A reset link was opened from this mailbox, so the address is confirmed too.
    onPasswordReset: async ({ user }) => {
      if (!user.emailVerified) await db.update(schema.user).set({ emailVerified: true, updatedAt: new Date() }).where(eq(schema.user.id, user.id));
    },
    sendResetPassword: async ({ user, url }, request) => {
      const l = langOf(request);
      await sendEmail(user.email, translate(l, "mail.resetSubject"),
        `<p>${translate(l, "mail.resetBody")}</p><p><a href="${url}">${url}</a></p><p>${translate(l, "mail.ignore")}</p>`, "reset");
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    // Not signed in by the link: an unverified account's password was chosen by whoever signed up, who may not own the mailbox,
    // and anyone can have a verify link sent to it. The owner logs in with the password they chose (or resets it, which
    // replaces any other) after confirming.
    autoSignInAfterVerification: false,
    sendVerificationEmail: async ({ user, url }, request) => sendVerifyMail(user.email, url, langOf(request)),
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
  advanced: {
    // Emails go out after the answer is sent, so a known and an unknown address answer equally fast
    // (forgot password, sign-up). Outside a request (scripts, tests) the send just runs on.
    backgroundTasks: {
      handler: (p: Promise<unknown>) => {
        try { after(p); } catch { p.catch(() => {}); }
      },
    },
  },
  plugins: [nextCookies()],
});
