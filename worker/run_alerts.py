#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
JobWatch worker — runs every 30 minutes on GitHub Actions.

Phase 1 (scrape):  alerts that are due for a fresh search are grouped by
                   identical search, scraped once with JobSpy (LinkedIn +
                   Indeed), filtered per alert, and saved to the job log.
Phase 2 (deliver): queued matches are sent to each user's channels (email,
                   Telegram, Discord) when one of their delivery windows is
                   open in their timezone, respecting instant/daily/weekly.

All database access goes through secret-gated RPCs (no service-role key).
Logs contain only counts and alert IDs — never emails, chat IDs or job text —
because Actions logs on public repositories are public.
"""

import hashlib
import html
import math
import os
import re
import smtplib
import ssl
import sys
import time
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from zoneinfo import ZoneInfo

import requests

APP_NAME = "JobWatch"
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_PUBLISHABLE_KEY", "")
WORKER_SECRET = os.environ.get("WORKER_SECRET", "")
SITE_URL = os.environ.get("SITE_URL", "").rstrip("/")
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "465") or 465)
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASS = os.environ.get("SMTP_PASS", "")
EMAIL_FROM = os.environ.get("EMAIL_FROM", "") or SMTP_USER

RESULTS_PER_SEARCH = 30
MAX_SAVE_PER_ALERT = 30
# Gentle on LinkedIn/Indeed: a pause between searches and a cap per run
# (alerts not reached this run are searched next run).
MAX_SEARCHES_PER_RUN = 40
PAUSE_BETWEEN_SEARCHES = 4.0
# Anti-spam email caps, shared with the site (lib/ratelimit.ts: smtp_day and
# email_to_day). A free Gmail account sends about 500 emails a day.
SMTP_DAILY_LIMIT = 450
EMAIL_PER_ADDRESS_DAILY = 30
HOUR_BUCKETS = [3, 6, 12, 24, 48, 72]

# Keep in sync with lib/config.ts (WINDOWS). Days: 0 = Monday … 6 = Sunday.
WINDOWS = {
    "weekday_morning": ({0, 1, 2, 3, 4}, {7, 8}),
    "workday": ({0, 1, 2, 3, 4}, set(range(9, 17))),
    "weeknight": ({0, 1, 2, 3, 4}, set(range(17, 21))),
    "weekend_morning": ({5, 6}, {7, 8, 9}),
    "weekend_day": ({5, 6}, set(range(10, 21))),
    "night_owl": (set(range(7)), {21, 22, 23, 0, 1}),
    "always": (set(range(7)), set(range(24))),
}


def log(msg: str) -> None:
    print(f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] {msg}", flush=True)


# ---------------------------------------------------------------- database
def rpc(name: str, payload: dict):
    res = requests.post(
        f"{SUPABASE_URL}/rest/v1/rpc/{name}",
        headers={"apikey": SUPABASE_KEY, "Content-Type": "application/json"},
        json={"p_secret": WORKER_SECRET, **payload},
        timeout=60,
    )
    if res.status_code >= 300:
        raise RuntimeError(f"rpc {name} failed: HTTP {res.status_code}")
    return res.json() if res.text else None


def key_of(value):
    """Same hashed key the site uses, so both count against one limit."""
    return hashlib.sha256(f"{value.strip().lower()}|{WORKER_SECRET}".encode()).hexdigest()[:32]


def allow(bucket, key, limit, window):
    """Count one hit in the shared rate limiter. Fails open if it's unreachable."""
    try:
        return rpc("rate_limit_hit", {"p_bucket": bucket, "p_key": key, "p_limit": limit, "p_window_seconds": window}) is not False
    except Exception:
        return True


def post_paced(url, body):
    """POST to Telegram/Discord; on 429 wait as told (up to 5 s) and retry once."""
    r = requests.post(url, json=body, timeout=20)
    if r.status_code == 429:
        try:
            data = r.json()
            wait = float(data.get("retry_after") or (data.get("parameters") or {}).get("retry_after") or 0)
        except Exception:
            wait = 0
        if 0 < wait <= 5:
            time.sleep(wait + 0.25)
            r = requests.post(url, json=body, timeout=20)
    return r


