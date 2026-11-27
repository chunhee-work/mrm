import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { after } from "next/server";
import { and, eq, notLike } from "drizzle-orm";
import { db, schema } from "@/db";
import { sendEmail } from "./email";
import { MAX_PASSWORD, MIN_PASSWORD, normLang, translate } from "./i18n";
import { cleanName, nameAtSignUp } from "./account-name";
import { ensureOwnOrg } from "./own-org";
import {
  MAILS_PER_ADDRESS_MAX, MAILS_PER_ADDRESS_WINDOW_MS, PASSWORD_CHECK_FAILS_MAX, PASSWORD_CHECK_FAILS_WINDOW_MS, SIGN_IN_FAILS_MAX,
  SIGN_IN_FAILS_WINDOW_MS, SIGNUP_AGAIN_MAILS_MAX, SIGNUP_AGAIN_WINDOW_MS, authRateLimit, counterId, forget, giveBack, hitOrAllow,
} from "./rate-limit";

function langOf(req?: Request) {
  const m = /(?:^|;\s*)lang=([^;]+)/.exec(req?.headers.get("cookie") ?? "");
  return normLang(m?.[1]);
}

function sendVerifyMail(to: string, url: string, l: ReturnType<typeof langOf>) {
  return sendEmail(to, translate(l, "mail.verifySubject"), `<p>${translate(l, "mail.verifyBody")}</p><p><a href="${url}">${url}</a></p>`, "verify");
}

/** False when this address already got its share of this kind of email in the last hour: nothing is sent, and the answer to the browser is the same either way. */
const mayMail = async (kind: "reset" | "verify", to: string) =>
  (await hitOrAllow(counterId(`mail-${kind}`, to.toLowerCase()), MAILS_PER_ADDRESS_MAX, MAILS_PER_ADDRESS_WINDOW_MS)).allowed;

/** Where the wrong passwords typed for one email address are counted, whoever types them and whether or not it has an account. */
const signInFails = (email: string) => counterId("signin", email.toLowerCase());

type Guess = { id: string; max: number; windowMs: number };
/**
 * A request that tests a password, and the counter it is held against: log-in by the email typed (from any client address),
 * change-password by the session cookie sent. null for every other request.
 */
