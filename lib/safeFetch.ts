import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// Fetching pages at addresses users give us (job links, company sites).
// Only public http(s) hosts are allowed, checked again after every redirect
// and after DNS, so a link can't be used to reach this server's own network.

function privateV4(ip: string) {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224
  );
}

function privateIp(ip: string) {
  if (isIP(ip) === 4) return privateV4(ip);
  const v6 = ip.toLowerCase();
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mapped) return privateV4(mapped);
  return v6 === "::" || v6 === "::1" || /^(fc|fd|fe[89ab])/.test(v6) || v6.startsWith("ff");
}

/** A public http(s) URL, or a short reason it isn't allowed. */
export function checkPublicUrl(raw: string): URL | string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return "Paste the full link, starting with https://";
  }
  if (!/^https?:$/.test(url.protocol)) return "Only http and https links work.";
  if (url.username || url.password) return "That address isn't allowed.";
  if (url.port && !["80", "443"].includes(url.port)) return "That address isn't allowed.";
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    !host.includes(".") ||
    host === "localhost" ||
    /\.(local|internal|localhost|lan|home|corp|intranet)$/.test(host) ||
    /^\d+$/.test(host) ||
    (isIP(host) && privateIp(host))
  )
    return "That address isn't allowed.";
  return url;
}

async function resolvesPublic(host: string) {
  if (isIP(host)) return !privateIp(host);
  try {
    const all = await lookup(host, { all: true, verbatim: true });
    return all.length > 0 && all.every((a) => !privateIp(a.address));
  } catch {
    return false;
  }
}

/** fetch() for user-supplied URLs: public hosts only, at most 5 redirects, each re-checked. */
export async function safeFetch(raw: string, init: RequestInit = {}, hops = 5): Promise<Response> {
  let current = raw;
  for (let i = 0; i <= hops; i++) {
    const url = checkPublicUrl(current);
    if (typeof url === "string") throw new Error(url);
    if (!(await resolvesPublic(url.hostname.replace(/^\[|\]$/g, "")))) throw new Error("That address isn't allowed.");
    const res = await fetch(url, { ...init, redirect: "manual" });
    const next = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!next) return res;
    current = new URL(next, url).toString();
  }
  throw new Error("Too many redirects.");
}
