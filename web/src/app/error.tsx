"use client";
import Link from "next/link";
import { useT } from "@/components/lang-provider";
import { Brand } from "@/components/brand-mark";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useT();
  return (
    <main id="main" className="wrap flex min-h-screen flex-col justify-center py-16">
      <Link href="/" aria-label={t("nav.home")} className="self-start"><Brand /></Link>
      <h1 className="display mt-10 text-[clamp(2.25rem,6vw,4.5rem)] text-deep">{t("err.title")}</h1>
      <div className="mt-8 flex flex-wrap items-center gap-x-7 gap-y-2">
        <button type="button" onClick={reset} className="btn-primary">{t("err.retry")}</button>
        <Link href="/" className="btn-quiet">{t("nf.home")}</Link>
      </div>
    </main>
  );
}
