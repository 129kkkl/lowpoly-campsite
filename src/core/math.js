export const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : clamp((v - a) / (b - a), 0, 1));
export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/** 与帧率无关的指数逼近 */
export const damp = (current, target, lambda, dt) =>
  current + (target - current) * (1 - Math.exp(-lambda * dt));

/** 在 [a, b] 区间内做三次平滑插值 */
export function smoothRange(a, b, v) {
  const t = invLerp(a, b, v);
  return t * t * (3 - 2 * t);
}
