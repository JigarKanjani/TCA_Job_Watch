"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/jobs", label: "Job log" },
  { href: "/alerts", label: "Alerts" },
  { href: "/documents", label: "Documents" },
  { href: "/settings", label: "Settings" },
];

export function AppNav() {
  const path = usePathname();
  return (
    <nav className="app-nav" aria-label="App">
      <div className="wrap app-nav-in">
        {TABS.map((t) => {
          const active = path === t.href || path.startsWith(`${t.href}/`);
          return (
            <Link key={t.href} href={t.href} className={active ? "on" : undefined} aria-current={active ? "page" : undefined}>
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
