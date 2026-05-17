// Mock runtime screens. Picked up when the menu engine sees a function-type
// item. Each function key resolves through data/runtime_specs.json to a draw
// type with a tiny per-frame renderer.

import { COLORS, CELL } from './font.js';
import { emitOpenartCmd } from './uart_bus.js';
import { pickFrame } from './frames.js';

let SPECS = {};

export async function loadRuntimeSpecs(url = 'data/runtime_specs.json') {
  const res = await fetch(url);
  SPECS = await res.json();
  return SPECS;
}

export function createRuntime(fnName, displayName) {
  const spec = SPECS[fnName] || null;
  const rt = {
    fnName,
    displayName: displayName || fnName,
    spec,
    rng: makeRng(fnName),
    state: {}, // per-draw scratch space
    startedAt: Date.now(),
  };
  // Emit openart_cmd on entry if the spec asks for it
  if (spec?.emits === 'openart_cmd' && typeof spec.cmd === 'number') {
    emitOpenartCmd({ cmd: spec.cmd });
  }
  return rt;
}

export function disposeRuntime(rt) {
  // Reset OpenArt to NULL if this runtime was driving it
  if (rt?.spec?.emits === 'openart_cmd') {
    emitOpenartCmd({ cmd: 0xff });
  }
}

export function tickRuntime(rt) {
  if (!rt) return;
  // most draws sample fresh randoms each tick — nothing to do here
}

// ---------------------------------------------------------------------------
// Render dispatch
// ---------------------------------------------------------------------------

export function renderRuntime(screen, rt) {
  if (!rt) return;
  screen.clear(COLORS.WHITE);
  const draw = rt.spec?.draw || 'placeholder';
  const fn = DRAW[draw] || DRAW.placeholder;
  fn(screen, rt);
  // Footer hint
  const exitHint = `L: exit`;
  screen.textRow(0, screen.rows - 1, screen.cols, exitHint, COLORS.GRAY, COLORS.WHITE);
}

// ---------------------------------------------------------------------------
// Draw types
// ---------------------------------------------------------------------------

