// Menu state machine + renderer. Mirrors the C engine in
// car3.0/project/code/menu.c and MCX1.0/project/user/menu.c.
//
// States: 'menu' (browsing) -> 'adjust' (param tuning) | 'runtime' (function
// page). The runtime page draws are delegated to runtime_screens.js via ctx.
// Param storage is delegated to state.js via ctx.
//
// Keys (menu mode):
//   U/D: cursor up/down (with cross-page navigation)
//   L  : pop submenu — at root invokes ctx.onLaunch() (the firmware's 发车)
//   R  : jump cursor to last item of the whole menu
//   E  : enter selected item — submenu / adjust / function
//
// Keys (adjust mode):
//   U  : value += step
//   D  : value -= step
//   R/E: save + flash "success" 500ms + exit
//   L  : reload (revert to backup) + exit
//
// Keys (runtime mode):
//   L  : exit back to menu (default; per-spec override possible)
//
// Step (from SW1/SW2): see stepFromSw() in keys.js.

import { COLORS } from './font.js';
import { stepFromSw } from './keys.js';

export function createMenuState(rootTable, spec) {
  return {
    mode: 'menu',
    stack: [makeFrame(rootTable, spec, /*isRoot=*/true)],
    adjust: null,
    runtime: null,
    flash: null,
  };
}

function makeFrame(table, spec, isRoot) {
  const title = isRoot ? spec.titleRoot : spec.titleSubFmt(table.title);
  return {
    table,
    title,
    cursor: 0,
    pageNo: 0,
    dispNum: spec.dispNum,
  };
}

function top(state) { return state.stack[state.stack.length - 1]; }

export function onKey(state, key, sw, spec, ctx) {
  if (state.mode === 'menu')    return onKeyMenu(state, key, sw, spec, ctx);
  if (state.mode === 'adjust')  return onKeyAdjust(state, key, sw, spec, ctx);
  if (state.mode === 'runtime') return onKeyRuntime(state, key, sw, spec, ctx);
}

function onKeyMenu(state, key, sw, spec, ctx) {
  const f = top(state);
  const items = f.table.items;
  const N = items.length;
  switch (key) {
    case 'U': {
      if (f.cursor > 0) {
        f.cursor--;
      } else if (f.pageNo > 0) {
        f.pageNo -= f.dispNum;
        const onPage = Math.min(f.dispNum, N - f.pageNo);
        f.cursor = onPage - 1;
      } else {
        // wrap to bottom (firmware actually clamps, but wrap is friendlier)
        const lastIdx = N - 1;
        f.pageNo = Math.floor(lastIdx / f.dispNum) * f.dispNum;
        f.cursor = lastIdx - f.pageNo;
      }
      return;
    }
    case 'D': {
      if (f.pageNo + f.cursor < N - 1) {
        if (f.cursor < f.dispNum - 1 && f.pageNo + f.cursor + 1 < N) {
          f.cursor++;
        } else {
          f.pageNo += f.dispNum;
          if (f.pageNo >= N) f.pageNo = 0;
          f.cursor = 0;
        }
      } else {
        // wrap to top
        f.pageNo = 0;
        f.cursor = 0;
      }
      return;
    }
    case 'R': {
      const last = N - 1;
      f.pageNo = Math.floor(last / f.dispNum) * f.dispNum;
      f.cursor = last - f.pageNo;
      return;
    }
    case 'L': {
      if (state.stack.length > 1) {
        state.stack.pop();
      } else {
        // At the root, L mirrors the firmware: Menu_Process loop sees
        // ExitMark=1, falls out into main()'s begin_all() → race loop.
        ctx.onLaunch?.();
      }
      return;
    }
    case 'Enter': {
      const idx = f.pageNo + f.cursor;
      const item = items[idx];
      if (!item) return;
      if (item.type === 'submenu') {
        const sub = ctx.resolveSubmenu(item.submenu);
        if (sub) state.stack.push(makeFrame(sub, spec, false));
        return;
      }
      if (item.type === 'param') {
        state.mode = 'adjust';
        state.adjust = {
          item,
          backup: ctx.getParam(item.param.key),
        };
        return;
      }
      if (item.type === 'function') {
        state.mode = 'runtime';
        state.runtime = { fnName: item.fn, name: item.name };
        ctx.onFunctionStart(item.fn, item.name);
        return;
      }
      if (item.type === 'info') {
        // info items don't react to Enter
        return;
      }
      return;
    }
  }
}

function onKeyAdjust(state, key, sw, spec, ctx) {
  const { item } = state.adjust;
  const step = stepFromSw(sw);
  switch (key) {
    case 'U': {
      adjustParam(item, +1, step, ctx);
      return;
    }
    case 'D': {
      adjustParam(item, -1, step, ctx);
      return;
    }
    case 'R':
    case 'Enter': {
      ctx.saveParams();
      flash(state, 'success', 500);
      state.mode = 'menu';
      state.adjust = null;
      return;
    }
    case 'L': {
      ctx.setParam(item.param.key, state.adjust.backup);
      state.mode = 'menu';
      state.adjust = null;
      return;
    }
  }
}

function onKeyRuntime(state, key, sw, spec, ctx) {
  // Runtime exit: default to L; spec may override via ctx.runtimeExitKey
  const exitKey = ctx.runtimeExitKey?.() || 'L';
  if (key === exitKey) {
    state.mode = 'menu';
    const fn = state.runtime?.fnName;
    state.runtime = null;
    ctx.onFunctionStop(fn);
  } else {
    // Forward other keys to the runtime, if it cares
    ctx.onRuntimeKey?.(key, sw);
  }
}

