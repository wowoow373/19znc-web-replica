// Thin canvas wrapper used by each of the three controller "screens".
// The canvas is sized to the controller's native pixel dimensions; the CSS
// scale (set in screen.css) does the on-page upscaling via image-rendering:
// pixelated.

import { drawText, drawTextPx, drawTextScaled, drawTextRow, CELL } from './font.js';

export class Screen {
  constructor(canvas, { cols, rows }) {
    this.canvas = canvas;
    this.cols = cols;
    this.rows = rows;
    this.w = cols * CELL.W;
    this.h = rows * CELL.H;
    canvas.width = this.w;
    canvas.height = this.h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    this.ctx = ctx;
  }

  clear(color) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.w, this.h);
  }

  fillRect(px, py, w, h, color) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(px, py, w, h);
  }

  // Stroked rectangle, 1 px lines, axis-aligned. Used for the OpenArt ROI box.
  strokeRect(px, py, w, h, color) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(px, py, w, 1);
    this.ctx.fillRect(px, py + h - 1, w, 1);
    this.ctx.fillRect(px, py, 1, h);
    this.ctx.fillRect(px + w - 1, py, 1, h);
  }

  text(col, row, str, fg, bg, invert = false) {
    drawText(this.ctx, col, row, str, fg, bg, invert);
  }

  textPx(px, py, str, fg, bg, invert = false) {
    drawTextPx(this.ctx, px, py, str, fg, bg, invert);
  }

  textScaled(px, py, str, fg, bg, scale, invert = false) {
    drawTextScaled(this.ctx, px, py, str, fg, bg, scale, invert);
  }

  textRow(col, row, width, str, fg, bg, invert = false) {
    drawTextRow(this.ctx, col, row, width, str, fg, bg, invert);
  }
}
