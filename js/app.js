// Entry point. Loads assets, instantiates the three screens, runs boot
// sequences, wires the menu engine + virtual buttons + UART bus, and starts
// the render/tick loop.

import { loadFont, COLORS } from './font.js';
import { Screen } from './screen.js';
import * as State from './state.js';
import {
  bindButtons, onKey, injectKey,
} from './keys.js';
import {
  makeBootCtx, bootCar3, bootMcx, bootOpenart,
} from './boot.js';
import {
  createMenuState, onKey as menuOnKey, tick as menuTick, render as menuRender,
  makeSubTitleFmt,
} from './menu_engine.js';
import {
  loadRuntimeSpecs, createRuntime, disposeRuntime, tickRuntime, renderRuntime,
} from './runtime_screens.js';
import { initOpenart } from './openart.js';
import { onKeyForward } from './uart_bus.js';

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
  // 1. Load font, runtime specs, menu data, submenus in parallel.
  const [, , menuCar3, menuMcx, enums, car3Subs, mcxSubs] = await Promise.all([
    loadFont(),
    loadRuntimeSpecs(),
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

  // 4. Per-controller specs.
  const car3Spec = {
    cols: 20, rows: 8, dispNum: 7, paramCol: 11, nameLen: 11, enumNameLen: 8,
    titleRoot: ' :(   Setting    ): ',
    titleSubFmt: makeSubTitleFmt(20),
  };
  const mcxSpec = {
    cols: 40, rows: 15, dispNum: 10, paramCol: 20, nameLen: 11, enumNameLen: 8,
    titleRoot: ' :)              ): ',
    titleSubFmt: makeSubTitleFmt(40),
  };

  // 5. Init OpenArt (subscribes to bus + manual CMD select).
  initOpenart(openartScreen);

  // 6. Boot sequences (parallel) — show boot animation while ready everything else.
  const car3Boot = makeBootCtx();
  const mcxBoot = makeBootCtx();
  const openartBoot = makeBootCtx();
  await Promise.all([
    bootCar3(car3Screen, car3Boot),
    bootMcx(mcxScreen, mcxBoot),
    bootOpenart(openartScreen, openartBoot),
  ]);

  // 7. Create menu states.
  const car3MenuState = createMenuState(menuCar3, car3Spec);
  const mcxMenuState  = createMenuState(menuMcx, mcxSpec);

  // Per-screen runtime instance (set when entering a function-type item).
  let car3Runtime = null;
  let mcxRuntime = null;

  // 8. Menu ctx (resolver, state, function lifecycle).
  function makeCtx(screenId, menuState, getRuntime, setRuntime) {
    return {
      resolveSubmenu(name) {
        return submenuTable.get(name) || null;
      },
      getParam(key) { return State.get(key); },
      setParam(key, value) { State.set(key, value); },
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
    };
  }

  const car3Ctx = makeCtx('car3', car3MenuState, () => car3Runtime, (rt) => { car3Runtime = rt; });
  const mcxCtx  = makeCtx('mcx',  mcxMenuState,  () => mcxRuntime,  (rt) => { mcxRuntime = rt; });

  // 9. Wire keys.
  onKey('car3', (key, sw) => {
    menuOnKey(car3MenuState, key, sw, car3Spec, car3Ctx);
    needsRender.car3 = true;
  });
  onKey('mcx', (key, sw) => {
    menuOnKey(mcxMenuState, key, sw, mcxSpec, mcxCtx);
    needsRender.mcx = true;
  });

  // Key forwarding from car3 to MCX over the bus.
  onKeyForward(({ key, sw1, sw2 }) => {
    injectKey('mcx', key, { sw1, sw2 });
  });

  // 10. Bind virtual buttons + KCA + skip + keyboard.
  bindButtons({
    onSkip(screenId) {
      if (screenId === 'car3') car3Boot.skip();
      else if (screenId === 'mcx') mcxBoot.skip();
    },
  });

  // 11. Render loop (50ms ≈ 20 fps; plenty for the tiny canvases).
  const needsRender = { car3: true, mcx: true };
  setInterval(() => {
    menuTick(car3MenuState);
    menuTick(mcxMenuState);
    tickRuntime(car3Runtime);
    tickRuntime(mcxRuntime);

    // Always re-render when in runtime mode (to animate fake data) or when
    // adjusting (to refresh param value) or when flash is active.
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

  // 12. Initial render after boot.
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
