"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { useT } from "@/components/lang-provider";
import { MIN_PASSWORD } from "@/lib/i18n";
import PasswordField from "@/components/auth/password-field";
import { Field, FieldError, IconEnvelope, SheetBody, SheetFoot, SubmitButton, TextLink, Title } from "@/components/auth/parts";

type Errors = { name?: boolean; email?: boolean; password?: boolean; agree?: boolean; form?: "fail" | "offline" };

export default function Signup() {
  const { t } = useT();
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [doneFor, setDoneFor] = useState(""); // the email the verification link went to
  const doneTitle = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (doneFor) doneTitle.current?.focus(); }, [doneFor]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = e.currentTarget;
    const f = new FormData(form);
    const el = (n: string) => form.elements.namedItem(n) as HTMLInputElement;
    const name = String(f.get("name") ?? "").trim();
    const email = String(f.get("email") ?? "").trim();
    const password = String(f.get("password") ?? "");
    const bad: Errors = {};
    if (!name) bad.name = true;
    if (!email || !el("email").validity.valid) bad.email = true;
    if (password.length < MIN_PASSWORD) bad.password = true;
    if (!f.get("agree")) bad.agree = true;
    setErrors(bad);
    const first = (["name", "email", "password", "agree"] as const).find((k) => bad[k]);
    if (first) { el(first).focus(); return; }
    setBusy(true);
    try {
      const { error } = await authClient.signUp.email({ name, email, password, callbackURL: "/dashboard" });
      if (error) setErrors({ form: error.status ? "fail" : "offline" });
      else setDoneFor(email);
    } catch {
      setErrors({ form: "offline" });
    }
    setBusy(false);
  }

  // an error goes away as soon as its own field is corrected
  function onInput(e: React.FormEvent<HTMLFormElement>) {
    const n = (e.target as HTMLInputElement).name as keyof Errors;
    if (errors[n] || errors.form) setErrors((o) => ({ ...o, [n]: undefined, form: undefined }));
  }

  if (doneFor)
    return (
      <SheetBody>
        <IconEnvelope />
        <div className="mt-5">
          <Title ref={doneTitle} tabIndex={-1}>{t("signup.doneTitle")}</Title>
        </div>
        <p className="mt-5 text-[16px] leading-relaxed text-deep">
          {t("signup.doneText")}
          <strong className="block break-all font-semibold">{doneFor}</strong>
        </p>
        <p className="mt-3 text-[16px] leading-relaxed text-deep">{t("signup.doneNext")}</p>
        <Link href="/login" className="btn-line mt-7 w-full">{t("login.submit")}</Link>
      </SheetBody>
    );

  return (
    <SheetBody>
      <Title>{t("signup.title")}</Title>
      <form onSubmit={onSubmit} onInput={onInput} noValidate className="mt-7">
        <div className="grid gap-5">
          <Field
            id="name" name="name" type="text" label={t("signup.name")} required autoComplete="organization"
            error={errors.name ? t("signup.needName") : undefined}
          />
          <Field
            id="email" name="email" type="email" label={t("signup.email")} required
            autoComplete="email" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false}
            error={errors.email ? t("login.needEmail") : undefined}
          />
          <PasswordField
            id="password" label={t("signup.password")} autoComplete="new-password" minLength={MIN_PASSWORD}
            hint={t("signup.passwordHint")}
            error={errors.password ? t("signup.passwordHint") : undefined}
          />

          <div className="grid gap-2.5">
            <div className="flex items-start gap-3">
              <span className="relative -m-3 flex h-11 w-11 shrink-0 items-center justify-center">
                <input
                  id="agree" name="agree" type="checkbox"
                  className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  aria-invalid={errors.agree ? true : undefined}
                  aria-describedby={errors.agree ? "agree-note" : undefined}
                />
                <span
                  className={`pointer-events-none flex h-5 w-5 items-center justify-center rounded-[2px] border-[1.5px] bg-white text-white transition-colors duration-150 peer-checked:border-ink peer-checked:bg-ink peer-hover:border-ink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-[3px] peer-focus-visible:outline-ink [&>svg]:opacity-0 peer-checked:[&>svg]:opacity-100 ${
                    errors.agree ? "border-signal ring-2 ring-signal/25" : "border-mute"
                  }`}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.25" aria-hidden="true" className="transition-opacity duration-150">
                    <path d="M3 8.6l3.2 3.2L13 4.4" />
                  </svg>
                </span>
              </span>
              <label htmlFor="agree" className="cursor-pointer text-[14.5px] leading-5 text-deep">
                {t("signup.agree1")}
                <TextLink href="/privacy" newTab>{t("footer.privacy")}</TextLink>
                {t("signup.and")}
                <TextLink href="/terms" newTab>{t("footer.terms")}</TextLink>
              </label>
            </div>
            {errors.agree && <FieldError id="agree-note">{t("signup.needAgree")}</FieldError>}
          </div>
        </div>

        <div className="mt-6">
          {errors.form && <div className="mb-4"><FieldError>{t(errors.form === "fail" ? "signup.fail" : "login.offline")}</FieldError></div>}
          <SubmitButton busy={busy}>{t("signup.submit")}</SubmitButton>
        </div>
      </form>
      <SheetFoot>
        {t("signup.have")}
        <TextLink href="/login">{t("login.submit")}</TextLink>
      </SheetFoot>
    </SheetBody>
  );
}
