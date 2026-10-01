import * as THREE from 'three';

/**
 * 低多边形场景常用几何构造工具。
 * 这里的函数统一返回 **几何体**（已烘焙变换），方便共享材质 / 合并。
 */

/** 稳定的伪随机哈希：相同坐标永远得到相同位移，保证岩石不会开裂 */
function hash3(x, y, z, seed = 0) {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed * 4.13) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * 一根连接两点的圆柱（木柴、绳索、帐篷杆、斜撑…）
 */
export function cylinderBetween(a, b, radius, radialSegments = 6, openEnded = false) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(radius, radius, len, radialSegments, 1, openEnded);
  const quat = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir.clone().normalize()
  );
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  const m = new THREE.Matrix4().compose(mid, quat, new THREE.Vector3(1, 1, 1));
  geo.applyMatrix4(m);
  return geo;
}

/**
 * 石头 / 树桩 / 灌木底座：二十面体 + 位置哈希位移，永远保持封闭不裂面。
 */
export function createRockGeometry({
  radius = 0.5,
  detail = 0,
  jitter = 0.3,
  squash = 0.72,
  seed = 3
} = {}) {
  const geo = new THREE.IcosahedronGeometry(radius, detail);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const key = 1e3;
    const rx = Math.round(v.x * key) / key;
    const ry = Math.round(v.y * key) / key;
    const rz = Math.round(v.z * key) / key;
    // 三个独立方向的噪声，避免整体缩放导致的规则感
    const dx = hash3(rx, ry, rz, seed) - 0.5;
    const dy = hash3(ry, rz, rx, seed + 7) - 0.5;
    const dz = hash3(rz, rx, ry, seed + 13) - 0.5;
    const k = 1 + jitter * (dx * 1.6);
    v.multiplyScalar(k);
    v.x += dx * radius * jitter * 0.7;
    v.y += dy * radius * jitter * 0.5;
    v.z += dz * radius * jitter * 0.7;
    v.y *= squash;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * A 字形帐篷主体（三角柱）。index 顺序保证所有面朝外。
 */
export function createTentGeometry(width, length, height) {
  const hw = width / 2;
  const hl = length / 2;
  const positions = new Float32Array([
    -hw, 0, -hl, // 0 前左
    hw, 0, -hl, // 1 前右
    0, height, -hl, // 2 前顶
    -hw, 0, hl, // 3 后左
    hw, 0, hl, // 4 后右
    0, height, hl // 5 后顶
  ]);
  const index = [
    0, 2, 1, // 正面
    3, 4, 5, // 背面
    0, 1, 4, 0, 4, 3, // 底面
    0, 3, 5, 0, 5, 2, // 左坡
    1, 2, 5, 1, 5, 4 // 右坡
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

/**
 * 草丛：一簇弯曲的低多边形草叶（每片 2 个三角面）。
 * 根部深、尖端亮，配合 instanceColor 会有自然的层次。
 */
export function createGrassTuftGeometry({ blades = 6, height = 0.46, width = 0.13, bend = 0.2 } = {}) {
  const pos = [];
  const col = [];
  const base = new THREE.Color(0x5c8a3e);
  const tip = new THREE.Color(0xa8d472);
  const tmp = new THREE.Color();

  const pushTri = (p0, p1, p2, c0, c1, c2) => {
    pos.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
    col.push(c0.r, c0.g, c0.b, c1.r, c1.g, c1.b, c2.r, c2.g, c2.b);
  };

  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2 + i * 0.37;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const h = height * (0.72 + ((i * 37) % 11) / 11 * 0.5);
    const w = width * (0.85 + ((i * 53) % 7) / 7 * 0.4);
    const outward = bend * h;

    const rootL = new THREE.Vector3(-sa * w, 0, ca * w);
    const rootR = new THREE.Vector3(sa * w, 0, -ca * w);
    const mid = new THREE.Vector3(ca * outward * 0.45, h * 0.55, sa * outward * 0.45);
    const tipP = new THREE.Vector3(ca * outward, h, sa * outward);

    tmp.copy(base);
    pushTri(rootL, rootR, mid, base, base, tmp.copy(base).lerp(tip, 0.45));
    pushTri(rootR, tipP, mid, base, tip, tmp.copy(base).lerp(tip, 0.55));
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}

/** 径向渐变贴图：火焰地面光晕、烟雾、火星光点都用它 */
export function createRadialTexture(stops, size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [offset, color] of stops) g.addColorStop(offset, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** 圆锥台（火苗）：底部略宽，尖端尖，open-ended 便于叠加发光 */
export function createFlameGeometry(radiusBottom, radiusTop, height, segments = 6) {
  return new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments, 1, true);
}

/** 给 InstancedMesh 批量设置变换 */
export function setInstance(mesh, index, position, rotationY, scale, quaternion) {
  const dummy = setInstance.dummy || (setInstance.dummy = new THREE.Object3D());
  dummy.position.copy(position);
  if (quaternion) dummy.quaternion.copy(quaternion);
  else dummy.rotation.set(0, rotationY, 0);
  dummy.scale.copy(scale);
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
}

/**
 * 顶点着色器风摆：只对 InstancedMesh 生效，CPU 端零开销。
 * amplitude 越大越明显，tipOffset 用于让根部保持稳定。
 */
export function attachWind(material, timeUniform, options = {}) {
  const {
    amplitude = 0.05,
    tipOffset = 0.2,
    speed = 1.15,
    phaseScale = 0.9,
    wave = 0
  } = options;
  const key = `wind-${amplitude}-${speed}-${wave}`;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = timeUniform;
    shader.vertexShader =
      'uniform float uTime;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 iPos = instanceMatrix[3].xyz;
          float phase = iPos.x * ${phaseScale.toFixed(3)} + iPos.z * ${(phaseScale * 0.67).toFixed(3)};
          float tip = max(transformed.y - ${tipOffset.toFixed(3)}, 0.0);
          float gust = ${wave.toFixed(3)} > 0.0
            ? (0.62 + 0.38 * sin(uTime * 0.55 - (iPos.x + iPos.z) * 0.06))
            : 1.0;
          transformed.x += sin(uTime * ${speed.toFixed(3)} + phase) * ${amplitude.toFixed(4)} * tip * gust;
          transformed.z += cos(uTime * ${(speed * 0.76).toFixed(3)} + phase * 1.37) * ${(amplitude * 0.7).toFixed(4)} * tip * gust;
        #endif`
      );
  };
  material.customProgramCacheKey = () => key;
  return material;
}
