// Virtual button dispatcher. Translates HTML button events into menu key
// events for the single physical d-pad (car3.0 only — MCX and OpenArt have
// no buttons in the real hardware; MCX receives keys forwarded over UART).
//
// car3.0's KCA routes its key presses:
//   locality  — keys drive car3.0 itself
//   deviation — keys are forwarded to MCX over the bus (emitKeyForward)
//   detection — keys are forwarded to MCX (firmware also CCs OpenArt; replica
//               only forwards to MCX for now)
//
// KCA is owned by the menu (the firmware's KEY_CHANGE parm_change item). We
// don't have a separate UI control for it — keys.js asks app.js for the
// current value via a getter set at startup.

import { emitKeyForward } from './uart_bus.js';

const screenState = {
  car3:    { sw1: false, sw2: false, handler: null },
  mcx:     {                          handler: null },
  openart: {                          handler: null },
};

// car3.0 KCA — externally provided so it stays in sync with the menu store.
let getKcaName = () => 'locality';
export function setKcaGetter(fn) { getKcaName = fn; }

// Long-press handler — fires after a held Enter on car3.0. The firmware uses
// this as a safety: while remote-controlling MCX, holding Enter pulls keys
// back to car3.0 (effectively KCA = locality).
let longPressEnterHandler = null;
export function setLongPressEnterHandler(fn) { longPressEnterHandler = fn; }
const LONG_PRESS_MS = 500;

export function getSw(screenId) {
  const s = screenState[screenId];
  return { sw1: !!s.sw1, sw2: !!s.sw2 };
}

export function onKey(screenId, handler) {
  screenState[screenId].handler = handler;
}

export function bindButtons({ onSkip, onReset }) {
  // Standard d-pad buttons (everything except Enter on car3, which gets
  // long-press semantics below).
  document.querySelectorAll('.dp[data-key]').forEach((btn) => {
    const screen = btn.dataset.screen;
    const key = btn.dataset.key;
    if (screen === 'car3' && key === 'Enter') {
      bindCar3EnterButton(btn);
    } else {
      btn.addEventListener('click', () => dispatch(screen, key));
    }
  });

  // SW1/SW2 toggles (car3 only — those are the physical hardware switches)
  document.querySelectorAll('input[type=checkbox][data-sw]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const [screen, swName] = cb.dataset.sw.split('-');
      const swKey = swName.toLowerCase(); // sw1 / sw2
      screenState[screen][swKey] = cb.checked;
      updateStepReadout(screen);
    });
  });

  // Skip-boot
  document.querySelectorAll('button.skip[data-skip]').forEach((btn) => {
    btn.addEventListener('click', () => onSkip?.(btn.dataset.skip));
  });

  // RESET (car3 only — its MCU is the master, hitting reset reboots all 3)
  document.querySelectorAll('button.reset[data-reset]').forEach((btn) => {
    btn.addEventListener('click', () => onReset?.(btn.dataset.reset));
  });

  // Init step readouts (only the screens that actually have SW UI)
  updateStepReadout('car3');

  // Keyboard fallback: arrows + Enter target car3 by default.
  window.addEventListener('keydown', (e) => {
    const target = document.activeElement;
    const screen = target?.closest?.('.screen')?.dataset?.screen || 'car3';
    const k = keyboardToKey(e.key);
    if (!k) return;
    e.preventDefault();
    dispatch(screen, k);
  });
}

// Wire mousedown/mouseup so a held Enter triggers the long-press handler
// (KCA → locality) instead of the normal click. A short press still
// dispatches Enter as usual.
function bindCar3EnterButton(btn) {
  let timer = null;

  const start = (e) => {
    e.preventDefault?.();
    timer = setTimeout(() => {
      timer = null;
      longPressEnterHandler?.();
    }, LONG_PRESS_MS);
  };
  const finish = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
      // Short press → normal click semantics
      dispatch('car3', 'Enter');
    }
    // Long press already fired and self-cleared the timer; nothing to do.
  };
  const cancel = () => {
    if (timer) { clearTimeout(timer); timer = null; }
  };

  btn.addEventListener('pointerdown', start);
  btn.addEventListener('pointerup',   finish);
  btn.addEventListener('pointerleave', cancel);
  btn.addEventListener('pointercancel', cancel);
}

function dispatch(screen, key) {
  // car3 KCA routing: any non-locality value forwards to MCX
  if (screen === 'car3' && getKcaName() !== 'locality') {
    emitKeyForward({
      key,
      sw1: !!screenState.car3.sw1,
      sw2: !!screenState.car3.sw2,
      down: true,
    });
    return;
  }
  const h = screenState[screen]?.handler;
  if (h) h(key, { sw1: !!screenState[screen].sw1, sw2: !!screenState[screen].sw2 });
}

function keyboardToKey(k) {
  switch (k) {
    case 'ArrowUp': return 'U';
    case 'ArrowDown': return 'D';
    case 'ArrowLeft': return 'L';
    case 'ArrowRight': return 'R';
    case 'Enter': case ' ': return 'Enter';
    default: return null;
  }
}

export function stepFromSw({ sw1, sw2 }) {
  // Mirror Menu_AdjustParam in firmware:
  //   !SW1 && !SW2 -> 0.1
  //   !SW1 &&  SW2 -> 1
  //    SW1 && !SW2 -> 10
  //    SW1 &&  SW2 -> 100
  if (!sw1 && !sw2) return 0.1;
  if (!sw1 &&  sw2) return 1;
  if ( sw1 && !sw2) return 10;
  return 100;
}

function updateStepReadout(screen) {
  const el = document.querySelector(`[data-step-readout="${screen}"]`);
  if (!el) return;
  const s = stepFromSw(getSw(screen));
  el.textContent = `step: ${s}`;
}

// Inject a key from the bus (used by MCX when KCA-forwarded keys arrive).
// The forwarded message carries car3's SW state so MCX uses the same step.
export function injectKey(screen, key, { sw1, sw2 }) {
  const h = screenState[screen]?.handler;
  if (h) h(key, { sw1, sw2 });
}
