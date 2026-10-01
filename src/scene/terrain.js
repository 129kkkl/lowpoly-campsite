import * as THREE from 'three';
import { createNoise2D, createFbm, smoothstep } from '../core/noise.js';
import { clamp, lerp } from '../core/math.js';

/**
 * 低多边形地形：起伏草甸 + 远处环山 + 中心压平的营地平台。
 * 同一个高度函数同时服务于「网格顶点」和「物体落点」，并提供精确的
 * 三角形重心插值采样，保证树木、石头、帐篷不会悬空或陷进地里。
 */

export const TERRAIN_SIZE = 132;
const SEGMENTS = 108;
const CAMP_CLEAR_R = 7.2; // 营地平整半径
const CAMP_FADE_R = 19; // 平整过渡到自然地形的半径
const CAMP_Y = 0;

const noise = createNoise2D(20260301);
const fbm = createFbm(noise);

function analyticHeight(x, z) {
  const d = Math.hypot(x, z);

  // 主体起伏
  let h = fbm(x * 0.028, z * 0.028, 4) * 3.3;
  // 中频丘陵，制造可读的空间层次
  h += fbm(x * 0.075 + 21, z * 0.075 - 13, 3) * 1.35;
  // 高频细节
  h += noise(x * 0.26 + 5, z * 0.26 - 9) * 0.22;

  // 远景环山：把视线收进画面，形成背景层次
  const rim = smoothstep(31, 64, d);
  h += rim * (5.2 + fbm(x * 0.019 + 11, z * 0.019 - 4, 2) * 4.4);
  // 营地背侧（-x -z 方向）一座小丘，让帐篷有靠背
  const knoll = Math.exp(-(((x + 16) ** 2) / 120 + ((z + 13) ** 2) / 100));
  h += knoll * 2.9;

  // 营地平台：内侧完全平整，外侧平滑过渡
  const flat = 1 - smoothstep(CAMP_CLEAR_R, CAMP_FADE_R, d);
  h = lerp(h, CAMP_Y, flat);

  return h;
}

