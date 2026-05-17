// OpenArt screen: no menu, no buttons. After boot it shows red `READY!` and
// then re-renders on every `openart_cmd` event (from the bus or the manual
// CMD selector). Each CMD maps to a label/classification overlay drawn over a
// real camera frame from assets/sample_frames/.

import { COLORS } from './font.js';
import { onOpenartCmd } from './uart_bus.js';
import { pickFrame } from './frames.js';

// CMD byte → display state
const CMD_TABLE = {
  0xff: { name: 'NULL', label: null, color: COLORS.GRAY },
  0x01: { name: 'target_classification', label: 'Helmet', color: COLORS.RED },
  0x02: { name: 'letter_classification', label: 'A', color: COLORS.RED },
  0x03: { name: 'number_classification', label: 'One', color: COLORS.RED },
  0x04: { name: 'targez_classification', label: 'BulletproofVest', color: COLORS.RED },
  0x10: { name: 'put_box0',   label: 'PUT box0', color: COLORS.GREEN },
  0x11: { name: 'put_box1',   label: 'PUT box1', color: COLORS.GREEN },
  0x12: { name: 'put_box2',   label: 'PUT box2', color: COLORS.GREEN },
  0x20: { name: 'reset_box0', label: 'RESET box0', color: COLORS.BLUE },
  0x21: { name: 'reset_box1', label: 'RESET box1', color: COLORS.BLUE },
  0x22: { name: 'reset_box2', label: 'RESET box2', color: COLORS.BLUE },
};

// Cycle through a few representative target labels so the visual doesn't
// always say the same thing on repeated clicks.
const TARGET_LABELS = ['Helmet', 'Ambulance', 'Telescope', 'Flashlight', 'FireAxe', 'Motorbike'];
const LETTER_LABELS = ['A', 'B', 'C', 'D', 'M', 'N', 'O'];
const NUMBER_LABELS = ['One', 'Two', 'Three'];
let cycleIdx = 0;

export function initOpenart(screen) {
  // initial boot text already drawn by boot.js; subscribe to CMD events
  onOpenartCmd(({ cmd, label }) => {
    handleCmd(screen, cmd, label);
  });
}

function handleCmd(screen, cmd, overrideLabel) {
  const entry = CMD_TABLE[cmd];
  const statusEl = document.querySelector('[data-openart-status]');
  if (statusEl) statusEl.textContent = entry?.name || `0x${cmd.toString(16)}`;

  if (cmd === 0xff || !entry) {
    drawReady(screen);
    return;
  }
  let label = overrideLabel || entry.label;
  if (cmd === 0x01) label = TARGET_LABELS[(cycleIdx++) % TARGET_LABELS.length];
  if (cmd === 0x02) label = LETTER_LABELS[(cycleIdx++) % LETTER_LABELS.length];
  if (cmd === 0x03) label = NUMBER_LABELS[(cycleIdx++) % NUMBER_LABELS.length];
  if (cmd === 0x04) label = TARGET_LABELS[(cycleIdx++) % TARGET_LABELS.length];
  drawClassification(screen, label, entry.color);
}

function drawReady(screen) {
  screen.clear(COLORS.WHITE);
  // firmware: lcd.show_str('READY!', 0, 44, lcd.RED, 1)
  screen.textPx(0, 44, 'READY!', COLORS.RED, COLORS.WHITE);
}

function drawClassification(screen, label, accentColor) {
  // Real camera frame, scaled to fill the OpenArt canvas
  drawRealFrame(screen, label);

  // ROI: firmware uses an 88×88 ROI per main.py:284-285. Place it center-ish.
  const w = screen.w, h = screen.h;
  const roiW = 88, roiH = 88;
  const roiX = Math.floor((w - roiW) / 2);
  const roiY = Math.floor((h - roiH) / 2);
  screen.strokeRect(roiX, roiY, roiW, roiH, COLORS.GREEN);
  screen.strokeRect(roiX - 1, roiY - 1, roiW + 2, roiH + 2, COLORS.GREEN);

  // Label above ROI (firmware scale=2; we use scale=2 for fidelity)
  screen.textScaled(roiX, roiY - 20, label || '', accentColor, COLORS.WHITE, 2);

  // Confidence below ROI
  const conf = (0.85 + Math.random() * 0.14).toFixed(2);
  screen.textScaled(roiX, roiY + roiH + 4, conf, accentColor, COLORS.WHITE, 2);
}

function drawRealFrame(screen, seed) {
  const img = pickFrame(seed || 'openart');
  if (img) {
    screen.drawImage(img, 0, 0, screen.w, screen.h);
  } else {
    // Fallback if frames haven't loaded
    screen.clear(COLORS.WHITE);
  }
}