function guessOf(ctx: { path?: string; body?: unknown; getCookie: (name: string) => string | null; context: { authCookies: { sessionToken: { name: string } } } }): Guess | null {
  if (ctx.path === "/sign-in/email") {
    const email = (ctx.body as { email?: unknown } | undefined)?.email;
    return typeof email === "string" && email ? { id: signInFails(email), max: SIGN_IN_FAILS_MAX, windowMs: SIGN_IN_FAILS_WINDOW_MS } : null;
  }
  if (ctx.path === "/change-password") {
    const cookie = ctx.getCookie(ctx.context.authCookies.sessionToken.name);
    return cookie ? { id: counterId("pw-check", cookie), max: PASSWORD_CHECK_FAILS_MAX, windowMs: PASSWORD_CHECK_FAILS_WINDOW_MS } : null;
  }
  return null;
}
/** The two answers that mean "that password was wrong". */
const WRONG_PASSWORD = new Set(["INVALID_EMAIL_OR_PASSWORD", "INVALID_PASSWORD"]);

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: MIN_PASSWORD,
    maxPasswordLength: MAX_PASSWORD, // the same limit the forms check
    requireEmailVerification: true,
    // A reset is what people do when they think someone else is in: sign every device out.
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 60 * 60, // seconds; the reset email says "valid for 1 hour"
    // Sign-up with an address that already has an account answers "check your email" like a new one (no account probing),
    // so an email must really arrive: a password reset link if never verified, else a "you already have an account" note.
    onExistingUserSignUp: async ({ user }, request) => {
      // at most one such email per address every 10 minutes, so this cannot be used to fill someone's inbox
      // (counted in one statement: many sign-ups at the same moment still send one)
      if (!(await hitOrAllow(counterId("signup-again", user.email.toLowerCase()), SIGNUP_AGAIN_MAILS_MAX, SIGNUP_AGAIN_WINDOW_MS)).allowed) return;
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
    // The made-up user in that answer gets its name the same way a real new account does (create.before below),
    // so the two answers cannot be told apart by sending a long or a padded name.
    // The picture is dropped the same way too (create.before): nothing a sign-up sends in it reaches the database or the answer.
    customSyntheticUser: ({ coreFields, additionalFields, id }) => ({ ...coreFields, name: nameAtSignUp(coreFields.name, coreFields.email), image: null, ...additionalFields, id }),
    // A reset link was opened from this mailbox, so the address is confirmed too.
    onPasswordReset: async ({ user }) => {
      if (!user.emailVerified) await db.update(schema.user).set({ emailVerified: true, updatedAt: new Date() }).where(eq(schema.user.id, user.id));
      // The other reset links sent to this account stop working with the one that was used (a reset row's value is the user id).
      try { await db.delete(schema.verification).where(and(eq(schema.verification.value, user.id), notLike(schema.verification.id, "rl:%"))); } catch (e) { console.error("removing the other reset links failed:", (e as Error)?.name); }
      // and the owner can log in at once, even if someone had the address locked with wrong passwords
      await forget(signInFails(user.email));
    },
    sendResetPassword: async ({ user, url }, request) => {
      if (!(await mayMail("reset", user.email))) return;
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
    sendVerificationEmail: async ({ user, url }, request) => {
      if (await mayMail("verify", user.email)) await sendVerifyMail(user.email, url, langOf(request));
    },
  },
  // A reset link is stored as a hash of itself: someone who can read the table cannot use the links in it.
  // Links sent before this was turned on (stored as they are) still work until they expire.
  verification: { storeIdentifier: { default: "plain", overrides: { "reset-password:": "hashed" } } },
  // Counted in the database, per client address: rate-limit.ts.
  rateLimit: authRateLimit,
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      // Counted before the password is looked at, in one statement, so tries sent at the same moment cannot all get in under the cap.
      const g = guessOf(ctx);
      if (g && !(await hitOrAllow(g.id, g.max, g.windowMs)).allowed) throw APIError.from("TOO_MANY_REQUESTS", { code: "TOO_MANY_REQUESTS", message: "Too many requests. Please try again later." });
      // A changed password signs every other device out, whatever the request asks for.
      if (ctx.path === "/change-password" && ctx.body && typeof ctx.body === "object") return { context: { body: { ...ctx.body, revokeOtherSessions: true } } };
    }),
    after: createAuthMiddleware(async (ctx) => {
      const g = guessOf(ctx);
      if (!g) return;
      const r = ctx.context.returned;
      const code = isAPIError(r) ? (r.body as { code?: string } | undefined)?.code : null;
      if (code && WRONG_PASSWORD.has(code)) return; // a wrong password: the try stays counted
      // the right password starts the count again; anything else (a malformed request, email not confirmed) was not a guess
      ctx.context.runInBackground(isAPIError(r) ? giveBack(g.id, g.max) : forget(g.id));
    }),
  },
  databaseHooks: {
    user: {
      create: {
        // The account name has a longest length on the server too (account-name.ts): a longer one is cut here.
        // Cut, not refused, so sign-up keeps answering the same for an address that has an account and one that has not
        // (the answer for one that has: customSyntheticUser above, the same cut).
        // A profile picture is not used anywhere: whatever is sent as one is dropped before the row is written.
        before: async (u) => ({ data: { name: nameAtSignUp(u.name, u.email), image: null } }),
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
          // no profile pictures: a text of any length could be stored there otherwise
          if (u.image !== undefined && u.image !== null) throw APIError.from("BAD_REQUEST", { code: "INVALID_IMAGE", message: "Invalid image" });
          if (u.name === undefined) return;
          const name = cleanName(u.name);
          if (name === null) throw APIError.from("BAD_REQUEST", { code: "INVALID_NAME", message: "Invalid name" });
          return { data: { name } };
        },
      },
    },
  },
  advanced: {
    // The client address the limiter counts by. On Vercel both headers are written by the platform (a value the client sends
    // is replaced), each with the one address of the client. The second is only read when the first is missing or holds more
    // than one address (Better Auth does not believe a list: its first entry is whatever the client typed).
    ipAddress: { ipAddressHeaders: ["x-forwarded-for", "x-vercel-forwarded-for"] },
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
