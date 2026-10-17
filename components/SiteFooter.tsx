import Link from "next/link";
import { APP_NAME } from "@/lib/config";
import { LogoMark } from "./LogoMark";

export function SiteFooter() {
  return (
    <footer className="foot">
      <div className="wrap foot-in">
        <div className="brand" style={{ fontSize: "1rem" }}>
          <LogoMark tile="#DB624D" ink="#F0E3DB" /> {APP_NAME}
        </div>
        <div>Free job alerts for Canada &amp; the US · Email · Telegram · Discord</div>
        <nav className="foot-links" aria-label="Legal">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
      </div>
    </footer>
  );
}
