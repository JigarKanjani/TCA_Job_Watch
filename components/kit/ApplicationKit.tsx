"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { attachDocToJob, findRecipientEmail, loadKit } from "@/app/(app)/jobs/[id]/kit-actions";
import { createClient } from "@/lib/supabase/client";
import { label, titleCase } from "@/lib/kit/analyze";
import { buildDocx, saveBlob } from "@/lib/kit/docx";
import type { FinderResult } from "@/lib/kit/emailFinder";
import {
  EMAIL_KINDS,
  coverLetter,
  docFileName,
  emailDraft,
  gmailHref,
  interviewPrompt,
  mailtoHref,
  missingForInterview,
  outlookHref,
  tailoredResume,
  type EmailKind,
  type InterviewOptions,
  type KitContext,
  type Recipient,
} from "@/lib/kit/templates";

type Tab = "cover" | "resume" | "emails" | "finder" | "interview";
const TABS: { value: Tab; label: string }[] = [
  { value: "cover", label: "Cover letter" },
  { value: "resume", label: "Tailored resume" },
  { value: "emails", label: "Follow-up & thank-you" },
  { value: "finder", label: "Find their email" },
  { value: "interview", label: "Interview prep" },
];

type Props = {
  jobId: string;
  jobUrl: string;
  company: string;
  resumes: { id: string; name: string }[];
  defaultResumeId: string | null;
  userId: string;
  demo: boolean;
  docsRemaining: number;
};

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = useCallback(async (text: string, key = "default") => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(key);
    window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800);
  }, []);
  return { copied, copy };
}