export function createTerrain() {
  const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, SEGMENTS, SEGMENTS);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const count = pos.count;
  const heights = new Float32Array(count);
  for (let i = 0; i < count; i++) heights[i] = analyticHeight(pos.getX(i), pos.getZ(i));
  for (let i = 0; i < count; i++) pos.setY(i, heights[i]);

  // ---- 顶点色：草地 / 踩秃的营地土面 / 高处裸岩 ----
  const colors = new Float32Array(count * 3);
  const cGrassDark = new THREE.Color(0x4e7a37);
  const cGrass = new THREE.Color(0x6d9a49);
  const cGrassLight = new THREE.Color(0x8fae55);
  const cDirt = new THREE.Color(0x7d6142);
  const cDirtLight = new THREE.Color(0x96795a);
  const cDirtDark = new THREE.Color(0x63503a);
  const cScorch = new THREE.Color(0x463a30);
  const cRock = new THREE.Color(0x8b908c);
  const cDry = new THREE.Color(0xa79a62);

  const c = new THREE.Color();
  const tmp = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = heights[i];
    const d = Math.hypot(x, z);

    // 草地基色：大尺度色块 + 细碎噪点
    const patch = fbm(x * 0.06 + 3, z * 0.06 - 8, 3) * 0.5 + 0.5;
    c.copy(cGrassDark).lerp(cGrass, clamp(patch * 1.4, 0, 1));
    tmp.copy(cGrassLight);
    c.lerp(tmp, clamp((fbm(x * 0.15 - 2, z * 0.15 + 6, 2) * 0.5 + 0.5) * 0.75, 0, 1));

    // 踩踏出来的土面：营地内部 + 一条从帐篷通向火堆的小路
    const campMask = 1 - smoothstep(CAMP_CLEAR_R * 0.62, CAMP_CLEAR_R * 1.25, d);
    const wobble = fbm(x * 0.34 + 17, z * 0.34 - 4, 3) * 0.55;
    // 高频噪声让土与草的交界呈散点过渡，而不是一圈生硬的光晕
    const speck = noise(x * 1.15 + 31, z * 1.15 - 17);
    let dirtMask = clamp(campMask * (0.92 + wobble) + speck * 0.42 * (1 - campMask), 0, 1) * 0.92;
    // 小路：帐篷(-4.6,-3.2) → 火堆(0,0)
    const px = x + 4.6;
    const pz = z + 3.2;
    const tt = clamp(px / 4.6, 0, 1);
    const cx = lerp(-4.6, 0, tt);
    const cz = lerp(-3.2, 0, tt);
    const pathDist = Math.hypot(x - cx, z - cz);
    dirtMask = Math.max(dirtMask, (1 - smoothstep(0.35, 1.5, pathDist)) * 0.85);
    // 柴堆 / 收纳箱附近的踩踏
    const pad2 = 1 - smoothstep(0.6, 2.4, Math.hypot(x + 5.2, z - 1.6));
    dirtMask = Math.max(dirtMask, pad2 * 0.8);

    tmp.copy(cDirt)
      .lerp(cDirtLight, clamp(fbm(x * 0.4, z * 0.4, 2) * 0.5 + 0.5, 0, 1))
      .lerp(cDirtDark, clamp(fbm(x * 0.9 - 6, z * 0.9 + 2, 2) * 0.5 + 0.5, 0, 1) * 0.45);
    c.lerp(tmp, clamp(dirtMask, 0, 1));

    // 火塘周围被烧焦的地面
    const scorch = (1 - smoothstep(1.4, 3.6, d)) * 0.88;
    if (scorch > 0.001) c.lerp(cScorch, scorch);

    // 高处裸岩 + 干草过渡
    const rockMask = smoothstep(3.6, 8.2, h) * 0.85;
    tmp.copy(cRock);
    c.lerp(tmp, rockMask);
    const dryMask = smoothstep(1.4, 4.2, h) * (1 - rockMask) * 0.35;
    tmp.copy(cDry);
    c.lerp(tmp, dryMask);

    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  // 转非索引以获得硬朗的平面着色
  const flatGeo = geo.toNonIndexed();
  flatGeo.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.97,
    metalness: 0
  });

  const mesh = new THREE.Mesh(flatGeo, material);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';

  // ---- 精确采样：对实际三角面做重心插值 ----
  const half = TERRAIN_SIZE / 2;
  const cell = TERRAIN_SIZE / SEGMENTS;

  /** 网格原始（未转换）顶点高度查询 */
  const rawHeights = heights;

  function heightAt(x, z) {
    const fx = clamp((x + half) / cell, 0, SEGMENTS - 1e-4);
    const fz = clamp((z + half) / cell, 0, SEGMENTS - 1e-4);
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const tx = fx - ix;
    const tz = fz - iz;
    const g = SEGMENTS + 1;
    const h00 = rawHeights[ix + iz * g];
    const h10 = rawHeights[ix + 1 + iz * g];
    const h01 = rawHeights[ix + (iz + 1) * g];
    const h11 = rawHeights[ix + 1 + (iz + 1) * g];
    // 与 PlaneGeometry 索引一致的两个三角形： (h00,h01,h10) 与 (h01,h11,h10)
    if (tx + tz <= 1) {
      return h00 + (h10 - h00) * tx + (h01 - h00) * tz;
    }
    return h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz);
  }

  /** 地形法线（用于让物体贴合坡面） */
  const normalAt = (() => {
    const e = 0.35;
    const n = new THREE.Vector3();
    return (x, z) => {
      const hl = heightAt(x - e, z);
      const hr = heightAt(x + e, z);
      const hd = heightAt(x, z - e);
      const hu = heightAt(x, z + e);
      return n.set(hl - hr, 2 * e, hd - hu).normalize().clone();
    };
  })();

  return { mesh, material, heightAt, normalAt, analyticHeight, campY: CAMP_Y };
}
