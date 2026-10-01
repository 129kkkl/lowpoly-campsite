import * as THREE from 'three';
import { createRng, randRange } from '../core/rng.js';
import { createRockGeometry, createRadialTexture, createFlameGeometry } from '../core/geo.js';
import { damp, clamp } from '../core/math.js';

/**
 * 篝火：石圈 + 炭化木柴 + 多层火焰 + 地面光晕 + 余烬 + 熄灭后的青烟 + 点光源。
 * `level` 是一个 0..1 的动画量，点燃/熄灭都走平滑过渡，光照随之同步强弱。
 */

const EMBER_COUNT = 80;
const SMOKE_COUNT = 18;

function flameWithGradient(bottom, top, middle) {
  const geo = createFlameGeometry(0.5, 0.02, 1, 7);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cBottom = new THREE.Color(bottom);
  const cTop = new THREE.Color(top);
  const cMid = new THREE.Color(middle);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) + 0.5; // 0..1
    if (y < 0.55) tmp.copy(cBottom).lerp(cMid, y / 0.55);
    else tmp.copy(cMid).lerp(cTop, (y - 0.55) / 0.45);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

export function createCampfire(terrain) {
  const group = new THREE.Group();
  group.name = 'campfire';
  group.position.set(0, terrain.campY, 0);
  const rng = createRng(31415);

  // ---------------------------------------------------------------- 灰烬底
  const ashMat = new THREE.MeshStandardMaterial({
    color: 0x2b2724,
    roughness: 1,
    metalness: 0,
    flatShading: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });
  const ash = new THREE.Mesh(new THREE.CircleGeometry(1.5, 18), ashMat);
  ash.rotation.x = -Math.PI / 2;
  ash.position.y = 0.012;
  ash.receiveShadow = true;
  group.add(ash);

  // ---------------------------------------------------------------- 石圈
  const ringGeo = createRockGeometry({ radius: 0.34, detail: 0, jitter: 0.3, squash: 0.8, seed: 91 });
  const ringMat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.95 });
  const RING = 10;
  const ring = new THREE.InstancedMesh(ringGeo, ringMat, RING);
  ring.castShadow = true;
  ring.receiveShadow = true;
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  for (let i = 0; i < RING; i++) {
    const a = (i / RING) * Math.PI * 2 + randRange(rng, -0.12, 0.12);
    const r = 1.32 + randRange(rng, -0.08, 0.1);
    const s = randRange(rng, 0.8, 1.25);
    dummy.position.set(Math.cos(a) * r, 0.12 * s, Math.sin(a) * r);
    dummy.rotation.set(randRange(rng, -0.3, 0.3), rng() * Math.PI, randRange(rng, -0.3, 0.3));
    dummy.scale.set(s * randRange(rng, 0.9, 1.2), s * randRange(rng, 0.8, 1.1), s * randRange(rng, 0.9, 1.2));
    dummy.updateMatrix();
    ring.setMatrixAt(i, dummy.matrix);
    ring.setColorAt(i, col.setHex(0xb0a89c).multiplyScalar(randRange(rng, 0.52, 0.78)));
  }
  ring.instanceMatrix.needsUpdate = true;
  if (ring.instanceColor) ring.instanceColor.needsUpdate = true;
  group.add(ring);

  // ---------------------------------------------------------------- 炭化木柴
  // 燃烧中的木头位于光源正下方，开启投影会在地面拉出难看的放射状硬影
  const charMat = new THREE.MeshStandardMaterial({
    color: 0x241b15,
    flatShading: true,
    roughness: 0.95,
    emissive: new THREE.Color(0xff5a12),
    emissiveIntensity: 0
  });
  const charGeo = new THREE.CylinderGeometry(0.075, 0.065, 0.95, 5);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.4;
    const log = new THREE.Mesh(charGeo, charMat);
    log.position.set(Math.cos(a) * 0.22, 0.36, Math.sin(a) * 0.22);
    log.rotation.set(Math.cos(a) * 0.55, -a, Math.sin(a) * 0.55);
    log.castShadow = false;
    group.add(log);
  }
  for (let i = 0; i < 2; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.08, 0.8, 5), charMat);
    log.rotation.set(Math.PI / 2, 0, i * 1.1);
    log.position.set(randRange(rng, -0.1, 0.1), 0.16 + i * 0.13, randRange(rng, -0.1, 0.1));
    log.castShadow = false;
    group.add(log);
  }

  // ---------------------------------------------------------------- 火焰
  const flames = [];
  const flameGeoOuter = flameWithGradient(0xff3c06, 0xff8a12, 0xff5c08);
  const flameGeoMid = flameWithGradient(0xff7a10, 0xffc24a, 0xffa020);
  const flameGeoCore = flameWithGradient(0xffcf62, 0xfff2c4, 0xffe08a);

  // 由外向内、更矮更亮；靠 toneMapping 做高光滚降，避免叠加爆白
  const FLAME_DEFS = [
    { geo: flameGeoOuter, w: 0.66, h: 1.15, x: 0, z: 0, s: 1, o: 0.62, sp: 1.0 },
    { geo: flameGeoOuter, w: 0.48, h: 0.88, x: 0.19, z: 0.11, s: 1, o: 0.5, sp: 1.35 },
    { geo: flameGeoOuter, w: 0.42, h: 0.72, x: -0.19, z: -0.1, s: 1, o: 0.44, sp: 1.6 },
    { geo: flameGeoMid, w: 0.3, h: 0.5, x: 0.04, z: -0.14, s: 1, o: 0.46, sp: 1.9 },
    { geo: flameGeoCore, w: 0.14, h: 0.24, x: -0.05, z: 0.05, s: 1, o: 0.5, sp: 2.4 }
  ];

  for (const def of FLAME_DEFS) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      // 交给 ACES 做高光滚降：叠加后仍然是暖色，而不是一片死白
      toneMapped: true,
      fog: false
    });
    const mesh = new THREE.Mesh(def.geo, mat);
    mesh.position.set(def.x, 0.18, def.z);
    mesh.renderOrder = 5;
    group.add(mesh);
    flames.push({
      mesh,
      mat,
      base: new THREE.Vector3(def.w * def.s, def.h * def.s, def.w * def.s),
      phase: rng() * Math.PI * 2,
      speed: def.sp,
      opacity: def.o,
      driftX: randRange(rng, -0.05, 0.05),
      driftZ: randRange(rng, -0.05, 0.05)
    });
  }

  // ---------------------------------------------------------------- 地面光晕
  const glowTex = createRadialTexture([
    [0.0, 'rgba(255,214,150,0.95)'],
    [0.22, 'rgba(255,150,60,0.55)'],
    [0.55, 'rgba(226,96,24,0.2)'],
    [1.0, 'rgba(160,60,10,0)']
  ]);
  const groundGlowMat = new THREE.MeshBasicMaterial({
    map: glowTex,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    fog: false
  });
  const groundGlow = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 6.4), groundGlowMat);
  groundGlow.rotation.x = -Math.PI / 2;
  groundGlow.position.y = 0.03;
  groundGlow.renderOrder = 2;
  group.add(groundGlow);

  // 火焰核心的体积光晕（sprite）
  const haloTex = createRadialTexture([
    [0.0, 'rgba(255,236,200,0.9)'],
    [0.35, 'rgba(255,150,60,0.32)'],
    [1.0, 'rgba(255,110,30,0)']
  ]);
  const haloMat = new THREE.SpriteMaterial({
    map: haloTex,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    fog: false
  });
  const halo = new THREE.Sprite(haloMat);
  halo.position.set(0, 0.85, 0);
  halo.scale.setScalar(4.2);
  halo.renderOrder = 6;
  group.add(halo);

  // ---------------------------------------------------------------- 火光
  const light = new THREE.PointLight(0xff7b2e, 0, 26, 2);
  light.position.set(0, 1.15, 0);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.camera.near = 0.3;
  light.shadow.camera.far = 24;
  light.shadow.bias = -0.0035;
  light.shadow.normalBias = 0.045;
  group.add(light);

  // 柔和的圆形粒子贴图：让余烬 / 烟是光斑而不是方块
  const softTex = createRadialTexture([
    [0.0, 'rgba(255,255,255,1)'],
    [0.35, 'rgba(255,255,255,0.55)'],
    [0.75, 'rgba(255,255,255,0.12)'],
    [1.0, 'rgba(255,255,255,0)']
  ]);

  // ---------------------------------------------------------------- 余烬
  const emberPos = new Float32Array(EMBER_COUNT * 3);
  const emberCol = new Float32Array(EMBER_COUNT * 3);
  const emberVel = new Float32Array(EMBER_COUNT * 3);
  const emberLife = new Float32Array(EMBER_COUNT);
  for (let i = 0; i < EMBER_COUNT; i++) respawnEmber(i, true);
  function respawnEmber(i, initial = false) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * 0.55;
    emberPos[i * 3] = Math.cos(a) * r;
    emberPos[i * 3 + 1] = initial ? rng() * 2.4 : randRange(rng, 0.2, 0.6);
    emberPos[i * 3 + 2] = Math.sin(a) * r;
    emberVel[i * 3] = randRange(rng, -0.22, 0.22);
    emberVel[i * 3 + 1] = randRange(rng, 0.9, 2.1);
    emberVel[i * 3 + 2] = randRange(rng, -0.22, 0.22);
    emberLife[i] = randRange(rng, 0.6, 2.4);
  }
  const emberGeo = new THREE.BufferGeometry();
  emberGeo.setAttribute('position', new THREE.BufferAttribute(emberPos, 3));
  emberGeo.setAttribute('color', new THREE.BufferAttribute(emberCol, 3));
  const emberMat = new THREE.PointsMaterial({
    map: softTex,
    size: 0.11,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    fog: false
  });
  const embers = new THREE.Points(emberGeo, emberMat);
  embers.renderOrder = 7;
  group.add(embers);

  // ---------------------------------------------------------------- 烟
  const smokePos = new Float32Array(SMOKE_COUNT * 3);
  const smokeCol = new Float32Array(SMOKE_COUNT * 3);
  const smokeVel = new Float32Array(SMOKE_COUNT * 3);
  const smokeLife = new Float32Array(SMOKE_COUNT);
  for (let i = 0; i < SMOKE_COUNT; i++) respawnSmoke(i, true);
  function respawnSmoke(i, initial = false) {
    smokePos[i * 3] = randRange(rng, -0.3, 0.3);
    smokePos[i * 3 + 1] = initial ? rng() * 3.2 : 0.15;
    smokePos[i * 3 + 2] = randRange(rng, -0.3, 0.3);
    smokeVel[i * 3] = randRange(rng, -0.1, 0.1);
    smokeVel[i * 3 + 1] = randRange(rng, 0.45, 0.85);
    smokeVel[i * 3 + 2] = randRange(rng, -0.1, 0.1);
    smokeLife[i] = randRange(rng, 1.6, 3.4);
  }
  const smokeGeo = new THREE.BufferGeometry();
  smokeGeo.setAttribute('position', new THREE.BufferAttribute(smokePos, 3));
  smokeGeo.setAttribute('color', new THREE.BufferAttribute(smokeCol, 3));
  const smokeMat = new THREE.PointsMaterial({
    map: softTex,
    size: 1.15,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    fog: false
  });
  const smoke = new THREE.Points(smokeGeo, smokeMat);
  smoke.renderOrder = 4;
  group.add(smoke);

  // ---------------------------------------------------------------- 状态
  const state = {
    lit: true,
    level: 1, // 0 熄灭 → 1 旺盛
    night: 0
  };

  let flicker = 1;
  let flickerTarget = 1;
  let flickTimer = 0;

  return {
    group,
    light,
    state,

    get lit() {
      return state.lit;
    },

    setLit(v) {
      state.lit = v;
    },

    toggle() {
      state.lit = !state.lit;
      return state.lit;
    },

    setNight(v) {
      state.night = v;
    },

    update(time, dt) {
      // 点燃/熄灭的平滑过渡
      state.level = damp(state.level, state.lit ? 1 : 0, 4.2, dt);
      const lv = state.level;
      const visible = lv > 0.015;

      // 火焰抖动：持续噪声 + 偶发爆闪
      flickTimer -= dt;
      if (flickTimer <= 0) {
        flickTimer = randRange(rng, 0.06, 0.22);
        flickerTarget = 0.82 + rng() * 0.36 + (rng() < 0.12 ? 0.22 : 0);
      }
      flicker = damp(flicker, flickerTarget, 12, dt);
      const breathe = 0.92 + 0.08 * Math.sin(time * 2.3) + 0.05 * Math.sin(time * 5.7);

      // 火焰
      for (let i = 0; i < flames.length; i++) {
        const f = flames[i];
        f.mesh.visible = visible;
        if (!visible) continue;
        const p = time * f.speed * 2.4 + f.phase;
        const sway = Math.sin(p) * 0.5 + 0.5;
        const s = f.base;
        f.mesh.scale.set(
          s.x * (0.84 + sway * 0.26) * (0.62 + lv * 0.55),
          s.y * (0.74 + lv * 0.46) * (0.88 + flicker * 0.18),
          s.z * (0.84 + sway * 0.26) * (0.62 + lv * 0.55)
        );
        f.mesh.rotation.y = time * 0.5 * f.speed + f.phase;
        // 圆锥几何以中心对齐，需要按当前高度把根部抬到火堆上
        f.mesh.position.set(
          f.mesh.position.x * 0.92 + f.driftX * sway * 0.06,
          0.12 + f.mesh.scale.y * 0.5,
          f.mesh.position.z * 0.92 + f.driftZ * sway * 0.06
        );
        f.mat.opacity = clamp(lv * f.opacity * flicker * breathe, 0, 1);
      }

      // 光晕
      groundGlow.visible = visible;
      groundGlowMat.opacity = lv * (0.24 + 0.14 * flicker) * (0.6 + state.night * 0.95);
      const glowScale = 1 + (1 - lv) * 0.5;
      groundGlow.scale.setScalar(glowScale);
      halo.visible = visible;
      haloMat.opacity = lv * (0.3 + 0.15 * flicker) * (0.62 + state.night * 0.6);
      halo.scale.setScalar(3.6 + flicker * 0.9 + lv * 0.6);

      // 炭木余温
      charMat.emissiveIntensity = lv * (0.5 + state.night * 0.55) * flicker;

      // 点光源：夜晚同一强度下更显眼，所以基准更高
      light.intensity = lv * flicker * (13 + state.night * 16);
      light.visible = lv > 0.02;

      // 余烬
      embers.visible = lv > 0.05;
      if (embers.visible) {
        for (let i = 0; i < EMBER_COUNT; i++) {
          emberLife[i] -= dt;
          if (emberLife[i] <= 0) respawnEmber(i);
          const i3 = i * 3;
          emberPos[i3] += emberVel[i3] * dt;
          emberPos[i3 + 1] += emberVel[i3 + 1] * dt * (0.5 + lv * 0.5);
          emberPos[i3 + 2] += emberVel[i3 + 2] * dt;
          emberVel[i3] += Math.sin(time * 2.2 + i) * dt * 0.25;
          emberVel[i3 + 2] += Math.cos(time * 1.9 + i) * dt * 0.25;
          const t = clamp(emberLife[i] / 2.2, 0, 1);
          const heat = t * t * lv * flicker;
          emberCol[i3] = 1.0 * heat;
          emberCol[i3 + 1] = (0.28 + 0.42 * t) * heat;
          emberCol[i3 + 2] = (0.05 + 0.22 * t) * heat;
        }
        emberGeo.attributes.position.needsUpdate = true;
        emberGeo.attributes.color.needsUpdate = true;
      }

      // 烟：熄灭后明显，燃烧时只有淡淡一缕
      const smokeStrength = clamp(1.05 - lv * 1.05, 0, 1);
      smoke.visible = smokeStrength > 0.02;
      smokeMat.opacity = 0.26 * smokeStrength;
      if (smoke.visible) {
        for (let i = 0; i < SMOKE_COUNT; i++) {
          smokeLife[i] -= dt;
          if (smokeLife[i] <= 0) respawnSmoke(i);
          const i3 = i * 3;
          smokePos[i3] += smokeVel[i3] * dt;
          smokePos[i3 + 1] += smokeVel[i3 + 1] * dt;
          smokePos[i3 + 2] += smokeVel[i3 + 2] * dt;
          smokeVel[i3] += Math.sin(time * 0.8 + i * 1.7) * dt * 0.12;
          smokeVel[i3 + 2] += Math.cos(time * 0.7 + i * 1.3) * dt * 0.12;
          const t = clamp(smokeLife[i] / 3.2, 0, 1);
          const a = Math.sin(t * Math.PI) * 0.5;
          smokeCol[i3] = 0.5 * a * smokeStrength;
          smokeCol[i3 + 1] = 0.52 * a * smokeStrength;
          smokeCol[i3 + 2] = 0.56 * a * smokeStrength;
        }
        smokeGeo.attributes.position.needsUpdate = true;
        smokeGeo.attributes.color.needsUpdate = true;
      }
    }
  };
}
