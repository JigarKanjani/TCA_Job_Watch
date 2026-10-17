// Reads a resume and a job description and works out what overlaps: the
// skills the posting asks for, which of them the resume shows, the strongest
// achievement lines, contact details and section structure. Pure functions,
// no API keys: this is what the free Application kit templates are built on.

// Canonical skill → aliases. Lower-case canonicals are generic ("supply chain"),
// capitalised ones are names that keep their casing ("Excel", "SAP").
const SKILLS: [string, ...string[]][] = [
  ["Excel", "microsoft excel", "ms excel", "advanced excel", "pivot tables", "pivot table", "vlookup", "xlookup"],
  ["SQL", "t-sql", "postgresql", "mysql"],
  ["Python"],
  ["Power BI", "powerbi"],
  ["Tableau"],
  ["Looker"],
  ["SAP", "sap s/4hana", "s/4hana", "sap mm", "sap ariba", "ariba"],
  ["Oracle", "oracle ebs", "jd edwards", "jde"],
  ["NetSuite"],
  ["ERP", "erp systems", "enterprise resource planning"],
  ["CRM"],
  ["Salesforce"],
  ["HubSpot"],
  ["Jira"],
  ["Confluence"],
  ["Visio", "process mapping", "bpmn"],
  ["Microsoft Office", "ms office", "office 365", "microsoft 365", "word and excel"],
  ["Google Workspace", "google sheets"],
  ["Agile", "scrum", "kanban"],
  ["project management", "project coordination", "pmp", "capm"],
  ["stakeholder management", "stakeholder engagement", "stakeholder relationships", "stakeholders"],
  ["supply chain", "supply-chain", "scm"],
  ["procurement", "purchasing", "sourcing", "strategic sourcing", "buyer"],
  ["inventory management", "inventory control", "inventory planning", "inventory"],
  ["logistics", "transportation", "freight", "shipping and receiving"],
  ["warehousing", "warehouse", "distribution centre", "distribution center"],
  ["demand planning", "demand forecasting", "forecasting"],
  ["S&OP", "sales and operations planning"],
  ["vendor management", "supplier management", "supplier relationship", "supplier relationships", "vendor relations"],
  ["contract negotiation", "negotiation", "negotiating", "contract management"],
  ["import/export", "customs", "incoterms"],
  ["data analysis", "data analytics", "analytics", "analyzing data", "analysing data"],
  ["data visualization", "data visualisation", "dashboards", "dashboard"],
  ["reporting", "kpi", "kpis", "metrics"],
  ["budgeting", "budget management", "budgets"],
  ["financial analysis", "financial modeling", "financial modelling", "variance analysis"],
  ["accounting", "accounts payable", "accounts receivable", "reconciliation", "reconciliations", "general ledger"],
  ["cost reduction", "cost savings", "cost optimization", "cost optimisation"],
  ["process improvement", "continuous improvement", "lean", "six sigma", "kaizen", "process optimization"],
  ["root cause analysis"],
  ["business analysis", "requirements gathering", "business requirements", "user stories", "gap analysis"],
  ["change management"],
  ["risk management", "risk assessment"],
  ["compliance", "regulatory", "audit", "audits"],
  ["quality assurance", "quality control", "qa/qc"],
  ["health and safety", "hse", "ehs", "workplace safety"],
  ["operations", "operations management", "operational excellence"],
  ["customer service", "customer experience", "client service"],
  ["account management", "client relationships", "relationship management"],
  ["sales", "business development", "lead generation"],
  ["marketing", "digital marketing", "campaigns"],
  ["SEO", "search engine optimization"],
  ["social media"],
  ["content writing", "copywriting", "content creation"],
  ["recruiting", "recruitment", "talent acquisition", "sourcing candidates"],
  ["HRIS", "workday", "adp", "successfactors"],
  ["payroll"],
  ["onboarding"],
  ["employee relations"],
  ["training", "coaching", "mentoring"],
  ["leadership", "team leadership", "people management", "supervising", "supervision"],
  ["communication", "communication skills", "written and verbal", "verbal and written"],
  ["presentation skills", "presentations", "presenting"],
  ["cross-functional collaboration", "cross-functional", "cross functional", "collaboration"],
  ["problem solving", "problem-solving", "troubleshooting"],
  ["attention to detail", "detail-oriented", "detail oriented"],
  ["time management", "prioritization", "prioritisation", "multitasking", "multi-tasking"],
  ["IT support", "help desk", "service desk", "desktop support"],
  ["ITIL"],
  ["ServiceNow"],
  ["Active Directory"],
  ["networking", "tcp/ip", "lan/wan"],
  ["cybersecurity", "information security"],
  ["AWS", "amazon web services"],
  ["Azure"],
  ["JavaScript", "typescript", "react", "node.js"],
  ["Java"],
  ["machine learning"],
  ["product management", "product roadmap", "roadmapping"],
  ["UX", "user research", "user experience"],
  ["Figma"],
  ["French", "bilingual"],
];