# ---------------------------------------------------------------- helpers
def parse_ts(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def clean(v):
    """Turn pandas NaN/NaT/None into None and everything else into plain types."""
    if v is None:
        return None
    try:
        if isinstance(v, float) and math.isnan(v):
            return None
    except TypeError:
        pass
    s = str(v)
    if s in ("nan", "NaT", "None", ""):
        return None
    return v


def annualize(amount, interval):
    if not amount:
        return None
    mult = {"hourly": 2080, "daily": 260, "weekly": 52, "monthly": 12}.get(str(interval or "yearly").lower(), 1)
    return float(amount) * mult


def salary_text(job):
    lo, hi = job.get("min_amount"), job.get("max_amount")
    lo_a, hi_a = annualize(lo, job.get("interval")), annualize(hi, job.get("interval"))
    cur = job.get("currency") or ""
    sym = "$" if cur in ("", "USD", "CAD") else f"{cur} "
    if lo_a and hi_a and hi_a > lo_a:
        return f"{sym}{lo_a:,.0f}–{sym}{hi_a:,.0f}/yr"
    if lo_a or hi_a:
        return f"{sym}{(lo_a or hi_a):,.0f}/yr"
    return None


YEARS_PATTERNS = [
    r"(\d+)\s*[-–to]+\s*(\d+)\s*\+?\s*years?",
    r"(?:minimum|at least|min\.?)\s+(?:of\s+)?(\d+)\s*\+?\s*years?",
    r"(\d+)\s*\+\s*years?",
    r"(\d+)\s*years?\s+(?:of\s+)?(?:\w+\s+){0,3}experience",
]


def min_years_required(description):
    if not description:
        return None
    d = str(description).lower()
    for i, pat in enumerate(YEARS_PATTERNS):
        m = re.search(pat, d)
        if m:
            return int(m.group(2) if i == 0 else m.group(1))
    return None


def hours_back(alert):
    last = parse_ts(alert.get("last_checked_at"))
    if not last:
        return 72  # first run: give a useful first batch
    hours = (datetime.now(timezone.utc) - last).total_seconds() / 3600 + 1
    for b in HOUR_BUCKETS:
        if hours <= b:
            return b
    return HOUR_BUCKETS[-1]


# ---------------------------------------------------------------- scraping
def scrape(role, city, country, work_mode, hours):
    from jobspy import scrape_jobs  # imported lazily so delivery-only runs stay fast

    remote = work_mode == "remote"
    term = f"{role} remote" if remote else role
    location = country if remote or not city else f"{city}, {country}"
    df = scrape_jobs(
        site_name=["linkedin", "indeed"],
        search_term=term,
        location=location,
        results_wanted=RESULTS_PER_SEARCH,
        hours_old=hours,
        country_indeed="Canada" if country == "Canada" else "USA",
        description_format="markdown",
        verbose=0,
    )
    jobs = []
    if df is None or len(df) == 0:
        return jobs
    for row in df.to_dict(orient="records"):
        url = clean(row.get("job_url"))
        if not url:
            continue
        posted = clean(row.get("date_posted"))
        jobs.append(
            {
                "job_url": str(url),
                "title": clean(row.get("title")),
                "company": clean(row.get("company")),
                "location": clean(row.get("location")),
                "site": clean(row.get("site")),
                "is_remote": bool(clean(row.get("is_remote"))) if clean(row.get("is_remote")) is not None else None,
                "min_amount": clean(row.get("min_amount")),
                "max_amount": clean(row.get("max_amount")),
                "interval": clean(row.get("interval")),
                "currency": clean(row.get("currency")),
                "date_posted": str(posted)[:10] if posted else None,
                "description": (str(clean(row.get("description")) or "")[:20000]) or None,
            }
        )
    return jobs


def matches_alert(alert, job, seen):
    if job["job_url"] in seen:
        return False
    title = (job.get("title") or "").lower()
    if not title:
        return False
    if any(k and k in title for k in (alert.get("exclude_keywords") or [])):
        return False

    loc = (job.get("location") or "").lower()
    remote_job = bool(job.get("is_remote")) or "remote" in loc or "remote" in title
    mode = alert.get("work_mode")
    if mode == "remote" and not remote_job:
        return False
    if mode == "onsite" and job.get("is_remote"):
        return False
    city = (alert.get("city") or "").split(",")[0].strip().lower()
    if city and mode != "remote" and loc and city not in loc and not (mode == "any" and remote_job):
        return False

    floor = alert.get("min_salary")
    if floor:
        listed = annualize(job.get("max_amount") or job.get("min_amount"), job.get("interval"))
        if listed and listed < floor:
            return False

    cap = alert.get("max_experience")
    if cap is not None:
        need = min_years_required(job.get("description"))
        if need is not None and need > cap:
            return False
    return True


def phase_scrape():
    alerts = rpc("worker_alerts_to_scrape", {}) or []
    log(f"scrape: {len(alerts)} alert(s) due")
    groups = {}
    for a in alerts:
        key = (a["role"].strip().lower(), (a.get("city") or "").strip().lower(), a["country"], a["work_mode"], hours_back(a))
        groups.setdefault(key, []).append(a)

    seen_by_user = {}
    for a in alerts:
        seen_by_user.setdefault(a["user_id"], set()).update(a.get("seen_urls") or [])

    saved_total = 0
    if len(groups) > MAX_SEARCHES_PER_RUN:
        log(f"scrape: {len(groups)} searches due; doing {MAX_SEARCHES_PER_RUN} now, the rest next run")
    for i, (key, group) in enumerate(list(groups.items())[:MAX_SEARCHES_PER_RUN], 1):
        role, _, country, mode, hours = key
        sample = group[0]
        if i > 1:
            time.sleep(PAUSE_BETWEEN_SEARCHES)
        try:
            jobs = scrape(sample["role"], sample.get("city") or "", country, mode, hours)
        except Exception as e:  # keep going; unstamped alerts retry next run
            log(f"scrape: search {i}/{len(groups)} failed ({type(e).__name__}); will retry next run")
            continue
        log(f"scrape: search {i}/{len(groups)} → {len(jobs)} raw result(s), last {hours}h, {len(group)} alert(s)")
        for a in group:
            seen = seen_by_user.setdefault(a["user_id"], set())
            keep = [j for j in jobs if matches_alert(a, j, seen)][:MAX_SAVE_PER_ALERT]
            payload = [{**j, "salary": salary_text(j)} for j in keep]
            for j in payload:
                for k in ("min_amount", "max_amount", "interval", "currency"):
                    j.pop(k, None)
            try:
                n = rpc("worker_save_matches", {"p_alert_id": a["id"], "p_jobs": payload}) or 0
            except Exception as e:
                log(f"scrape: saving for alert {a['id'][:8]} failed ({type(e).__name__})")
                continue
            seen.update(j["job_url"] for j in keep)
            saved_total += int(n)
            log(f"scrape: alert {a['id'][:8]} +{n} new")
    log(f"scrape: saved {saved_total} new match(es)")


# ---------------------------------------------------------------- delivery
def window_open(alert, now_utc):
    try:
        tz = ZoneInfo(alert.get("timezone") or "America/Edmonton")
    except Exception:
        tz = ZoneInfo("America/Edmonton")
    local = now_utc.astimezone(tz)
    for w in alert.get("windows") or []:
        days, hours = WINDOWS.get(w, (set(), set()))
        # Night-owl hours after midnight belong to the previous evening's window.
        day = local.weekday() if not (w == "night_owl" and local.hour < 2) else (local.weekday() - 1) % 7
        if day in days and local.hour in hours:
            return True
    return False


def due(alert, now_utc):
    if not window_open(alert, now_utc):
        return False
    last = parse_ts(alert.get("last_sent_at"))
    freq = alert.get("frequency")
    if freq == "daily":
        return last is None or now_utc - last >= timedelta(hours=20)
    if freq == "weekly":
        return last is None or now_utc - last >= timedelta(days=6, hours=12)
    return True


EST_NOTE = ("(est.) = market estimate for similar roles in the area (Job Bank / U.S. BLS), "
            "not from the employer. Actual pay can vary a lot.")


def annotate_pay(alert, matches):
    """Posted pay, or an estimate marked "(est.)", from the site's /api/pay."""
    if not SITE_URL or not matches:
        return
    jobs = [{"title": m.get("title"), "location": m.get("location"), "salary": m.get("salary"),
             "pay_hint": m.get("pay_hint"), "country": alert.get("country")} for m in matches]
    try:
        r = requests.post(f"{SITE_URL}/api/pay", json={"jobs": jobs}, headers={"Authorization": f"Bearer {WORKER_SECRET}"}, timeout=20)
        pays = r.json().get("pay") if r.ok else None
    except Exception:
        pays = None
    for m, p in zip(matches, pays or []):
        if p:
            m["pay_text"] = p["text"] + (" (est.)" if p.get("kind") == "estimate" else "")


def has_estimate(matches):
    return any(str(m.get("pay_text") or "").endswith("(est.)") for m in matches)


def job_line(m, rich=False):
    bits = [b for b in [m.get("company"), m.get("location"), m.get("pay_text") or m.get("salary")] if b]
    track = f"{SITE_URL}/jobs/{m['id']}" if SITE_URL else ""
    if rich:  # Discord markdown; <> stops link previews
        out = f"**{m.get('title') or 'New role'}**\n{' · '.join(bits)}\nApply: <{m['job_url']}>"
        return out + (f"\nTrack it: <{track}>" if track else "")
    out = f"🆕 {m.get('title') or 'New role'}\n" + (f"{' · '.join(bits)}\n" if bits else "") + f"Apply: {m['job_url']}"
    return out + (f"\nTrack it: {track}" if track else "")


def header(alert, n):
    role = alert["role"]
    if alert.get("frequency") == "daily":
        return f"☀️ Your daily {APP_NAME} digest — {n} new “{role}” role{'s' if n != 1 else ''}"
    if alert.get("frequency") == "weekly":
        return f"🗓️ Your weekly {APP_NAME} digest — {n} new “{role}” role{'s' if n != 1 else ''}"
    return f"🔔 {n} new “{role}” match{'es' if n != 1 else ''}"


def chunks(parts, limit):
    buf = ""
    for p in parts:
        piece = p + "\n\n"
        if len(buf) + len(piece) > limit and buf:
            yield buf.rstrip()
            buf = ""
        buf += piece
    if buf.strip():
        yield buf.rstrip()


def send_telegram(chat_id, alert, matches):
    if not (TELEGRAM_BOT_TOKEN and chat_id):
        return False
    parts = [header(alert, len(matches))] + [job_line(m) for m in matches]
    if has_estimate(matches):
        parts.append(EST_NOTE)
    if SITE_URL:
        parts.append(f"Manage alerts: {SITE_URL}/alerts")
    ok = True
    for i, text in enumerate(chunks(parts, 3800)):
        if i:
            time.sleep(1.1)  # Telegram: about one message a second per chat
        r = post_paced(
            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
            {"chat_id": chat_id, "text": text, "disable_web_page_preview": True},
        )
        ok = ok and r.ok
    return ok


def send_discord(webhook, alert, matches):
    if not webhook:
        return False
    parts = [f"**{header(alert, len(matches))}**"] + [job_line(m, rich=True) for m in matches]
    if has_estimate(matches):
        parts.append(f"-# {EST_NOTE}")
    ok = True
    for i, text in enumerate(chunks(parts, 1900)):
        if i:
            time.sleep(0.5)  # Discord webhooks: 5 requests per 2 seconds
        r = post_paced(webhook, {"username": APP_NAME, "content": text})
        ok = ok and r.status_code < 300
    return ok


def email_html(alert, matches):
    rows = []
    for m in matches:
        bits = " · ".join(html.escape(str(b)) for b in [m.get("company"), m.get("location"), m.get("pay_text") or m.get("salary")] if b)
        track = f'<a href="{html.escape(SITE_URL)}/jobs/{m["id"]}" style="color:#a8402f">Track it</a>' if SITE_URL else ""
        rows.append(
            f'<tr><td style="padding:14px 0;border-top:1px solid #efe4dd">'
            f'<a href="{html.escape(m["job_url"])}" style="color:#111827;font-weight:600;font-size:16px;text-decoration:none">{html.escape(m.get("title") or "New role")}</a>'
            f'<div style="color:#4b5563;font-size:14px;margin:4px 0 8px">{bits}</div>'
            f'<a href="{html.escape(m["job_url"])}" style="background:#db624d;color:#fff;padding:7px 13px;border-radius:999px;text-decoration:none;font-size:13px;font-weight:600">Apply now</a>'
            f'&nbsp;&nbsp;{track}</td></tr>'
        )
    fine = f'<p style="color:#7a8a8f;font-size:11px;margin-top:16px">{html.escape(EST_NOTE)}</p>' if has_estimate(matches) else ""
    manage = fine + f'<p style="color:#4b5563;font-size:13px;margin-top:20px">Manage your alerts at <a href="{html.escape(SITE_URL)}/alerts" style="color:#a8402f">{html.escape(SITE_URL)}</a></p>' if SITE_URL else ""
    return (
        '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:600px;margin:auto;padding:20px;color:#111827">'
        f'<h2 style="font-size:20px;margin:0 0 6px">{html.escape(header(alert, len(matches)))}</h2>'
        f'<table style="width:100%;border-collapse:collapse">{"".join(rows)}</table>{manage}</div>'
    )


def send_email(to, alert, matches):
    if not to or not (SMTP_USER and SMTP_PASS):
        return False
    if not allow("email_to_day", key_of(to), EMAIL_PER_ADDRESS_DAILY, 86400):
        log(f"deliver: alert {alert['id'][:8]} email skipped — daily cap for this address")
        return False
    if not allow("smtp_day", "all", SMTP_DAILY_LIMIT, 86400):
        log("deliver: email skipped — app-wide daily email cap reached")
        return False
    n = len(matches)
    if alert.get("frequency") == "instant" and n == 1:
        m = matches[0]
        subject = f"New role: {m.get('title') or alert['role']}" + (f" at {m['company']}" if m.get("company") else "")
    else:
        subject = header(alert, n).split(" ", 1)[1]
    text = "\n\n".join([header(alert, n)] + [job_line(m) for m in matches] + ([EST_NOTE] if has_estimate(matches) else []))
    body = email_html(alert, matches)
    try:
        msg = EmailMessage()
        msg["Subject"], msg["From"], msg["To"] = subject, EMAIL_FROM, to
        if SITE_URL:
            msg["List-Unsubscribe"] = f"<{SITE_URL}/alerts>"
        msg.set_content(text)
        msg.add_alternative(body, subtype="html")
        if SMTP_PORT == 465:
            with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=ssl.create_default_context(), timeout=30) as s:
                s.login(SMTP_USER, SMTP_PASS)
                s.send_message(msg)
        else:
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30) as s:
                s.starttls(context=ssl.create_default_context())
                s.login(SMTP_USER, SMTP_PASS)
                s.send_message(msg)
        return True
    except Exception:
        return False


