# 19ZNC Web Replica

A static web "回忆" page that recreates the on-screen UI of a smart-car
competition project's three controllers — **car3.0 (主控)**, **MCX1.0 (协控)**,
and **OpenArt (协控)** — purely from observable screen behavior.

Three canvases sit side by side, each backed by a small virtual button
panel. The car3.0 and MCX menus, parameter adjustments, sub-menus, and
debug pages are reproduced; OpenArt shows its `READY!` boot text and the
classification overlays it would draw in response to UART commands from
car3.0.

## Quick start

Open `index.html` directly in Chrome / Edge / Firefox. No build step.

The page expects to be served from a path where relative URLs to
`assets/`, `data/`, and `js/` resolve. Opening as a `file://` URL works in
most browsers; if your browser blocks `fetch()` from `file://`, run any
static HTTP server in this folder, e.g.:

```bash
python -m http.server 8080
# then visit http://localhost:8080
```

## Privacy / what's NOT in this repo

The original competition firmware at the parent directory
(`../car3.0/`, `../MCX1.0/`, `../OpenArt/`) is **intentionally outside this
git repository**. The team's competition source code cannot be public.

What IS in this repo:
- A pixel-perfect ASCII font extracted at build time from
  `../car3.0/libraries/zf_common/zf_common_font.c` (committed as
  `assets/font_8x16.json`).
- Menu structures hand-translated from the firmware's `MENU_TABLE` arrays
  into JSON. These are layout / label data, not executable firmware.
- A clean-room JavaScript reimplementation of the firmware's menu state
  machine and screen renderer.

Nothing in the original firmware (algorithms, PID code, image processing,
classification models, hardware glue) is reproduced.

## File layout

```
web-replica/
├─ index.html
├─ README.md
├─ .gitignore
├─ css/
│  ├─ layout.css          # CSS Grid 3-column page + button-panel styling
│  └─ screen.css          # canvas + image-rendering:pixelated, dpad layout
├─ js/
│  ├─ app.js              # entry: load assets, instantiate screens, render loop
│  ├─ font.js             # 8x16 bitmap renderer (consumes font_8x16.json)
│  ├─ screen.js           # Screen wrapper around <canvas>
│  ├─ state.js            # param store + localStorage persistence
│  ├─ keys.js             # virtual button dispatcher + SW1/SW2/KCA routing
│  ├─ uart_bus.js         # tiny EventTarget for inter-screen events
│  ├─ boot.js             # boot animations for each controller
│  ├─ menu_engine.js      # reducers + renderer for the C menu state machine
│  ├─ runtime_screens.js  # mock pages for "function"-type menu items
│  └─ openart.js          # OpenArt READY! + CMD-driven classification screen
├─ assets/
│  └─ font_8x16.json      # 95 glyphs × 16 bytes (extracted from firmware)
├─ data/
│  ├─ enums.json          # named enum tables (locate_mode, KCA, ...)
│  ├─ menu_car3.json      # car3.0 root menu (31 items)
│  ├─ menu_mcx.json       # MCX1.0 root menu (8 items)
│  ├─ runtime_specs.json  # per-function mock-screen specs
│  ├─ submenus_car3/      # 19 sub-menu JSONs (PID, motors, attitudes, ...)
│  └─ submenus_mcx/       # 2 sub-menu JSONs (ParamAdjust, SDtest)
└─ tools/
   └─ extract_font.mjs    # one-shot Node ESM script that produced font_8x16.json
```

## Architecture cheat sheet

- **Screens** are 1:1 sized canvases (160×128 for car3, 320×240 for MCX
  and OpenArt). CSS upscales them with `image-rendering: pixelated`.
- **Menu engine** is a pure state-machine + render function, identical for
  car3 and MCX. Per-controller differences (grid size, title decoration,
  param column) live in a `spec` object.
- **Param state** is a flat key → number dict persisted under
  `localStorage["znc-state-v1"]`. Pressing R / Enter while adjusting a
  param flushes to storage and flashes "success".
- **Inter-screen "UART"** is a single `EventTarget` (`js/uart_bus.js`).
  Two routes are wired:
  - When car3's `KCA` toggle is `deviation`, its key presses are
    forwarded to MCX over the bus.
  - When car3 enters `yoloTest` / `classifytest` / `takingPhotos`, an
    `openart_cmd` byte is emitted; OpenArt subscribes and re-renders.
- **Runtime screens** for `function`-type menu items (motor test, FPS
  display, PID curve, etc.) draw procedurally-generated fake data. No
  real telemetry, no real images — pure UI illusion.

## Keyboard fallback

The dpad buttons can also be driven from the keyboard:
- `↑ ↓ ← →` → U / D / L / R
- `Enter` or `Space` → confirm

The key is routed to whichever screen contains the currently-focused
element; click into a screen's panel first to target it.

## Regenerating the font

```bash
node tools/extract_font.mjs
```

This re-reads `../car3.0/libraries/zf_common/zf_common_font.c` and
overwrites `assets/font_8x16.json`. You only need to do this if the
firmware's font changes (it almost never does).

## License / ownership

The page is a UI recreation. The bitmap font in `assets/font_8x16.json`
originated in SeekFree's `zf_common_font.c` (GPLv3) and is included under
that license. The hand-translated menu JSONs describe label text and
layout only.
