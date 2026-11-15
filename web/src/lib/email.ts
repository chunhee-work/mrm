import { Resend } from "resend";
import { recordEmail } from "./ledger";

export type EmailKind = "verify" | "reset" | "other";

/** `kind` is required so every send is counted in /admin. Only kind, recipient domain and outcome are stored. */
export async function sendEmail(to: string, subject: string, html: string, kind: EmailKind) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const recipientDomain = (to.split("@")[1] ?? "unknown").toLowerCase().slice(0, 100);
  if (!key || !from) {
    // Dev fallback: never log links in production.
    if (process.env.NODE_ENV !== "production") console.log(`[email:dev] to=${to} subject=${subject}\n${html}`);
    else console.error("RESEND_API_KEY / EMAIL_FROM not set; email not sent");
    await recordEmail({ kind, recipientDomain, status: "skipped" });
    return;
  }
  let error: { message: string; name?: string } | null = null;
  try {
    ({ error } = await new Resend(key).emails.send({ from, to, subject, html }));
  } catch (e) {
    await recordEmail({ kind, recipientDomain, status: "failed", errorClass: (e as Error)?.name ?? "Error" });
    throw e;
  }
  if (error) {
    await recordEmail({ kind, recipientDomain, status: "failed", errorClass: error.name ?? "ResendError" });
    throw new Error(`Resend: ${error.message}`);
  }
  await recordEmail({ kind, recipientDomain, status: "sent" });
}
