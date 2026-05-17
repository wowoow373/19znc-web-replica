// One-shot extractor: reads the SeekFree 8x16 ASCII font from the firmware
// source and emits assets/font_8x16.json as an array of 16-byte glyphs.
//
// Glyph layout (per the comment block at the top of the C array):
//   byte[0..7]  = top half  — each byte is a vertical 8-pixel column slice,
//                 bit 0 = topmost row of that slice (row 0..7), bit 7 = row 7
//   byte[8..15] = bottom half (rows 8..15)
// So for char pixel (x, y) where x in [0..7], y in [0..15]:
//   y < 8:  pixel set when (glyph[x]      >> y)     & 1
//   y >= 8: pixel set when (glyph[x + 8]  >> (y-8)) & 1
//
// Run: `node tools/extract_font.mjs` from the web-replica/ folder.
// Requires Node 18+. No dependencies.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FONT_C = resolve(__dirname, '../../car3.0/libraries/zf_common/zf_common_font.c');
const OUT_JSON = resolve(__dirname, '../assets/font_8x16.json');

const rawSrc = readFileSync(FONT_C, 'utf8');

// Strip /* ... */ block comments and // line comments before parsing. The font
// header has Chinese block comments containing literal "{byte1, ...}" which the
// row regex would otherwise match.
const src = rawSrc
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/[^\n]*/g, '');

const startMarker = /ascii_font_8x16\s*\[\s*\]\s*\[\s*16\s*\]\s*=\s*\{/;
const startMatch = startMarker.exec(src);
if (!startMatch) throw new Error('Cannot find ascii_font_8x16 array start in ' + FONT_C);

let i = startMatch.index + startMatch[0].length;
let depth = 1;
let endIdx = -1;
while (i < src.length) {
  const ch = src[i];
  if (ch === '{') depth++;
  else if (ch === '}') {
    depth--;
    if (depth === 0) { endIdx = i; break; }
  }
  i++;
}
if (endIdx < 0) throw new Error('Cannot find matching closing brace for ascii_font_8x16');

const body = src.slice(startMatch.index + startMatch[0].length, endIdx);

const rowRe = /\{([^{}]*)\}/g;
const glyphs = [];
let m;
while ((m = rowRe.exec(body)) !== null) {
  const bytes = [...m[1].matchAll(/0x([0-9A-Fa-f]{1,2})/g)].map((b) => parseInt(b[1], 16));
  if (bytes.length !== 16) {
    throw new Error(`Row ${glyphs.length} has ${bytes.length} bytes (expected 16)`);
  }
  glyphs.push(bytes);
}

if (glyphs.length < 95) {
  throw new Error(`Only ${glyphs.length} glyphs extracted; expected at least 95 (ASCII 32..126)`);
}

mkdirSync(dirname(OUT_JSON), { recursive: true });
writeFileSync(OUT_JSON, JSON.stringify(glyphs));
console.log(`Extracted ${glyphs.length} glyphs -> ${OUT_JSON}`);
