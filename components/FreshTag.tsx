import { freshness } from "@/lib/reality";
import type { Reality } from "@/lib/types";

/** "Posted 2d ago", "Reposted 4×", "Maybe evergreen": is this job real and current? */
export function FreshTag({ reality, datePosted, className = "" }: { reality?: Reality | null; datePosted?: string | null; className?: string }) {
  const f = freshness(reality, datePosted);
  if (!f) return null;
  return (
    <span className={`tag fresh-tag fresh-${f.tone} ${className}`.trim()} title={f.detail}>
      {f.label}
    </span>
  );
}
