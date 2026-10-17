// Builds an editable Word file (.docx) in the browser from a plain-text
// draft. Resume: name, contact line, UPPERCASE headings, "- " bullets.
// Cover letter: name and contact header, then paragraphs.
import { isHeading } from "./analyze";

const FONT = "Calibri";
const BULLET = /^\s*[-•●▪◦*]\s+/;

export async function buildDocx(kind: "cover" | "resume", text: string, title: string): Promise<Blob> {
  const { AlignmentType, BorderStyle, Document, LevelFormat, Packer, Paragraph, TextRun } = await import("docx");
  const lines = text.replace(/\r/g, "").split("\n");
  const children: InstanceType<typeof Paragraph>[] = [];
  const run = (t: string, o: Record<string, unknown> = {}) => new TextRun({ text: t, font: FONT, size: 21, ...o });

  if (kind === "resume") {
    lines.forEach((raw, i) => {
      const line = raw.trimEnd();
      if (!line.trim()) return;
      if (i === 0) {
        children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [run(line, { bold: true, size: 36 })] }));
      } else if (i === 1 && !isHeading(line)) {
        children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [run(line, { size: 19, color: "555555" })] }));
      } else if (isHeading(line)) {
        children.push(
          new Paragraph({
            spacing: { before: 220, after: 80 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "0D9488", space: 2 } },
            children: [run(line.toUpperCase(), { bold: true, size: 22, color: "065F55" })],
          }),
        );
      } else if (BULLET.test(line)) {
        children.push(new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 40 }, children: [run(line.replace(BULLET, ""))] }));
      } else {
        // Short lines with a date or a separator read as role / school lines.
        const roleLine = line.length < 110 && (/\b(19|20)\d{2}\b|present|current/i.test(line) || /\s[|–—]\s/.test(line));
        children.push(new Paragraph({ spacing: { before: roleLine ? 100 : 0, after: 50 }, children: [run(line, roleLine ? { bold: true } : {})] }));
      }
    });
  } else {
    lines.forEach((raw, i) => {
      const line = raw.trimEnd();
      const next = lines[i + 1] ?? "";
      if (!line.trim()) return;
      const after = next.trim() ? 0 : 220;
      if (i === 0) children.push(new Paragraph({ spacing: { after: 20 }, children: [run(line, { bold: true, size: 30 })] }));
      else if (i === 1) children.push(new Paragraph({ spacing: { after: 280 }, children: [run(line, { size: 19, color: "555555" })] }));
      else children.push(new Paragraph({ spacing: { after, line: 276 }, children: [run(line, { size: 22 })] }));
    });
  }

  const doc = new Document({
    creator: "JobWatch",
    title,
    styles: { default: { document: { run: { font: FONT, size: 22 } } } },
    numbering: {
      config: [
        {
          reference: "bullets",
          levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 240 } } } }],
        },
      ],
    },
    sections: [{ properties: { page: { margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 } } }, children }],
  });
  return Packer.toBlob(doc);
}

export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 3000);
}
