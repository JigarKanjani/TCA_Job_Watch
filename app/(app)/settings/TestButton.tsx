"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { sendTest, type TestState } from "./actions";

export function TestButton({ channel, disabled }: { channel: string; disabled?: boolean }) {
  const [state, action] = useActionState<TestState, FormData>(sendTest, {});
  return (
    <form action={action} className="test-form">
      <input type="hidden" name="channel" value={channel} />
      <SubmitButton className="btn btn-outline btn-sm" pendingText="Sending…" disabled={disabled}>
        Send test
      </SubmitButton>
      {state.message && (
        <span className={`small ${state.ok ? "text-ok" : "text-err"}`} role="status">{state.message}</span>
      )}
    </form>
  );
}
