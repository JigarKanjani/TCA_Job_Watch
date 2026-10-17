import "server-only";
import type { KitContext } from "./templates";

// Optional: with ANTHROPIC_API_KEY set, the Application kit can have Claude
// write the drafts. Without it everything still works from the templates.

export const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);
const MODEL = () => process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

export type AiKind = "cover" | "resume" | "followup" | "thankyou" | "outreach" | "linkedin";

const SYSTEM = `You help job seekers write application documents.
Rules:
- Use only facts found in the resume. Never invent employers, job titles, degrees, dates, certifications, tools or numbers.
- If a useful detail is missing, leave a short [bracketed placeholder] for the user to fill in.
- Canadian/US business English. Warm, confident, specific. No clichés like "I am writing to express my interest".
- Plain text only. No markdown, no asterisks, no headings with #.`;

const TASK: Record<AiKind, string> = {
  cover:
    "Write a one-page cover letter (250–350 words). Start with the candidate's name and a contact line, then the date, then the company block, then the greeting. Three or four short paragraphs: why this role, one or two concrete achievements from the resume tied to the posting, how their skills match what the posting emphasizes, a short close. Sign off with 'Sincerely,' and their name.",
  resume:
    "Rewrite the resume so it is tailored to this posting, keeping every fact true. Output format: line 1 = name, line 2 = contact line, then sections with UPPERCASE headings (PROFESSIONAL SUMMARY, CORE SKILLS, EXPERIENCE, EDUCATION, plus any others the original has). Bullets start with '- '. Put the posting's most relevant skills and bullets first, use the posting's vocabulary where it truthfully applies, keep it to what would fit on 1–2 pages.",
  followup:
    "Write a short follow-up email (90–140 words) sent 5–7 business days after applying. First line 'Subject: ...', blank line, then the body ending with a signature (name, phone, LinkedIn if known).",
  thankyou:
    "Write a thank-you email (100–160 words) sent within 24 hours of an interview. Reference the topic discussed if given. First line 'Subject: ...', blank line, then the body ending with a signature.",
  outreach:
    "Write a short email (80–130 words) introducing the candidate to the recruiter or hiring manager around the time they apply, asking for a brief chat. First line 'Subject: ...', blank line, then the body ending with a signature.",
  linkedin: "Write a LinkedIn connection note, at most 280 characters, friendly and specific. Output only the note.",
};

export async function aiWrite(
  kind: AiKind,
  c: KitContext,
  extra: { recipient?: string; when?: string; topic?: string } = {},
): Promise<{ text: string } | { error: string }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { error: "AI writing isn't switched on. Add ANTHROPIC_API_KEY on Vercel." };
  const user = [
    TASK[kind],
    "",
    `Role: ${c.role}`,
    `Company: ${c.company}`,
    c.location ? `Location: ${c.location}` : "",
    extra.recipient ? `Recipient: ${extra.recipient}` : "Recipient: unknown (use a general greeting)",
    extra.when ? `Interview was: ${extra.when}` : "",
    extra.topic ? `Topic we discussed: ${extra.topic}` : "",
    `Candidate name: ${c.name || "[unknown]"}; contact: ${[c.city, c.phone, c.email, c.linkedin].filter(Boolean).join(" · ") || "[unknown]"}`,
    "",
    "JOB DESCRIPTION:",
    c.jd ? c.jd.slice(0, 12000) : "[not available: rely on the role title]",
    "",
    "RESUME:",
    c.resume ? c.resume.slice(0, 14000) : "[not available: keep claims general and use placeholders]",
  ]
    .filter((l) => l !== "")
    .join("\n");
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL(), max_tokens: kind === "resume" ? 3000 : 1200, system: SYSTEM, messages: [{ role: "user", content: user }] }),
      signal: AbortSignal.timeout(55000),
    });
    if (!res.ok) return { error: `The AI service said no (${res.status}). The template draft is still there.` };
    const body = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (body.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    return text ? { text } : { error: "The AI returned an empty draft. Try again." };
  } catch {
    return { error: "The AI took too long. The template draft is still there." };
  }
}
