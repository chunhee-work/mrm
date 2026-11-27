"use client";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { authProblem, badAddress } from "@/lib/auth-problem";
import { safeNext } from "@/lib/next-path";
import { useT } from "@/components/lang-provider";
import PasswordField from "@/components/auth/password-field";
import { Field, FieldError, IconTick, SheetBody, SheetFoot, Spinner, SubmitButton, TextLink, Title } from "@/components/auth/parts";

type Problem = null | "email" | "password" | "bad" | "unverified" | "offline" | "tooMany" | "failed";

export default function Login() {
  const { t, lang } = useT();
  const [problem, setProblem] = useState<Problem>(null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState(""); // the address of the last attempt, for "send again"
  const [resend, setResend] = useState<"idle" | "busy" | "sent" | "tooMany" | "offline" | "failed" | "email">("idle");
  const [verified, setVerified] = useState(false); // back from the link in the confirmation email
  const [linkOld, setLinkOld] = useState(false); // back from that link, but it was too old or not a real one (the server adds ?error=…)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const back = q.get("verified") === "1";
    setVerified(back && !q.get("error"));
    setLinkOld(back && !!q.get("error"));
  }, []);

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
    setBusy(true); setProblem(null); setResend("idle"); setEmail(mail); setLinkOld(false);
    try {
      const { error } = await authClient.signIn.email({ email: mail, password });
      if (!error) { window.location.href = safeNext(new URLSearchParams(window.location.search).get("next")) ?? "/dashboard"; return; } // stay busy while the page loads
      // by the server's own reason, not the status number: a refused request is also a 403, and a server fault is not a wrong password
      // (hard test: a right password sent too often was called wrong)
      const why = authProblem(error);
      setProblem(why === "unverified" || why === "tooMany" || why === "offline" ? why : why === "badLogin" || why === "passwordLong" ? "bad" : "failed");
    } catch {
      setProblem("offline");
    }
    setBusy(false);
  }

  async function sendAgain() {
    setResend("busy");
    // "Sent" only when the server took the request. (It answers the same for any address, so this tells nothing about accounts.)
    try {
      const { error } = await authClient.sendVerificationEmail({ email, callbackURL: "/login?verified=1" });
      setResend(!error ? "sent" : error.status === 429 ? "tooMany" : badAddress(error) ? "email" : "failed");
    } catch {
      setResend("offline");
    }
  }

  const clear = () => { if (problem && problem !== "unverified") setProblem(null); };

  return (
    <SheetBody>
      <Title>{t("login.title")}</Title>
      {verified && <p role="status" className="mt-3 flex items-center gap-2 text-[14px] font-medium text-fg"><IconTick className="shrink-0 text-ice" />{t("login.verified")}</p>}
      {linkOld && <div className="mt-3"><FieldError>{t("login.linkOld")}</FieldError></div>}
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
        {problem === "tooMany" && <div className="mb-4"><FieldError>{t("auth.tooMany")}</FieldError></div>}
        {problem === "failed" && <div className="mb-4"><FieldError>{t("w.err")}</FieldError></div>}
        {problem === "unverified" && (
          <div className="mb-4">
            <FieldError>{t("login.unverified")}</FieldError>
            <div className="ml-[18px] mt-1 flex min-h-[44px] items-center text-[14px]">
              {resend === "sent" ? (
                <p role="status" className="flex items-center gap-2 font-medium text-fg">
                  <IconTick className="shrink-0 text-ice" />
                  {t("login.resent")}
                </p>
              ) : (
                <button type="button" onClick={sendAgain} disabled={resend === "busy"} className="link inline-flex h-11 items-center gap-2 disabled:cursor-not-allowed disabled:opacity-55">
                  {t("login.resend")}
                  {resend === "busy" && <Spinner />}
                </button>
              )}
            </div>
            {(resend === "tooMany" || resend === "offline" || resend === "failed" || resend === "email") && (
              <div className="ml-[18px]"><FieldError>{t(resend === "tooMany" ? "auth.tooMany" : resend === "offline" ? "login.offline" : resend === "email" ? "login.needEmail" : "auth.notSent")}</FieldError></div>
            )}
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
