// Param state store with localStorage persistence (mimics the firmware's
// flash sector save). Mirrors menu_engine's adjust-mode: only saves are
// triggered by R/Enter on a parm_change item; L reloads from store.

const STORAGE_KEY = 'znc-state-v1';

const store = {
  params: {}, // { key: number, ... }
  defaults: {}, // populated by registerDefaults()
};

export function registerDefaults(defs) {
  for (const [k, v] of Object.entries(defs)) {
    if (store.defaults[k] === undefined) store.defaults[k] = v;
    if (store.params[k] === undefined) store.params[k] = v;
  }
}

export function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw);
    if (obj && typeof obj === 'object') {
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'number' || typeof v === 'boolean') {
          store.params[k] = v;
        }
      }
    }
  } catch (e) {
    console.warn('state load failed:', e);
  }
}

export function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store.params));
  } catch (e) {
    console.warn('state save failed:', e);
  }
}

export function get(key) {
  if (store.params[key] === undefined) return store.defaults[key] ?? 0;
  return store.params[key];
}

export function set(key, value) {
  store.params[key] = value;
}

// Adjust a numeric param by step; respect optional min/max clamps.
export function adjust(key, step, { min, max } = {}) {
  let v = get(key) + step;
  if (min !== undefined && v < min) v = min;
  if (max !== undefined && v > max) v = max;
  set(key, v);
  return v;
}

export function reload() {
  load();
}

export function rawDump() {
  return { ...store.params };
}
