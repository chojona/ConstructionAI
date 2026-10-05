const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const CELL = 3;
const ADVANCE = CELL * 6;
const LINE_HEIGHT = CELL * 10;
const MARGIN = 72;

/** 5 by 7 glyphs. Row 0 is the top. `#` is ink. */
function glyph(rows: string): number[] {
  const lines = rows.split("|");
  if (lines.length !== 7 || lines.some((row) => row.length !== 5)) {
    throw new Error(`Glyph must be 7 rows of 5: ${rows}`);
  }
  return lines.map((row) => {
    let bits = 0;
    for (let column = 0; column < 5; column += 1) {
      if (row[column] === "#") bits |= 1 << (4 - column);
    }
    return bits;
  });
}

const BOX = glyph("#####|#...#|#...#|#...#|#...#|#...#|#####");

const GLYPHS: Record<string, number[]> = {
  "0": glyph(".###.|#...#|#..##|#.#.#|##..#|#...#|.###."),
  "1": glyph("..#..|.##..|..#..|..#..|..#..|..#..|.###."),
  "2": glyph(".###.|#...#|....#|..##.|.#...|#....|#####"),
  "3": glyph("####.|....#|....#|.###.|....#|....#|####."),
  "4": glyph("#...#|#...#|#...#|#####|....#|....#|....#"),
  "5": glyph("#####|#....|#....|####.|....#|....#|####."),
  "6": glyph(".###.|#....|#....|####.|#...#|#...#|.###."),
  "7": glyph("#####|....#|...#.|..#..|.#...|.#...|.#..."),
  "8": glyph(".###.|#...#|#...#|.###.|#...#|#...#|.###."),
  "9": glyph(".###.|#...#|#...#|.####|....#|....#|.###."),
  A: glyph(".###.|#...#|#...#|#####|#...#|#...#|#...#"),
  B: glyph("####.|#...#|#...#|####.|#...#|#...#|####."),
  C: glyph(".###.|#...#|#....|#....|#....|#...#|.###."),
  D: glyph("####.|#...#|#...#|#...#|#...#|#...#|####."),
  E: glyph("#####|#....|#....|####.|#....|#....|#####"),
  F: glyph("#####|#....|#....|####.|#....|#....|#...."),
  G: glyph(".###.|#...#|#....|#.###|#...#|#...#|.###."),
  H: glyph("#...#|#...#|#...#|#####|#...#|#...#|#...#"),
  I: glyph(".###.|..#..|..#..|..#..|..#..|..#..|.###."),
  J: glyph("..###|...#.|...#.|...#.|...#.|#..#.|.##.."),
  K: glyph("#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#"),
  L: glyph("#....|#....|#....|#....|#....|#....|#####"),
  M: glyph("#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#"),
  N: glyph("#...#|##..#|#.#.#|#..##|#...#|#...#|#...#"),
  O: glyph(".###.|#...#|#...#|#...#|#...#|#...#|.###."),
  P: glyph("####.|#...#|#...#|####.|#....|#....|#...."),
  Q: glyph(".###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#"),
  R: glyph("####.|#...#|#...#|####.|#.#..|#..#.|#...#"),
  S: glyph(".####|#....|#....|.###.|....#|....#|####."),
  T: glyph("#####|..#..|..#..|..#..|..#..|..#..|..#.."),
  U: glyph("#...#|#...#|#...#|#...#|#...#|#...#|.###."),
  V: glyph("#...#|#...#|#...#|#...#|#...#|.#.#.|..#.."),
  W: glyph("#...#|#...#|#...#|#.#.#|#.#.#|#.#.#|.#.#."),
  X: glyph("#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#"),
  Y: glyph("#...#|#...#|.#.#.|..#..|..#..|..#..|..#.."),
  Z: glyph("#####|....#|...#.|..#..|.#...|#....|#####"),
  a: glyph(".....|.....|.###.|....#|.####|#...#|.####"),
  b: glyph("#....|#....|####.|#...#|#...#|#...#|####."),
  c: glyph(".....|.....|.###.|#....|#....|#...#|.###."),
  d: glyph("....#|....#|.####|#...#|#...#|#...#|.####"),
  e: glyph(".....|.....|.###.|#...#|#####|#....|.###."),
  f: glyph("..##.|.#..#|.#...|###..|.#...|.#...|.#..."),
  g: glyph(".....|.####|#...#|#...#|.####|....#|.###."),
  h: glyph("#....|#....|####.|#...#|#...#|#...#|#...#"),
  i: glyph("..#..|.....|.##..|..#..|..#..|..#..|.###."),
  j: glyph("...#.|.....|..##.|...#.|...#.|#..#.|.##.."),
  k: glyph("#....|#....|#..#.|#.#..|##...|#.#..|#..#."),
  l: glyph(".##..|..#..|..#..|..#..|..#..|..#..|.###."),
  m: glyph(".....|.....|##.#.|#.#.#|#.#.#|#...#|#...#"),
  n: glyph(".....|.....|####.|#...#|#...#|#...#|#...#"),
  o: glyph(".....|.....|.###.|#...#|#...#|#...#|.###."),
  p: glyph(".....|####.|#...#|#...#|####.|#....|#...."),
  q: glyph(".....|.####|#...#|#...#|.####|....#|....#"),
  r: glyph(".....|.....|#.##.|##..#|#....|#....|#...."),
  s: glyph(".....|.....|.####|#....|.###.|....#|####."),
  t: glyph(".#...|.#...|###..|.#...|.#...|.#..#|..##."),
  u: glyph(".....|.....|#...#|#...#|#...#|#..##|.##.#"),
  v: glyph(".....|.....|#...#|#...#|#...#|.#.#.|..#.."),
  w: glyph(".....|.....|#...#|#...#|#.#.#|#.#.#|.#.#."),
  x: glyph(".....|.....|#...#|.#.#.|..#..|.#.#.|#...#"),
  y: glyph(".....|#...#|#...#|.#.#.|..#..|..#..|.#..."),
  z: glyph(".....|.....|#####|...#.|..#..|.#...|#####"),
  ".": glyph(".....|.....|.....|.....|.....|.##..|.##.."),
  ",": glyph(".....|.....|.....|.....|..#..|..#..|.#..."),
  "-": glyph(".....|.....|.....|#####|.....|.....|....."),
  ":": glyph(".....|.##..|.##..|.....|.##..|.##..|....."),
  ";": glyph(".....|.##..|.##..|.....|..#..|..#..|.#..."),
  "'": glyph(".#.#.|.#...|.#...|.....|.....|.....|....."),
  "!": glyph("..#..|..#..|..#..|..#..|..#..|.....|..#.."),
  "?": glyph(".###.|#...#|...#.|..#..|..#..|.....|..#.."),
  "/": glyph("....#|...#.|...#.|..#..|.#...|.#...|#...."),
  "(": glyph("...#.|..#..|.#...|.#...|.#...|..#..|...#."),
  ")": glyph(".#...|..#..|...#.|...#.|...#.|..#..|.#..."),
  "+": glyph(".....|..#..|..#..|#####|..#..|..#..|....."),
  "=": glyph(".....|.....|#####|.....|#####|.....|....."),
  "%": glyph("#...#|#..#.|...#.|..#..|.#...|#..#.|#...#"),
};

