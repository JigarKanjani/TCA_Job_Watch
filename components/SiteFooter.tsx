import { APP_NAME } from "@/lib/config";

export function SiteFooter() {
  return (
    <footer className="foot">
      <div className="wrap foot-in">
        <div className="brand" style={{ fontSize: "1rem" }}>
          <span className="mark" /> {APP_NAME}
        </div>
        <div>Job alerts for Canada &amp; the US · Email · Telegram · Discord</div>
      </div>
    </footer>
  );
}
