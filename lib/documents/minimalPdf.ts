function escapePdfString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/** Builds a tiny text PDF for tests. It is not a general PDF writer. */
export function buildTextPdf(pages: string[]): Buffer {
  const parts: Buffer[] = [Buffer.from("%PDF-1.4\n")];
  const offsets: number[] = [0];
  const add = (body: string) => {
    offsets.push(Buffer.concat(parts).length);
    parts.push(Buffer.from(body));
  };

  const pageObjectIds: number[] = [];
  const contentIds: number[] = [];
  let nextId = 4;
  for (let index = 0; index < pages.length; index += 1) {
    pageObjectIds.push(nextId++);
    contentIds.push(nextId++);
  }

  add("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  add(`2 0 obj\n<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>\nendobj\n`);
  add("3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n");

  pages.forEach((page, index) => {
    const commands = ["BT", "/F1 12 Tf", "72 720 Td"];
    page.split("\n").forEach((line, lineIndex) => {
      if (lineIndex > 0) commands.push("0 -16 Td");
      commands.push(`(${escapePdfString(line)}) Tj`);
    });
    commands.push("ET");
    const stream = commands.join("\n");
    add(`${pageObjectIds[index]} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentIds[index]} 0 R /Resources << /Font << /F1 3 0 R >> >> >>\nendobj\n`);
    add(`${contentIds[index]} 0 obj\n<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream\nendobj\n`);
  });

  const xrefOffset = Buffer.concat(parts).length;
  let xref = `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) {
    xref += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  parts.push(Buffer.from(xref));
  return Buffer.concat(parts);
}