function rowsFor(char: string) {
  return GLYPHS[char] ?? BOX;
}

function wrapLines(text: string, columns: number) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (!paragraph) {
      lines.push("");
      continue;
    }
    const words = paragraph.split(" ");
    let current = "";
    for (const word of words) {
      if (word.length > columns) {
        if (current) lines.push(current);
        for (let index = 0; index < word.length; index += columns) {
          lines.push(word.slice(index, index + columns));
        }
        current = "";
        continue;
      }
      const next = current ? `${current} ${word}` : word;
      if (next.length > columns && current) {
        lines.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    if (current) lines.push(current);
  }
  return lines.length > 0 ? lines : [""];
}

function layoutRects(text: string) {
  const columns = Math.max(1, Math.floor((PAGE_WIDTH - MARGIN * 2) / ADVANCE));
  const rects: Array<{ x: number; y: number; w: number; h: number }> = [];
  wrapLines(text, columns).forEach((line, lineIndex) => {
    [...line].forEach((char, column) => {
      if (char === " ") return;
      const top = PAGE_HEIGHT - MARGIN - lineIndex * LINE_HEIGHT;
      if (top - 7 * CELL < MARGIN) return;
      rowsFor(char).forEach((bits, row) => {
        for (let col = 0; col < 5; col += 1) {
          if ((bits & (1 << (4 - col))) === 0) continue;
          rects.push({
            x: MARGIN + column * ADVANCE + col * CELL,
            y: top - (row + 1) * CELL,
            w: CELL,
            h: CELL,
          });
        }
      });
    });
  });
  return rects;
}

function drawnPageStream(text: string) {
  const rects = layoutRects(text);
  if (rects.length === 0) return "";
  return ["0 0 0 rg", ...rects.map((rect) => `${rect.x} ${rect.y} ${rect.w} ${rect.h} re`), "f"].join("\n");
}

/**
 * Letter-size PDF whose text is filled rectangles.
 * Page preview paints these paths without a host font. A non-embedded
 * Helvetica `Tj` page renders as a white PNG where canvas has no fonts.
 */
export function buildDrawnTextPdf(pages: string[]): Buffer {
  if (pages.length < 1) throw new Error("A drawn text PDF needs a page.");
  const parts: Buffer[] = [Buffer.from("%PDF-1.4\n")];
  const offsets: number[] = [0];
  const add = (body: string) => {
    offsets.push(Buffer.concat(parts).length);
    parts.push(Buffer.from(body));
  };

  const pageObjectIds: number[] = [];
  const contentIds: number[] = [];
  let nextId = 3;
  for (let index = 0; index < pages.length; index += 1) {
    pageObjectIds.push(nextId);
    nextId += 1;
    contentIds.push(nextId);
    nextId += 1;
  }

  add("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  add(`2 0 obj\n<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>\nendobj\n`);

  pages.forEach((page, index) => {
    const stream = drawnPageStream(page);
    add(`${pageObjectIds[index]} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Contents ${contentIds[index]} 0 R >>\nendobj\n`);
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
