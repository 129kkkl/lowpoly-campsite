import * as THREE from 'three';
import { createRng, randRange } from '../core/rng.js';
import {
  createTentGeometry,
  createRockGeometry,
  cylinderBetween
} from '../core/geo.js';

/**
 * 露营核心区：帐篷、围火原木、柴堆、收纳箱、树桩水杯、
 * 挂灯杆、彩旗、踏脚石、背包 —— 围篝火围成一个有生活感的圈子。
 */

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function addMesh(group, geo, mat, { pos = [0, 0, 0], rotY = 0, rotX = 0, cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(pos[0], pos[1], pos[2]);
  m.rotation.y = rotY;
  m.rotation.x = rotX;
  m.castShadow = cast;
  m.receiveShadow = receive;
  group.add(m);
  return m;
}

/** 横躺的圆木，两端露出浅色木芯 */
function makeLog(len, radius, mats) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.94, len, 7, 1), mats.bark);
  body.rotation.z = Math.PI / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  for (const s of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.99, radius * 0.93, 0.06, 7, 1), mats.wood);
    cap.rotation.z = Math.PI / 2;
    cap.position.x = s * (len / 2 + 0.02);
    cap.castShadow = true;
    g.add(cap);
  }
  return g;
}

export function createCamp(terrain) {
  const group = new THREE.Group();
  group.name = 'camp';
  const rng = createRng(5150);
  const { heightAt } = terrain;

  // ---------------------------------------------------------------- 材质
  const M = {
    canvas: new THREE.MeshStandardMaterial({
      color: 0xdd7638,
      flatShading: true,
      roughness: 0.95,
      metalness: 0,
      side: THREE.DoubleSide
    }),
    canvasDark: new THREE.MeshStandardMaterial({
      color: 0xb45a28,
      flatShading: true,
      roughness: 0.95,
      side: THREE.DoubleSide
    }),
    ground: new THREE.MeshStandardMaterial({ color: 0x3a332c, flatShading: true, roughness: 1 }),
    door: new THREE.MeshStandardMaterial({ color: 0x191b1f, flatShading: true, roughness: 1 }),
    pole: new THREE.MeshStandardMaterial({ color: 0x8a6a45, flatShading: true, roughness: 0.9 }),
    line: new THREE.MeshStandardMaterial({ color: 0xd8d2c4, flatShading: true, roughness: 0.8 }),
    bark: new THREE.MeshStandardMaterial({ color: 0x5d4430, flatShading: true, roughness: 1 }),
    wood: new THREE.MeshStandardMaterial({ color: 0xa5835c, flatShading: true, roughness: 0.95 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x3b4149, flatShading: true, roughness: 0.5, metalness: 0.65 }),
    cooler: new THREE.MeshStandardMaterial({ color: 0x2f5f8f, flatShading: true, roughness: 0.6 }),
    coolerLid: new THREE.MeshStandardMaterial({ color: 0xe4ebef, flatShading: true, roughness: 0.6 }),
    bag: new THREE.MeshStandardMaterial({ color: 0x2f6b52, flatShading: true, roughness: 0.9 }),
    bagStrap: new THREE.MeshStandardMaterial({ color: 0xd8703f, flatShading: true, roughness: 0.9 }),
    glass: new THREE.MeshStandardMaterial({
      color: 0xffd79a,
      emissive: new THREE.Color(0xffb257),
      emissiveIntensity: 0,
      flatShading: true,
      roughness: 0.3
    }),
    stone: new THREE.MeshStandardMaterial({ color: 0x8d9290, flatShading: true, roughness: 0.95 })
  };

  // ================================================================ 帐篷
  const TENT = { x: -4.6, z: -3.2, w: 2.5, l: 3.0, h: 1.85, rot: -2.1 };
  const tent = new THREE.Group();
  tent.position.set(TENT.x, heightAt(TENT.x, TENT.z), TENT.z);
  tent.rotation.y = TENT.rot;
  group.add(tent);

  const tentBody = new THREE.Mesh(createTentGeometry(TENT.w, TENT.l, TENT.h), M.canvas);
  tentBody.castShadow = true;
  tentBody.receiveShadow = true;
  tent.add(tentBody);

  // 门帘：一亮一暗两层，低多边形也很有层次
  const doorOuter = new THREE.Mesh(
    createTentGeometry(TENT.w * 0.62, 0.12, TENT.h * 0.82),
    M.canvasDark
  );
  doorOuter.position.set(0, 0, -TENT.l / 2 - 0.02);
  doorOuter.castShadow = false;
  tent.add(doorOuter);
  const doorHole = new THREE.Mesh(createTentGeometry(TENT.w * 0.4, 0.14, TENT.h * 0.62), M.door);
  doorHole.position.set(0, 0, -TENT.l / 2 - 0.09);
  tent.add(doorHole);

  // 地布 / 底边
  const skirt = new THREE.Mesh(createTentGeometry(TENT.w * 1.03, TENT.l * 1.01, 0.22), M.ground);
  skirt.position.y = -0.01;
  skirt.castShadow = true;
  skirt.receiveShadow = true;
  tent.add(skirt);

  // 脊杆（两端出头）
  const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, TENT.l + 0.75, 6), M.pole);
  ridge.rotation.x = Math.PI / 2;
  ridge.position.y = TENT.h + 0.01;
  ridge.castShadow = true;
  tent.add(ridge);
  // 前庭支撑杆
  const frontPole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, TENT.h + 0.1, 6), M.pole);
  frontPole.position.set(0, (TENT.h + 0.1) / 2, -TENT.l / 2 - 0.03);
  frontPole.castShadow = true;
  tent.add(frontPole);

  // 张力绳 + 地钉
  const guyAnchors = [
    [TENT.w / 2 + 0.05, TENT.h * 0.72, TENT.l / 2 - 0.1],
    [-TENT.w / 2 - 0.05, TENT.h * 0.72, TENT.l / 2 - 0.1]
  ];
  for (const [gx, gy, gz] of guyAnchors) {
    const top = V(gx, gy, gz);
    const out = V(gx * 1.75, 0.02, gz * 1.5);
    const rope = new THREE.Mesh(cylinderBetween(top, out, 0.012, 4), M.line);
    tent.add(rope);
    const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.012, 0.3, 4), M.metal);
    peg.position.set(out.x, 0.06, out.z);
    peg.rotation.z = 0.3;
    tent.add(peg);
  }

  // 门口露出的睡垫 / 背包
  const matRoll = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.62, 6), M.bagStrap);
  matRoll.rotation.x = Math.PI / 2;
  matRoll.position.set(0.12, 0.17, -TENT.l / 2 - 0.42);
  matRoll.castShadow = true;
  tent.add(matRoll);

  // ================================================================ 围火原木
  // 角度刻意避开默认机位与火堆之间的视线，避免遮挡火焰
  const SEAT_ANGLES = [0.087, 2.618, 4.363];
  SEAT_ANGLES.forEach((a, i) => {
    const r = 2.75 + randRange(rng, -0.15, 0.25);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const log = makeLog(1.75, 0.24, M);
    log.position.set(x, heightAt(x, z) + 0.22, z);
    log.rotation.y = -a + Math.PI / 2 + randRange(rng, -0.2, 0.2);
    group.add(log);
    // 支撑小木墩
    for (const s of [-1, 1]) {
      const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.24, 5), M.bark);
      stub.position.set(
        x + Math.cos(-a) * s * 0.5,
        heightAt(x, z) + 0.11,
        z + Math.sin(-a) * s * 0.5
      );
      stub.castShadow = true;
      stub.receiveShadow = true;
      group.add(stub);
    }
    if (i === 0) {
      // 靠在原木上的背包
      const bag = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.3), M.bag);
      body.castShadow = true;
      body.receiveShadow = true;
      bag.add(body);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.3, 8), M.bag);
      top.rotation.x = Math.PI / 2;
      top.position.y = 0.27;
      top.scale.set(1, 1, 0.72);
      top.castShadow = true;
      bag.add(top);
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.34), M.bagStrap);
      strap.position.x = 0.14;
      bag.add(strap);
      bag.position.set(x + Math.cos(-a) * 0.35, heightAt(x, z) + 0.45, z + Math.sin(-a) * 0.35);
      bag.rotation.y = -a + Math.PI / 2;
      bag.rotation.z = -0.18;
      group.add(bag);
    }
  });

  // ================================================================ 柴堆
  const woodpile = new THREE.Group();
  woodpile.position.set(-5.4, heightAt(-5.4, 1.7), 1.7);
  woodpile.rotation.y = 0.5;
  group.add(woodpile);
  for (const s of [-1, 1]) {
    const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.5, 5), M.bark);
    stake.position.set(s * 0.72, 0.2, 0);
    stake.rotation.z = s * 0.12;
    stake.castShadow = true;
    woodpile.add(stake);
  }
  const pileRng = createRng(808);
  for (let row = 0; row < 3; row++) {
    const n = 4 - row;
    for (let i = 0; i < n; i++) {
      const log = new THREE.Mesh(
        new THREE.CylinderGeometry(0.105, 0.1, 0.92, 6),
        row === 2 ? M.wood : M.bark
      );
      log.rotation.z = Math.PI / 2;
      log.position.set(
        (i - (n - 1) / 2) * 0.235 + randRange(pileRng, -0.03, 0.03),
        0.12 + row * 0.2,
        randRange(pileRng, -0.08, 0.08)
      );
      log.rotation.y = randRange(pileRng, -0.08, 0.08);
      log.castShadow = true;
      log.receiveShadow = true;
      woodpile.add(log);
    }
  }

  // 火堆旁散落的几根木柴
  for (let i = 0; i < 4; i++) {
    const a = randRange(rng, 0, Math.PI * 2);
    const r = randRange(rng, 1.5, 2.1);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.075, 0.75, 5), M.bark);
    log.position.set(x, heightAt(x, z) + 0.08, z);
    log.rotation.set(Math.PI / 2, 0, randRange(rng, 0, Math.PI));
    log.rotation.y = randRange(rng, 0, Math.PI);
    log.castShadow = true;
    log.receiveShadow = true;
    group.add(log);
  }

  // ================================================================ 收纳箱
  const cooler = new THREE.Group();
  cooler.position.set(3.7, heightAt(3.7, -2.5), -2.5);
  cooler.rotation.y = -0.7;
  group.add(cooler);
  const coolerBody = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.44, 0.5), M.cooler);
  coolerBody.position.y = 0.22;
  coolerBody.castShadow = true;
  coolerBody.receiveShadow = true;
  cooler.add(coolerBody);
  const coolerLid = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.13, 0.54), M.coolerLid);
  coolerLid.position.y = 0.49;
  coolerLid.castShadow = true;
  cooler.add(coolerLid);
  const coolerHandle = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.06), M.metal);
  coolerHandle.position.set(0, 0.5, 0.22);
  cooler.add(coolerHandle);

  // ================================================================ 树桩 + 杯子
  const stump = new THREE.Group();
  const sx = 1.5;
  const sz = -2.9;
  stump.position.set(sx, heightAt(sx, sz), sz);
  group.add(stump);
  const stumpBody = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.5, 8), M.bark);
  stumpBody.position.y = 0.25;
  stumpBody.castShadow = true;
  stumpBody.receiveShadow = true;
  stump.add(stumpBody);
  const stumpTop = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.06, 8), M.wood);
  stumpTop.position.y = 0.52;
  stumpTop.castShadow = true;
  stump.add(stumpTop);
  const mugGeo = new THREE.CylinderGeometry(0.075, 0.065, 0.13, 6);
  for (let i = 0; i < 2; i++) {
    const mug = new THREE.Mesh(mugGeo, i === 0 ? M.coolerLid : M.canvasDark);
    mug.position.set(-0.12 + i * 0.24, 0.61, 0.06 - i * 0.14);
    mug.castShadow = true;
    stump.add(mug);
  }

  // ================================================================ 挂灯杆
  const poleX = 4.6;
  const poleZ = 1.9;
  const lampPole = new THREE.Group();
  lampPole.position.set(poleX, heightAt(poleX, poleZ), poleZ);
  lampPole.rotation.y = 2.74; // 挂钩朝向火堆一侧
  group.add(lampPole);
  const poleShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 2.5, 6), M.bark);
  poleShaft.position.y = 1.25;
  poleShaft.castShadow = true;
  poleShaft.receiveShadow = true;
  lampPole.add(poleShaft);
  // 挂钩：四分之一圆环
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.035, 5, 8, Math.PI * 1.15), M.metal);
  hook.position.set(0.2, 2.46, 0);
  hook.rotation.set(0, Math.PI / 2, -0.35);
  hook.castShadow = true;
  lampPole.add(hook);

  // 吊灯（会轻微摆动）
  const lantern = new THREE.Group();
  lantern.position.set(0.34, 2.18, 0);
  lampPole.add(lantern);
  const lanternTop = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.07, 6), M.metal);
  lanternTop.position.y = 0.19;
  lantern.add(lanternTop);
  const lanternGlass = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.24, 6), M.glass);
  lanternGlass.position.y = 0.02;
  lantern.add(lanternGlass);
  for (let i = 0; i < 3; i++) {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.26, 4), M.metal);
    const a = (i / 3) * Math.PI * 2;
    bar.position.set(Math.cos(a) * 0.105, 0.02, Math.sin(a) * 0.105);
    lantern.add(bar);
  }
  const lanternBottom = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.06, 6), M.metal);
  lanternBottom.position.y = -0.14;
  lantern.add(lanternBottom);
  const lanternHanger = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 4, 6), M.metal);
  lanternHanger.position.y = 0.26;
  lantern.add(lanternHanger);

  const lanternLight = new THREE.PointLight(0xffc078, 0, 16, 2);
  lanternLight.position.set(0.34, 2.18, 0);
  lanternLight.castShadow = false;
  lampPole.add(lanternLight);

  // ================================================================ 彩旗
  const FLAG_COLORS = [0xe05c4b, 0xf2b33d, 0x5fb894, 0x4f7fd1, 0xd96fa8];
  const buntA = new THREE.Vector3(-7.8, 0, -6.4);
  const buntB = new THREE.Vector3(5.8, 0, -7.4);
  const buntGroup = new THREE.Group();
  group.add(buntGroup);
  const poleGeo = new THREE.CylinderGeometry(0.055, 0.075, 3.1, 6);
  for (const p of [buntA, buntB]) {
    const p2 = new THREE.Mesh(poleGeo, M.bark);
    p2.position.set(p.x, heightAt(p.x, p.z) + 1.55, p.z);
    p2.rotation.z = randRange(rng, -0.05, 0.05);
    p2.castShadow = true;
    p2.receiveShadow = true;
    buntGroup.add(p2);
  }
  const SA = V(buntA.x, heightAt(buntA.x, buntA.z) + 2.95, buntA.z);
  const SB = V(buntB.x, heightAt(buntB.x, buntB.z) + 2.95, buntB.z);
  const SEGS = 14;
  const sag = 0.85;
  const ropePts = [];
  for (let i = 0; i <= SEGS; i++) {
    const t = i / SEGS;
    const p = new THREE.Vector3().lerpVectors(SA, SB, t);
    p.y -= Math.sin(t * Math.PI) * sag;
    ropePts.push(p);
  }
  for (let i = 0; i < SEGS; i++) {
    const rope = new THREE.Mesh(cylinderBetween(ropePts[i], ropePts[i + 1], 0.014, 4), M.line);
    rope.castShadow = false;
    buntGroup.add(rope);
  }
  const flagGeo = (() => {
    const g = new THREE.BufferGeometry();
    const w = 0.24;
    const h = 0.36;
    g.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([-w / 2, 0, 0, w / 2, 0, 0, 0, -h, 0], 3)
    );
    g.computeVertexNormals();
    return g;
  })();
  for (let i = 1; i < SEGS; i++) {
    const t = i / SEGS;
    const p = new THREE.Vector3().lerpVectors(SA, SB, t);
    p.y -= Math.sin(t * Math.PI) * sag;
    const flag = new THREE.Mesh(
      flagGeo,
      new THREE.MeshStandardMaterial({
        color: FLAG_COLORS[i % FLAG_COLORS.length],
        flatShading: true,
        roughness: 0.9,
        side: THREE.DoubleSide
      })
    );
    flag.position.copy(p);
    flag.position.y -= 0.02;
    flag.rotation.y = randRange(rng, -0.35, 0.35);
    flag.castShadow = false;
    buntGroup.add(flag);
  }

  // ================================================================ 踏脚石
  const stepGeos = [
    createRockGeometry({ radius: 0.3, detail: 0, jitter: 0.3, squash: 0.46, seed: 61 }),
    createRockGeometry({ radius: 0.3, detail: 0, jitter: 0.34, squash: 0.4, seed: 67 })
  ];
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const x = -4.2 + t * 3.4 + randRange(rng, -0.22, 0.22);
    const z = -2.9 + t * 2.1 + randRange(rng, -0.22, 0.22);
    const s = randRange(rng, 0.85, 1.25);
    const stone = new THREE.Mesh(stepGeos[i % 2], M.stone);
    stone.scale.set(s, s, s * randRange(rng, 0.85, 1.15));
    stone.position.set(x, heightAt(x, z) + 0.07, z);
    stone.rotation.y = rng() * Math.PI;
    stone.castShadow = true;
    stone.receiveShadow = true;
    group.add(stone);
  }

  return {
    group,
    materials: M,
    lantern,
    lanternLight,
    lanternGlass: M.glass,
    tent,
    fireAnchor: V(0, 0, 0),

    update(time) {
      // 吊灯轻微摆动
      lantern.rotation.z = Math.sin(time * 0.9) * 0.06;
      lantern.rotation.x = Math.cos(time * 0.73) * 0.045;
      // 彩旗轻微飘动
      buntGroup.children.forEach((c, i) => {
        if (c.geometry === flagGeo) c.rotation.x = Math.sin(time * 2.2 + i) * 0.18;
      });
    },

    /** t: 0 白天 → 1 夜晚 */
    applyPhase(t, nightAmount) {
      M.glass.emissiveIntensity = nightAmount * 3.2;
      lanternLight.intensity = nightAmount * 16;
    }
  };
}
