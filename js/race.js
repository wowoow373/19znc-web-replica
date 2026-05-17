// Race-mode renderers. Active after car3.0 L-on-root triggers 发车 (launch),
// mirroring the firmware's begin_all() → run_TMD() loop. Each screen shows the
// real-time view it would show during a competition run.
//
// car3.0: the TFT shows the camera frame + curvature/drift overlay (firmware's
//   ImageShower = AllMaps + run_state = track_no_TGT path).
// MCX:    IPS shows ShowTargetInfo lateral-tracking telemetry.
// OpenArt: driven by the openart_cmd bus (target_classification 0x01) so the
//   normal openart.js renderer handles it — race.js doesn't touch openart.

import { COLORS } from './font.js';
import { pickFrame, getFrames } from './frames.js';

// Pick a per-tick frame so the camera view animates while running.
function tickFrame(t) {
  const frames = getFrames();
  if (!frames.length) return null;
  return frames[Math.floor(t / 700) % frames.length];
}

export function drawRaceCar3(screen, t) {
  // 1. Camera frame (full canvas)
  const img = tickFrame(t) || pickFrame('car3-race');
  if (img) screen.drawImage(img, 0, 0, screen.w, screen.h);
  else     screen.clear(COLORS.WHITE);

  // 2. Title bar on row 0 (overlay)
  screen.textRow(0, 0, screen.cols, 'RUN track_no_TGT ', COLORS.RED, COLORS.WHITE);

  // 3. Bottom telemetry: curvature + drift + speed (mock; numbers wobble)
  const phase = t / 1000;
  const k    = (Math.sin(phase * 1.7)         * 0.04).toFixed(3);
  const drft = (Math.sin(phase * 0.9 + 1)     * 0.20).toFixed(2);
  const spd  = (1.50 + Math.sin(phase * 0.4) * 0.10).toFixed(2);
  screen.textRow(0, screen.rows - 3, screen.cols, `K   ${k}`,  COLORS.BLUE, COLORS.WHITE);
  screen.textRow(0, screen.rows - 2, screen.cols, `Drft ${drft}`, COLORS.BLUE, COLORS.WHITE);
  screen.textRow(0, screen.rows - 1, screen.cols, `spd ${spd} m/s`, COLORS.BLUE, COLORS.WHITE);
}

export function drawRaceMcx(screen, t) {
  // 1. Camera frame upscaled to fill MCX (the firmware also redraws the image
  // on this screen via Cm_DealedImage on the IPS200)
  const img = tickFrame(t + 200) || pickFrame('mcx-race');
  if (img) screen.drawImage(img, 0, 0, screen.w, screen.h);
  else     screen.clear(COLORS.WHITE);

  // 2. Show TargetInfo-style overlay (firmware: ShowTargetInfo + LateralTracking)
  screen.textRow(0, 0, screen.cols, '  Lateral Tracking  ', COLORS.RED, COLORS.WHITE);
  const labels = ['STST', 'STED', 'TKDF', 'TKDV', 'TKAB', 'Loss', 'CenX', 'CenY', 'R   ', 'STRG'];
  const phase = t / 1000;
  for (let i = 0; i < labels.length; i++) {
    const v = (50 + Math.sin(phase + i) * 40).toFixed(0);
    screen.textRow(0, 2 + i, screen.cols, ` ${labels[i]}: ${v}`, COLORS.BLUE, COLORS.WHITE);
  }
  const states = ['track_no_TGT', 'with_TGT', 'ramp_climb', 'oc_jump'];
  const s = states[Math.floor(t / 2000) % states.length];
  screen.textRow(0, screen.rows - 2, screen.cols, ` run:${s}`, COLORS.RED, COLORS.WHITE);
  screen.textRow(0, screen.rows - 1, screen.cols, ' Wait L = stop      ', COLORS.GRAY, COLORS.WHITE);
}
