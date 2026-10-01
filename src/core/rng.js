/**
 * 确定性随机数工具：同一个 seed 永远生成同一片营地。
 */

/** mulberry32 —— 轻量、分布均匀、可复现 */
export function createRng(seed = 20260101) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 区间随机 */
export const randRange = (rng, min, max) => min + (max - min) * rng();

/** 整数随机 [min, max] */
export const randInt = (rng, min, max) => Math.floor(min + (max - min + 1) * rng()) | 0;

/** 从数组中随机取一个 */
export const pick = (rng, arr) => arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))];

/** 近似正态分布（Irwin–Hall），用于自然的尺寸/色差抖动 */
export function randBell(rng, min, max) {
  let s = 0;
  for (let i = 0; i < 3; i++) s += rng();
  s /= 3; // 0..1，中心密集
  return min + (max - min) * s;
}
