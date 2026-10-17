import "server-only";
import { checkJobUrl } from "@/lib/jd";

// Finds the most likely work email for a recruiter or hiring manager.
//  1. Company domain: typed by the user, or looked up from the company name
//     (Clearbit's free autocomplete), or taken from the company's own careers
//     page link, then confirmed by a DNS MX lookup (Google public DNS).
//  2. Evidence: email addresses the company publishes on its own site reveal
//     its naming pattern.
//  3. Everything else is ranked by how common each pattern is in practice.
// All free, no API keys.

export type EmailCandidate = { email: string; pattern: string; confidence: "high" | "medium" | "low"; note?: string };
export type FinderInput = { first: string; last: string; company: string; domain?: string; jobUrl?: string };
export type FinderResult = {
  ok: boolean;
  error?: string;
  domain: string | null;
  domainSource?: string;
  mx?: { ok: boolean; provider: string | null };
  candidates: EmailCandidate[];
  generic: { email: string; seen: boolean }[];
  companyOptions: { name: string; domain: string }[];
};

const PATTERNS: { key: string; label: string; weight: number; make: (f: string, l: string) => string | null }[] = [
  { key: "first.last", label: "first.last", weight: 40, make: (f, l) => (l ? `${f}.${l}` : null) },
  { key: "flast", label: "first initial + last", weight: 18, make: (f, l) => (l ? `${f[0]}${l}` : null) },
  { key: "first", label: "first name only", weight: 12, make: (f) => f },
  { key: "firstlast", label: "firstlast", weight: 8, make: (f, l) => (l ? `${f}${l}` : null) },
  { key: "f.last", label: "f.last", weight: 5, make: (f, l) => (l ? `${f[0]}.${l}` : null) },
  { key: "first_last", label: "first_last", weight: 4, make: (f, l) => (l ? `${f}_${l}` : null) },
  { key: "firstl", label: "first + last initial", weight: 3, make: (f, l) => (l ? `${f}${l[0]}` : null) },
  { key: "last.first", label: "last.first", weight: 3, make: (f, l) => (l ? `${l}.${f}` : null) },
  { key: "first-last", label: "first-last", weight: 2, make: (f, l) => (l ? `${f}-${l}` : null) },
  { key: "lastf", label: "last + first initial", weight: 2, make: (f, l) => (l ? `${l}${f[0]}` : null) },
  { key: "first.l", label: "first.l", weight: 2, make: (f, l) => (l ? `${f}.${l[0]}` : null) },
  { key: "last", label: "last name only", weight: 1, make: (_f, l) => l || null },
];

const ROLE_BOXES = ["careers", "jobs", "recruiting", "recruitment", "talent", "hr", "hiring", "people"];
const JOB_BOARDS =
  /(linkedin|indeed|glassdoor|ziprecruiter|monster|workopolis|jobbank|simplyhired|myworkdayjobs|workday|greenhouse|lever|smartrecruiters|icims|taleo|jobvite|ashbyhq|bamboohr|recruitee|workable|successfactors|ultipro|adp|paylocity|breezy|jazzhr|dayforce|ceridian|applytojob|eightfold|oraclecloud|jobs\.)/i;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
const companyKey = (s: string) =>
  norm(s.replace(/\b(inc|incorporated|ltd|limited|llc|llp|corp|corporation|co|company|group|holdings|canada|usa|plc|the)\b\.?/gi, ""));

export function cleanDomain(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0];
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s) ? s : null;
}

function registrable(host: string) {
  const parts = host.replace(/^www\./, "").split(".");
  const twoPart = /^(co|com|org|net|gov|ac|edu)\.[a-z]{2}$/.test(parts.slice(-2).join("."));
  return parts.slice(twoPart ? -3 : -2).join(".");
}

async function getJson(url: string, ms = 4500, init?: RequestInit) {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(ms), cache: "no-store" });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

