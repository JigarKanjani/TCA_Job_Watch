const MESSAGES: Record<string, { kind: "ok" | "err"; text: string }> = {
  alert_created: { kind: "ok", text: "Alert saved. Your first matches show up here within about two hours." },
  alert_deleted: { kind: "ok", text: "Alert deleted." },
  password_updated: { kind: "ok", text: "Password updated." },
  job_added: { kind: "ok", text: "Job added to your log." },
  job_saved: { kind: "ok", text: "Saved." },
  job_deleted: { kind: "ok", text: "Job removed from your log." },
  discord_saved: { kind: "ok", text: "Discord webhook saved." },
  discord_removed: { kind: "ok", text: "Discord disconnected." },
  telegram_disconnected: { kind: "ok", text: "Telegram disconnected." },
  doc_deleted: { kind: "ok", text: "Document deleted." },
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
