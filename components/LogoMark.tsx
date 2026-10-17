// The JobWatch mark (same drawing as app/icon.svg): a radar sweep with an
// amber "new role" ping. Cream tile on the coral header.
export function LogoMark({ tile = "#F0E3DB", ink = "#DB624D", className = "mark" }: { tile?: string; ink?: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill={tile} />
      <circle cx="29" cy="35" r="18" fill="none" stroke={ink} strokeWidth="4.5" />
      <circle cx="29" cy="35" r="8.5" fill="none" stroke={ink} strokeWidth="4.5" opacity="0.65" />
      <path d="M29 35 43.5 20.5" stroke={ink} strokeWidth="4.5" strokeLinecap="round" />
      <circle cx="47" cy="17" r="7" fill="#F59E0B" stroke={tile} strokeWidth="3" />
    </svg>
  );
}
