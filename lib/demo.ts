// A shared, read-only demo account so anyone can explore the app without
// signing up. Writes are blocked in the database (restrictive RLS policies);
// these helpers just give friendly messages instead of errors.
export const DEMO_EMAIL = process.env.DEMO_EMAIL ?? "demo@example.com";
export const demoEnabled = Boolean(process.env.DEMO_PASSWORD);
export const DEMO_MESSAGE = "This is the read-only demo. Create your own free account to save changes.";

export function isDemoEmail(email: string | null | undefined): boolean {
  return Boolean(email) && email!.toLowerCase() === DEMO_EMAIL.toLowerCase();
}
