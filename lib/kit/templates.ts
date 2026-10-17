// Free, template-built drafts for the Application kit. Every draft is meant
// to be edited: anything we couldn't find is left as a [bracketed] prompt.
import { cleanBullet, label, listJoin, prioritiseBullets, startsWithVerb, type Section } from "./analyze";

export type KitContext = {
  jobId: string;
  role: string;
  company: string;
  location: string | null;
  jobUrl: string;
  jd: string | null;
  resume: string | null;
  resumeName: string | null;
  resumeError: string | null;
  name: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  linkedin: string | null;
  city: string | null;
  jdSkills: string[];
  matched: string[];
  missing: string[];
  resumeSkills: string[];
  score: number;
  achievements: string[];
  sections: Section[];
  pay: string | null;
};

export type Recipient = { first: string; last: string; email: string; linkedin: string; title: string };
export type EmailDraft = { subject: string; body: string };

const today = () => new Date().toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" });
const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
// Generic skills are stored lower-case and tool names keep their casing,
// so they read naturally mid-sentence.
const skillList = (skills: string[]) => listJoin(skills);

export function fileSafe(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);
}

export function docFileName(c: KitContext, kind: "Cover_Letter" | "Resume") {
  const who = [c.firstName, c.lastName].filter(Boolean).map(fileSafe).join("_") || "My";
  return `${who}_${kind}_${fileSafe(c.company) || "Company"}.docx`;
}

function contactLine(c: KitContext) {
  return [c.city, c.phone, c.email, c.linkedin].filter(Boolean).join(" · ");
}

function signature(c: KitContext) {
  return [c.name || "[Your name]", [c.phone, c.linkedin].filter(Boolean).join(" · ")].filter(Boolean).join("\n");
}

function achievementSentence(c: KitContext) {
  const verbs = c.achievements.filter(startsWithVerb).slice(0, 2).map((a) => lowerFirst(cleanBullet(a)));
  if (verbs.length === 2) return `In my recent work, I ${verbs[0]}, and I ${verbs[1]}.`;
  if (verbs.length === 1) return `In my recent work, I ${verbs[0]}.`;
  if (c.achievements.length) return `Highlights from my recent work include: ${c.achievements.slice(0, 2).map(cleanBullet).join("; ")}.`;
  return "[Add one or two results you're proud of, ideally with numbers: what you did and what changed because of it.]";
}

// ---------------------------------------------------------------- cover letter
export function coverLetter(c: KitContext, r: Recipient): string {
  const top = c.matched.slice(0, 3);
  const greeting = r.first ? `Dear ${r.first}${r.last ? ` ${r.last}` : ""},` : "Dear Hiring Manager,";
  const where = c.location ? ` in ${c.location.split(",")[0]}` : "";
  const p1 = top.length
    ? `I'm excited to apply for the ${c.role} position at ${c.company}${where}. With hands-on experience in ${skillList(top)}, I'm confident I can make an immediate contribution to your team.`
    : `I'm excited to apply for the ${c.role} position at ${c.company}${where}. [One sentence on why this role and company appeal to you.]`;
  const p2 = achievementSentence(c);
  const asks = c.jdSkills.slice(0, 4);
  let p3 = asks.length ? `Your posting emphasizes ${skillList(asks)}.` : "[What the posting emphasizes, and how your experience lines up.]";
  if (asks.length && c.matched.length) p3 += ` That lines up closely with my day-to-day work, especially ${skillList(c.matched.slice(0, 3))}.`;
  if (c.missing.length && c.matched.length) p3 += ` I'm also building my ${c.missing[0]} skills and pick up new tools quickly.`;
  const p4 = `I'd welcome the chance to discuss how my experience can help ${c.company}. Thank you for your time and consideration.`;
  return [
    c.name || "[Your name]",
    contactLine(c) || "[City] · [Phone] · [Email] · [LinkedIn]",
    "",
    today(),
    "",
    r.first ? `${r.first} ${r.last}`.trim() + (r.title ? `, ${r.title}` : "") : "Hiring Team",
    c.company,
    ...(c.location ? [c.location] : []),
    "",
    greeting,
    "",
    p1,
    "",
    p2,
    "",
    p3,
    "",
    p4,
    "",
    "Sincerely,",
    c.name || "[Your name]",
  ].join("\n");
}

// ---------------------------------------------------------------- tailored resume
const REPLACED = /^(professional summary|summary|profile|career summary|objective|about me|skills|technical skills|key skills|core skills|core competencies|competencies|areas of expertise)$/i;

