/**
 * 2D Perlin 噪声 + fbm，用于地形起伏、草地与天空分布。
 * 低多边形风格不需要复杂的物理模拟，可控的高度函数更重要。
 */
import { createRng } from './rng.js';

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;

function grad2(hash, x, y) {
  switch (hash & 3) {
    case 0: return x + y;
    case 1: return -x + y;
    case 2: return x - y;
    default: return -x - y;
  }
}

export function createNoise2D(seed = 1337) {
  const rng = createRng(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = p[i];
    p[i] = p[j];
    p[j] = tmp;
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  return function noise2D(x, y) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const X = xi & 255;
    const Y = yi & 255;
    const xf = x - xi;
    const yf = y - yi;
    const u = fade(xf);
    const v = fade(yf);

    const aa = perm[perm[X] + Y];
    const ab = perm[perm[X] + Y + 1];
    const ba = perm[perm[X + 1] + Y];
    const bb = perm[perm[X + 1] + Y + 1];

    const x1 = lerp(grad2(aa, xf, yf), grad2(ba, xf - 1, yf), u);
    const x2 = lerp(grad2(ab, xf, yf - 1), grad2(bb, xf - 1, yf - 1), u);
    return lerp(x1, x2, v); // 约 -1 .. 1
  };
}

export function createFbm(noise2D) {
  return function fbm(x, y, octaves = 4, lacunarity = 2.0, gain = 0.5) {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * noise2D(x * freq, y * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  };
}

/** 3D 值噪声（用于云朵 / 星星抖动） */
export function createNoise3D(seed = 7331) {
  const noise2D = createNoise2D(seed);
  return function noise3D(x, y, z) {
    // 两个 2D 噪声按 z 轴线性插值，够用且便宜
    const zi = Math.floor(z);
    const zf = fade(z - zi);
    const a = noise2D(x + zi * 17.3, y - zi * 9.1);
    const b = noise2D(x + (zi + 1) * 17.3, y - (zi + 1) * 9.1);
    return lerp(a, b, zf);
  };
}

export const smoothstep = (edge0, edge1, x) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};
