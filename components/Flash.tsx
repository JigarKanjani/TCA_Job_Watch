const MESSAGES: Record<string, { kind: "ok" | "err"; text: string }> = {
  alert_created: { kind: "ok", text: "Alert saved. We're watching. New matches show up here and in your alerts as soon as they're posted." },
  base_resume_saved: { kind: "ok", text: "Base resume saved. The Application kit on each job will use it." },
  base_resume_failed: { kind: "err", text: "Couldn't save your base resume. Please try again." },
  alert_created_found: { kind: "ok", text: "Alert saved and your first matches are in. Sort them now; new ones arrive automatically." },
  alert_deleted: { kind: "ok", text: "Alert deleted." },
  password_updated: { kind: "ok", text: "Password updated." },
  job_added: { kind: "ok", text: "Job added to your log." },
  job_saved: { kind: "ok", text: "Saved." },
  job_deleted: { kind: "ok", text: "Job removed from your log." },
  discord_saved: { kind: "ok", text: "Discord webhook saved." },
  discord_removed: { kind: "ok", text: "Discord disconnected." },
  telegram_disconnected: { kind: "ok", text: "Telegram disconnected." },
  doc_deleted: { kind: "ok", text: "Document deleted." },
  demo_readonly: { kind: "err", text: "This is the read-only demo. Create your own free account to save changes." },
};

export function Flash({ code }: { code?: string }) {
  if (!code || !MESSAGES[code]) return null;
  const m = MESSAGES[code];
  return (
    <p className={`notice ${m.kind === "ok" ? "notice-ok" : "notice-err"} flash`} role="status">
      {m.text}
    </p>
  );
}
