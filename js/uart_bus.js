// Cross-screen event bus. In the real hardware, car3.0 talks to MCX and
// OpenArt over UART; here we just dispatch events on a single EventTarget so
// each screen module can subscribe to the slice it cares about.

export const bus = new EventTarget();

// car3.0 forwards a key event to MCX when its KCA is set to "deviation".
// payload: { key: "U"|"D"|"L"|"R"|"Enter", sw1: bool, sw2: bool, down: bool }
export const EVT_KEY_FORWARD = 'key_forward';

// car3.0 changes OpenArt's mode by emitting a CMD byte.
// payload: { cmd: number (0x01..0x12, 0xff), label?: string }
export const EVT_OPENART_CMD = 'openart_cmd';

export function emitKeyForward(payload) {
  bus.dispatchEvent(new CustomEvent(EVT_KEY_FORWARD, { detail: payload }));
}

export function emitOpenartCmd(payload) {
  bus.dispatchEvent(new CustomEvent(EVT_OPENART_CMD, { detail: payload }));
}

export function onKeyForward(handler) {
  bus.addEventListener(EVT_KEY_FORWARD, (e) => handler(e.detail));
}

export function onOpenartCmd(handler) {
  bus.addEventListener(EVT_OPENART_CMD, (e) => handler(e.detail));
}
