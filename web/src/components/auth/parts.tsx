import Link from "next/link";
import type { ComponentProps, InputHTMLAttributes, ReactNode } from "react";

/** The padded body of the sheet. */
export function SheetBody({ children }: { children: ReactNode }) {
  return <div className="px-5 pb-6 pt-7 sm:px-8 sm:pb-8 sm:pt-9">{children}</div>;
}

export function Title({ children, ...rest }: ComponentProps<"h1">) {
  return (
    <h1 className="display-2 text-[30px] !leading-[1.06] text-deep outline-none sm:text-[32px]" {...rest}>
      {children}
    </h1>
  );
}

/** The line under the form: a dimension rule, then one sentence with one link. */
export function SheetFoot({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="reg-rule mt-7" />
      <p className="-mb-2 pt-4 text-[15px] leading-6 text-mute sm:-mb-3">{children}</p>
    </>
  );
}

/** Inline text link with a 44px-tall hit area. */
export function TextLink({ href, children, newTab = false }: { href: string; children: ReactNode; newTab?: boolean }) {
  return (
    <Link href={href} className="link relative after:absolute after:inset-x-0 after:-inset-y-3 after:content-['']" {...(newTab ? { target: "_blank", rel: "noopener" } : {})}>
      {children}
    </Link>
  );
}

export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} role="alert" className="field-error">
      {children}
    </p>
  );
}

type FieldProps = { id: string; label: string; error?: string; hint?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "className">;

/** Label above a 48px input; the hint line turns into the error line. */
export function Field({ id, label, error, hint, ...input }: FieldProps) {
  const noteId = error || hint ? `${id}-note` : undefined;
  return (
    <div className="field">
      <label className="label" htmlFor={id}>{label}</label>
      <input id={id} className="input" aria-invalid={error ? true : undefined} aria-describedby={noteId} {...input} />
      {error ? <FieldError id={noteId}>{error}</FieldError> : hint ? <p id={noteId} className="hint">{hint}</p> : null}
    </div>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`h-4 w-4 motion-safe:animate-spin motion-reduce:animate-pulse ${className}`}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6" opacity="0.3" />
      <path d="M8 2a6 6 0 0 1 6 6" />
    </svg>
  );
}

/** Full-width primary button; while `busy` it is disabled and shows a spinner beside the label (the label does not move). */
export function SubmitButton({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <button type="submit" className="btn-primary w-full disabled:cursor-progress disabled:bg-ink disabled:opacity-80" disabled={busy} aria-busy={busy || undefined}>
      <span className="relative">
        {busy && <Spinner className="absolute -left-7 top-1/2 -mt-2" />}
        {children}
      </span>
    </button>
  );
}

/** An envelope with one amber mark: something is waiting in the inbox. */
export function IconEnvelope() {
  return (
    <svg width="44" height="44" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-ink" aria-hidden="true">
      <path d="M3.75 9.75h28.5v21.5H3.75z" />
      <path d="M3.75 9.75L18 21.5l14.25-11.75" />
      <circle cx="32.25" cy="9.75" r="4.5" fill="#FF8A1F" stroke="#0B1533" strokeWidth="1.25" />
    </svg>
  );
}

export function IconTick({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M3 8.6l3.2 3.2L13 4.4" />
    </svg>
  );
}
