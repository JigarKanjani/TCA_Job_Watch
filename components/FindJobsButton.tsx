"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { findJobsNow, type FindState } from "@/app/(app)/dashboard/actions";

export function FindJobsButton({ className = "btn btn-accent", compact = false }: { className?: string; compact?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<FindState | null>(null);

  function run() {
    setResult(null);
    start(async () => {
      const r = await findJobsNow();
      setResult(r);
      // The dashboard opens the sorting pop-up when new jobs arrive.
      if (r.found) window.dispatchEvent(new CustomEvent("jobwatch:found", { detail: r.found }));
      router.refresh();
    });
  }

  return (
    <div className={`find-now ${compact ? "compact" : ""}`}>
      <button type="button" className={`${className} ${pending ? "is-searching" : ""}`} onClick={run} disabled={pending}>
        <span className="radar-glyph" aria-hidden="true" />
        {pending ? "Searching LinkedIn…" : "Find jobs now"}
      </button>
      {result && (
        <span className={`small ${result.ok ? "text-ok" : "text-err"}`} role="status">
          {result.message}
        </span>
      )}
    </div>
  );
}
