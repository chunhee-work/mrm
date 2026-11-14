"use client";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { useT } from "@/components/lang-provider";
import PasswordField from "@/components/auth/password-field";
import { Field, FieldError, IconTick, SheetBody, SheetFoot, Spinner, SubmitButton, TextLink, Title } from "@/components/auth/parts";

type Problem = null | "email" | "password" | "bad" | "unverified" | "offline";

export default function Login() {
  const { t, lang } = useT();
  const [problem, setProblem] = useState<Problem>(null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState(""); // the address of the last attempt, for "send again"
  const [resend, setResend] = useState<"idle" | "busy" | "sent">("idle");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = e.currentTarget;
    const f = new FormData(form);
    const mail = String(f.get("email") ?? "").trim();
    const password = String(f.get("password") ?? "");
    const emailEl = form.elements.namedItem("email") as HTMLInputElement;
    if (!mail || !emailEl.validity.valid) { setProblem("email"); emailEl.focus(); return; }
    if (!password) { setProblem("password"); (form.elements.namedItem("password") as HTMLInputElement).focus(); return; }
    setBusy(true); setProblem(null); setResend("idle"); setEmail(mail);
    try {
      const { error } = await authClient.signIn.email({ email: mail, password });
      if (!error) { window.location.href = "/dashboard"; return; } // stay busy while the dashboard loads
      setProblem(error.status === 403 ? "unverified" : error.status ? "bad" : "offline");
    } catch {
      setProblem("offline");
    }
    setBusy(false);
  }

  async function sendAgain() {
    setResend("busy");
    try { await authClient.sendVerificationEmail({ email, callbackURL: "/dashboard" }); } catch { /* same answer either way */ }
    setResend("sent");
  }

  const clear = () => { if (problem && problem !== "unverified") setProblem(null); };

  return (
    <SheetBody>
      <Title>{t("login.title")}</Title>
      <form onSubmit={onSubmit} onInput={clear} noValidate className="mt-7">
        <div className="grid gap-5">
          <Field
            id="email" name="email" type="email" label={t("login.email")} required
            autoComplete="email" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false}
            error={problem === "email" ? t("login.needEmail") : undefined}
            aria-invalid={problem === "email" || problem === "bad" ? true : undefined}
          />
          <PasswordField
            id="password" label={t("login.password")} autoComplete="current-password"
            error={problem === "password" ? t("login.needPassword") : undefined}
            invalid={problem === "bad"}
          />
        </div>
        <p className="mb-2 mt-1 flex h-11 items-center text-[14px]">
          <TextLink href="/forgot-password">{t("login.forgot")}</TextLink>
        </p>

        {problem === "bad" && <div className="mb-4"><FieldError>{t("login.bad")}</FieldError></div>}
        {problem === "offline" && <div className="mb-4"><FieldError>{t("login.offline")}</FieldError></div>}
        {problem === "unverified" && (
          <div className="mb-4">
            <FieldError>{t("login.unverified")}</FieldError>
            <div className="ml-[18px] mt-1 flex min-h-[44px] items-center text-[14px]">
              {resend === "sent" ? (
                <p role="status" className="flex items-center gap-2 font-medium text-deep">
                  <IconTick className="shrink-0 text-ink" />
                  {t("login.resent")}
                </p>
              ) : (
                <button type="button" onClick={sendAgain} disabled={resend === "busy"} className="link inline-flex h-11 items-center gap-2 disabled:cursor-not-allowed disabled:opacity-55">
                  {t("login.resend")}
                  {resend === "busy" && <Spinner />}
                </button>
              )}
            </div>
          </div>
        )}

        <SubmitButton busy={busy}>{t("login.submit")}</SubmitButton>
      </form>
      <SheetFoot>
        {t("login.noAccount")}{lang === "zh" ? "" : " "}
        <TextLink href="/signup">{t("login.new")}</TextLink>
      </SheetFoot>
    </SheetBody>
  );
}