const GENERIC_UPPER = new Set([
  "THE", "AND", "FOR", "WITH", "YOU", "OUR", "WE", "ARE", "ALL", "NEW", "USA", "CAN", "CA", "US", "AB", "BC", "ON", "QC",
  "MB", "SK", "NS", "NB", "NL", "PE", "EOE", "LLC", "INC", "LTD", "CORP", "WHAT", "WHO", "HOW", "WHY", "JOB", "ROLE",
  "ABOUT", "TEAM", "HR", "PM", "AM", "NA", "N/A", "OR", "TO", "OF", "IN", "IT", "IS", "BE", "AS", "AT", "BY", "AN", "A",
]);

export type Section = { heading: string; lines: string[] };

export type Contact = {
  name: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  linkedin: string | null;
  city: string | null;
};

export type Fit = {
  jdSkills: string[];
  matched: string[];
  missing: string[];
  resumeSkills: string[];
  score: number;
};

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const aliasRe = new Map<string, RegExp>();
function re(alias: string) {
  let r = aliasRe.get(alias);
  if (!r) {
    r = new RegExp(`(?<![a-z0-9])${esc(alias.toLowerCase())}(?![a-z0-9])`, "g");
    aliasRe.set(alias, r);
  }
  r.lastIndex = 0;
  return r;
}

function countSkill(textLower: string, aliases: string[]) {
  let n = 0;
  for (const a of aliases) n += textLower.match(re(a))?.length ?? 0;
  return n;
}