export function tailoredResume(c: KitContext): string {
  if (!c.resume) return "Upload your resume (Documents → Resume), then pick it above to tailor it to this job.";
  const top = c.matched.slice(0, 4);
  const first = c.achievements.find(startsWithVerb);
  const soft = c.matched.filter((s) => /communication|stakeholder|leadership|collaboration|problem solving|presentation/.test(s)).slice(0, 2);
  const summary = [
    top.length
      ? `${c.role} candidate with hands-on experience in ${skillList(top)}.`
      : `${c.role} candidate with [your years] years of experience in [your field].`,
    first ? `Recently ${lowerFirst(cleanBullet(first))}.` : "",
    soft.length ? `Known for strong ${skillList(soft)} across teams.` : "Known for reliable delivery and clear communication across teams.",
  ]
    .filter(Boolean)
    .join(" ");
  const skills = [...c.matched, ...c.resumeSkills.filter((s) => !c.matched.includes(s))].slice(0, 16).map(label);

  const header = c.sections[0]?.lines.filter((l) => l.trim()) ?? [];
  const body = c.sections
    .slice(1)
    .filter((s) => !REPLACED.test(s.heading.trim()))
    .flatMap((s) => ["", s.heading.toUpperCase(), ...prioritiseBullets(s.lines, c.jdSkills)]);
  // No headings found: keep the resume body as it was.
  const fallback = c.sections.length <= 1 ? ["", "EXPERIENCE", ...prioritiseBullets(header.slice(2), c.jdSkills)] : [];

  return [
    c.name || header[0] || "[Your name]",
    contactLine(c) || header[1] || "[City] · [Phone] · [Email] · [LinkedIn]",
    "",
    "PROFESSIONAL SUMMARY",
    summary,
    "",
    "CORE SKILLS",
    skills.length ? skills.join(" · ") : "[Your key skills]",
    ...body,
    ...fallback,
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---------------------------------------------------------------- emails
export type EmailKind = "followup" | "thankyou" | "outreach" | "linkedin";

export const EMAIL_KINDS: { value: EmailKind; label: string; when: string }[] = [
  { value: "followup", label: "Follow-up after applying", when: "Send 5–7 business days after you apply." },
  { value: "thankyou", label: "Thank you after an interview", when: "Send within 24 hours of the interview." },
  { value: "outreach", label: "Reach out before applying", when: "Send to a recruiter or hiring manager when you apply, or just before." },
  { value: "linkedin", label: "LinkedIn connection note", when: "Paste into “Add a note” when you connect (300 characters max)." },
];

export function emailDraft(kind: EmailKind, c: KitContext, r: Recipient, o: { when?: string; topic?: string } = {}): EmailDraft {
  const hi = r.first ? `Hi ${r.first},` : "Hi there,";
  const strengths = skillList(c.matched.slice(0, 2)) || "[your top two strengths]";
  const proof = c.achievements.find(startsWithVerb);
  const proofLine = proof ? ` Most recently, I ${lowerFirst(cleanBullet(proof))}.` : "";
  const sig = signature(c);
  if (kind === "followup")
    return {
      subject: `Following up on my application: ${c.role}`,
      body: `${hi}\n\nI recently applied for the ${c.role} role at ${c.company} and wanted to follow up to share how interested I am. My background in ${strengths} lines up well with what the team is looking for.${proofLine}\n\nI'd love to learn more about the role and the next steps. Thank you for your time.\n\nBest regards,\n${sig}`,
    };
  if (kind === "thankyou") {
    const when = o.when || "today";
    const topic = o.topic?.trim() ? o.topic.trim() : "[something specific you discussed]";
    return {
      subject: `Thank you: ${c.role} interview`,
      body: `${hi}\n\nThank you for taking the time to speak with me ${when} about the ${c.role} role. I really enjoyed our conversation, especially learning about ${topic}.\n\nIt made me even more excited about the opportunity. I'm confident my experience in ${strengths} would let me contribute quickly${c.matched[2] ? `, and I'd bring the same focus on ${c.matched[2]} to ${c.company}` : ""}.\n\nPlease let me know if I can share anything else. I look forward to hearing about the next steps.\n\nBest regards,\n${sig}`,
    };
  }
  if (kind === "outreach")
    return {
      subject: `${c.role} at ${c.company}`,
      body: `${hi}\n\nI'm applying for the ${c.role} role at ${c.company} and wanted to introduce myself. I bring experience in ${strengths}.${proofLine}\n\nWould you be open to a quick 15-minute chat about the team and what success looks like in this role? I've attached my resume for context.\n\nThank you,\n${sig}`,
    };
  // LinkedIn notes are capped at 300 characters.
  const note = `${hi} I just applied for the ${c.role} role at ${c.company}. My background is in ${strengths}, and I'd love to connect and learn more about the team. Thanks!`;
  return { subject: "", body: note.length > 300 ? `${note.slice(0, 296).replace(/\s+\S*$/, "")}…` : note };
}

export function mailtoHref(to: string, d: EmailDraft) {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(d.subject)}&body=${encodeURIComponent(d.body)}`;
}
export function gmailHref(to: string, d: EmailDraft) {
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(d.subject)}&body=${encodeURIComponent(d.body)}`;
}
export function outlookHref(to: string, d: EmailDraft) {
  return `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(to)}&subject=${encodeURIComponent(d.subject)}&body=${encodeURIComponent(d.body)}`;
}

// ---------------------------------------------------------------- interview prep
export type InterviewOptions = {
  interviewer: "recruiter" | "hiring_manager" | "panel" | "technical";
  mode: "voice" | "text";
  feedback: "each" | "end";
  difficulty: "friendly" | "realistic" | "tough";
  minutes: 15 | 30 | 45;
};

const WHO: Record<InterviewOptions["interviewer"], string> = {
  recruiter: "a recruiter running a first-round phone screen",
  hiring_manager: "the hiring manager for this role",
  panel: "a panel of three interviewers (the hiring manager, a future teammate and someone from a partner team), taking turns and saying who is speaking",
  technical: "a senior team member running the technical or case interview for this role",
};

export function missingForInterview(c: KitContext) {
  const gaps: string[] = [];
  if (!c.resume) gaps.push("Your resume: attach the file to the chat along with this prompt.");
  if (!c.jd) gaps.push("The job description: open the posting and paste it into the chat, or fetch it on this page first.");
  gaps.push(`About ${c.company}: optional, but you can paste their “About us” page or ask the AI to research the company first.`);
  return gaps;
}

export function interviewPrompt(c: KitContext, o: InterviewOptions, notes = ""): string {
  const questions = Math.max(5, Math.round(o.minutes / 4));
  const lines = [
    `I have an interview coming up and want to practise. Act as ${WHO[o.interviewer]} at ${c.company}, interviewing me for the ${c.role} role${c.location ? ` (${c.location})` : ""}.`,
    "",
    "## How to run it",
    `- This is a ${o.mode === "voice" ? "spoken (voice mode) conversation: keep each of your turns short and natural, like a real interviewer on a call" : "text conversation"}. Ask ONE question at a time and wait for my answer.`,
    `- Plan about ${questions} questions for a ${o.minutes}-minute interview: a warm-up, behavioural questions (expect STAR answers), questions specific to this role and the job description, one about why ${c.company}, and one curveball. Ask natural follow-ups when my answer is vague.`,
    `- Tone: ${o.difficulty === "friendly" ? "warm and encouraging" : o.difficulty === "tough" ? "demanding: push back, probe for specifics and numbers, like a tough real interview" : "realistic and professional"}.`,
    o.feedback === "each"
      ? "- After each answer, step out of character for 2–3 sentences: what worked, what to tighten, and a stronger way to phrase it. Then continue."
      : "- Stay in character until the end. Then step out and give feedback.",
    "- End by asking if I have questions for you, and answer them in character.",
    "- Finish with a scorecard (1–5) for clarity, relevance to the role, use of examples, and confidence; my 3 biggest improvements; and a model answer for my 2 weakest questions, using my real experience.",
    "- Use only facts from my resume and the job description. If something you need is missing, ask me for it before we start (for example, ask me to upload my resume or paste the job description).",
    "",
    "## The role",
    `Title: ${c.role}`,
    `Company: ${c.company}`,
    ...(c.location ? [`Location: ${c.location}`] : []),
    `Posting: ${c.jobUrl}`,
    ...(c.pay ? [`Pay: ${c.pay}. Ask me about salary expectations at a realistic point, and coach me on answering with a range.`] : []),
    "",
    "Job description:",
    c.jd ? `"""\n${c.jd.slice(0, 9000).trim()}\n"""` : "[Not included: I'll paste it, or ask me for it.]",
    "",
    "## About me",
    `Name: ${c.name || "[my name]"}`,
    ...(c.matched.length ? [`Skills that match this posting: ${c.matched.slice(0, 8).map(label).join(", ")}`] : []),
    ...(c.missing.length ? [`Skills the posting asks for that my resume doesn't show (probe these): ${c.missing.slice(0, 5).map(label).join(", ")}`] : []),
    "",
    "Resume:",
    c.resume ? `"""\n${c.resume.slice(0, 9000).trim()}\n"""` : "[Not included: I'll attach my resume file, or ask me for it.]",
    ...(notes.trim() ? ["", "Notes from me:", notes.trim()] : []),
    "",
    "When you're ready, introduce yourself as the interviewer and ask your first question.",
  ];
  return lines.join("\n");
}
