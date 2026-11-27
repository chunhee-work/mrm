import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { after } from "next/server";
import { and, eq, gt } from "drizzle-orm";
import { db, schema } from "@/db";
import { sendEmail } from "./email";
import { MAX_PASSWORD, MIN_PASSWORD, normLang, translate } from "./i18n";
import { cleanName, nameAtSignUp } from "./account-name";
import { ensureOwnOrg } from "./own-org";

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
        // The account name has a longest length on the server too (account-name.ts): a longer one is cut here.
        // Cut, not refused, so sign-up keeps answering the same for an address that has an account and one that has not.
        before: async (u) => ({ data: { name: nameAtSignUp(u.name, u.email) } }),
        // Org is created at sign-up (plan §5 Stage 1).
        // If the database fails at this moment the account is already made, so the error is not passed on: sign-up still
        // sends the confirmation email, and the first signed-in page makes the organization (session.ts). Passing it on
        // left an account that could confirm its email and then never get in.
        after: async (u) => {
          try { await ensureOwnOrg(u); } catch (e) { console.error("organization at sign-up failed:", (e as Error)?.name); }
        },
      },
      update: {
        // A changed name is checked like a typed one: trimmed, not empty, not longer than the limit. Other changes pass.
        before: async (u) => {
          if (u.name === undefined) return;
          const name = cleanName(u.name);
          if (name === null) throw APIError.from("BAD_REQUEST", { code: "INVALID_NAME", message: "Invalid name" });
          return { data: { name } };
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
