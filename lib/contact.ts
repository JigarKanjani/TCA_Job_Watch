import "server-only";

/** Public contact: CONTACT_EMAIL if set, otherwise the address alerts come from. */
export function contactEmail(): string | null {
  const from = process.env.CONTACT_EMAIL || process.env.EMAIL_FROM || process.env.SMTP_USER || "";
  return from.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/)?.[0] ?? null;
}
