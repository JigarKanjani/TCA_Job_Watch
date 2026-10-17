import "server-only";

/** The address alerts are sent from, used as the public contact. */
export function contactEmail(): string | null {
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER || "";
  return from.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/)?.[0] ?? null;
}
