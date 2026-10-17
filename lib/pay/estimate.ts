import "server-only";
import occupationsFile from "./data/occupations.json";
import wages from "./data/wages.json";
import { annualRange, describePay, formatRange, parsePay, payFromDescription, type PayView } from "./parse";

// Pay for a job: what the posting says if it says anything, otherwise an
// estimate from official wage data for that kind of role in that area —
// Job Bank (Canada, by city region and province) or the U.S. BLS (by state).

export type Pay =
  | { kind: "posted"; text: string; annual: [number, number]; from: "posting" | "description" }
  | { kind: "estimate"; text: string; annual: [number, number]; median: number; note: string; source: string };

type Occupation = { p: string; noc: string; soc: string; label: string; level?: Level };
type Level = "intern" | "junior" | "mid" | "senior" | "lead";
type Five = [number, number, number, number, number];
const CA = (wages as unknown as { ca: Record<string, Record<string, Five>> }).ca;
const US = (wages as unknown as { us: Record<string, Record<string, Five>> }).us;

const OCCUPATIONS = (occupationsFile.occupations as Occupation[]).map((o) => ({ ...o, re: new RegExp(`(?<![a-z])(?:${o.p})`, "i") }));

export function occupationFor(title: string) {
  return OCCUPATIONS.find((o) => o.re.test(title)) ?? null;
}

function levelOf(title: string): Level {
  const t = title.toLowerCase();
  if (/\b(intern|internship|co-?op|student|summer)\b/.test(t)) return "intern";
  if (/\b(lead|principal|staff|head of|director|vp|vice president|chief)\b/.test(t)) return "lead";
  if (/\b(senior|sr\.?|iii|iv|level (3|iii)|experienced)\b/.test(t)) return "senior";
  if (/\b(junior|jr\.?|entry[- ]level|graduate|new grad|trainee|apprentice|level (1|i))\b|\bi$/.test(t)) return "junior";
  return "mid";
}

// Which part of [low, p25, median, p75, high] a level maps to.
function band(v: Five, level: Level): [number, number] {
  const [low, p25, med, p75, high] = v;
  switch (level) {
    case "intern":
      return [low * 0.7, low];
    case "junior":
      return [(low + p25) / 2, med];
    case "senior":
      return [med, (p75 + high) / 2];
    case "lead":
      return [p75, high];
    default:
      return [p25, p75];
  }
}

// ---------------------------------------------------------------- places
const PROVINCES: Record<string, string> = {
  ab: "AB", alberta: "AB", bc: "BC", "british columbia": "BC", mb: "MB", manitoba: "MB", nb: "NB", "new brunswick": "NB",
  nl: "NL", newfoundland: "NL", "newfoundland and labrador": "NL", ns: "NS", "nova scotia": "NS", on: "ON", ontario: "ON",
  pe: "PEI", pei: "PEI", "prince edward island": "PEI", qc: "QC", quebec: "QC", québec: "QC", sk: "SK", saskatchewan: "SK",
  nt: "NWT", "northwest territories": "NWT", nu: "NU", nunavut: "NU", yt: "YK", yukon: "YK",
};
const PROVINCE_LABEL: Record<string, string> = {
  AB: "Alberta", BC: "British Columbia", MB: "Manitoba", NB: "New Brunswick", NL: "Newfoundland and Labrador", NS: "Nova Scotia",
  ON: "Ontario", PEI: "Prince Edward Island", QC: "Quebec", SK: "Saskatchewan", NWT: "Northwest Territories", NU: "Nunavut", YK: "Yukon",
};
// Cities (and suburbs) → Job Bank economic region.
const CITY_REGION: Record<string, string> = {};
const addCities = (region: string, cities: string) => cities.split(",").forEach((c) => (CITY_REGION[c.trim()] = region));
addCities("AB/Calgary", "calgary,airdrie,cochrane,okotoks,chestermere,strathmore,high river");
addCities("AB/Edmonton", "edmonton,st. albert,st albert,sherwood park,leduc,spruce grove,nisku,fort saskatchewan,stony plain,beaumont");
addCities("AB/Red Deer", "red deer,sylvan lake,lacombe");
addCities("AB/Lethbridge--Medicine Hat", "lethbridge,medicine hat");
addCities("AB/Wood Buffalo--Cold Lake", "fort mcmurray,cold lake,bonnyville");
addCities("AB/Athabasca--Grande Prairie--Peace River", "grande prairie,peace river,athabasca");
addCities("BC/Lower Mainland", "vancouver,burnaby,surrey,richmond,coquitlam,north vancouver,west vancouver,langley,delta,new westminster,abbotsford,port moody,maple ridge,chilliwack,port coquitlam,white rock,mission");
addCities("BC/Vancouver Island and Coast", "victoria,nanaimo,saanich,langford,courtenay,colwood,duncan,campbell river");
addCities("BC/Thompson--Okanagan", "kelowna,kamloops,vernon,penticton,west kelowna");
addCities("ON/Toronto", "toronto,mississauga,brampton,markham,vaughan,richmond hill,oakville,north york,scarborough,etobicoke,pickering,ajax,whitby,oshawa,milton,newmarket,aurora,concord,woodbridge");
addCities("ON/Ottawa", "ottawa,kanata,nepean,orleans");
addCities("ON/Hamilton--Niagara Peninsula", "hamilton,burlington,st. catharines,st catharines,niagara falls,welland,grimsby");
addCities("ON/Kitchener--Waterloo--Barrie", "kitchener,waterloo,cambridge,guelph,barrie,orillia");
addCities("ON/London", "london,st. thomas,woodstock");
addCities("ON/Windsor--Sarnia", "windsor,sarnia,chatham");
addCities("ON/Kingston--Pembroke", "kingston,belleville,pembroke");
addCities("ON/Northeast", "sudbury,greater sudbury,north bay,sault ste. marie,timmins");
addCities("ON/Northwest", "thunder bay,kenora");
addCities("QC/Montréal", "montreal,montréal,dorval,saint-laurent,pointe-claire");
addCities("QC/Laval", "laval");
addCities("QC/Montérégie", "longueuil,brossard,boucherville,saint-jean-sur-richelieu");
addCities("QC/Capitale-Nationale", "quebec city,québec city,québec,quebec,levis,lévis");
addCities("QC/Outaouais", "gatineau");
addCities("QC/Estrie", "sherbrooke");
addCities("MB/Winnipeg", "winnipeg");
addCities("SK/Saskatoon--Biggar", "saskatoon");
addCities("SK/Regina--Moose Mountain", "regina");
addCities("NS/Halifax", "halifax,dartmouth,bedford");
addCities("NB/Moncton--Richibucto", "moncton,dieppe");
addCities("NB/Fredericton--Oromocto", "fredericton");
addCities("NB/Saint John--St. Stephen", "saint john");
addCities("NL/Avalon Peninsula", "st. john's,st johns,mount pearl");

