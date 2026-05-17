// Virtual button dispatcher. Translates HTML button clicks into menu key
// events for each screen, and tracks SW1/SW2 + (car3 only) KCA routing.
//
// When car3's KCA is set to "deviation", the firmware diverts subsequent key
// presses to MCX over UART; we mirror that by emitting a key_forward event
// onto the bus instead of invoking the local key handler.

import { emitKeyForward } from './uart_bus.js';

const screenState = {
  car3:    { sw1: false, sw2: false, kca: 'locality', handler: null },
  mcx:     { sw1: false, sw2: false,                  handler: null },
  openart: {                                          handler: null },
};

export function getSw(screenId) {
  const s = screenState[screenId];
  return { sw1: !!s.sw1, sw2: !!s.sw2 };
}

export function getKca(screenId = 'car3') {
  return screenState[screenId]?.kca || 'locality';
}

export function onKey(screenId, handler) {
  screenState[screenId].handler = handler;
}

export function bindButtons({ onSkip, onReset }) {
  // d-pad buttons
  document.querySelectorAll('.dp[data-key]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const screen = btn.dataset.screen;
      const key = btn.dataset.key;
      dispatch(screen, key);
    });
  });

  // SW1/SW2 toggles
  document.querySelectorAll('input[type=checkbox][data-sw]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const [screen, swName] = cb.dataset.sw.split('-');
      const swKey = swName.toLowerCase(); // sw1 / sw2
      screenState[screen][swKey] = cb.checked;
      updateStepReadout(screen);
    });
  });

  // KCA select (car3 only)
  document.querySelectorAll('select[data-kca]').forEach((sel) => {
    sel.addEventListener('change', () => {
      const screen = sel.dataset.kca;
      screenState[screen].kca = sel.value;
      const hint = document.getElementById('mcx-link-hint');
      if (hint) {
        if (sel.value === 'deviation') {
          hint.textContent = `▶ car3.0 按键已转发到 MCX (KCA=${sel.value})`;
          hint.style.color = '#6080ff';
        } else {
          hint.textContent = `等待 car3.0 转发的按键…  (当前 KCA=${sel.value}，未转发)`;
          hint.style.color = '#6a6a75';
        }
      }
    });
    // Sync initial state
    sel.dispatchEvent(new Event('change'));
  });

  // Skip-boot
  document.querySelectorAll('button.skip[data-skip]').forEach((btn) => {
    btn.addEventListener('click', () => onSkip(btn.dataset.skip));
  });

  // RESET (car3 only — its MCU is the master, hitting reset reboots all 3)
  document.querySelectorAll('button.reset[data-reset]').forEach((btn) => {
    btn.addEventListener('click', () => onReset?.(btn.dataset.reset));
  });

  // Init step readouts
  updateStepReadout('car3');
  updateStepReadout('mcx');

  // Keyboard fallback: arrow keys + Enter target whichever screen owns focus.
  // For simplicity, route to car3 by default; users can click into the panel
  // to focus a different screen if needed (future improvement).
  window.addEventListener('keydown', (e) => {
    const target = document.activeElement;
    const screen = target?.closest?.('.screen')?.dataset?.screen || 'car3';
    const k = keyboardToKey(e.key);
    if (!k) return;
    e.preventDefault();
    dispatch(screen, k);
  });
}

function dispatch(screen, key) {
  // car3 KCA routing: deviation/detection → forward to MCX
  if (screen === 'car3' && screenState.car3.kca !== 'locality') {
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
export function injectKey(screen, key, { sw1, sw2 }) {
  const h = screenState[screen]?.handler;
  if (h) h(key, { sw1, sw2 });
}
