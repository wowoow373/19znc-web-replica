// Real camera-frame loader. Reads assets/sample_frames/*.jpg (extracted from
// img_yolo/raw/) into HTMLImageElement objects so other modules can draw them
// directly via Screen.drawImage. Each frame is the native 160×120 from the
// MT9V03X camera; canvases that draw it are upscaled to fill.

const FRAME_FILES = [
  '08_20_15_35_11_p20.jpg',
  '08_20_15_43_53_p30.jpg',
  '08_20_15_49_35_p40.jpg',
  '08_20_16_05_59_p20.jpg',
  '08_20_16_17_11_p30.jpg',
  '08_20_16_25_23_p15.jpg',
  '08_20_16_33_26_p25.jpg',
  '08_20_16_37_27_p35.jpg',
];

let FRAMES = [];

export async function loadFrames(base = 'assets/sample_frames/') {
  const imgs = await Promise.all(FRAME_FILES.map((name) => loadOne(base + name)));
  FRAMES = imgs.filter(Boolean);
  return FRAMES;
}

function loadOne(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      console.warn('frame load failed:', url);
      resolve(null);
    };
    img.src = url;
  });
}

// Deterministic pick using a key string so the same runtime always shows the
// same frame; pass {animate:true} to cycle frames over time.
export function pickFrame(key = '', tickMs = null) {
  if (!FRAMES.length) return null;
  if (tickMs !== null) {
    const i = Math.floor(tickMs / 600) % FRAMES.length;
    return FRAMES[i];
  }
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const idx = (h >>> 0) % FRAMES.length;
  return FRAMES[idx];
}

export function getFrames() {
  return FRAMES;
}
