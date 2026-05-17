// Bitmap text renderer using the extracted SeekFree 8x16 ASCII font.
//
// Glyph layout (see tools/extract_font.mjs comment):
//   bytes 0..7 = top half columns (each byte = vertical 8-px slice, bit 0 = topmost)
//   bytes 8..15 = bottom half columns
// Pixel (x, y) where x in [0..7], y in [0..15] is on when:
//   y < 8:  (glyph[x]     >> y    ) & 1
//   y >= 8: (glyph[x + 8] >> (y-8)) & 1

const CELL_W = 8;
const CELL_H = 16;
const FIRST_CODE = 32; // glyph index 0 maps to ASCII space (32)

export const COLORS = {
  WHITE: '#ffffff',
  BLACK: '#000000',
  BLUE: '#0000ff',
  RED: '#ff0000',
  GREEN: '#00ff00',
  GRAY: '#808080',
  PINK: '#ffc0cb',
  CYAN: '#00ffff',
  YELLOW: '#ffff00',
};

let glyphs = null;

export async function loadFont(url = 'assets/font_8x16.json') {
  if (glyphs) return glyphs;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load font: ${res.status}`);
  glyphs = await res.json();
  return glyphs;
}

function glyphFor(ch) {
  const code = ch.charCodeAt(0);
  const idx = code - FIRST_CODE;
  if (idx < 0 || idx >= glyphs.length) return glyphs[0]; // fallback to space
  return glyphs[idx];
}

function pixelOn(glyph, x, y) {
  if (y < 8) return (glyph[x] >> y) & 1;
  return (glyph[x + 8] >> (y - 8)) & 1;
}

// Grid-aligned text. col/row are in 8x16 cell coordinates.
export function drawText(ctx, col, row, text, fg, bg, invert = false) {
  drawTextPx(ctx, col * CELL_W, row * CELL_H, text, fg, bg, invert);
}

// Pixel-positioned text at (px, py).
export function drawTextPx(ctx, px, py, text, fg, bg, invert = false) {
  drawTextScaled(ctx, px, py, text, fg, bg, 1, invert);
}

// Pixel-positioned text with integer scale factor (1 = native 8x16).
export function drawTextScaled(ctx, px, py, text, fg, bg, scale = 1, invert = false) {
  if (!glyphs) throw new Error('font not loaded');
  const on = invert ? bg : fg;
  const off = invert ? fg : bg;
  for (let i = 0; i < text.length; i++) {
    const glyph = glyphFor(text[i]);
    const baseX = px + i * CELL_W * scale;
    for (let y = 0; y < CELL_H; y++) {
      for (let x = 0; x < CELL_W; x++) {
        const color = pixelOn(glyph, x, y) ? on : off;
        if (color === null || color === undefined) continue;
        ctx.fillStyle = color;
        ctx.fillRect(baseX + x * scale, py + y * scale, scale, scale);
      }
    }
  }
}

// Fill a horizontal text row with bg first, then draw text. Useful for clearing
// a row before redraw. width is in cells.
export function drawTextRow(ctx, col, row, width, text, fg, bg, invert = false) {
  const px = col * CELL_W;
  const py = row * CELL_H;
  ctx.fillStyle = invert ? fg : bg;
  ctx.fillRect(px, py, width * CELL_W, CELL_H);
  drawTextPx(ctx, px, py, text, fg, bg, invert);
}

export const CELL = { W: CELL_W, H: CELL_H };
