"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { badAddress } from "@/lib/auth-problem";
import { useT } from "@/components/lang-provider";
import { Field, FieldError, IconEnvelope, SheetBody, SheetFoot, SubmitButton, TextLink, Title } from "@/components/auth/parts";

export default function Forgot() {
  const { t } = useT();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState(false);
  const [fail, setFail] = useState<null | "tooMany" | "offline" | "failed">(null); // the request itself did not get through
  const sentTitle = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (sent) sentTitle.current?.focus(); }, [sent]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const emailEl = e.currentTarget.elements.namedItem("email") as HTMLInputElement;
    const email = emailEl.value.trim();
    if (!email || !emailEl.validity.valid) { setBad(true); emailEl.focus(); return; }
    setBusy(true); setFail(null);
    // "Sent" only when the server took the request: refused for too many tries, offline or a server fault, nothing was sent.
    let why: typeof fail | "email" = null;
    try {
      const { error } = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
      // the browser lets some addresses through that the server calls malformed (no dot after the @): trying again never helps
      if (error) why = error.status === 429 ? "tooMany" : badAddress(error) ? "email" : "failed";
    } catch {
      why = "offline";
    }
    setBusy(false);
    if (why === "email") { setBad(true); emailEl.focus(); }
    else if (why) setFail(why);
    else setSent(true); // same answer whether or not the email exists (the server answers OK for both)
  }

  if (sent)
    return (
      <SheetBody>
        <IconEnvelope />
        <div className="mt-5">
          <Title ref={sentTitle} tabIndex={-1}>{t("forgot.sentTitle")}</Title>
        </div>
        <p className="mt-5 text-[16px] leading-relaxed text-fg">{t("forgot.sent")}</p>
        <Link href="/login" className="btn-line mt-7 w-full">{t("forgot.back")}</Link>
      </SheetBody>
    );

  return (
    <SheetBody>
      <Title>{t("forgot.title")}</Title>
      <form onSubmit={onSubmit} onInput={() => { if (bad) setBad(false); if (fail) setFail(null); }} noValidate className="mt-7">
        <Field
          id="email" name="email" type="email" label={t("forgot.email")} required
          autoComplete="email" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false}
          error={bad ? t("login.needEmail") : undefined}
        />
        <div className="mt-6">
          {fail && <div className="mb-4"><FieldError>{t(fail === "tooMany" ? "auth.tooMany" : fail === "offline" ? "login.offline" : "auth.notSent")}</FieldError></div>}
          <SubmitButton busy={busy}>{t("forgot.submit")}</SubmitButton>
        </div>
      </form>
      <SheetFoot>
        <TextLink href="/login">{t("forgot.back")}</TextLink>
      </SheetFoot>
    </SheetBody>
  );
}
