"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { useT } from "@/components/lang-provider";
import { Field, IconEnvelope, SheetBody, SheetFoot, SubmitButton, TextLink, Title } from "@/components/auth/parts";

export default function Forgot() {
  const { t } = useT();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState(false);
  const sentTitle = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (sent) sentTitle.current?.focus(); }, [sent]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const emailEl = e.currentTarget.elements.namedItem("email") as HTMLInputElement;
    const email = emailEl.value.trim();
    if (!email || !emailEl.validity.valid) { setBad(true); emailEl.focus(); return; }
    setBusy(true);
    try { await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" }); } catch { /* same answer either way */ }
    setBusy(false);
    setSent(true); // same answer whether or not the email exists
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
      <form onSubmit={onSubmit} onInput={() => bad && setBad(false)} noValidate className="mt-7">
        <Field
          id="email" name="email" type="email" label={t("forgot.email")} required
          autoComplete="email" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false}
          error={bad ? t("login.needEmail") : undefined}
        />
        <div className="mt-6">
          <SubmitButton busy={busy}>{t("forgot.submit")}</SubmitButton>
        </div>
      </form>
      <SheetFoot>
        <TextLink href="/login">{t("forgot.back")}</TextLink>
      </SheetFoot>
    </SheetBody>
  );
}