const DRAW = {
  placeholder(screen, rt) {
    screen.textRow(0, 0, screen.cols, rt.displayName.slice(0, screen.cols), COLORS.BLUE, COLORS.WHITE);
    screen.textRow(0, 2, screen.cols, '<no mock yet>', COLORS.RED, COLORS.WHITE);
    screen.textRow(0, 3, screen.cols, 'running... press L', COLORS.BLACK, COLORS.WHITE);
  },

  fps_panel(screen, rt) {
    const fps = 28 + Math.floor(rt.rng() * 5);
    screen.textRow(0, 0, screen.cols, 'show_fps', COLORS.BLUE, COLORS.WHITE);
    screen.textRow(0, 2, screen.cols, `fps: ${fps}`, COLORS.BLACK, COLORS.WHITE);
    screen.textRow(0, 3, screen.cols, `frame: ${Math.floor((Date.now() - rt.startedAt) / 33)}`, COLORS.BLACK, COLORS.WHITE);
  },

  wheel_speeds(screen, rt) {
    screen.textRow(0, 0, screen.cols, 'WHEELS SPEED', COLORS.BLUE, COLORS.WHITE);
    const names = ['LF', 'RF', 'LR', 'RR'];
    for (let i = 0; i < 4; i++) {
      const v = (1.2 + (rt.rng() - 0.5) * 0.3).toFixed(2);
      screen.textRow(0, 2 + i, screen.cols, `${names[i]}: ${v} m/s`, COLORS.BLACK, COLORS.WHITE);
    }
  },

  car_speed(screen, rt) {
    screen.textRow(0, 0, screen.cols, 'CAR SPEED', COLORS.BLUE, COLORS.WHITE);
    const v = (1.5 + (rt.rng() - 0.5) * 0.2).toFixed(2);
    screen.textRow(0, 2, screen.cols, `speed: ${v} m/s`, COLORS.BLACK, COLORS.WHITE);
    screen.textRow(0, 3, screen.cols, `accel: ${((rt.rng() - 0.5) * 1.2).toFixed(2)} m/s2`, COLORS.BLACK, COLORS.WHITE);
  },

  attitude(screen, rt) {
    screen.textRow(0, 0, screen.cols, 'ATTITUDE', COLORS.BLUE, COLORS.WHITE);
    screen.textRow(0, 2, screen.cols, `yaw  : ${((rt.rng() - 0.5) * 30).toFixed(2)}°`, COLORS.BLACK, COLORS.WHITE);
    screen.textRow(0, 3, screen.cols, `pitch: ${((rt.rng() - 0.5) * 10).toFixed(2)}°`, COLORS.BLACK, COLORS.WHITE);
    screen.textRow(0, 4, screen.cols, `roll : ${((rt.rng() - 0.5) * 10).toFixed(2)}°`, COLORS.BLACK, COLORS.WHITE);
  },

  state_log(screen, rt) {
    screen.textRow(0, 0, screen.cols, 'STATE', COLORS.BLUE, COLORS.WHITE);
    const states = ['track_no_TGT', 'track_TGT_left', 'ramp_climb', 'stop_run'];
    screen.textRow(0, 2, screen.cols, `run: ${states[Math.floor(rt.rng() * states.length)]}`, COLORS.BLACK, COLORS.WHITE);
    screen.textRow(0, 3, screen.cols, `intervene: stop`, COLORS.BLACK, COLORS.WHITE);
  },

  curvature(screen, rt) {
    screen.textRow(0, 0, screen.cols, 'CURVATURE', COLORS.BLUE, COLORS.WHITE);
    screen.textRow(0, 2, screen.cols, `K: ${((rt.rng() - 0.5) * 0.05).toFixed(4)}`, COLORS.BLACK, COLORS.WHITE);
    screen.textRow(0, 3, screen.cols, `drift_p: 1.20`, COLORS.BLACK, COLORS.WHITE);
  },

  interven(screen, rt) {
    screen.textRow(0, 0, screen.cols, 'INTERVENE INFO', COLORS.BLUE, COLORS.WHITE);
    screen.textRow(0, 2, screen.cols, `state: stop`, COLORS.BLACK, COLORS.WHITE);
    screen.textRow(0, 3, screen.cols, `flag : 0x00`, COLORS.BLACK, COLORS.WHITE);
  },

  yolo_info(screen, rt) {
    screen.textRow(0, 0, screen.cols, 'YOLO INFO', COLORS.BLUE, COLORS.WHITE);
    const cats = ['Helmet', 'Ambulance', 'Telescope', 'Flashlight', 'FireAxe', 'Motorbike'];
    const cat = cats[Math.floor(rt.rng() * cats.length)];
    screen.textRow(0, 2, screen.cols, `obj : ${cat}`, COLORS.BLACK, COLORS.WHITE);
    screen.textRow(0, 3, screen.cols, `conf: ${(0.8 + rt.rng() * 0.2).toFixed(2)}`, COLORS.BLACK, COLORS.WHITE);
    screen.textRow(0, 4, screen.cols, `dist: ${(0.4 + rt.rng() * 1.2).toFixed(2)} m`, COLORS.BLACK, COLORS.WHITE);
  },

  neural_log(screen, rt) {
    screen.textRow(0, 0, screen.cols, 'ANN INFO', COLORS.BLUE, COLORS.WHITE);
    screen.textRow(0, 2, screen.cols, `cross: -1`, COLORS.BLACK, COLORS.WHITE);
    screen.textRow(0, 3, screen.cols, `keep : ${rt.rng() > 0.5 ? 'YES' : 'NO'}`, COLORS.BLACK, COLORS.WHITE);
  },

  image(screen, rt) {
    drawFakeCameraFrame(screen, rt);
    screen.textRow(0, 0, screen.cols, rt.displayName.slice(0, screen.cols), COLORS.RED, COLORS.WHITE);
  },

  raw_map(screen, rt) {
    drawFakeCameraFrame(screen, rt);
    screen.textRow(0, 0, screen.cols, 'showRawMap', COLORS.RED, COLORS.WHITE);
  },

  site_test(screen, rt) {
    screen.textRow(0, 0, screen.cols, 'TEST SITE', COLORS.BLUE, COLORS.WHITE);
    screen.textRow(0, 2, screen.cols, 'world_x: 0.12', COLORS.BLACK, COLORS.WHITE);
    screen.textRow(0, 3, screen.cols, 'world_y: 0.05', COLORS.BLACK, COLORS.WHITE);
    screen.textRow(0, 4, screen.cols, 'attitude: 0.0', COLORS.BLACK, COLORS.WHITE);
  },

  servo_bars(screen, rt) {
    screen.textRow(0, 0, screen.cols, 'SERVO TEST', COLORS.BLUE, COLORS.WHITE);
    for (let i = 0; i < 4; i++) {
      const w = Math.floor(rt.rng() * (screen.w - 32));
      const y = 32 + i * 32;
      screen.fillRect(8, y, screen.w - 16, 4, '#cccccc');
      screen.fillRect(8, y, w + 16, 4, COLORS.BLUE);
      screen.textPx(8, y - 12, `S${i}`, COLORS.BLACK, COLORS.WHITE);
    }
  },

  uart_log(screen, rt) {
    screen.textRow(0, 0, screen.cols, `UART: ${rt.spec.label || 'log'}`, COLORS.BLUE, COLORS.WHITE);
    const lines = ['> FE 0A 14 1E 01 FF', '> FE 0B 16 22 02 FF', '< 06 05 03', '< 02 01 03'];
    for (let i = 0; i < lines.length; i++) {
      screen.textRow(0, 2 + i, screen.cols, lines[i], COLORS.BLACK, COLORS.WHITE);
    }
  },

  sd_status(screen, rt) {
    screen.textRow(0, 0, screen.cols, `SD: ${rt.spec.label || 'test'}`, COLORS.BLUE, COLORS.WHITE);
    screen.textRow(0, 2, screen.cols, 'init: ok', COLORS.BLACK, COLORS.WHITE);
    screen.textRow(0, 3, screen.cols, 'write 4096B: ok', COLORS.BLACK, COLORS.WHITE);
    screen.textRow(0, 4, screen.cols, 'read  4096B: ok', COLORS.BLACK, COLORS.WHITE);
  },

  motor_single(screen, rt) {
    const label = rt.spec.label || '?';
    screen.textRow(0, 0, screen.cols, `MOTOR ${label}`, COLORS.BLUE, COLORS.WHITE);
    const rpm = (500 + (rt.rng() - 0.5) * 200).toFixed(0);
    screen.textRow(0, 2, screen.cols, `rpm : ${rpm}`, COLORS.BLACK, COLORS.WHITE);
    screen.textRow(0, 3, screen.cols, `duty: ${(rt.rng() * 0.5).toFixed(2)}`, COLORS.BLACK, COLORS.WHITE);
  },

  motors_all(screen, rt) {
    screen.textRow(0, 0, screen.cols, 'MOTOR TEST ALL', COLORS.BLUE, COLORS.WHITE);
    const names = ['LB', 'LT', 'RB', 'RT'];
    for (let i = 0; i < 4; i++) {
      const rpm = (500 + (rt.rng() - 0.5) * 200).toFixed(0);
      screen.textRow(0, 2 + i, screen.cols, `${names[i]} rpm: ${rpm}`, COLORS.BLACK, COLORS.WHITE);
    }
  },

  attitude_table(screen, rt) {
    screen.textRow(0, 0, screen.cols, 'ATTITUDE GET', COLORS.BLUE, COLORS.WHITE);
    screen.textRow(0, 2, screen.cols, 'world_x: 0.12', COLORS.BLACK, COLORS.WHITE);
    screen.textRow(0, 3, screen.cols, 'world_y: 0.05', COLORS.BLACK, COLORS.WHITE);
    screen.textRow(0, 4, screen.cols, 'yaw    : 0.00', COLORS.BLACK, COLORS.WHITE);
    screen.textRow(0, 5, screen.cols, 'ac_type: a_left', COLORS.BLACK, COLORS.WHITE);
    screen.textRow(0, 6, screen.cols, 'total  : 1', COLORS.BLACK, COLORS.WHITE);
  },

  perspective_grid(screen, rt) {
    drawFakeCameraFrame(screen, rt);
    // draw a perspective grid overlay
    const { ctx, w, h } = screen;
    ctx.fillStyle = '#0000ff';
    for (let i = 0; i <= 4; i++) {
      const y = Math.floor(h * (0.5 + i * 0.1));
      ctx.fillRect(0, y, w, 1);
    }
    for (let i = -2; i <= 2; i++) {
      const x = Math.floor(w * 0.5 + i * (w * 0.08));
      ctx.fillRect(x, Math.floor(h * 0.5), 1, Math.floor(h * 0.5));
    }
    screen.textRow(0, 0, screen.cols, 'PERSPECTIVE GRID', COLORS.RED, COLORS.WHITE);
  },

  perspective_take(screen, rt) {
    drawFakeCameraFrame(screen, rt);
    screen.textRow(0, 0, screen.cols, 'TAKE PHOTO', COLORS.RED, COLORS.WHITE);
    screen.textRow(0, 1, screen.cols, 'press R to capture', COLORS.BLACK, COLORS.WHITE);
  },

  photo(screen, rt) {
    drawFakeCameraFrame(screen, rt);
    screen.textRow(0, 0, screen.cols, 'TAKING PHOTOS', COLORS.RED, COLORS.WHITE);
    const count = Math.floor((Date.now() - rt.startedAt) / 250) + 1;
    screen.textRow(0, 1, screen.cols, `saved: ${count}/30`, COLORS.BLACK, COLORS.WHITE);
  },

  yolo_proxy(screen, rt) {
    screen.textRow(0, 0, screen.cols, 'YOLO TEST', COLORS.BLUE, COLORS.WHITE);
    screen.textRow(0, 2, screen.cols, '> OpenArt', COLORS.BLACK, COLORS.WHITE);
    screen.textRow(0, 3, screen.cols, 'CMD 0x01 sent', COLORS.RED, COLORS.WHITE);
    screen.textRow(0, 4, screen.cols, 'check 屏 3', COLORS.BLACK, COLORS.WHITE);
  },

  classify_proxy(screen, rt) {
    screen.textRow(0, 0, screen.cols, 'CLASSIFY TEST', COLORS.BLUE, COLORS.WHITE);
    screen.textRow(0, 2, screen.cols, '> OpenArt', COLORS.BLACK, COLORS.WHITE);
    screen.textRow(0, 3, screen.cols, 'CMD 0x02 sent', COLORS.RED, COLORS.WHITE);
    screen.textRow(0, 4, screen.cols, 'check 屏 3', COLORS.BLACK, COLORS.WHITE);
  },

  tgt_info(screen, rt) {
    screen.textRow(0, 0, screen.cols, 'imgDealing TGT', COLORS.BLUE, COLORS.WHITE);
    const labels = ['TGTn', 'T-cx', 'T-cy', 'T-ag', 'dist', 'trkF', 'cenD', 'notF', 'face', 'zone'];
    for (let i = 0; i < Math.min(labels.length, screen.rows - 2); i++) {
      const v = (rt.rng() * 100).toFixed(0);
      screen.textRow(0, 1 + i, screen.cols, `${labels[i]}: ${v}`, COLORS.BLACK, COLORS.WHITE);
    }
  },

  lateral_tracking(screen, rt) {
    screen.textRow(0, 0, screen.cols, 'Lateral Tracking', COLORS.BLUE, COLORS.WHITE);
    const labels = ['STST', 'STED', 'TKDF', 'TKDV', 'TKAB', 'Loss', 'CenX', 'CenY', 'R', 'STRG'];
    for (let i = 0; i < Math.min(labels.length, screen.rows - 2); i++) {
      const v = (rt.rng() * 100).toFixed(0);
      screen.textRow(0, 1 + i, screen.cols, `${labels[i]}: ${v}`, COLORS.BLACK, COLORS.WHITE);
    }
  },

  thresh_lab(screen, rt) {
    screen.textRow(0, 0, screen.cols, 'LAB THRESHOLD', COLORS.BLUE, COLORS.WHITE);
    const labels = ['blueTh', 'whiteTh'];
    let row = 2;
    for (const name of labels) {
      screen.textRow(0, row++, screen.cols, `[${name}]`, COLORS.RED, COLORS.WHITE);
      screen.textRow(0, row++, screen.cols, ` L 0-100  A 0-128  B 0-128`, COLORS.BLACK, COLORS.WHITE);
    }
  },

  thresh_hsv(screen, rt) {
    screen.textRow(0, 0, screen.cols, 'HSV THRESHOLD', COLORS.BLUE, COLORS.WHITE);
    const layers = ['HSVBlue', 'HSVWhite', 'HSVTest'];
    let row = 2;
    for (const name of layers) {
      screen.textRow(0, row++, screen.cols, `[${name}]`, COLORS.RED, COLORS.WHITE);
      screen.textRow(0, row++, screen.cols, ` H 0-179 S 0-255 V 0-255`, COLORS.BLACK, COLORS.WHITE);
    }
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function drawFakeCameraFrame(screen, rt) {
  // Try a real frame first (deterministic per runtime by fnName)
  const img = pickFrame(rt?.fnName || 'camera');
  if (img) {
    screen.drawImage(img, 0, 0, screen.w, screen.h);
    return;
  }
  // Fallback procedural frame if real frames aren't loaded yet
  const { ctx, w, h } = screen;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#bbbbbb');
  grad.addColorStop(1, '#777777');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#ffffff';
  for (let y = Math.floor(h * 0.4); y < h; y++) {
    const t = (y - h * 0.4) / (h * 0.6);
    const lx = Math.floor(w * 0.5 - t * w * 0.45);
    const rx = Math.floor(w * 0.5 + t * w * 0.45);
    ctx.fillRect(lx, y, 2, 1);
    ctx.fillRect(rx, y, 2, 1);
  }
}

// Cheap deterministic RNG seeded by the runtime function name so the same page
// has a consistent fingerprint per session.
function makeRng(seedStr) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let state = h >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0xFFFFFFFF;
  };
}
