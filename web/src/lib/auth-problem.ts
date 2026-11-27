/**
 * What a failed call to the auth server means for the user. Read from Better Auth's own error code, not guessed from the
 * status number: a 403 is also what a refused request gets, and a 400 is not always a wrong password.
 * The codes are Better Auth's BASE_ERROR_CODES (auth.test.ts checks the server still sends them).
 */
export type AuthProblem =
  | "offline" // no answer came back
  | "tooMany" // asked too often (429)
  | "unverified" // right password, email not confirmed yet
  | "badLogin" // wrong email or password
  | "wrongPassword" // the current password typed to change it is wrong
  | "passwordLong"
  | "passwordShort"
  | "other"; // anything else: say only that it did not work

/** True when the server refused the request because the address in it is not a well-formed one (decided before any account is looked up). */
export function badAddress(error: { status?: number; code?: string } | null | undefined): boolean {
  return error?.status === 400 && (error.code === "VALIDATION_ERROR" || error.code === "INVALID_EMAIL");
}

export function authProblem(error: { status?: number; code?: string } | null | undefined): AuthProblem {
  if (!error?.status) return "offline";
  if (error.status === 429) return "tooMany";
  switch (error.code) {
    case "EMAIL_NOT_VERIFIED": return "unverified";
    case "INVALID_EMAIL_OR_PASSWORD":
    case "INVALID_EMAIL": return "badLogin";
    case "INVALID_PASSWORD": return "wrongPassword";
    case "PASSWORD_TOO_LONG": return "passwordLong";
    case "PASSWORD_TOO_SHORT": return "passwordShort";
    default: return "other";
  }
}
