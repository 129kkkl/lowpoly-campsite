import * as THREE from 'three';
import { clamp, lerp, smoothRange } from '../core/math.js';

/**
 * 昼夜系统：白天 → 黄昏 → 夜晚 三段颜色轨道线性插值。
 * 天空、雾、主光、半球光、曝光、挂灯都挂在这条进度上。
 */

const PRESETS = {
  day: {
    skyTop: 0x2a76cb,
    skyBottom: 0xbcdcf0,
    disc: 0xfff6d8,
    fog: 0xc9e0f2,
    key: 0xfff1d4,
    keyI: 2.55,
    hemiSky: 0xcfe6ff,
    hemiGround: 0x6f8a4e,
    hemiI: 0.72,
    dir: new THREE.Vector3(-0.45, 0.72, 0.52).normalize(),
    exposure: 1.0,
    ambient: 0.16
  },
  dusk: {
    skyTop: 0x2b3f74,
    skyBottom: 0xefa35f,
    disc: 0xffb066,
    fog: 0xcf9370,
    key: 0xff9b52,
    keyI: 1.5,
    hemiSky: 0x9a92c4,
    hemiGround: 0x54432f,
    hemiI: 0.42,
    dir: new THREE.Vector3(-0.82, 0.16, 0.3).normalize(),
    exposure: 1.04,
    ambient: 0.1
  },
  night: {
    skyTop: 0x04080f,
    skyBottom: 0x142036,
    disc: 0xdce6ff,
    fog: 0x0b1524,
    key: 0x9db8ff,
    keyI: 0.62,
    hemiSky: 0x2a3d68,
    hemiGround: 0x0a1018,
    hemiI: 0.33,
    dir: new THREE.Vector3(-0.55, 0.3, -0.78).normalize(),
    exposure: 0.96,
    ambient: 0.06
  }
};

const KEY_DISTANCE = 62;
const DISC_DISTANCE = 300;

export function createDayNight({ scene, renderer, sky, campfire, camp, hemi, keyLight, ambient }) {
  const fog = new THREE.Fog(PRESETS.day.fog, 26, 178);
  scene.fog = fog;

  const state = {
    t: 0, // 0 白天 → 1 夜晚
    target: 0,
    night: 0
  };

  const cA = new THREE.Color();
  const cB = new THREE.Color();
  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const dir = new THREE.Vector3();

  function track(t) {
    const k = t < 0.5 ? t * 2 : (t - 0.5) * 2;
    return { a: t < 0.5 ? PRESETS.day : PRESETS.dusk, b: t < 0.5 ? PRESETS.dusk : PRESETS.night, k };
  }

  function apply() {
    const t = state.t;
    const { a, b, k } = track(t);

    // 天空
    sky.applyPhase(t, PRESETS);
    vA.copy(a.dir).multiplyScalar(KEY_DISTANCE);
    vB.copy(b.dir).multiplyScalar(KEY_DISTANCE);
    dir.copy(vA).lerp(vB, k);
    keyLight.position.copy(dir);
    keyLight.intensity = lerp(a.keyI, b.keyI, k);
    cA.setHex(a.key);
    cB.setHex(b.key);
    keyLight.color.copy(cA).lerp(cB, k);

    cA.setHex(a.hemiSky);
    cB.setHex(b.hemiSky);
    hemi.color.copy(cA).lerp(cB, k);
    cA.setHex(a.hemiGround);
    cB.setHex(b.hemiGround);
    hemi.groundColor.copy(cA).lerp(cB, k);
    hemi.intensity = lerp(a.hemiI, b.hemiI, k);
    ambient.intensity = lerp(a.ambient, b.ambient, k);

    cA.setHex(a.fog);
    cB.setHex(b.fog);
    fog.color.copy(cA).lerp(cB, k);

    renderer.toneMappingExposure = lerp(a.exposure, b.exposure, k);

    // 太阳 / 月亮圆盘跟随同一方向，方便观察
    vA.copy(a.dir).multiplyScalar(DISC_DISTANCE);
    vB.copy(b.dir).multiplyScalar(DISC_DISTANCE);
    dir.copy(vA).lerp(vB, k);
    sky.disc.position.copy(dir);
    sky.glow.position.copy(dir);
    sky.moonGlow.position.copy(dir);

    // 人工光源：入夜后才明显
    state.night = smoothRange(0.42, 0.92, t);
    camp.applyPhase(t, state.night);
    campfire.setNight(state.night);
  }

  apply();

  return {
    state,
    get isNight() {
      return state.target > 0.5;
    },
    setNight(v) {
      state.target = v ? 1 : 0;
    },
    toggle() {
      state.target = state.target > 0.5 ? 0 : 1;
      return state.isNight;
    },
    /** 手动设置进度（用于按钮立即跳转时的插值起点） */
    update(dt) {
      const next = state.t + (state.target - state.t) * (1 - Math.exp(-2.4 * dt));
      const changed = Math.abs(next - state.t) > 1e-5;
      state.t = clamp(next, 0, 1);
      if (changed) apply();
      return state.t;
    },
    apply
  };
}
