// Single source for the brand name and the company identity.
//
// Companies Act 2016 s.30(2)(b): a Malaysian company must show its registered name and
// registration number on its website. The values below are PLACEHOLDERS until the owner
// supplies the real ones — then set `placeholder: false`.
// While `placeholder` is true the company block is shown on preview deployments (so the
// owner can see where it goes) and hidden on the production deployment.
export const SITE = {
  brand: "Autopilotclaim",
  url: "https://autopilotclaim.com",
  placeholder: true,
  legalName: "Your Company Sdn. Bhd.",
  regNo: "000000000000 (0000000-X)",
  address: "Kuala Lumpur, Malaysia",
  email: "hello@example.com",
  /** Real number (owner, 2026-11-15). Unlike the company block it is shown everywhere, production included. */
  whatsapp: "+60 12-318 5769",
  year: 2026,
} as const;

/** False only on the production deployment while the identity is still a placeholder. */
export function showCompany(): boolean {
  return !(SITE.placeholder && process.env.VERCEL_ENV === "production");
}
/** Click-to-chat link. `text` is pre-filled in the visitor's message box, so they only press send. */
export function whatsappHref(text?: string): string {
  const base = `https://wa.me/${SITE.whatsapp.replace(/\D/g, "")}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}
/** Name used in the legal pages for "who operates this service". */
export function operatorName(): string {
  return showCompany() ? SITE.legalName : SITE.brand;
}
export function contactEmail(): string {
  return showCompany() ? SITE.email : `${SITE.url.replace(/^https?:\/\//, "")}/contact`;
}
