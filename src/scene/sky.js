import * as THREE from 'three';
import { createRng, randRange } from '../core/rng.js';
import { createRadialTexture } from '../core/geo.js';
import { createNoise2D } from '../core/noise.js';

/**
 * 天空系统：渐变穹顶 + 星星 + 太阳/月亮 + 低多边形云。
 * 所有对象的颜色/透明度都交给 lighting 模块按昼夜进度插值。
 */

const SKY_RADIUS = 460;

export function createSky() {
  const group = new THREE.Group();
  group.name = 'sky';

  // ---------- 渐变穹顶 ----------
  const skyUniforms = {
    uTop: { value: new THREE.Color(0x3f8fd8) },
    uBottom: { value: new THREE.Color(0xcfe8f7) },
    uPower: { value: 0.72 }
  };
  const skyMaterial = new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop;
      uniform vec3 uBottom;
      uniform float uPower;
      varying vec3 vWorld;
      void main() {
        vec3 dir = normalize(vWorld);
        float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
        float t = pow(h, uPower);
        // 地平线附近再压暗一点，避免天空和地面糊在一起
        float horizon = smoothstep(0.5, 0.42, h);
        vec3 col = mix(uBottom, uTop, t);
        col = mix(col, uBottom * 0.86, horizon * 0.35);
        gl_FragColor = vec4(col, 1.0);
        // 与场景其余部分使用同一套色调映射 / 色彩空间处理
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 32, 20), skyMaterial);
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  group.add(dome);

  // ---------- 星星 ----------
  const rng = createRng(90210);
  const STAR_COUNT = 900;
  const starPos = new Float32Array(STAR_COUNT * 3);
  const starSize = new Float32Array(STAR_COUNT);
  for (let i = 0; i < STAR_COUNT; i++) {
    // 只在上半球，且避开地平线附近
    const u = rng();
    const v = Math.pow(rng(), 0.6);
    const theta = u * Math.PI * 2;
    const phi = Math.acos(1 - v);
    const r = SKY_RADIUS * 0.93;
    starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPos[i * 3 + 1] = r * Math.cos(phi);
    starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    starSize[i] = 0.6 + Math.pow(rng(), 3) * 2.6;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 2.2,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: false,
    blending: THREE.AdditiveBlending
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.renderOrder = -9;
  stars.frustumCulled = false;
  group.add(stars);

  // ---------- 太阳 / 月亮 ----------
  const discMaterial = new THREE.MeshBasicMaterial({ color: 0xfff3cf, fog: false, toneMapped: false });
  const disc = new THREE.Mesh(new THREE.SphereGeometry(9, 16, 12), discMaterial);
  disc.renderOrder = -8;
  disc.frustumCulled = false;

  const glowTex = createRadialTexture([
    [0.0, 'rgba(255,255,255,0.95)'],
    [0.25, 'rgba(255,226,150,0.5)'],
    [0.6, 'rgba(255,180,90,0.14)'],
    [1.0, 'rgba(255,150,60,0)']
  ]);
  const glowMaterial = new THREE.SpriteMaterial({
    map: glowTex,
    color: 0xffe6ae,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    fog: false
  });
  const glow = new THREE.Sprite(glowMaterial);
  glow.scale.setScalar(120);
  glow.renderOrder = -7;
  glow.frustumCulled = false;

  const moonGlowMaterial = glowMaterial.clone();
  moonGlowMaterial.color = new THREE.Color(0x9db8ff);
  moonGlowMaterial.opacity = 0;
  const moonGlow = new THREE.Sprite(moonGlowMaterial);
  moonGlow.scale.setScalar(58);
  moonGlow.renderOrder = -7;
  moonGlow.frustumCulled = false;

  group.add(disc, glow, moonGlow);

  // ---------- 低多边形云 ----------
  const cloudGroup = new THREE.Group();
  cloudGroup.name = 'clouds';
  const cloudMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
    flatShading: true,
    fog: false,
    emissive: new THREE.Color(0x223044),
    emissiveIntensity: 0
  });
  const noise2D = createNoise2D(4242);
  const CLOUDS = 9;
  const clouds = [];
  for (let i = 0; i < CLOUDS; i++) {
    const cloud = new THREE.Group();
    const puffs = 4 + Math.floor(rng() * 3);
    const baseScale = randRange(rng, 9, 20);
    for (let p = 0; p < puffs; p++) {
      const r = baseScale * randRange(rng, 0.45, 0.85);
      const geo = new THREE.IcosahedronGeometry(r, 0);
      const jitter = 0.3;
      const pos = geo.attributes.position;
      for (let k = 0; k < pos.count; k++) {
        pos.setXYZ(
          k,
          pos.getX(k) * (1 + (noise2D(pos.getX(k) * 0.4 + p, pos.getZ(k) * 0.4) * jitter)),
          pos.getY(k) * 0.62 * (1 + jitter * 0.5),
          pos.getZ(k) * (1 + (noise2D(pos.getZ(k) * 0.4 - p, pos.getX(k) * 0.4) * jitter))
        );
      }
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, cloudMaterial);
      mesh.position.set(
        (p - (puffs - 1) / 2) * baseScale * 0.82 + randRange(rng, -3, 3),
        randRange(rng, -1.5, 1.5),
        randRange(rng, -3, 3)
      );
      cloud.add(mesh);
    }
    const angle = rng() * Math.PI * 2;
    const dist = randRange(rng, 130, 300);
    cloud.position.set(
      Math.cos(angle) * dist,
      randRange(rng, 34, 68),
      Math.sin(angle) * dist
    );
    cloud.userData.drift = randRange(rng, 0.22, 0.55) * (rng() > 0.5 ? 1 : -1);
    cloud.userData.bobPhase = rng() * Math.PI * 2;
    cloud.userData.baseY = cloud.position.y;
    clouds.push(cloud);
    cloudGroup.add(cloud);
  }
  group.add(cloudGroup);

  const tmpColor = new THREE.Color();
  const tmpColor2 = new THREE.Color();
  const nightCloud = new THREE.Color(0x2c3850);
  const white = new THREE.Color(0xffffff);
  const moonTint = new THREE.Color(0xa8c2ff);
  const nightEmissive = new THREE.Color(0x24344e);
  const duskEmissive = new THREE.Color(0x223044);

  return {
    group,
    skyUniforms,
    starMat,
    disc,
    discMaterial,
    glow,
    glowMaterial,
    moonGlow,
    moonGlowMaterial,
    cloudMaterial,
    clouds,
    cloudGroup,

    /** 昼夜动画：云缓慢漂移 + 轻微上下浮动 */
    update(time) {
      for (const cloud of clouds) {
        cloud.position.x += cloud.userData.drift * 0.016;
        if (cloud.position.x > 330) cloud.position.x = -330;
        if (cloud.position.x < -330) cloud.position.x = 330;
        cloud.position.y = cloud.userData.baseY + Math.sin(time * 0.22 + cloud.userData.bobPhase) * 2.2;
        cloud.rotation.y = Math.sin(time * 0.05 + cloud.userData.bobPhase) * 0.06;
      }
    },

    /**
     * 由 lighting 模块调用，t=0 白天，t=1 夜晚
     * 颜色轨道：白天 → 黄昏 → 夜晚（黄昏作为中间色站）
     */
    applyPhase(t, presets) {
      const k = t < 0.5 ? t * 2 : (t - 0.5) * 2;
      const a = t < 0.5 ? presets.day : presets.dusk;
      const b = t < 0.5 ? presets.dusk : presets.night;

      skyUniforms.uTop.value.setHex(a.skyTop).lerp(tmpColor.setHex(b.skyTop), k);
      skyUniforms.uBottom.value.setHex(a.skyBottom).lerp(tmpColor.setHex(b.skyBottom), k);

      // 星星：黄昏过后逐渐浮现
      starMat.opacity = THREE.MathUtils.smoothstep(t, 0.52, 0.98) * 0.95;

      // 太阳/月亮圆盘与光晕
      tmpColor.setHex(a.disc).lerp(tmpColor2.setHex(b.disc), k);
      discMaterial.color.copy(tmpColor);
      glowMaterial.color.copy(tmpColor);
      glowMaterial.opacity = (1 - t) * 0.8;
      moonGlowMaterial.color.copy(moonTint);
      moonGlowMaterial.opacity = THREE.MathUtils.smoothstep(t, 0.45, 0.95) * 0.7;

      cloudMaterial.color.copy(white).lerp(nightCloud, t);
      cloudMaterial.emissive.copy(t > 0.6 ? nightEmissive : duskEmissive);
      cloudMaterial.emissiveIntensity = 0.1 + t * 0.45;
    }
  };
}