function adjustParam(item, sign, step, ctx) {
  const p = item.param;
  const key = p.key;
  if (p.kind === 'enum') {
    const enumArr = ctx.getEnum(p.enum);
    const len = enumArr.length;
    let v = (ctx.getParam(key) | 0) + sign;
    v = ((v % len) + len) % len;
    ctx.setParam(key, v);
    return;
  }
  let v = ctx.getParam(key);
  v = v + sign * step;
  if (p.kind === 'int' || p.kind === 'uint') v = Math.round(v);
  if (p.kind === 'uint' && v < 0) v = 0;
  if (typeof p.min === 'number' && v < p.min) v = p.min;
  if (typeof p.max === 'number' && v > p.max) v = p.max;
  ctx.setParam(key, v);
}

function flash(state, text, ms) {
  state.flash = { text, untilTs: Date.now() + ms };
}

// Call once per frame to expire flash messages.
export function tick(state) {
  if (state.flash && Date.now() >= state.flash.untilTs) state.flash = null;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export function render(screen, state, spec, ctx) {
  if (state.mode === 'runtime') {
    // Delegate to runtime_screens
    ctx.renderRuntime?.(screen, state.runtime);
    if (state.flash) drawFlash(screen, spec, state.flash.text);
    return;
  }
  renderMenu(screen, state, spec, ctx);
}

function renderMenu(screen, state, spec, ctx) {
  screen.clear(COLORS.WHITE);
  const f = top(state);
  // Row 0 title — full-width
  screen.textRow(0, 0, spec.cols, padOrCrop(f.title, spec.cols), COLORS.BLUE, COLORS.WHITE);

  const items = f.table.items;
  for (let i = 0; i < f.dispNum; i++) {
    const idx = f.pageNo + i;
    const row = i + 1;
    const item = items[idx];
    if (!item) {
      // blank row
      screen.textRow(0, row, spec.cols, '', COLORS.BLUE, COLORS.WHITE);
      continue;
    }
    // Name column: rows nameLen chars, inverted if cursor
    const isCursor = (i === f.cursor);
    const isAdjustingThis = (state.mode === 'adjust' && idx === (f.pageNo + f.cursor));
    const name = padOrCrop(item.name, spec.nameLen);
    screen.textRow(0, row, spec.nameLen, name, COLORS.BLUE, COLORS.WHITE, isCursor);
    // Param column
    const paramCol = spec.paramCol;
    if (item.type === 'param' || item.type === 'info') {
      const valueText = formatParamValue(item.param, ctx);
      const padded = padOrCrop(valueText, spec.enumNameLen);
      if (isAdjustingThis) {
        screen.textRow(paramCol, row, spec.enumNameLen, padded, COLORS.WHITE, COLORS.RED);
      } else {
        screen.textRow(paramCol, row, spec.enumNameLen, padded, COLORS.RED, COLORS.WHITE);
      }
    } else {
      // submenu / function: blank param area
      screen.textRow(paramCol, row, spec.enumNameLen, '', COLORS.BLUE, COLORS.WHITE);
    }
  }
  if (state.flash) drawFlash(screen, spec, state.flash.text);
}

function drawFlash(screen, spec, text) {
  // Overlay the text on the cursor row's param column to mirror the firmware:
  //   menu_show_string("success", Table_Name_Length, 0, site.row, Color, bkColor)
  // For simplicity we draw it at row = floor(dispNum/2) centered.
  const row = Math.floor(spec.dispNum / 2) + 1;
  const padded = padOrCrop(text, spec.cols);
  screen.textRow(0, row, spec.cols, padded, COLORS.WHITE, COLORS.RED);
}

function formatParamValue(param, ctx) {
  const v = ctx.getParam(param.key);
  switch (param.kind) {
    case 'enum': {
      const arr = ctx.getEnum(param.enum);
      const idx = ((v | 0) % arr.length + arr.length) % arr.length;
      return arr[idx];
    }
    case 'int':
    case 'uint':
      return String(Math.round(v));
    case 'float':
      return (typeof v === 'number') ? formatFloat(v) : '0.00';
    case 'bool':
      return v ? 'true' : 'false';
    default:
      return String(v);
  }
}

function formatFloat(v) {
  // Try to fit in 7 chars: sign + digits + dot + 2 decimals
  if (Math.abs(v) >= 100) return v.toFixed(1);
  if (Math.abs(v) >= 1) return v.toFixed(2);
  return v.toFixed(3);
}

function padOrCrop(s, width) {
  s = String(s ?? '');
  if (s.length >= width) return s.slice(0, width);
  return s + ' '.repeat(width - s.length);
}

// Helper for menu data: produce the sub-menu title decoration. Spec exposes
// titleSubFmt so we keep the formatting in one place per device.
export function makeSubTitleFmt(totalCols) {
  // " -=  <name>  =- "  centered. Pads with spaces on both sides.
  return (name) => {
    const max = totalCols;
    const decoLen = 8; // " -=  " + "  =- " == 5+5=10? Let's compute precisely:
    // " -=  ".length = 5, "  =- ".length = 5 → decoLen=10
    const left = ' -=  ';
    const right = '  =- ';
    const innerWidth = max - left.length - right.length;
    const namePadded = padCenter(name, innerWidth);
    return left + namePadded + right;
  };
}

function padCenter(s, w) {
  s = String(s ?? '');
  if (s.length >= w) return s.slice(0, w);
  const total = w - s.length;
  const l = Math.floor(total / 2);
  const r = total - l;
  return ' '.repeat(l) + s + ' '.repeat(r);
}
