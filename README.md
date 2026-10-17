# JobWatch (TCA Job Watch)

Job alerts + application tracker. Users sign in (Google or email/password), say which roles,
places, salary floor, experience cap, **delivery windows** and **channels** they want, and get
matches from LinkedIn + Indeed by **email, Telegram or Discord**. Every match lands in a
**job log / tracker** with stage, applied date, resume + cover letter used, notes and the full JD.

New matches pop up in a **swipe sorter** (Apply / Super Apply with a 24-hour timer / Maybe / Not
interested), every job shows **pay** (posted, or a clearly labelled estimate), and each job page has
an **Application kit**: cover letter and tailored resume as Word files, follow-up and thank-you
emails, a recruiter email finder, and an interview-practice prompt for ChatGPT / Claude / Gemini.

| Piece | Where | Tech |
|---|---|---|
| Website + API | Vercel | Next.js 15 (App Router), React 19 |
| Auth + DB + files | Supabase (`tca-job-watch`, ca-central-1) | Postgres + RLS, Auth, Storage |
| Scraper + delivery | GitHub Actions, every 30 min | Python + [JobSpy](https://github.com/speedyapply/JobSpy) |

## How it fits together
```
Browser ──> Next.js (Vercel) ──RLS──> Supabase  <──secret-gated RPCs── worker (GitHub Actions, every 30 min)
                     │                                                   │
          Telegram webhook (/api/telegram/webhook)              scrape due alerts (JobSpy)
                                                                deliver queued matches in-window
```
- No service-role key is used anywhere. The worker and the Telegram webhook call narrow
  `SECURITY DEFINER` functions gated by secrets stored in the private `private.app_config` table.
- Email alerts go only to the user's verified sign-in email. Telegram chats can only be linked by
  the bot itself (`/start <token>`), so nobody can point alerts at someone else.

## Environment variables
**Vercel** (Project → Settings → Environment Variables):
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL`,
`TELEGRAM_BOT_TOKEN`, `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`,
`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` (a free Gmail account with an
app password works), optional `DEMO_EMAIL` + `DEMO_PASSWORD` (enables the one-click read-only demo;
writes are blocked in the database for that account).

**GitHub Actions** (repo → Settings → Secrets and variables → Actions):
secrets `WORKER_SECRET`, `TELEGRAM_BOT_TOKEN`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`,
`EMAIL_FROM`; variable `SITE_URL`.

## 100% free, no paid APIs
Everything runs on free tiers and keyless, open resources: JobSpy (open source) and LinkedIn's
public job pages for searching; schema.org data, page markup and Jina Reader (open source,
keyless) for job descriptions; Clearbit's free company autocomplete and Google public DNS for the
email finder; official open wage data (Job Bank, U.S. BLS) for pay estimates; Gmail SMTP,
Telegram and Discord webhooks for alerts. Cover letters, resumes, emails and interview prompts are
built by the app's own templates; the interview prompt is pasted into the user's own free
ChatGPT / Claude / Gemini account.

## Pay: posted first, estimates clearly labelled
`lib/pay/` decides what every card, list, email and the dashboard show:
1. **Posted pay**: the posting's salary field (JobSpy for Indeed/LinkedIn, LinkedIn's card), the
   posting's schema.org `baseSalary`, or a pay sentence in the description (`pay_hint` in the database).
2. **Estimate** when nothing is posted: the job title is matched to an occupation
   (`lib/pay/data/occupations.json`) and looked up in official wage data for the area: Canada's
   **Job Bank wages 2025** (by city region, then province, then national) and the **U.S. BLS OEWS
   May 2025** (by state, then national). Seniority in the title moves the band (entry-level, mid,
   senior, lead). Estimates are always a range, marked **Est.**, with fine print.

Refresh the data each year with `python scripts/build_wages.py <download-dir>` (sources and steps
are in the script). The worker gets pay labels from the site's `/api/pay`.

## Delivery windows
Defined in `lib/config.ts` and mirrored in `worker/run_alerts.py` (`WINDOWS`) — keep them in sync.
Matches found outside a user's windows wait and are delivered when the next window opens, in the
user's timezone. `instant` = every match while a window is open; `daily`/`weekly` = one digest.

## Adding the paywall later
Everything gates through `lib/plans.ts` → `entitlementsFor(plan)`.
1. Add a checkout route (e.g. Stripe Checkout) and a billing webhook.
2. The webhook sets `profiles.plan`, `plan_status`, `plan_renews_at`, `billing_customer_id`
   (users can't write these). Use a secret-gated RPC like the worker's, or the service role server-side.
3. Set `BETA_ALL_FEATURES = false` in `lib/plans.ts`.
4. Lower the free alert cap without a deploy:
   `update private.app_config set value = '3' where key = 'alert_limit_free';`
   (enforced in the database by `enforce_alert_limit`, so it can't be bypassed via the API).

## Local development
```bash
cp .env.example .env.local   # fill in values
npm install && npm run dev
# worker
pip install -r worker/requirements.txt
SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... WORKER_SECRET=... python worker/run_alerts.py
```
