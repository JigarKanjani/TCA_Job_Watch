import "server-only";

// Fetches title / company / location / description for a job posting URL.
// Order: Firecrawl (if FIRECRAWL_API_KEY is set) → schema.org JobPosting
// JSON-LD (Greenhouse, Lever, Workday, Indeed and most ATS pages embed it) →
// known page markup (LinkedIn guest view) → <meta> tags.

export type JobDetails = {
  title?: string;
  company?: string;
  location?: string;
  description?: string;
  via: "firecrawl" | "jsonld" | "html" | "meta" | "none";
  error?: string;
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export function checkJobUrl(raw: string): URL | string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return "Paste the full link, starting with https://";
  }
  if (!/^https?:$/.test(url.protocol)) return "Only http and https links work.";
  const host = url.hostname.toLowerCase();
  const privateHost =
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) ||
    host.startsWith("[") ||
    /^\d+$/.test(host);
  if (privateHost) return "That address isn't allowed.";
  return url;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", hellip: "…", bull: "•" };

function decode(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

export function htmlToText(html: string): string {
  return decode(
    html
      .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, "")
      .replace(/<li[^>]*>/gi, "\n• ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|h[1-6]|ul|ol|li|tr|section)>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function meta(html: string, prop: string): string | undefined {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`, "i");
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`, "i");
  const m = html.match(re) ?? html.match(re2);
  return m ? decode(m[1]).trim() : undefined;
}

type Ld = Record<string, unknown>;

function findJobPosting(node: unknown): Ld | undefined {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = findJobPosting(n);
      if (hit) return hit;
    }
    return;
  }
  const obj = node as Ld;
  const type = obj["@type"];
  if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) return obj;
  if (obj["@graph"]) return findJobPosting(obj["@graph"]);
}

function ldLocation(job: Ld): string | undefined {
  const loc = Array.isArray(job.jobLocation) ? job.jobLocation[0] : job.jobLocation;
  const addr = (loc as Ld | undefined)?.address as Ld | undefined;
  if (addr) {
    const parts = [addr.addressLocality, addr.addressRegion, addr.addressCountry]
      .map((p) => (typeof p === "object" && p ? (p as Ld).name : p))
      .filter((p): p is string => typeof p === "string" && p.length > 0);
    if (parts.length) return parts.join(", ");
  }
  if (job.jobLocationType === "TELECOMMUTE") return "Remote";
}

function fromJsonLd(html: string): JobDetails | undefined {
  const blocks = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  for (const block of blocks) {
    const body = block.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "");
    try {
      const job = findJobPosting(JSON.parse(body.trim()));
      if (!job) continue;
      const org = job.hiringOrganization as Ld | undefined;
      return {
        title: typeof job.title === "string" ? decode(job.title) : undefined,
        company: typeof org?.name === "string" ? decode(org.name) : undefined,
        location: ldLocation(job),
        description: typeof job.description === "string" ? htmlToText(decode(job.description)) : undefined,
        via: "jsonld",
      };
    } catch {
      /* malformed block — try the next one */
    }
  }
}

function fromKnownMarkup(html: string): string | undefined {
  const patterns = [
    /class=["'][^"']*show-more-less-html__markup[^"']*["'][^>]*>([\s\S]*?)<\/div>/i, // LinkedIn guest view
    /id=["']jobDescriptionText["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/i, // Indeed
    /class=["'][^"']*(?:job-description|jobDescription|description__text)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|section)>/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1].length > 200) return htmlToText(m[1]);
  }
}

async function viaFirecrawl(url: string): Promise<JobDetails | undefined> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) return;
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return;
    const body = (await res.json()) as { data?: { markdown?: string; metadata?: { title?: string; ogTitle?: string } } };
    const md = body.data?.markdown?.trim();
    if (!md) return;
    return { title: body.data?.metadata?.ogTitle ?? body.data?.metadata?.title, description: md.slice(0, 60000), via: "firecrawl" };
  } catch {
    return;
  }
}

export async function fetchJobDetails(rawUrl: string): Promise<JobDetails> {
  const checked = checkJobUrl(rawUrl);
  if (typeof checked === "string") return { via: "none", error: checked };
  const url = checked.toString();

  let html = "";
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "en-CA,en;q=0.9" },
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
    });
    if (res.ok) html = (await res.text()).slice(0, 2_000_000);
  } catch {
    /* fall through to Firecrawl */
  }

  const ld = html ? fromJsonLd(html) : undefined;
  if (ld?.description) return ld;

  const fc = await viaFirecrawl(url);
  if (fc) return { ...fc, title: ld?.title ?? fc.title, company: ld?.company, location: ld?.location };

  if (html) {
    const markup = fromKnownMarkup(html);
    const title = ld?.title ?? meta(html, "og:title") ?? html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim();
    if (markup) return { title, company: ld?.company, location: ld?.location, description: markup, via: "html" };
    const desc = meta(html, "og:description") ?? meta(html, "description");
    if (title || desc) return { title, company: ld?.company, location: ld?.location, description: desc, via: "meta" };
  }
  return {
    via: "none",
    error: "Couldn't read that page automatically — some sites block it. Paste the description below instead.",
  };
}
