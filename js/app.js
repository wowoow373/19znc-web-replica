// Entry point. Loads assets, instantiates the three screens, runs boot
// sequences, wires the menu engine + virtual buttons + UART bus, and starts
// the render/tick loop.
//
// New (rev 2): also wires the RESET button (re-runs the whole boot+menu
// pipeline + resets persisted params) and the 发车 (launch) flow that triggers
// when L is pressed at the root of car3.0's menu — mirroring the firmware's
// `Menu_Process → begin_all() → run_TMD()` transition.

import { loadFont, COLORS } from './font.js';
import { Screen } from './screen.js';
import * as State from './state.js';
import {
  bindButtons, onKey, injectKey, setKcaGetter, setLongPressEnterHandler,
} from './keys.js';
import {
  makeBootCtx, bootCar3, bootMcx, bootOpenart,
} from './boot.js';
import {
  createMenuState, onKey as menuOnKey, tick as menuTick, render as menuRender,
  makeSubTitleFmt, subNameCat,
} from './menu_engine.js';
import {
  loadRuntimeSpecs, createRuntime, disposeRuntime, tickRuntime, renderRuntime,
} from './runtime_screens.js';
import { initOpenart } from './openart.js';
import { onKeyForward, emitOpenartCmd } from './uart_bus.js';
import { loadFrames } from './frames.js';
import { drawRaceCar3, drawRaceMcx } from './race.js';

