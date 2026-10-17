import "server-only";
import { APP_NAME } from "@/lib/config";
import { payFor } from "@/lib/pay/estimate";
import { money, type PayView } from "@/lib/pay/parse";
import { formatLocal, safeZone, windowsLabel } from "@/lib/schedule";

// The search brief: a short, skimmable email of what "Find jobs now" found.
// Table layout and inline styles so it renders the same in Gmail, Outlook
// and Apple Mail. Colours follow the site (coral / cream).

export type BriefJob = {
  id: string;
  title: string | null;
  company: string | null;
  location: string | null;
  job_url: string;
  salary: string | null;
  pay_hint?: string | null;
  alert_role?: string | null;
  country?: string | null;
};

export type BriefInput = {
  name: string | null;
  jobs: BriefJob[];
  searchedAt: Date;
  sentAt: Date;
  timezone: string | null;
  windows: string[];
  site: string;
};

const C = { coral: "#DB624D", coralInk: "#A8402F", cream: "#FBF3EE", line: "#EFE4DD", ink: "#111827", muted: "#4B5563", ok: "#067647", amber: "#B45309" };
const TOP = 6;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function renderBrief(b: BriefInput) {
  const tz = safeZone(b.timezone);
  const first = (b.name ?? "").trim().split(/\s+/)[0];
  const jobs = b.jobs.map((j) => {
    const p = payFor({ ...j, description: null });
    const pay: PayView | null = p ? { kind: p.kind, text: p.text } : null;
    return { ...j, pay, annual: p?.annual ?? null };
  });
  const n = jobs.length;
  const roles = [...new Set(jobs.map((j) => j.alert_role).filter(Boolean))] as string[];
  const roleText = roles.length === 1 ? ` “${roles[0]}”` : "";
  const held = b.sentAt.getTime() - b.searchedAt.getTime() > 10 * 60 * 1000;

  const posted = jobs.filter((j) => j.pay?.kind === "posted").length;
  const mids = jobs
    .map((j) => (j.annual ? (j.annual[0] + j.annual[1]) / 2 : 0))
    .filter((x) => x > 0)
    .sort((x, y) => x - y);
  const typical = mids.length ? mids[Math.floor(mids.length / 2)] : null;
  const companies = Object.entries(
    jobs.reduce<Record<string, number>>((m, j) => (j.company ? ((m[j.company] = (m[j.company] ?? 0) + 1), m) : m), {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([c]) => c);
  // Posted pay first: those are the easiest to judge at a glance.
  const top = [...jobs].sort((a, b) => Number(b.pay?.kind === "posted") - Number(a.pay?.kind === "posted")).slice(0, TOP);

  const subject = `${held ? "Your search brief" : "Just found"}: ${plural(n, `new${roleText} role`)}`;
  const preheader = [
    plural(n, "new role"),
    typical ? `typical pay ≈ ${money(typical)}${posted < n ? " (est.)" : ""}` : null,
    companies.length ? `incl. ${companies.slice(0, 3).join(", ")}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const intro = held
    ? `You searched ${formatLocal(b.searchedAt, tz)}. We held this brief until your delivery hours started.`
    : "Here's the short version of the search you just ran.";
  const dash = `${b.site}/dashboard`;

  // ---------------------------------------------------------------- HTML
  const stat = (big: string, small: string) =>
    `<td style="padding:12px 10px;background:${C.cream};border-radius:12px;text-align:center;width:33%">` +
    `<div style="font-size:20px;font-weight:700;color:${C.ink}">${esc(big)}</div>` +
    `<div style="font-size:12px;color:${C.muted};margin-top:2px">${esc(small)}</div></td>`;
  const payHtml = (p: PayView | null) =>
    !p
      ? ""
      : p.kind === "posted"
        ? `<span style="color:${C.ok};font-weight:600">💰 ${esc(p.text)}</span>`
        : `<span style="color:${C.ink};font-weight:600">≈ ${esc(p.text)}</span> <span style="font-size:10px;font-weight:700;color:${C.amber};border:1px solid #F3D3A6;border-radius:4px;padding:0 4px">EST.</span>`;
  const rows = top
    .map(
      (j) =>
        `<tr><td style="padding:14px 0;border-top:1px solid ${C.line}">` +
        `<a href="${esc(j.job_url)}" style="font-size:16px;font-weight:700;color:${C.ink};text-decoration:none">${esc(j.title ?? "New role")}</a>` +
        `<div style="font-size:14px;color:${C.muted};margin:3px 0 6px">${esc([j.company, j.location].filter(Boolean).join(" · "))}</div>` +
        (j.pay ? `<div style="font-size:14px;margin-bottom:8px">${payHtml(j.pay)}</div>` : "") +
        `<a href="${esc(j.job_url)}" style="font-size:13px;font-weight:600;color:${C.coralInk}">View posting</a>` +
        `<span style="color:${C.line}">&nbsp;|&nbsp;</span>` +
        `<a href="${esc(`${b.site}/jobs/${j.id}`)}" style="font-size:13px;font-weight:600;color:${C.coralInk}">Open in ${APP_NAME}</a>` +
        `</td></tr>`,
    )
    .join("");
  const more = n > TOP ? `<p style="margin:6px 0 0;font-size:14px;color:${C.muted}">+ ${plural(n - TOP, "more role")} waiting in your dashboard.</p>` : "";
  const anyEst = jobs.some((j) => j.pay?.kind === "estimate");

  const html =
    `<!doctype html><html><body style="margin:0;padding:0;background:#F6EFEA">` +
    `<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</span>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6EFEA;padding:24px 12px"><tr><td align="center">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${C.ink}">` +
    `<tr><td style="background:${C.coral};padding:18px 24px;color:#ffffff">` +
    `<span style="font-size:18px;font-weight:800">${APP_NAME}</span>` +
    `<span style="float:right;font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.9;line-height:26px">Search brief</span></td></tr>` +
    `<tr><td style="padding:24px 24px 6px">` +
    `<h1 style="margin:0 0 6px;font-size:22px;line-height:1.25">${first ? `Hi ${esc(first)}, ` : ""}${esc(plural(n, `new${roleText} role`))} ${n === 1 ? "is" : "are"} waiting</h1>` +
    `<p style="margin:0;font-size:15px;color:${C.muted};line-height:1.5">${esc(intro)}</p></td></tr>` +
    `<tr><td style="padding:16px 24px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="6"><tr>` +
    stat(String(n), n === 1 ? "new role" : "new roles") +
    stat(typical ? `≈ ${money(typical)}` : "—", typical ? (posted < n ? "typical pay (est.)" : "typical pay") : "pay not listed") +
    stat(String(posted), posted === 1 ? "lists pay" : "list pay") +
    `</tr></table></td></tr>` +
    `<tr><td style="padding:14px 24px 0"><div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${C.coralInk};font-weight:700">Top picks</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>${more}</td></tr>` +
    `<tr><td style="padding:20px 24px 4px" align="left"><a href="${esc(dash)}" style="display:inline-block;background:${C.coral};color:#ffffff;font-weight:700;font-size:15px;padding:12px 20px;border-radius:10px;text-decoration:none">Sort them in ${APP_NAME} →</a></td></tr>` +
    (companies.length
      ? `<tr><td style="padding:14px 24px 0;font-size:14px;color:${C.muted}"><b style="color:${C.ink}">Hiring now:</b> ${esc(companies.join(", "))}</td></tr>`
      : "") +
    `<tr><td style="padding:22px 24px 24px;font-size:12px;line-height:1.55;color:#7A6E69">` +
    (anyEst ? `EST. = market estimate for similar roles in the area (Job Bank / U.S. BLS), not from the employer. Actual pay can vary a lot.<br><br>` : "") +
    `You're getting this because you pressed <b>Find jobs now</b>. Briefs only arrive during your delivery hours: ${esc(windowsLabel(b.windows) || "your chosen windows")} · ${esc(tz.replace(/_/g, " "))}.<br>` +
    `<a href="${esc(`${b.site}/alerts`)}" style="color:${C.coralInk}">Change delivery hours</a> · <a href="${esc(`${b.site}/settings#briefs`)}" style="color:${C.coralInk}">Turn off search briefs</a>` +
    `</td></tr></table></td></tr></table></body></html>`;

  // ---------------------------------------------------------------- text
  const text = [
    `${first ? `Hi ${first}, ` : ""}${plural(n, `new${roleText} role`)} ${n === 1 ? "is" : "are"} waiting.`,
    intro,
    `${plural(n, "new role")} · ${typical ? `typical pay ≈ ${money(typical)}${posted < n ? " (est.)" : ""}` : "pay not listed"} · ${posted} list pay`,
    "TOP PICKS",
    ...top.map((j) =>
      [`• ${j.title ?? "New role"}`, [j.company, j.location].filter(Boolean).join(" · "), j.pay ? `${j.pay.text}${j.pay.kind === "estimate" ? " (est.)" : ""}` : null, `  ${j.job_url}`]
        .filter(Boolean)
        .join("\n  "),
    ),
    n > TOP ? `+ ${plural(n - TOP, "more role")} in your dashboard.` : null,
    `Sort them: ${dash}`,
    companies.length ? `Hiring now: ${companies.join(", ")}` : null,
    anyEst ? "(est.) = market estimate for similar roles in the area, not from the employer." : null,
    `You pressed Find jobs now. Briefs only arrive during your delivery hours. Turn them off: ${b.site}/settings#briefs`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return { subject, preheader, html, text };
}
