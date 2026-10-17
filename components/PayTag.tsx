import { PAY_FINE_PRINT, type PayView } from "@/lib/pay/parse";

/** Posted pay, or an estimate that always says so. */
export function PayTag({ pay, className = "" }: { pay: PayView | null | undefined; className?: string }) {
  if (!pay) return null;
  return pay.kind === "posted" ? (
    <span className={`pay pay-posted ${className}`} title={pay.note}>
      💰 {pay.text}
    </span>
  ) : (
    <span className={`pay pay-est ${className}`} title={pay.note}>
      ≈ {pay.text} <b className="est">Est.</b>
    </span>
  );
}

export function PayFinePrint({ pay, short = false, className = "" }: { pay?: PayView | null; short?: boolean; className?: string }) {
  if (pay && pay.kind !== "estimate") return null;
  return (
    <p className={`pay-fine ${className}`}>
      {short ? "Est. = market estimate for similar roles in the area. Actual pay can vary a lot." : `${pay?.note ? `${pay.note}. ` : ""}${PAY_FINE_PRINT}`}
    </p>
  );
}