const CAR3_SUBMENUS = [
  'pidparam_change', 'MCX_pidparam_change', 'servoparam_change',
  'servo_test_step_by_step', 'motor_test', 'motortest_all',
  'SDtest_car3', 'SDparam_car3', 'perspectiveMatrix', 'uart_test',
  'a_c_LR_info_para', 'a_c_ture_info_para', 'taking_photo_sd',
  'a_c_attitude_get_st', 'a_c_attitude_get', 'end_put_attitude_get',
  'speed_change', 'th_change', 'ramp_change',
];
const MCX_SUBMENUS = ['ParamAdjust', 'SD_test_Table'];

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ${url}: ${r.status}`);
  return r.json();
}

async function main() {
  // 1. Load font, runtime specs, menu data, submenus, frames in parallel.
  const [, , , menuCar3, menuMcx, enums, car3Subs, mcxSubs] = await Promise.all([
    loadFont(),
    loadRuntimeSpecs(),
    loadFrames(),
    fetchJson('data/menu_car3.json'),
    fetchJson('data/menu_mcx.json'),
    fetchJson('data/enums.json'),
    Promise.all(CAR3_SUBMENUS.map((n) => fetchJson(`data/submenus_car3/${n}.json`)
      .then((j) => [n, j]))),
    Promise.all(MCX_SUBMENUS.map((n) => fetchJson(`data/submenus_mcx/${n}.json`)
      .then((j) => [n, j]))),
  ]);

  const submenuTable = new Map([
    ...car3Subs,
    ...mcxSubs,
  ]);

  // 2. Build default param values from all menu trees so localStorage merges
  // cleanly even if menu items were added since last visit.
  const defaults = {};
  collectDefaults(menuCar3, defaults, enums);
  collectDefaults(menuMcx, defaults, enums);
  for (const [, sub] of submenuTable) collectDefaults(sub, defaults, enums);
  State.registerDefaults(defaults);
  State.load();

  // 3. Set up Screen wrappers for each canvas.
  const car3Screen = new Screen(document.getElementById('canvas-car3'),    { cols: 20, rows: 8 });
  const mcxScreen  = new Screen(document.getElementById('canvas-mcx'),     { cols: 40, rows: 15 });
  const openartScreen = new Screen(document.getElementById('canvas-openart'), { cols: 40, rows: 15 });

  // 4. Per-controller specs. Titles use the firmware's SubNameCat() so MCX
  // titles render as the 20-char decoration centered on a 40-col row (rest of
  // row 0 stays blank — the C buffer is zero-padded past 20 chars and the
  // string draw stops at the first '\0'). See menu_engine.js subNameCat.
  const CAR3_DECO = ' :(              ): ';
  const MCX_DECO  = ' :)              ): ';
  const car3Spec = {
    cols: 20, rows: 8, dispNum: 7, paramCol: 11, nameLen: 11, enumNameLen: 8,
    titleRoot: subNameCat('Setting', CAR3_DECO, 20),
    titleSubFmt: makeSubTitleFmt(20, CAR3_DECO),
  };
  const mcxSpec = {
    cols: 40, rows: 15, dispNum: 10, paramCol: 20, nameLen: 11, enumNameLen: 8,
    titleRoot: subNameCat('Setting', MCX_DECO, 40),
    titleSubFmt: makeSubTitleFmt(40, MCX_DECO),
  };

  // 5. Init OpenArt (subscribes to bus + manual CMD select).
  initOpenart(openartScreen);

  // Shared race-mode flag (set by car3 L-on-root, cleared by car3 RESET or
  // closing the race strip). When true, the render loop draws drawRaceCar3 /
  // drawRaceMcx instead of the menu.
  let racing = false;

  // 6. Create menu states first so reset can recreate them.
  let car3MenuState;
  let mcxMenuState;
  let car3Runtime = null;
  let mcxRuntime  = null;
  let needsRender = { car3: true, mcx: true };

  function freshMenuStates() {
    car3MenuState = createMenuState(menuCar3, car3Spec);
    mcxMenuState  = createMenuState(menuMcx, mcxSpec);
    car3Runtime = null;
    mcxRuntime  = null;
    needsRender.car3 = true;
    needsRender.mcx  = true;
  }
  freshMenuStates();

  // 7. Menu ctx (resolver, state, function lifecycle, launch hook).
  function makeCtx(getRuntime, setRuntime, onLaunchOpt) {
    return {
      resolveSubmenu(name) {
        return submenuTable.get(name) || null;
      },
      getParam(key) { return State.get(key); },
      setParam(key, value) {
        State.set(key, value);
        // KCA is the only param with a side-effect on the UI (status pill +
        // routing). Refresh the indicator immediately so adjust-mode shows
        // the live value, not the saved one.
        if (key === 'KCA') updateKcaIndicator();
      },
      saveParams() { State.save(); },
      getEnum(name) { return enums[name] || []; },
      onFunctionStart(fnName, displayName) {
        setRuntime(createRuntime(fnName, displayName));
      },
      onFunctionStop(fnName) {
        disposeRuntime(getRuntime());
        setRuntime(null);
      },
      renderRuntime(screen, runtimeState) {
        renderRuntime(screen, getRuntime());
      },
      runtimeExitKey() { return 'L'; },
      onLaunch: onLaunchOpt,
    };
  }

  const car3Ctx = makeCtx(
    () => car3Runtime,
    (rt) => { car3Runtime = rt; },
    onCar3Launch,
  );
  const mcxCtx  = makeCtx(
    () => mcxRuntime,
    (rt) => { mcxRuntime = rt; },
    // MCX L-on-root mirrors car3: also launches. The firmware does the same
    // in begin_all() — car3 sends KEY_L over UART to MCX.
    onCar3Launch,
  );

  // 8. Wire keys.
  onKey('car3', (key, sw) => {
    if (racing) {
      // While racing, L returns to the menu (firmware: KEY_L pressed during
      // run also breaks out via stop conditions). Other keys are ignored.
      if (key === 'L') stopRace();
      return;
    }
    menuOnKey(car3MenuState, key, sw, car3Spec, car3Ctx);
    needsRender.car3 = true;
  });
  onKey('mcx', (key, sw) => {
    if (racing) {
      if (key === 'L') stopRace();
      return;
    }
    menuOnKey(mcxMenuState, key, sw, mcxSpec, mcxCtx);
    needsRender.mcx = true;
  });

  // Key forwarding from car3 to MCX over the bus.
  onKeyForward(({ key, sw1, sw2 }) => {
    injectKey('mcx', key, { sw1, sw2 });
  });

  // 9. Bind virtual buttons + KCA + skip + keyboard + RESET.
  bindButtons({
    onSkip(screenId) {
      if (screenId === 'car3') car3Boot.skip();
      else if (screenId === 'mcx') mcxBoot.skip();
    },
    onReset(screenId) {
      // car3.0 is the only board with a Reset button on the panel (the others
      // would be peer-reset by car3 over UART in real life). We re-run the
      // whole boot+wipe pipeline for every screen.
      hardReset();
    },
  });

  // Wire KCA (key-routing) — the source of truth is the car3 menu's KEY_CHANGE
  // param. keys.js looks this up on every click so changes are reflected
  // immediately. Long-press Enter on car3 forces it back to locality (firmware
  // safety: holding Enter pulls control back to car3.0).
  const KCA_NAMES = enums.key_control || ['locality', 'deviation', 'detection'];
  function currentKcaName() {
    return KCA_NAMES[(State.get('KCA') | 0) % KCA_NAMES.length] || 'locality';
  }
  setKcaGetter(currentKcaName);
  setLongPressEnterHandler(() => {
    State.set('KCA', 0); // locality
    State.save();
    updateKcaIndicator();
    // Flash an indicator on car3 so the user sees it happened
    if (car3MenuState && car3MenuState.mode === 'menu') {
      car3MenuState.flash = { text: 'KCA->loc', untilTs: Date.now() + 500 };
      needsRender.car3 = true;
    }
  });

  // KCA status pill (the only UI surface for the value; the user changes it
  // through the KEY_CHANGE menu item). Updated whenever ctx.setParam writes
  // the 'KCA' key — see makeCtx below.
  function updateKcaIndicator() {
    const v = currentKcaName();
    const el = document.querySelector('[data-kca-status]');
    if (el) el.textContent = v;
    const hint = document.getElementById('mcx-link-hint');
    if (hint) {
      if (v === 'locality') {
        hint.textContent = `等待 car3.0 转发的按键…  (当前 KCA=${v}，未转发)`;
        hint.style.color = '#6a6a75';
      } else {
        hint.textContent = `▶ car3.0 按键已转发到 MCX (KCA=${v})`;
        hint.style.color = '#6080ff';
      }
    }
  }
  updateKcaIndicator();

  // ----- Launch flow -----
  function onCar3Launch() {
    if (racing) return;
    racing = true;
    // Clean up any open function/runtime page on either screen
    if (car3Runtime) { disposeRuntime(car3Runtime); car3Runtime = null; }
    if (mcxRuntime)  { disposeRuntime(mcxRuntime);  mcxRuntime  = null; }
    car3MenuState.mode = 'menu';
    mcxMenuState.mode  = 'menu';
    car3MenuState.flash = null;
    mcxMenuState.flash  = null;

    // OpenArt enters target_classification (firmware: begin_all path drives
    // 0x01 via the detection_uart UART)
    emitOpenartCmd({ cmd: 0x01 });

    // Show race video below the three screens and try to autoplay (browsers
    // may require user gesture — the L click counts as a gesture, so this
    // generally works).
    const strip = document.getElementById('race-strip');
    const video = document.getElementById('race-video');
    if (strip) strip.hidden = false;
    if (video) {
      video.currentTime = 0;
      const p = video.play();
      if (p?.catch) p.catch(() => { /* autoplay blocked; user can click play */ });
    }
  }

  function stopRace() {
    if (!racing) return;
    racing = false;
    emitOpenartCmd({ cmd: 0xff });
    const strip = document.getElementById('race-strip');
    const video = document.getElementById('race-video');
    if (video) video.pause();
    if (strip) strip.hidden = true;
    needsRender.car3 = true;
    needsRender.mcx  = true;
  }

  // ----- Reset flow -----
  function hardReset() {
    stopRace();
    // Skip any boot animation that's still mid-play so the previous Promise
    // resolves and stops drawing before we kick off a new one on the same
    // canvas.
    car3Boot?.skip?.();
    mcxBoot?.skip?.();
    State.resetToDefaults();
    freshMenuStates();
    // Don't let the menu render loop overdraw the boot animation. The boot
    // functions themselves call screen.clear() first, so this also doubles as
    // an instant "blank the screens" the moment the user hits RESET.
    booting = true;
    car3Screen.clear(COLORS.WHITE);
    mcxScreen.clear(COLORS.WHITE);
    openartScreen.clear(COLORS.WHITE);
    // Re-run boot animations on all three screens.
    car3Boot = makeBootCtx();
    mcxBoot  = makeBootCtx();
    const openartBoot = makeBootCtx();
    Promise.all([
      bootCar3(car3Screen, car3Boot),
      bootMcx(mcxScreen, mcxBoot),
      bootOpenart(openartScreen, openartBoot),
    ]).then(() => {
      booting = false;
      needsRender.car3 = true;
      needsRender.mcx  = true;
    });
  }

  // 10. Boot sequences (parallel) — show boot animation while ready everything else.
  let booting = true;
  let car3Boot = makeBootCtx();
  let mcxBoot = makeBootCtx();
  const openartBoot = makeBootCtx();
  await Promise.all([
    bootCar3(car3Screen, car3Boot),
    bootMcx(mcxScreen, mcxBoot),
    bootOpenart(openartScreen, openartBoot),
  ]);
  booting = false;

  // 11. Race-strip close button (returns to menu — same as L during race).
  const raceClose = document.querySelector('[data-race-close]');
  if (raceClose) raceClose.addEventListener('click', () => stopRace());

  // 12. Render loop (50ms ≈ 20 fps; plenty for the tiny canvases).
  setInterval(() => {
    if (booting) return;
    if (racing) {
      drawRaceCar3(car3Screen, Date.now());
      drawRaceMcx(mcxScreen, Date.now());
      return;
    }
    // tick() returns true if a flash just expired — we need to re-render to
    // remove the "success" overlay it left on the canvas.
    if (menuTick(car3MenuState)) needsRender.car3 = true;
    if (menuTick(mcxMenuState))  needsRender.mcx  = true;
    tickRuntime(car3Runtime);
    tickRuntime(mcxRuntime);

    const car3LiveDraw = car3MenuState.mode === 'runtime' || car3MenuState.mode === 'adjust' || !!car3MenuState.flash;
    const mcxLiveDraw  = mcxMenuState.mode === 'runtime'  || mcxMenuState.mode === 'adjust'  || !!mcxMenuState.flash;

    if (needsRender.car3 || car3LiveDraw) {
      menuRender(car3Screen, car3MenuState, car3Spec, car3Ctx);
      needsRender.car3 = false;
    }
    if (needsRender.mcx || mcxLiveDraw) {
      menuRender(mcxScreen, mcxMenuState, mcxSpec, mcxCtx);
      needsRender.mcx = false;
    }
  }, 50);

  // 13. Initial render after boot.
  menuRender(car3Screen, car3MenuState, car3Spec, car3Ctx);
  menuRender(mcxScreen, mcxMenuState, mcxSpec, mcxCtx);
}

// Walk a menu table and add defaults for every param-or-info item.
function collectDefaults(table, dst, enums) {
  if (!table?.items) return;
  for (const item of table.items) {
    if (item.type !== 'param' && item.type !== 'info') continue;
    const p = item.param;
    if (!p?.key) continue;
    if (dst[p.key] !== undefined) continue;
    if (p.kind === 'float') dst[p.key] = 1.0;
    else if (p.kind === 'enum') dst[p.key] = 0;
    else if (p.kind === 'bool') dst[p.key] = 0;
    else if (typeof p.min === 'number') dst[p.key] = p.min;
    else dst[p.key] = 0;
  }
}

main().catch((e) => {
  console.error('Init failed:', e);
  const root = document.getElementById('root');
  if (root) {
    const el = document.createElement('pre');
    el.style.cssText = 'background:#400;color:#fff;padding:16px;white-space:pre-wrap;';
    el.textContent = `Init failed:\n${e.stack || e.message}`;
    root.prepend(el);
  }
});
