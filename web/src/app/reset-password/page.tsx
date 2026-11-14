"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { useT } from "@/components/lang-provider";
import { MIN_PASSWORD } from "@/lib/i18n";
import PasswordField from "@/components/auth/password-field";
import { FieldError, SheetBody, SheetFoot, SubmitButton, TextLink, Title } from "@/components/auth/parts";

function Form() {
  const { t } = useT();
  const token = useSearchParams().get("token") ?? "";
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<null | "short" | "expired" | "offline">(token ? null : "expired");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const el = e.currentTarget.elements.namedItem("password") as HTMLInputElement;
    if (el.value.length < MIN_PASSWORD) { setProblem("short"); el.focus(); return; }
    setBusy(true); setProblem(null);
    try {
      const { error } = await authClient.resetPassword({ newPassword: el.value, token });
      if (!error) { window.location.href = "/login"; return; } // stay busy while the log-in page loads
      setProblem(error.status ? "expired" : "offline");
    } catch {
      setProblem("offline");
    }
    setBusy(false);
  }

  // the link is missing, used or too old: nothing to fill in, only one way on
  if (problem === "expired")
    return (
      <SheetBody>
        <Title>{t("reset.title")}</Title>
        <div className="mt-6"><FieldError>{t("reset.bad")}</FieldError></div>
        <Link href="/forgot-password" className="btn-primary mt-6 w-full">{t("reset.again")}</Link>
        <SheetFoot>
          <TextLink href="/login">{t("forgot.back")}</TextLink>
        </SheetFoot>
      </SheetBody>
    );

  return (
    <SheetBody>
      <Title>{t("reset.title")}</Title>
      <form onSubmit={onSubmit} onInput={() => problem && setProblem(null)} noValidate className="mt-7">
        <PasswordField
          id="password" label={t("reset.password")} autoComplete="new-password" minLength={MIN_PASSWORD}
          hint={t("signup.passwordHint")}
          error={problem === "short" ? t("signup.passwordHint") : undefined}
        />
        <div className="mt-6">
          {problem === "offline" && <div className="mb-4"><FieldError>{t("login.offline")}</FieldError></div>}
          <SubmitButton busy={busy}>{t("reset.submit")}</SubmitButton>
        </div>
      </form>
      <SheetFoot>
        <TextLink href="/login">{t("forgot.back")}</TextLink>
      </SheetFoot>
    </SheetBody>
  );
}

export default function Reset() {
  return <Suspense><Form /></Suspense>;
}
