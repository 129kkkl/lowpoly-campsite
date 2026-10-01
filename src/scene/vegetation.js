import * as THREE from 'three';
import { createRng, randRange, randBell, pick } from '../core/rng.js';
import { createRockGeometry, createGrassTuftGeometry, attachWind, setInstance } from '../core/geo.js';

/**
 * 环境散布：松树、灌木、石头、草丛、小野花。
 * 全部使用 InstancedMesh，风摆走顶点着色器，保证 CPU 开销接近于零。
 */

// 树冠三层配色
const FOLIAGE = [0x2f5d3a, 0x376a41, 0x28502f];
const BARK = 0x54402e;
const ROCK = [0x8a8f8e, 0x777d7c, 0x9aa09b];
const BUSH = [0x3f6b34, 0x4b7a3a, 0x355a2c];
const FLOWER = [0xf2f0e2, 0xf6c453, 0xef8fa6, 0xc9a7e8];

export function createVegetation(terrain, seed = 77) {
  const group = new THREE.Group();
  group.name = 'vegetation';
  const rng = createRng(seed);
  const timeUniform = { value: 0 };

  const { heightAt, normalAt } = terrain;

  /** 归一化坐标：0 中心 → 1 边缘 */
  const place = (radius) => {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * radius;
    return new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r);
  };

  // ---------------------------------------------------------------- 树木
  const treeCount = 118;
  const trunkGeo = new THREE.CylinderGeometry(0.13, 0.22, 1.15, 5, 1);
  trunkGeo.translate(0, 0.575, 0);
  const layerDefs = [
    { r: 1.02, h: 1.5, y: 1.25 },
    { r: 0.78, h: 1.35, y: 1.85 },
    { r: 0.5, h: 1.15, y: 2.45 }
  ];
  const layerGeos = layerDefs.map((d) => {
    const g = new THREE.ConeGeometry(d.r, d.h, 6, 1);
    g.translate(0, d.y + d.h * 0.5 - 0.22, 0);
    return g;
  });

  const barkMat = new THREE.MeshStandardMaterial({ color: BARK, flatShading: true, roughness: 1 });
  const foliageMats = FOLIAGE.map(
    (c) =>
      attachWind(
        new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.92 }),
        timeUniform,
        { amplitude: 0.028, tipOffset: 0.6, speed: 1.05, wave: 1 }
      )
  );

  const trunks = new THREE.InstancedMesh(trunkGeo, barkMat, treeCount);
  const canopies = layerGeos.map((g, i) => new THREE.InstancedMesh(g, foliageMats[i], treeCount));
  [trunks, ...canopies].forEach((m) => {
    m.castShadow = true;
    m.receiveShadow = false;
    m.frustumCulled = false;
    group.add(m);
  });

  const dummyScale = new THREE.Vector3();
  const dummyPos = new THREE.Vector3();
  const color = new THREE.Color();
  let ti = 0;
  let guard = 0;
  while (ti < treeCount && guard < treeCount * 40) {
    guard++;
    const p = place(60);
    const d = p.length();
    if (d < 12) continue;
    // 环山区域稀疏一些，近景密，制造纵深
    if (d > 40 && rng() < 0.45) continue;
    // 草甸留白
    if (Math.hypot(p.x + 20, p.y - 17) < 9.5) continue;
    if (Math.hypot(p.x - 24, p.y + 6) < 7) continue;

    const s = randBell(rng, 0.75, 1.75);
    dummyPos.set(p.x, heightAt(p.x, p.y) - 0.12, p.y);
    dummyScale.set(s, s * randRange(rng, 0.9, 1.25), s);
    setInstance(trunks, ti, dummyPos, rng() * Math.PI * 2, dummyScale);
    setInstance(canopies[0], ti, dummyPos, 0, dummyScale);
    setInstance(canopies[1], ti, dummyPos, rng() * 0.7, dummyScale);
    setInstance(canopies[2], ti, dummyPos, rng() * 1.4, dummyScale);

    const shade = randRange(rng, 0.86, 1.16);
    color.setHex(0xffffff).multiplyScalar(shade);
    canopies[0].setColorAt(ti, color);
    color.setHex(0xffffff).multiplyScalar(shade * randRange(rng, 0.94, 1.08));
    canopies[1].setColorAt(ti, color);
    color.setHex(0xffffff).multiplyScalar(shade * randRange(rng, 0.9, 1.12));
    canopies[2].setColorAt(ti, color);
    ti++;
  }
  // 未用满的实例收进地下
  for (; ti < treeCount; ti++) {
    dummyPos.set(0, -999, 0);
    dummyScale.set(0.001, 0.001, 0.001);
    setInstance(trunks, ti, dummyPos, 0, dummyScale);
    canopies.forEach((c) => setInstance(c, ti, dummyPos, 0, dummyScale));
  }
  trunks.count = treeCount;
  canopies.forEach((c) => (c.count = treeCount));
  [trunks, ...canopies].forEach((m) => {
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });

  // ---------------------------------------------------------------- 灌木
  const bushGeo = createRockGeometry({ radius: 0.62, detail: 0, jitter: 0.34, squash: 0.66, seed: 11 });
  bushGeo.translate(0, 0.3, 0);
  const bushMat = attachWind(
    new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.95 }),
    timeUniform,
    { amplitude: 0.03, tipOffset: 0.15, speed: 1.35, wave: 1 }
  );
  const bushCount = 74;
  const bushes = new THREE.InstancedMesh(bushGeo, bushMat, bushCount);
  bushes.castShadow = true;
  bushes.frustumCulled = false;
  let bi = 0;
  guard = 0;
  while (bi < bushCount && guard < bushCount * 40) {
    guard++;
    const p = place(58);
    if (p.length() < 8.5) continue;
    const s = randRange(rng, 0.6, 1.5);
    dummyPos.set(p.x, heightAt(p.x, p.y) - 0.08, p.y);
    dummyScale.set(s, s * randRange(rng, 0.7, 1.1), s);
    setInstance(bushes, bi, dummyPos, rng() * Math.PI * 2, dummyScale);
    color.setHex(pick(rng, BUSH)).multiplyScalar(randRange(rng, 0.85, 1.18));
    bushes.setColorAt(bi, color);
    bi++;
  }
  bushes.count = bushCount;
  bushes.instanceMatrix.needsUpdate = true;
  if (bushes.instanceColor) bushes.instanceColor.needsUpdate = true;
  group.add(bushes);

  // ---------------------------------------------------------------- 石头
  const rockGeos = [
    createRockGeometry({ radius: 0.5, detail: 0, jitter: 0.36, squash: 0.7, seed: 21 }),
    createRockGeometry({ radius: 0.5, detail: 0, jitter: 0.42, squash: 0.55, seed: 33 }),
    createRockGeometry({ radius: 0.5, detail: 0, jitter: 0.3, squash: 0.82, seed: 45 })
  ];
  const rockMat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.94 });
  const rockCount = 132;
  const rocks = rockGeos.map((g) => {
    // 每种形状多留几个空位，供后面的近景补充使用
    const m = new THREE.InstancedMesh(g, rockMat, Math.ceil(rockCount / 3) + 8);
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;
    group.add(m);
    return m;
  });
  const perMesh = new Array(3).fill(0);
  const rockMax = rocks[0].instanceMatrix.count;
  guard = 0;
  let placedRocks = 0;
  while (placedRocks < rockCount && guard < rockCount * 40) {
    guard++;
    const p = place(62);
    const d = p.length();
    if (d < 8) continue;
    // 营地中央保持干净
    if (d < 11 && rng() < 0.75) continue;
    const k = placedRocks % 3;
    if (perMesh[k] >= rockMax) {
      placedRocks++;
      continue;
    }
    const s = randBell(rng, 0.28, 1.35) * (d > 30 ? 1.5 : 1);
    dummyPos.set(p.x, heightAt(p.x, p.y) - s * 0.16, p.y);
    dummyScale.set(s * randRange(rng, 0.9, 1.35), s * randRange(rng, 0.7, 1.1), s * randRange(rng, 0.9, 1.35));
    setInstance(rocks[k], perMesh[k], dummyPos, rng() * Math.PI * 2, dummyScale);
    color.setHex(pick(rng, ROCK)).multiplyScalar(randRange(rng, 0.88, 1.14));
    rocks[k].setColorAt(perMesh[k], color);
    perMesh[k]++;
    placedRocks++;
  }
  rocks.forEach((m, i) => {
    m.count = perMesh[i];
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });

  // 近景补充：默认机位朝向的这一侧多放几块石头和灌木，避免前景空旷
  const nearRng = createRng(6060);
  for (let i = 0; i < 16; i++) {
    const a = nearRng() * Math.PI * 2;
    const r = randRange(nearRng, 11, 28);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const k = i % 3;
    if (perMesh[k] >= rockMax) continue;
    const s = randRange(nearRng, 0.5, 1.5);
    dummyPos.set(x, heightAt(x, z) - s * 0.18, z);
    dummyScale.set(s * randRange(nearRng, 0.95, 1.4), s * randRange(nearRng, 0.7, 1.05), s * randRange(nearRng, 0.95, 1.4));
    setInstance(rocks[k], perMesh[k], dummyPos, nearRng() * Math.PI * 2, dummyScale);
    color.setHex(pick(nearRng, ROCK)).multiplyScalar(randRange(nearRng, 0.88, 1.12));
    rocks[k].setColorAt(perMesh[k], color);
    perMesh[k]++;
  }
  rocks.forEach((m, i) => {
    m.count = perMesh[i];
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });

  // ---------------------------------------------------------------- 草丛
  const grassGeo = createGrassTuftGeometry({ blades: 6, height: 0.46, width: 0.13, bend: 0.21 });
  const grassMat = attachWind(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      flatShading: true,
      roughness: 1,
      side: THREE.DoubleSide
    }),
    timeUniform,
    { amplitude: 0.16, tipOffset: 0.02, speed: 2.1, wave: 1.6, phaseScale: 0.7 }
  );
  const grassCount = 3200;
  const grass = new THREE.InstancedMesh(grassGeo, grassMat, grassCount);
  grass.frustumCulled = false;
  grass.receiveShadow = false;
  let gi = 0;
  guard = 0;
  while (gi < grassCount && guard < grassCount * 25) {
    guard++;
    const p = place(58);
    const d = p.length();
    if (d < 6.4) continue;
    const s = randRange(rng, 0.62, 1.5);
    dummyPos.set(p.x, heightAt(p.x, p.y) - 0.03, p.y);
    dummyScale.set(s, s * randRange(rng, 0.8, 1.35), s);
    setInstance(grass, gi, dummyPos, rng() * Math.PI * 2, dummyScale);
    color.setHex(rng() < 0.22 ? 0xd8d06a : 0xffffff).multiplyScalar(randRange(rng, 0.9, 1.1));
    grass.setColorAt(gi, color);
    gi++;
  }
  grass.count = gi;
  grass.instanceMatrix.needsUpdate = true;
  if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
  group.add(grass);

  // ---------------------------------------------------------------- 小花
  const flowerGeo = new THREE.IcosahedronGeometry(0.075, 0);
  flowerGeo.scale(1, 0.7, 1);
  const flowerMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    flatShading: true,
    roughness: 0.85,
    emissive: new THREE.Color(0x1a1a1a),
    emissiveIntensity: 0.2
  });
  const flowerCount = 170;
  const flowers = new THREE.InstancedMesh(flowerGeo, flowerMat, flowerCount);
  flowers.frustumCulled = false;
  let fi = 0;
  guard = 0;
  while (fi < flowerCount && guard < flowerCount * 25) {
    guard++;
    const p = place(46);
    if (p.length() < 8) continue;
    // 花只长在草地上
    if (Math.hypot(p.x + 20, p.y - 17) > 13 && rng() < 0.55) continue;
    const s = randRange(rng, 0.7, 1.5);
    dummyPos.set(p.x, heightAt(p.x, p.y) + 0.11 * s, p.y);
    dummyScale.setScalar(s);
    setInstance(flowers, fi, dummyPos, rng() * Math.PI * 2, dummyScale);
    color.setHex(pick(rng, FLOWER));
    flowers.setColorAt(fi, color);
    fi++;
  }
  flowers.count = fi;
  flowers.instanceMatrix.needsUpdate = true;
  if (flowers.instanceColor) flowers.instanceColor.needsUpdate = true;
  group.add(flowers);

  return {
    group,
    timeUniform,
    update(time) {
      timeUniform.value = time;
    },
    stats: { trees: ti, bushes: bi, rocks: perMesh[0] + perMesh[1] + perMesh[2], grass: gi, flowers: fi }
  };
}