/** Part of a posting that lists requirements, weighted higher. */
function requirementsPart(jd: string) {
  const m = jd.search(/\n\s*(?:#+\s*)?(requirements|qualifications|what you(?:'|’)ll bring|what you bring|must[- ]haves?|skills|about you|who you are)\b/i);
  return m >= 0 ? jd.slice(m) : "";
}

export function skillsIn(text: string): string[] {
  const t = text.toLowerCase();
  return SKILLS.filter((s) => countSkill(t, s.map((x) => x.toLowerCase())) > 0).map((s) => s[0]);
}

export function analyzeFit(resume: string | null, jd: string | null): Fit {
  const resumeSkills = resume ? skillsIn(resume) : [];
  if (!jd) return { jdSkills: [], matched: [], missing: [], resumeSkills, score: 0 };
  const jdLower = jd.toLowerCase();
  const reqLower = requirementsPart(jd).toLowerCase();
  const scored = SKILLS.map((s) => {
    const aliases = s.map((x) => x.toLowerCase());
    return { skill: s[0], score: countSkill(jdLower, aliases) + 2 * countSkill(reqLower, aliases) };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  const jdSkills = scored.map((x) => x.skill);

  // Tool names and acronyms the posting uses that the resume also mentions.
  if (resume) {
    const resumeUpper = new Set(resume.match(/\b[A-Z][A-Z0-9&]{1,6}\b/g) ?? []);
    const extras = [...new Set(jd.match(/\b[A-Z][A-Z0-9&]{1,6}\b/g) ?? [])].filter(
      (t) => !GENERIC_UPPER.has(t) && resumeUpper.has(t) && !jdSkills.some((s) => s.toUpperCase().split(/[^A-Z0-9&]+/).includes(t)),
    );
    jdSkills.push(...extras.slice(0, 4));
  }

  const have = new Set(resumeSkills);
  const resumeLower = (resume ?? "").toLowerCase();
  const matched = jdSkills.filter((s) => have.has(s) || (resume && /^[A-Z0-9&]+$/.test(s) && resume.includes(s)) || (!SKILLS.some((x) => x[0] === s) && resumeLower.includes(s.toLowerCase())));
  const missing = jdSkills.filter((s) => !matched.includes(s));
  const considered = Math.min(jdSkills.length, 12);
  const score = considered ? Math.round((matched.filter((s) => jdSkills.indexOf(s) < 12).length / considered) * 100) : 0;
  return { jdSkills, matched, missing, resumeSkills, score };
}

const BULLET = /^\s*(?:[•●▪◦‣∙·\-–*]|\d+[.)])\s+/;
const VERBS =
  /^(led|managed|built|created|developed|designed|delivered|drove|reduced|increased|improved|saved|launched|implemented|streamlined|negotiated|coordinated|analy[sz]ed|automated|owned|grew|cut|achieved|won|trained|supported|resolved|optimi[sz]ed|spearheaded|established|introduced|oversaw|directed|executed|generated|produced|organi[sz]ed|planned|prepared|processed|maintained|monitored|tracked|handled|partnered|collaborated|facilitated|conducted|performed|completed|ran|wrote|redesigned|rebuilt|migrated|consolidated|standardi[sz]ed|forecast(?:ed)?|sourced|procured|scheduled|expedited|reconciled|administered|assisted|served|ensured|identified|mentored|taught|boosted|accelerated|secured|exceeded|recruited|hired|shipped)$/i;

export function startsWithVerb(line: string) {
  const first = line.trim().split(/\s+/)[0] ?? "";
  return VERBS.test(first) || /^[A-Za-z]{4,}ed$/.test(first);
}

export function cleanBullet(line: string) {
  return line.replace(BULLET, "").replace(/\s+/g, " ").replace(/[.;,\s]+$/, "").trim();
}

/** The resume lines that best show results relevant to this job. */
export function topAchievements(resume: string | null, jdSkills: string[], n = 3): string[] {
  if (!resume) return [];
  const want = SKILLS.filter((s) => jdSkills.includes(s[0])).flatMap((s) => s.map((x) => x.toLowerCase()));
  const lines = resume
    .split(/\n/)
    .map((l) => ({ raw: l, text: cleanBullet(l) }))
    .filter((l) => l.text.length >= 35 && l.text.length <= 260 && (BULLET.test(l.raw) || startsWithVerb(l.text)));
  const scored = lines.map((l) => {
    const lower = l.text.toLowerCase();
    const hits = want.filter((a) => re(a).test(lower)).length;
    const numbers = /\d/.test(l.text) ? 2 : 0;
    const money = /[$%]|\bk\b|million|\bm\b/i.test(l.text) ? 1 : 0;
    return { text: l.text, score: hits * 2 + numbers + money + (startsWithVerb(l.text) ? 1 : 0) };
  });
  const seen = new Set<string>();
  return scored
    .sort((a, b) => b.score - a.score)
    .filter((l) => (seen.has(l.text) ? false : (seen.add(l.text), true)))
    .slice(0, n)
    .map((l) => l.text);
}

const HEADINGS =
  /^(professional summary|summary|profile|career summary|objective|about me|experience|work experience|professional experience|relevant experience|employment history|work history|education|education and training|skills|technical skills|key skills|core skills|core competencies|competencies|areas of expertise|certifications?|licenses?(?: and certifications)?|certifications and training|training|projects|volunteer(?: experience)?|volunteering|awards|achievements|languages|interests|references)\s*:?\s*$/i;

export function isHeading(line: string) {
  const t = line.trim();
  if (!t || t.length > 42) return false;
  if (HEADINGS.test(t)) return true;
  return /^[A-Z][A-Z &/,-]{3,}$/.test(t) && /[A-Z]{4,}/.test(t) && t.split(/\s+/).length <= 5;
}

export function splitSections(resume: string | null): Section[] {
  if (!resume) return [];
  const out: Section[] = [{ heading: "", lines: [] }];
  for (const raw of resume.split(/\n/)) {
    const line = raw.replace(/\s+$/, "");
    if (isHeading(line)) out.push({ heading: line.trim().replace(/:$/, ""), lines: [] });
    else out[out.length - 1].lines.push(line);
  }
  // Trim blank edges.
  for (const s of out) {
    while (s.lines.length && !s.lines[0].trim()) s.lines.shift();
    while (s.lines.length && !s.lines[s.lines.length - 1].trim()) s.lines.pop();
  }
  return out.filter((s, i) => i === 0 || s.lines.length || s.heading);
}

const PROVINCES =
  "AB|BC|SK|MB|ON|QC|NS|NB|NL|PE|YT|NT|NU|Alberta|British Columbia|Saskatchewan|Manitoba|Ontario|Quebec|Nova Scotia|New Brunswick|Newfoundland|AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY";

export function parseContact(resume: string | null, fallbackName: string | null, fallbackEmail: string | null): Contact {
  const head = (resume ?? "").split(/\n/).map((l) => l.trim()).filter(Boolean).slice(0, 10);
  const all = resume ?? "";
  const email = all.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/)?.[0] ?? fallbackEmail;
  const phone = all.match(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/)?.[0]?.trim() ?? null;
  const li = all.match(/(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[A-Za-z0-9_%-]+\/?/i)?.[0] ?? null;
  const city = head.join("  ").match(new RegExp(`\\b([A-Z][a-zA-Z.'-]+(?: [A-Z][a-zA-Z.'-]+)?),\\s*(${PROVINCES})\\b`))?.[0] ?? null;
  const nameLine = head
    .slice(0, 4)
    .find((l) => /^[A-Za-zÀ-ÿ'’.-]+(?:\s+[A-Za-zÀ-ÿ'’.-]+){1,3}$/.test(l) && !isHeading(l) && !/@|\d/.test(l));
  const name = (nameLine ? titleCase(nameLine) : fallbackName?.trim()) || (email ? titleCase(email.split("@")[0].replace(/[._\d]+/g, " ")) : "") || "";
  const parts = name.split(/\s+/).filter(Boolean);
  return {
    name,
    firstName: parts[0] ?? "",
    lastName: parts.length > 1 ? parts[parts.length - 1] : "",
    email,
    phone,
    linkedin: li ? li.replace(/^https?:\/\//, "").replace(/\/$/, "") : null,
    city,
  };
}

export function titleCase(s: string) {
  return s
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.replace(/(^|[-'’])([a-zà-ÿ])/g, (_, p, c) => p + c.toUpperCase()))
    .join(" ");
}

/** "supply chain" → "Supply chain"; names keep their casing. */
export const label = (skill: string) => skill.charAt(0).toUpperCase() + skill.slice(1);

export function listJoin(items: string[], word = "and") {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} ${word} ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} ${word} ${items[items.length - 1]}`;
}

/** Sort each run of bullets so the lines that match the posting come first. */
export function prioritiseBullets(lines: string[], jdSkills: string[]): string[] {
  const want = SKILLS.filter((s) => jdSkills.includes(s[0])).flatMap((s) => s.map((x) => x.toLowerCase()));
  const weight = (l: string) => want.filter((a) => re(a).test(l.toLowerCase())).length + (/\d/.test(l) ? 0.5 : 0);
  const out: string[] = [];
  let run: string[] = [];
  const flush = () => {
    out.push(...run.map((l, i) => ({ l, i, w: weight(l) })).sort((a, b) => b.w - a.w || a.i - b.i).map((x) => x.l));
    run = [];
  };
  for (const l of lines) {
    if (BULLET.test(l)) run.push(l);
    else {
      flush();
      out.push(l);
    }
  }
  flush();
  return out;
}
