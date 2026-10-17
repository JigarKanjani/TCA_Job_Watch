import { Fragment } from "react";

// Renders job-description text that may be Markdown (JobSpy, Jina Reader) or
// plain text with "•" bullets (page scrapes). Builds React nodes only — no
// HTML injection — handling headings, bullet lists, **bold** and *italic*.

function clean(src: string): string {
  return src
    .replace(/\r\n?/g, "\n")
    .replace(/\\([\\`*_{}[\]()#+\-.!>|~])/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function inline(text: string, keyBase: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*)/g);
  return parts.map((p, i) => {
    const k = `${keyBase}-${i}`;
    if (/^(\*\*|__).+(\*\*|__)$/.test(p)) return <strong key={k}>{p.slice(2, -2)}</strong>;
    if (/^\*[^*].*\*$/.test(p)) return <em key={k}>{p.slice(1, -1)}</em>;
    return <Fragment key={k}>{p}</Fragment>;
  });
}

const BULLET = /^\s*(?:[-*•·]|\d+[.)])\s+/;

export function RichText({ text }: { text: string }) {
  const blocks = clean(text).split(/\n\s*\n/);
  return (
    <div className="rich">
      {blocks.map((block, bi) => {
        const lines = block.split("\n").filter((l) => l.trim());
        if (!lines.length) return null;
        const heading = lines.length === 1 && /^#{1,6}\s+/.test(lines[0]);
        if (heading) return <h4 key={bi}>{inline(lines[0].replace(/^#{1,6}\s+/, ""), `h${bi}`)}</h4>;
        if (lines.every((l) => BULLET.test(l))) {
          return (
            <ul key={bi}>
              {lines.map((l, li) => <li key={li}>{inline(l.replace(BULLET, ""), `b${bi}-${li}`)}</li>)}
            </ul>
          );
        }
        // Mixed block: lead-in line(s) followed by bullets.
        const firstBullet = lines.findIndex((l) => BULLET.test(l));
        if (firstBullet > 0 && lines.slice(firstBullet).every((l) => BULLET.test(l))) {
          return (
            <Fragment key={bi}>
              <p>{inline(lines.slice(0, firstBullet).join(" "), `p${bi}`)}</p>
              <ul>
                {lines.slice(firstBullet).map((l, li) => <li key={li}>{inline(l.replace(BULLET, ""), `m${bi}-${li}`)}</li>)}
              </ul>
            </Fragment>
          );
        }
        return (
          <p key={bi}>
            {lines.map((l, li) => (
              <Fragment key={li}>
                {li > 0 && <br />}
                {inline(l.replace(/^#{1,6}\s+/, ""), `l${bi}-${li}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
