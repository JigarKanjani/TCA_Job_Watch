"use client";

import { useRef } from "react";
import { STATUSES } from "@/lib/config";
import { quickStatus } from "@/app/(app)/jobs/actions";

export function StatusSelect({ id, status }: { id: string; status: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form action={quickStatus} ref={formRef}>
      <input type="hidden" name="id" value={id} />
      <select
        name="status"
        className={`status-select st-${status}`}
        defaultValue={status}
        aria-label="Stage"
        onChange={() => formRef.current?.requestSubmit()}
      >
        {STATUSES.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>
    </form>
  );
}