async function mxLookup(domain: string): Promise<{ ok: boolean; provider: string | null }> {
  const data = (await getJson(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`)) as
    | { Answer?: { data: string }[] }
    | null;
  const hosts = (data?.Answer ?? []).map((a) => a.data.toLowerCase());
  if (!hosts.length) return { ok: false, provider: null };
  const all = hosts.join(" ");
  const provider = /google|googlemail/.test(all)
    ? "Google Workspace"
    : /outlook|microsoft/.test(all)
      ? "Microsoft 365"
      : /pphosted|mimecast|barracuda|proofpoint|messagelabs|iphmx/.test(all)
        ? "Corporate email gateway"
        : "Company mail server";
  return { ok: true, provider };
}

async function suggestDomains(company: string) {
  const data = (await getJson(`https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(company)}`)) as
    | { name: string; domain: string }[]
    | null;
  return (data ?? []).filter((d) => d?.domain).slice(0, 5);
}

/** Email addresses the company publishes on its own site. */
async function publicEmails(domain: string): Promise<string[]> {
  const found = new Set<string>();
  const grab = (text: string) => {
    for (const m of text.matchAll(/[a-z0-9._%+-]+@([a-z0-9-]+\.)*[a-z0-9-]+\.[a-z]{2,}/gi)) {
      const e = m[0].toLowerCase();
      if (e.endsWith(`@${domain}`) || e.endsWith(`.${domain}`)) found.add(e);
    }
  };
  const pages = [`https://${domain}`, `https://${domain}/contact`, `https://${domain}/contact-us`, `https://${domain}/careers`];
  await Promise.all(
    pages.map(async (u) => {
      if (typeof checkJobUrl(u) === "string") return;
      try {
        const res = await fetch(u, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(5000), cache: "no-store" });
        if (!res.ok) return;
        grab((await res.text()).slice(0, 1_500_000).replace(/&#64;|\[at\]|\(at\)/gi, "@"));
      } catch {}
    }),
  );
  return [...found].slice(0, 30);
}

/** Which pattern a published address follows, when it's unambiguous. */
function patternOf(local: string): string | null {
  if (/^[a-z]{2,}\.[a-z]{2,}$/.test(local)) return "first.last";
  if (/^[a-z]{2,}_[a-z]{2,}$/.test(local)) return "first_last";
  if (/^[a-z]{2,}-[a-z]{2,}$/.test(local)) return "first-last";
  if (/^[a-z]\.[a-z]{2,}$/.test(local)) return "f.last";
  return null;
}

export async function findEmails(input: FinderInput): Promise<FinderResult> {
  const firstName = norm(input.first.split(/\s+/)[0] ?? "");
  const lastName = norm(input.last);
  const empty: FinderResult = { ok: false, domain: null, candidates: [], generic: [], companyOptions: [] };
  if (!firstName) return { ...empty, error: "Enter at least their first name." };

  // 1. Domain.
  let domain = input.domain ? cleanDomain(input.domain) : null;
  let domainSource = domain ? "you entered it" : "";
  let companyOptions: { name: string; domain: string }[] = [];
  if (!domain && input.jobUrl) {
    try {
      const host = new URL(input.jobUrl).hostname;
      if (!JOB_BOARDS.test(host)) {
        domain = registrable(host);
        domainSource = "the job posting's website";
      }
    } catch {}
  }
  if (input.company.trim()) {
    companyOptions = await suggestDomains(input.company.trim());
    if (!domain && companyOptions.length) {
      const key = companyKey(input.company);
      const best = companyOptions.find((o) => companyKey(o.name) === key) ?? companyOptions.find((o) => companyKey(o.name).startsWith(key)) ?? companyOptions[0];
      domain = best.domain.toLowerCase();
      domainSource = `company lookup (${best.name})`;
    }
  }
  if (!domain && input.company.trim()) {
    const slug = companyKey(input.company);
    for (const tld of ["com", "ca"]) {
      if (slug && (await mxLookup(`${slug}.${tld}`)).ok) {
        domain = `${slug}.${tld}`;
        domainSource = "best guess from the company name";
        break;
      }
    }
  }
  if (!domain) return { ...empty, companyOptions, error: "Couldn't work out the company's email domain. Add their website (e.g. company.com)." };

  // 2. Evidence.
  const [mx, published] = await Promise.all([mxLookup(domain), publicEmails(domain)]);
  const weights = new Map(PATTERNS.map((p) => [p.key, p.weight]));
  const notes = new Map<string, string>();
  if (mx.provider === "Microsoft 365") {
    weights.set("first.last", weights.get("first.last")! + 6);
    weights.set("flast", weights.get("flast")! + 3);
  }
  if (mx.provider === "Google Workspace") weights.set("first", weights.get("first")! + 8);
  const seenPatterns = published.map((e) => patternOf(e.split("@")[0])).filter(Boolean) as string[];
  for (const p of new Set(seenPatterns)) {
    weights.set(p, (weights.get(p) ?? 0) + 60);
    notes.set(p, `Matches addresses published by ${domain}`);
  }

  // 3. Rank.
  const candidates: EmailCandidate[] = PATTERNS.map((p) => ({ p, local: p.make(firstName, lastName) }))
    .filter((x): x is { p: (typeof PATTERNS)[number]; local: string } => Boolean(x.local))
    .map(({ p, local }) => ({ email: `${local}@${domain}`, pattern: p.label, w: weights.get(p.key) ?? 0, note: notes.get(p.key) }))
    .sort((a, b) => b.w - a.w)
    .map((c, i) => ({
      email: c.email,
      pattern: c.pattern,
      note: c.note,
      confidence: (c.w >= 60 || (i === 0 && c.w >= 40) ? "high" : c.w >= 10 ? "medium" : "low") as EmailCandidate["confidence"],
    }));
  const publishedRole = published.filter((e) => ROLE_BOXES.some((r) => e.startsWith(`${r}@`)));
  const generic = [
    ...publishedRole.map((email) => ({ email, seen: true })),
    ...["careers", "jobs", "hr"].map((r) => `${r}@${domain}`).filter((e) => !publishedRole.includes(e)).map((email) => ({ email, seen: false })),
  ].slice(0, 5);

  return { ok: true, domain, domainSource, mx, candidates: candidates.slice(0, 8), generic, companyOptions };
}
