function escapePdfString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/**
 * One-page PDF that paints Helvetica and Times with `Tj` and no FontFile.
 * Standard-14 fonts are named, not embedded.
 */
export function buildUnembeddedStandardFontPdf(): Buffer {
  const stream = [
    "BT",
    "/F1 18 Tf",
    "72 700 Td",
    `(${escapePdfString("Catch basin 16 EA")}) Tj`,
    "0 -28 Td",
    "/F2 18 Tf",
    `(${escapePdfString("Times Roman note")}) Tj`,
    "ET",
  ].join("\n");

  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [5 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>\nendobj\n",
    `5 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 6 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>\nendobj\n`,
    `6 0 obj\n<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream\nendobj\n`,
  ];

  const parts: Buffer[] = [Buffer.from("%PDF-1.4\n")];
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.concat(parts).length);
    parts.push(Buffer.from(object));
  }
  const xrefOffset = Buffer.concat(parts).length;
  let xref = `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) {
    xref += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  parts.push(Buffer.from(xref));
  return Buffer.concat(parts);
}