/** "linkedin.com/in/jane-doe-4b2a91" → Jane Doe */
function nameFromLinkedIn(url: string) {
  const slug = url.match(/linkedin\.com\/in\/([^/?#]+)/i)?.[1];
  if (!slug) return null;
  const words = decodeURIComponent(slug).split("-").filter((w) => !/\d/.test(w) && w.length > 1);
  if (!words.length) return null;
  return { first: titleCase(words[0]), last: words.length > 1 ? titleCase(words[words.length - 1]) : "" };
}

export function ApplicationKit(p: Props) {
  const [resumeId, setResumeId] = useState(p.defaultResumeId ?? "");
  const [ctx, setCtx] = useState<KitContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, start] = useTransition();
  const [tab, setTab] = useState<Tab>("cover");
  const [recipient, setRecipient] = useState<Recipient>({ first: "", last: "", email: "", linkedin: "", title: "" });

  useEffect(() => {
    start(async () => {
      const r = await loadKit(p.jobId, resumeId || null);
      if ("error" in r) setError(r.error);
      else {
        setCtx(r);
        setError(null);
      }
    });
  }, [p.jobId, resumeId]);

  return (
    <section className="panel kit" id="kit" aria-label="Application kit">
      <div className="kit-head">
        <div>
          <span className="eyebrow">Application kit</span>
          <h2>Apply, follow up and prep for the interview</h2>
          <p className="muted small">Built from your resume and this job description. Everything is editable before you download or send.</p>
        </div>
        <label className="kit-resume">
          <span className="small muted">Resume to use</span>
          <select className="input" value={resumeId} onChange={(e) => setResumeId(e.target.value)} disabled={loading}>
            <option value="">No resume (generic drafts)</option>
            {p.resumes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          {!p.resumes.length && (
            <Link className="linklike small" href="/documents">
              Upload your resume →
            </Link>
          )}
        </label>
      </div>

      {error && <p className="notice notice-err">{error}</p>}
      {!ctx ? (
        <div className="kit-loading" aria-busy="true">
          <span className="radar-glyph is-spin" aria-hidden="true" /> Reading your resume and the job description…
        </div>
      ) : (
        <>
          {ctx.resumeError && <p className="notice notice-warn small">{ctx.resumeError}</p>}
          {!ctx.jd && (
            <p className="notice notice-warn small">
              No job description yet. Fetch or paste it in the description panel above for much better drafts.
            </p>
          )}
          <FitSummary ctx={ctx} loading={loading} />
          <div className="kit-tabs" role="tablist" aria-label="Application kit tools">
            {TABS.map((t) => (
              <button key={t.value} type="button" role="tab" aria-selected={tab === t.value} className={tab === t.value ? "on" : ""} onClick={() => setTab(t.value)}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="kit-body" role="tabpanel">
            {tab === "cover" && <DocTab kind="cover" ctx={ctx} recipient={recipient} setRecipient={setRecipient} {...p} resumeId={resumeId} />}
            {tab === "resume" && <DocTab kind="resume" ctx={ctx} recipient={recipient} setRecipient={setRecipient} {...p} resumeId={resumeId} />}
            {tab === "emails" && <EmailsTab ctx={ctx} recipient={recipient} setRecipient={setRecipient} goFind={() => setTab("finder")} />}
            {tab === "finder" && (
              <FinderTab
                ctx={ctx}
                company={p.company}
                jobUrl={p.jobUrl}
                recipient={recipient}
                setRecipient={setRecipient}
                onUse={() => setTab("emails")}
              />
            )}
            {tab === "interview" && <InterviewTab ctx={ctx} />}
          </div>
        </>
      )}
    </section>
  );
}

function FitSummary({ ctx, loading }: { ctx: KitContext; loading: boolean }) {
  if (!ctx.jdSkills.length) return null;
  return (
    <div className={`kit-fit ${loading ? "is-busy" : ""}`}>
      <div className="kit-score" aria-label={`Resume match ${ctx.score}%`}>
        <b>{ctx.resume ? `${ctx.score}%` : "—"}</b>
        <span className="small muted">{ctx.resume ? "skills match" : "pick a resume"}</span>
      </div>
      <div className="kit-chips">
        {ctx.matched.slice(0, 10).map((s) => (
          <span key={s} className="chip chip-ok" title="In the posting and on your resume">
            ✓ {label(s)}
          </span>
        ))}
        {ctx.missing.slice(0, 6).map((s) => (
          <span key={s} className="chip chip-gap" title="The posting asks for this; your resume doesn't show it">
            + {label(s)}
          </span>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------ cover letter & resume
function DocTab({
  kind,
  ctx,
  recipient,
  setRecipient,
  resumeId,
  jobId,
  userId,
  demo,
  docsRemaining,
}: Props & { kind: "cover" | "resume"; ctx: KitContext; recipient: Recipient; setRecipient: (r: Recipient) => void; resumeId: string }) {
  const router = useRouter();
  const build = useCallback(() => (kind === "cover" ? coverLetter(ctx, recipient) : tailoredResume(ctx)), [kind, ctx, recipient]);
  const [text, setText] = useState(build);
  const [edited, setEdited] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const { copied, copy } = useCopy();
  const fileName = docFileName(ctx, kind === "cover" ? "Cover_Letter" : "Resume");

  useEffect(() => {
    if (!edited) setText(build());
  }, [build, edited]);

  async function download() {
    setBusy("download");
    saveBlob(await buildDocx(kind, text, fileName.replace(/\.docx$/, "")), fileName);
    setBusy(null);
  }

  async function saveToLibrary() {
    if (demo) return setMsg({ ok: false, text: "This is the read-only demo. Create a free account to save documents." });
    if (docsRemaining <= 0) return setMsg({ ok: false, text: "Your document library is full. Delete one on the Documents page first." });
    setBusy("save");
    setMsg(null);
    const blob = await buildDocx(kind, text, fileName.replace(/\.docx$/, ""));
    const supabase = createClient();
    const path = `${userId}/${crypto.randomUUID()}-${fileName}`;
    const up = await supabase.storage.from("documents").upload(path, blob, {
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    if (up.error) {
      setBusy(null);
      return setMsg({ ok: false, text: `Couldn't save: ${up.error.message}` });
    }
    const docKind = kind === "cover" ? "cover_letter" : "resume";
    const ins = await supabase
      .from("documents")
      .insert({ kind: docKind, name: fileName.replace(/\.docx$/, "").replace(/_/g, " ").slice(0, 120), storage_path: path, size_bytes: blob.size })
      .select("id")
      .single();
    if (ins.error || !ins.data) {
      await supabase.storage.from("documents").remove([path]);
      setBusy(null);
      return setMsg({ ok: false, text: "Couldn't save that document. Please try again." });
    }
    const r = await attachDocToJob(jobId, ins.data.id, docKind);
    setBusy(null);
    setMsg(r.ok ? { ok: true, text: "Saved to your documents and attached to this job's tracker." } : { ok: false, text: r.message ?? "Saved, but not attached." });
    router.refresh();
  }

  return (
    <div className="stack">
      {kind === "cover" ? (
        <div className="kit-row">
          <label className="field">
            <span className="small muted">Hiring manager first name (optional)</span>
            <input className="input" value={recipient.first} onChange={(e) => setRecipient({ ...recipient, first: e.target.value })} placeholder="e.g. Priya" />
          </label>
          <label className="field">
            <span className="small muted">Last name</span>
            <input className="input" value={recipient.last} onChange={(e) => setRecipient({ ...recipient, last: e.target.value })} placeholder="e.g. Shah" />
          </label>
          <label className="field">
            <span className="small muted">Their title</span>
            <input className="input" value={recipient.title} onChange={(e) => setRecipient({ ...recipient, title: e.target.value })} placeholder="e.g. Supply Chain Manager" />
          </label>
        </div>
      ) : (
        <p className="hint">
          Your resume, reordered for this job: a tailored summary, the posting&apos;s skills first, and your most relevant bullets moved up. Add a missing skill only if it&apos;s true.
        </p>
      )}
      <textarea
        className="input kit-text"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setEdited(true);
        }}
        rows={kind === "cover" ? 20 : 24}
        aria-label={kind === "cover" ? "Cover letter text" : "Tailored resume text"}
        spellCheck
      />
      <div className="kit-actions">
        <button type="button" className="btn btn-accent btn-sm" onClick={download} disabled={busy !== null}>
          ⬇ Download Word (.docx)
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={saveToLibrary} disabled={busy !== null}>
          {busy === "save" ? "Saving…" : "Save to my documents + attach"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy(text, kind)}>
          {copied === kind ? "Copied ✓" : "Copy text"}
        </button>
        {edited && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setEdited(false);
              setText(build());
            }}
          >
            ↻ Start over
          </button>
        )}
      </div>
      <p className="hint">File name: {fileName}</p>
      {msg && <p className={`notice ${msg.ok ? "notice-ok" : "notice-err"} small`}>{msg.text}</p>}
    </div>
  );
}

// ------------------------------------------------------------ emails
function EmailsTab({
  ctx,
  recipient,
  setRecipient,
  goFind,
}: {
  ctx: KitContext;
  recipient: Recipient;
  setRecipient: (r: Recipient) => void;
  goFind: () => void;
}) {
  const [kind, setKind] = useState<EmailKind>("followup");
  const [when, setWhen] = useState("today");
  const [topic, setTopic] = useState("");
  const build = useCallback(() => emailDraft(kind, ctx, recipient, { when, topic }), [kind, ctx, recipient, when, topic]);
  const [draft, setDraft] = useState(build);
  const [edited, setEdited] = useState(false);
  const { copied, copy } = useCopy();
  const meta = EMAIL_KINDS.find((k) => k.value === kind)!;

  useEffect(() => {
    if (!edited) setDraft(build());
  }, [build, edited]);

  function pickKind(k: EmailKind) {
    setKind(k);
    setEdited(false);
    setDraft(emailDraft(k, ctx, recipient, { when, topic }));
  }

  const to = recipient.email.trim();
  return (
    <div className="stack">
      <div className="seg kit-seg" role="group" aria-label="Email type">
        {EMAIL_KINDS.map((k) => (
          <button key={k.value} type="button" aria-pressed={kind === k.value} onClick={() => pickKind(k.value)}>
            {k.label}
          </button>
        ))}
      </div>
      <p className="hint">{meta.when}</p>
      <div className="kit-row">
        <label className="field">
          <span className="small muted">Their first name</span>
          <input className="input" value={recipient.first} onChange={(e) => setRecipient({ ...recipient, first: e.target.value })} placeholder="e.g. Priya" />
        </label>
        {kind !== "linkedin" ? (
          <label className="field grow">
            <span className="small muted">
              Their email ·{" "}
              <button type="button" className="linklike" onClick={goFind}>
                find it
              </button>
            </span>
            <input className="input" type="email" value={recipient.email} onChange={(e) => setRecipient({ ...recipient, email: e.target.value })} placeholder="name@company.com" />
          </label>
        ) : (
          <label className="field grow">
            <span className="small muted">Their LinkedIn profile</span>
            <input className="input" value={recipient.linkedin} onChange={(e) => setRecipient({ ...recipient, linkedin: e.target.value })} placeholder="linkedin.com/in/…" />
          </label>
        )}
      </div>
      {kind === "thankyou" && (
        <div className="kit-row">
          <label className="field">
            <span className="small muted">Interview was</span>
            <select className="input" value={when} onChange={(e) => setWhen(e.target.value)}>
              <option value="today">today</option>
              <option value="yesterday">yesterday</option>
              <option value="earlier this week">earlier this week</option>
            </select>
          </label>
          <label className="field grow">
            <span className="small muted">Something specific you talked about</span>
            <input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. the plan to move inventory planning onto SAP" />
          </label>
        </div>
      )}
      {kind !== "linkedin" && (
        <label className="field">
          <span className="small muted">Subject</span>
          <input
            className="input"
            value={draft.subject}
            onChange={(e) => {
              setDraft({ ...draft, subject: e.target.value });
              setEdited(true);
            }}
          />
        </label>
      )}
      <textarea
        className="input kit-text"
        rows={kind === "linkedin" ? 5 : 12}
        value={draft.body}
        onChange={(e) => {
          setDraft({ ...draft, body: e.target.value });
          setEdited(true);
        }}
        aria-label="Email body"
      />
      {kind === "linkedin" && <p className="hint">{draft.body.length}/300 characters</p>}
      <div className="kit-actions">
        {kind !== "linkedin" ? (
          <>
            <a className="btn btn-accent btn-sm" href={mailtoHref(to, draft)}>
              ✉ Open in my email app
            </a>
            <a className="btn btn-outline btn-sm" href={gmailHref(to, draft)} target="_blank" rel="noopener noreferrer">
              Gmail ↗
            </a>
            <a className="btn btn-outline btn-sm" href={outlookHref(to, draft)} target="_blank" rel="noopener noreferrer">
              Outlook ↗
            </a>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy(`Subject: ${draft.subject}\n\n${draft.body}`, "email")}>
              {copied === "email" ? "Copied ✓" : "Copy"}
            </button>
            {to && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy(to, "to")}>
                {copied === "to" ? "Copied ✓" : "Copy address"}
              </button>
            )}
          </>
        ) : (
          <>
            <button type="button" className="btn btn-accent btn-sm" onClick={() => copy(draft.body, "note")}>
              {copied === "note" ? "Copied ✓" : "Copy note"}
            </button>
            {recipient.linkedin && (
              <a className="btn btn-outline btn-sm" href={recipient.linkedin.startsWith("http") ? recipient.linkedin : `https://${recipient.linkedin}`} target="_blank" rel="noopener noreferrer">
                Open their LinkedIn ↗
              </a>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------ email finder
function FinderTab({
  ctx,
  company,
  jobUrl,
  recipient,
  setRecipient,
  onUse,
}: {
  ctx: KitContext;
  company: string;
  jobUrl: string;
  recipient: Recipient;
  setRecipient: (r: Recipient) => void;
  onUse: () => void;
}) {
  const [companyName, setCompanyName] = useState(company);
  const [domain, setDomain] = useState("");
  const [result, setResult] = useState<FinderResult | null>(null);
  const [pending, start] = useTransition();
  const { copied, copy } = useCopy();

  function run(overrideDomain?: string) {
    if (overrideDomain !== undefined) setDomain(overrideDomain);
    start(async () => {
      setResult(
        await findRecipientEmail({ first: recipient.first, last: recipient.last, company: companyName, domain: overrideDomain ?? domain, jobUrl }),
      );
    });
  }

  return (
    <div className="stack">
      <p className="hint">
        Add the recruiter or hiring manager&apos;s name (paste their LinkedIn link to fill it in). We work out the company&apos;s email domain, check it
        accepts mail, look for the naming pattern the company uses, and rank the most likely addresses.
      </p>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <label className="field">
          <span className="small muted">Their LinkedIn profile (optional)</span>
          <input
            className="input"
            value={recipient.linkedin}
            placeholder="https://www.linkedin.com/in/jane-doe-12ab34"
            onChange={(e) => {
              const v = e.target.value;
              const n = nameFromLinkedIn(v);
              setRecipient({ ...recipient, linkedin: v, ...(n && !recipient.first ? n : {}) });
            }}
          />
        </label>
        <div className="kit-row">
          <label className="field">
            <span className="small muted">First name</span>
            <input className="input" required value={recipient.first} onChange={(e) => setRecipient({ ...recipient, first: e.target.value })} />
          </label>
          <label className="field">
            <span className="small muted">Last name</span>
            <input className="input" value={recipient.last} onChange={(e) => setRecipient({ ...recipient, last: e.target.value })} />
          </label>
        </div>
        <div className="kit-row">
          <label className="field grow">
            <span className="small muted">Company (full name)</span>
            <input className="input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          </label>
          <label className="field grow">
            <span className="small muted">Company website (optional)</span>
            <input className="input" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="company.com" />
          </label>
        </div>
        <div className="kit-actions">
          <button type="submit" className={`btn btn-accent btn-sm ${pending ? "is-searching" : ""}`} disabled={pending || !recipient.first.trim()}>
            <span className="radar-glyph" aria-hidden="true" />
            {pending ? "Looking…" : "Find likely emails"}
          </button>
        </div>
      </form>

      {result && !result.ok && <p className="notice notice-err small">{result.error}</p>}
      {result?.ok && (
        <div className="finder-out">
          <p className="small">
            Domain <b>{result.domain}</b> <span className="muted">from {result.domainSource}</span>
            {result.mx?.ok ? (
              <span className="chip chip-ok">✓ accepts email{result.mx.provider ? ` · ${result.mx.provider}` : ""}</span>
            ) : (
              <span className="chip chip-gap">no mail server found: check the website</span>
            )}
          </p>
          {result.companyOptions.length > 1 && (
            <p className="small muted">
              Not the right company?{" "}
              {result.companyOptions
                .filter((o) => o.domain !== result.domain)
                .slice(0, 4)
                .map((o) => (
                  <button key={o.domain} type="button" className="chip chip-btn" onClick={() => run(o.domain)}>
                    {o.name} · {o.domain}
                  </button>
                ))}
            </p>
          )}
          <ol className="finder-list">
            {result.candidates.map((c, i) => (
              <li key={c.email}>
                <div className="info">
                  <b>{c.email}</b>
                  <span className="small muted">
                    {i === 0 ? "Most likely · " : ""}
                    {c.pattern}
                    {c.note ? ` · ${c.note}` : ""}
                  </span>
                </div>
                <span className={`conf conf-${c.confidence}`}>{c.confidence}</span>
                <button type="button" className="btn btn-ghost btn-xs" onClick={() => copy(c.email, c.email)}>
                  {copied === c.email ? "✓" : "Copy"}
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-xs"
                  onClick={() => {
                    setRecipient({ ...recipient, email: c.email });
                    onUse();
                  }}
                >
                  Use →
                </button>
              </li>
            ))}
          </ol>
          {result.generic.length > 0 && (
            <p className="small">
              <span className="muted">Team inboxes: </span>
              {result.generic.map((g) => (
                <button key={g.email} type="button" className="chip chip-btn" onClick={() => copy(g.email, g.email)} title={g.seen ? "Published on their website" : "Common, not confirmed"}>
                  {copied === g.email ? "Copied ✓" : g.email}
                  {g.seen ? " ✓" : ""}
                </button>
              ))}
            </p>
          )}
          <p className="hint">
            These are educated guesses ranked by how companies usually format addresses. Sending to the top one or two usually works; a bounce just means try the next.
          </p>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------ interview prep
function InterviewTab({ ctx }: { ctx: KitContext }) {
  const [o, setO] = useState<InterviewOptions>({ interviewer: "hiring_manager", mode: "voice", feedback: "end", difficulty: "realistic", minutes: 30 });
  const [notes, setNotes] = useState("");
  const prompt = useMemo(() => interviewPrompt(ctx, o, notes), [ctx, o, notes]);
  const gaps = missingForInterview(ctx);
  const { copied, copy } = useCopy();
  const short = prompt.length < 6000;
  const set = <K extends keyof InterviewOptions>(k: K, v: InterviewOptions[K]) => setO({ ...o, [k]: v });

  return (
    <div className="stack">
      <p className="hint">
        Copy this prompt into ChatGPT, Claude, Gemini or Grok, switch on voice mode, and practise with an interviewer that knows the job and your resume.
      </p>
      <div className="kit-row">
        <label className="field">
          <span className="small muted">Interviewer</span>
          <select className="input" value={o.interviewer} onChange={(e) => set("interviewer", e.target.value as InterviewOptions["interviewer"])}>
            <option value="recruiter">Recruiter screen</option>
            <option value="hiring_manager">Hiring manager</option>
            <option value="panel">Panel interview</option>
            <option value="technical">Technical / case</option>
          </select>
        </label>
        <label className="field">
          <span className="small muted">Style</span>
          <select className="input" value={o.difficulty} onChange={(e) => set("difficulty", e.target.value as InterviewOptions["difficulty"])}>
            <option value="friendly">Friendly</option>
            <option value="realistic">Realistic</option>
            <option value="tough">Tough</option>
          </select>
        </label>
        <label className="field">
          <span className="small muted">Length</span>
          <select className="input" value={o.minutes} onChange={(e) => set("minutes", Number(e.target.value) as InterviewOptions["minutes"])}>
            <option value={15}>15 minutes</option>
            <option value={30}>30 minutes</option>
            <option value={45}>45 minutes</option>
          </select>
        </label>
        <label className="field">
          <span className="small muted">Feedback</span>
          <select className="input" value={o.feedback} onChange={(e) => set("feedback", e.target.value as InterviewOptions["feedback"])}>
            <option value="end">At the end</option>
            <option value="each">After every answer</option>
          </select>
        </label>
        <label className="field">
          <span className="small muted">Mode</span>
          <select className="input" value={o.mode} onChange={(e) => set("mode", e.target.value as InterviewOptions["mode"])}>
            <option value="voice">Voice</option>
            <option value="text">Text</option>
          </select>
        </label>
      </div>
      <ul className="checklist small">
        {gaps.map((g) => (
          <li key={g} className={g.startsWith("About") ? "done" : undefined}>
            <span className="check" aria-hidden="true">{g.startsWith("About") ? "i" : "!"}</span>
            <span>{g}</span>
          </li>
        ))}
        {ctx.resume && ctx.jd && (
          <li className="done">
            <span className="check" aria-hidden="true">✓</span>
            <span>Your resume and the job description are already inside the prompt.</span>
          </li>
        )}
      </ul>
      <label className="field">
        <span className="small muted">Anything else the interviewer should know (optional)</span>
        <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. I'm changing careers from retail; I want to practise salary questions" />
      </label>
      <textarea className="input kit-text kit-prompt" rows={14} value={prompt} readOnly aria-label="Interview practice prompt" />
      <div className="kit-actions">
        <button type="button" className="btn btn-accent btn-sm" onClick={() => copy(prompt, "prompt")}>
          {copied === "prompt" ? "Copied ✓" : "Copy prompt"}
        </button>
        <a
          className="btn btn-outline btn-sm"
          href={short ? `https://chatgpt.com/?q=${encodeURIComponent(prompt)}` : "https://chatgpt.com/"}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => copy(prompt, "prompt")}
        >
          Open ChatGPT ↗
        </a>
        <a
          className="btn btn-outline btn-sm"
          href={short ? `https://claude.ai/new?q=${encodeURIComponent(prompt)}` : "https://claude.ai/new"}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => copy(prompt, "prompt")}
        >
          Open Claude ↗
        </a>
        <a className="btn btn-outline btn-sm" href="https://gemini.google.com/app" target="_blank" rel="noopener noreferrer" onClick={() => copy(prompt, "prompt")}>
          Open Gemini ↗
        </a>
        <a className="btn btn-outline btn-sm" href="https://grok.com/" target="_blank" rel="noopener noreferrer" onClick={() => copy(prompt, "prompt")}>
          Open Grok ↗
        </a>
      </div>
      <p className="hint">
        Opening a chat also copies the prompt: paste it in if it isn&apos;t filled in already{!ctx.resume ? " and attach your resume file" : ""}. Then start voice mode (the
        microphone or headphones button) and answer out loud.
      </p>
    </div>
  );
}
