import { Resend } from "resend";

export async function sendEmail(to: string, subject: string, html: string) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) {
    // Dev fallback: never log links in production.
    if (process.env.NODE_ENV !== "production") console.log(`[email:dev] to=${to} subject=${subject}\n${html}`);
    else console.error("RESEND_API_KEY / EMAIL_FROM not set; email not sent");
    return;
  }
  const { error } = await new Resend(key).emails.send({ from, to, subject, html });
  if (error) throw new Error(`Resend: ${error.message}`);
}