def phase_deliver():
    pending = rpc("worker_pending_deliveries", {}) or []
    now = datetime.now(timezone.utc)
    log(f"deliver: {len(pending)} alert(s) have queued matches")
    sent_alerts = 0
    for a in pending:
        matches = a.get("matches") or []
        if not matches or not due(a, now):
            continue
        annotate_pay(a, matches)
        results = {}
        for ch in a.get("channels") or []:
            if ch == "email":
                results[ch] = send_email(a.get("email"), a, matches)
            elif ch == "telegram":
                results[ch] = send_telegram(a.get("telegram_chat_id"), a, matches)
            elif ch == "discord":
                results[ch] = send_discord(a.get("discord_webhook_url"), a, matches)
        summary = ", ".join(f"{k}:{'ok' if v else 'skip'}" for k, v in results.items())
        if any(results.values()):
            rpc("worker_mark_notified", {"p_alert_id": a["id"], "p_match_ids": [m["id"] for m in matches]})
            sent_alerts += 1
            log(f"deliver: alert {a['id'][:8]} sent {len(matches)} ({summary})")
        else:
            log(f"deliver: alert {a['id'][:8]} held — no channel ready ({summary})")
    log(f"deliver: delivered for {sent_alerts} alert(s)")


def phase_briefs():
    """Ask the site to send search briefs whose delivery window has opened."""
    if not SITE_URL:
        log("briefs: SITE_URL not set, skipped")
        return
    try:
        r = requests.post(f"{SITE_URL}/api/briefs/run", headers={"Authorization": f"Bearer {WORKER_SECRET}"}, timeout=90)
        body = r.json() if r.ok else {}
        log(f"briefs: HTTP {r.status_code} sent={body.get('sent', 0)} cancelled={body.get('cancelled', 0)} retry={body.get('retry', 0)}")
    except Exception as e:
        log(f"briefs: failed ({type(e).__name__})")


def main():
    missing = [k for k, v in {"SUPABASE_URL": SUPABASE_URL, "SUPABASE_PUBLISHABLE_KEY": SUPABASE_KEY, "WORKER_SECRET": WORKER_SECRET}.items() if not v]
    if missing:
        log(f"missing configuration: {', '.join(missing)}")
        sys.exit(1)
    only = sys.argv[1] if len(sys.argv) > 1 else "all"
    if only in ("all", "scrape"):
        phase_scrape()
    if only in ("all", "deliver"):
        phase_deliver()
    if only in ("all", "deliver", "briefs"):
        phase_briefs()


if __name__ == "__main__":
    main()
