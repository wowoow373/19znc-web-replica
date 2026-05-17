// Boot animations for each controller. Each returns a Promise that resolves
// when boot completes (or is skipped via ctx.skip()).
//
// car3.0:  10 init lines printed at 250ms intervals into rows 0..7, with
//          firmware's `(show_row++) % 8` wraparound behavior (lines 9-10
//          overwrite rows 0 and 1). Followed by a 500ms BEEP-pause, then
//          clear → menu transition.
// MCX1.0:  5 init lines from main.cpp's device_init() sequence — the
//          firmware doesn't render these on the IPS200 itself (the printfs go
//          to the debug uart), but the replica writes them onto the screen so
//          there's parity with car3.0's boot.
// OpenArt: clear → red `READY!` at pixel (0, 44), then idle until UART CMD.

import { COLORS } from './font.js';

export function makeBootCtx() {
  const ctx = {
    skipped: false,
    skip() {
      ctx.skipped = true;
      ctx._resolveSkip?.();
    },
    sleep(ms) {
      if (ctx.skipped) return Promise.resolve();
      return new Promise((res) => {
        const to = setTimeout(res, ms);
        // Allow skip() to fast-forward the wait
        const prev = ctx._resolveSkip;
        ctx._resolveSkip = () => {
          clearTimeout(to);
          prev?.();
          res();
        };
      });
    },
  };
  return ctx;
}

const CAR3_BOOT_LINES = [
  { row: 0, text: 'BEEP_init_finished' },
  { row: 1, text: 'sd_init_finished' },
  { row: 2, text: 'sd_clear_finished' },
  { row: 2, text: 'flash_init_finished' },     // overwrites sd_clear_finished
  { row: 3, text: 'mt9v03x_init_finish' },
  { row: 4, text: 'BMX055_init_finished' },
  { row: 5, text: 'pit_init_finished' },
  { row: 6, text: 'uatr_init_finished' },
  { row: 7, text: 'key_init_finished' },
  { row: 0, text: 'motor_init_finished' },     // overwrites BEEP_init_finished
];

export async function bootCar3(screen, ctx) {
  screen.clear(COLORS.WHITE);
  for (const { row, text } of CAR3_BOOT_LINES) {
    if (ctx.skipped) break;
    screen.textRow(0, row, screen.cols, text, COLORS.BLUE, COLORS.WHITE);
    await ctx.sleep(250);
  }
  if (!ctx.skipped) await ctx.sleep(500); // simulate final BEEP pause
  screen.clear(COLORS.WHITE);
}

const MCX_BOOT_LINES = [
  { row: 0, text: 'zf_board_init_finished' },
  { row: 1, text: 'user_uart_init_finished' },
  { row: 2, text: 'sd_card_init_finished' },
  { row: 3, text: 'debug_uart_ready' },
  { row: 4, text: 'ips200_init_finished' },
  { row: 5, text: 'scc8660_init_finished' },
];

export async function bootMcx(screen, ctx) {
  screen.clear(COLORS.WHITE);
  for (const { row, text } of MCX_BOOT_LINES) {
    if (ctx.skipped) break;
    screen.textRow(0, row, screen.cols, text, COLORS.BLUE, COLORS.WHITE);
    await ctx.sleep(250);
  }
  if (!ctx.skipped) await ctx.sleep(400);
  screen.clear(COLORS.WHITE);
}

export async function bootOpenart(screen, ctx) {
  screen.clear(COLORS.WHITE);
  screen.textPx(0, 44, 'READY!', COLORS.RED, COLORS.WHITE);
  if (!ctx.skipped) await ctx.sleep(50);
}