const STATES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE",
  "district of columbia": "DC", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN",
  mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ",
  "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR",
  pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT",
  vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
};
const STATE_CODES = new Set(Object.values(STATES));
const STATE_LABEL = Object.fromEntries(Object.entries(STATES).map(([n, c]) => [c, n.replace(/\b\w/g, (m) => m.toUpperCase())]));

type Place = { country: "CA" | "US"; chain: string[]; labels: Record<string, string> };

export function placeFor(location: string | null | undefined, countryHint?: string | null): Place {
  const parts = (location ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  const lower = parts.map((p) => p.toLowerCase());
  const hint: "CA" | "US" = /us|united states|america/i.test(countryHint ?? "") ? "US" : "CA";
  const prov = lower.map((p) => PROVINCES[p]).find(Boolean);
  // "CA" is Canada as a trailing country code ("Calgary, AB, CA") but California otherwise.
  const state = lower
    .map((p, i) => (p === "ca" && (i === parts.length - 1 && parts.length >= 3) ? undefined : STATES[p] ?? (STATE_CODES.has(p.toUpperCase()) ? p.toUpperCase() : undefined)))
    .find(Boolean);
  let country: "CA" | "US" = hint;
  if (prov || lower.includes("canada")) country = "CA";
  else if (state || lower.some((p) => /^(us|usa|united states)$/.test(p))) country = "US";

  if (country === "CA") {
    const region = CITY_REGION[lower[0]];
    const p = prov ?? region?.split("/")[0];
    const city = parts[0] && region ? parts[0] : null;
    return {
      country,
      chain: [region, p, "NAT"].filter(Boolean) as string[],
      labels: { ...(region && city ? { [region]: city } : {}), ...(p ? { [p]: PROVINCE_LABEL[p] ?? p } : {}), NAT: "Canada" },
    };
  }
  return { country, chain: [state, "US"].filter(Boolean) as string[], labels: { ...(state ? { [state]: STATE_LABEL[state] ?? state } : {}), US: "the US" } };
}

// ---------------------------------------------------------------- estimates
export type Estimate = { min: number; max: number; median: number; occupation: string; place: string; source: string; level: Level };

export function estimatePay(title: string | null | undefined, location: string | null | undefined, countryHint?: string | null): Estimate | null {
  if (!title) return null;
  const occ = occupationFor(title);
  if (!occ) return null;
  const place = placeFor(location, countryHint);
  const table = place.country === "CA" ? CA[occ.noc] : US[occ.soc];
  if (!table) return null;
  const key = place.chain.find((k) => table[k]);
  if (!key) return null;
  const level = occ.level ?? levelOf(title);
  const [lo, hi] = band(table[key], level);
  const round = (n: number) => Math.round(n / 1000) * 1000;
  return {
    min: round(lo),
    max: Math.max(round(hi), round(lo) + 1000),
    median: round(table[key][2]),
    occupation: occ.label,
    place: place.labels[key] ?? key,
    source: place.country === "CA" ? "Job Bank 2025" : "U.S. BLS, May 2025",
    level,
  };
}

const LEVEL_WORD: Record<Level, string> = { intern: "", junior: "entry-level ", mid: "", senior: "senior ", lead: "lead " };
// "Business analysts" → "business analysts", but "IT support" stays.
const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/** Posted pay when there is any, otherwise a labelled estimate. */
export function payFor(job: {
  title: string | null;
  location: string | null;
  salary?: string | null;
  description?: string | null;
  pay_hint?: string | null;
  country?: string | null;
}): Pay | null {
  const posted = parsePay(job.salary);
  const described = posted ? null : payFromDescription(job.description ?? job.pay_hint);
  const p = posted ?? described;
  if (p) return { kind: "posted", text: describePay(p), annual: annualRange(p), from: posted ? "posting" : "description" };
  const e = estimatePay(job.title, job.location, job.country);
  if (!e) return null;
  return {
    kind: "estimate",
    text: formatRange(e.min, e.max),
    annual: [e.min, e.max],
    median: e.median,
    note: `Est. for ${LEVEL_WORD[e.level]}${lowerFirst(e.occupation)} in ${e.place} (${e.source})`,
    source: e.source,
  };
}

export function payView(job: Parameters<typeof payFor>[0]): PayView | null {
  const p = payFor(job);
  if (!p) return null;
  return p.kind === "posted"
    ? { kind: "posted", text: p.text, note: p.from === "description" ? "Pay stated in the job description" : "Pay listed in the posting" }
    : { kind: "estimate", text: p.text, note: p.note };
}
