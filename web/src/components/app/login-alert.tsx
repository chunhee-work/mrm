"use client";
import { useState } from "react";
import { useT } from "@/components/lang-provider";
import { needsUser } from "@/lib/ext/login-state";
import ProfileCard, { type Cred } from "./profile-card";

/** What Merimen said, in one sentence (the same lines the details page uses). */
export function loginLine(c: Cred): string {
  if (c.verifyState === "otp") return "w.otp";
  if (c.verifyState === "locked") return "w.locked";
  if (c.verifyState === "unknown") return "w.unknown";
  if (c.verifyState === "bad_credentials") return "w.bad";
  return "w.blocked";
}

/**
 * One slim red line on the Cases page, only while the Merimen login needs the user (wrong password, a code, locked, unclear).
 * Fix opens the login form right under it, on this page (owner 2026-11-27: everything stays on the first page).
 * It goes away by itself once the login works again.
 */
export default function LoginAlert({ cred, setCred, onSaved }: { cred: Cred; setCred: (c: Cred) => void; onSaved?: () => void }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  if (!cred.complete || !needsUser(cred)) return null;
  return (
    <div className="grid gap-3" data-testid="login-alert">
      <div role="alert" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[4px] border border-[#dc2626]/45 bg-[#fef2f2] px-4 py-3">
        <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#dc2626] text-[12px] font-bold leading-none text-white">!</span>
        <p className="min-w-0 flex-1 text-[14.5px] leading-snug text-[#7f1d1d]">
          <span className="font-semibold">{t("la.title")}</span> <span className="text-[#991b1b]">{t(loginLine(cred))}</span>
        </p>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
          className="inline-flex h-9 shrink-0 items-center rounded-full border border-[#dc2626]/60 bg-white px-4 text-[14px] font-semibold text-[#991b1b] transition-colors hover:bg-[#fee2e2]" data-testid="login-fix">
          {t(open ? "la.close" : "la.fix")}
        </button>
      </div>
      {open && <ProfileCard cred={cred} setCred={setCred} onSaved={onSaved} compact look="page" />}
    </div>
  );
}
