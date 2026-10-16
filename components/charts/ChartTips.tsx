"use client";

import { useEffect, useRef } from "react";

// One tooltip per chart. Marks carry data-tip-label / data-tip-value and are
// focusable, so keyboard users get the same readout as pointer users.
export function ChartTips({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    const tip = tipRef.current;
    if (!root || !tip) return;
    const valueEl = tip.querySelector<HTMLElement>(".tip-value")!;
    const labelEl = tip.querySelector<HTMLElement>(".tip-label")!;

    function show(mark: HTMLElement, x?: number, y?: number) {
      valueEl.textContent = mark.dataset.tipValue ?? "";
      labelEl.textContent = mark.dataset.tipLabel ?? "";
      const box = root!.getBoundingClientRect();
      const m = mark.getBoundingClientRect();
      const px = (x ?? m.left + m.width / 2) - box.left;
      const py = (y ?? m.top) - box.top;
      tip!.style.left = `${Math.min(Math.max(px, 60), box.width - 60)}px`;
      tip!.style.top = `${py}px`;
      tip!.hidden = false;
      root!.querySelectorAll(".is-hot").forEach((n) => n.classList.remove("is-hot"));
      mark.classList.add("is-hot");
    }
    function hide() {
      tip!.hidden = true;
      root!.querySelectorAll(".is-hot").forEach((n) => n.classList.remove("is-hot"));
    }
    const onMove = (e: PointerEvent) => {
      const mark = (e.target as HTMLElement).closest<HTMLElement>("[data-tip-value]");
      if (mark && root.contains(mark)) show(mark, e.clientX, e.clientY - 10);
      else hide();
    };
    const onFocus = (e: FocusEvent) => {
      const mark = (e.target as HTMLElement).closest<HTMLElement>("[data-tip-value]");
      if (mark) show(mark);
    };
    root.addEventListener("pointermove", onMove);
    root.addEventListener("pointerleave", hide);
    root.addEventListener("focusin", onFocus);
    root.addEventListener("focusout", hide);
    return () => {
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerleave", hide);
      root.removeEventListener("focusin", onFocus);
      root.removeEventListener("focusout", hide);
    };
  }, []);

  return (
    <div ref={ref} className={`chart-root ${className}`}>
      {children}
      <div ref={tipRef} className="chart-tip" role="status" hidden>
        <span className="tip-value" />
        <span className="tip-label" />
      </div>
    </div>
  );
}
