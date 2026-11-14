"use client";
import { useState } from "react";
import { useT } from "@/components/lang-provider";
import { FieldError } from "./parts";

type Props = {
  id: string;
  name?: string;
  label: string;
  autoComplete: "current-password" | "new-password";
  minLength?: number;
  hint?: string;
  error?: string;
  invalid?: boolean;
};

/** Password input with a show / hide toggle inside the field. Always starts hidden. */
export default function PasswordField({ id, name = "password", label, autoComplete, minLength, hint, error, invalid }: Props) {
  const { t } = useT();
  const [shown, setShown] = useState(false);
  const noteId = error || hint ? `${id}-note` : undefined;
  const action = shown ? t("common.hide") : t("common.show");
  return (
    <div className="field">
      <label className="label" htmlFor={id}>{label}</label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={shown ? "text" : "password"}
          className="input pr-12"
          required
          minLength={minLength}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={error || invalid ? true : undefined}
          aria-describedby={noteId}
        />
        <button
          type="button"
          onClick={() => setShown((v) => !v)}
          aria-pressed={shown}
          aria-label={`${t("common.show")} ${label}`}
          aria-controls={id}
          title={action}
          className={`absolute right-[2px] top-[2px] flex h-11 w-11 items-center justify-center rounded-[3px] transition-colors duration-150 hover:text-ice focus-visible:[outline-offset:-3px] ${shown ? "text-ice" : "text-mute"}`}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="M2.25 12C4.6 7.9 8 5.75 12 5.75S19.4 7.9 21.75 12C19.4 16.1 16 18.25 12 18.25S4.6 16.1 2.25 12z" />
            <circle cx="12" cy="12" r="3.1" fill={shown ? "currentColor" : "none"} />
          </svg>
        </button>
      </div>
      {error ? <FieldError id={noteId}>{error}</FieldError> : hint ? <p id={noteId} className="hint">{hint}</p> : null}
    </div>
  );
}
