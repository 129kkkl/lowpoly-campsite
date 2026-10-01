import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { createTerrain } from './scene/terrain.js';
import { createSky } from './scene/sky.js';
import { createVegetation } from './scene/vegetation.js';
import { createCamp } from './scene/camp.js';
import { createCampfire } from './scene/campfire.js';
import { createDayNight } from './core/lighting.js';
import { createUI } from './ui.js';
import { damp } from './core/math.js';

// ---------------------------------------------------------------- 基础设置
const container = document.getElementById('app');

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance'
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  46,
  window.innerWidth / window.innerHeight,
  0.1,
  900
);

const HOME = {
  position: new THREE.Vector3(11.9, 7.1, 13.9),
  target: new THREE.Vector3(-0.4, 1.05, -0.9)
};
camera.position.copy(HOME.position);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(HOME.target);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.rotateSpeed = 0.72;
controls.zoomSpeed = 0.9;
controls.panSpeed = 0.6;
controls.minDistance = 5;
controls.maxDistance = 62;
controls.minPolarAngle = 0.12;
controls.maxPolarAngle = 1.47;
controls.update();

// ---------------------------------------------------------------- 光源
const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x6f8a4e, 0.72);
scene.add(hemi);

const ambient = new THREE.AmbientLight(0xffffff, 0.16);
scene.add(ambient);

const keyLight = new THREE.DirectionalLight(0xfff1d4, 2.55);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 1;
keyLight.shadow.camera.far = 140;
keyLight.shadow.camera.left = -34;
keyLight.shadow.camera.right = 34;
keyLight.shadow.camera.top = 34;
keyLight.shadow.camera.bottom = -34;
keyLight.shadow.bias = -0.0006;
keyLight.shadow.normalBias = 0.028;
scene.add(keyLight);
scene.add(keyLight.target);

// ---------------------------------------------------------------- 场景内容
const terrain = createTerrain();
scene.add(terrain.mesh);

const sky = createSky();
scene.add(sky.group);

const vegetation = createVegetation(terrain);
scene.add(vegetation.group);

const camp = createCamp(terrain);
scene.add(camp.group);

const campfire = createCampfire(terrain);
scene.add(campfire.group);

const dayNight = createDayNight({
  scene,
  renderer,
  sky,
  campfire,
  camp,
  hemi,
  keyLight,
  ambient
});

// ---------------------------------------------------------------- UI
let resetting = false;
const ui = createUI({
  onTogglePhase: () => {
    dayNight.toggle();
    ui.sync();
  },
  onToggleFire: () => {
    campfire.toggle();
    ui.sync();
  },
  onResetView: () => {
    resetting = true;
  },
  getState: () => ({ isNight: dayNight.isNight, fireLit: campfire.lit })
});
ui.sync();

// ---------------------------------------------------------------- 循环
let last = performance.now();
let elapsed = 0;
let frames = 0;
let fpsTimer = 0;
let firstFrame = true;

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  elapsed += dt;

  if (resetting) {
    camera.position.lerp(HOME.position, 1 - Math.exp(-4.2 * dt));
    controls.target.lerp(HOME.target, 1 - Math.exp(-4.2 * dt));
    if (camera.position.distanceTo(HOME.position) < 0.06) {
      camera.position.copy(HOME.position);
      controls.target.copy(HOME.target);
      resetting = false;
    }
  }

  dayNight.update(dt);
  sky.update(elapsed);
  vegetation.update(elapsed);
  camp.update(elapsed);
  campfire.update(elapsed, dt);
  controls.update();

  renderer.render(scene, camera);

  frames++;
  fpsTimer += dt;
  if (fpsTimer >= 0.5) {
    ui.setFps(frames / fpsTimer);
    frames = 0;
    fpsTimer = 0;
  }

  if (firstFrame) {
    firstFrame = false;
    ui.hideLoader();
  }
}
animate();

// ---------------------------------------------------------------- 自适应
let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// 供调试/自动化测试使用
window.__campsite = {
  scene,
  camera,
  controls,
  renderer,
  dayNight,
  campfire,
  setNight: (v) => {
    dayNight.setNight(v);
    ui.sync();
  },
  setFire: (v) => {
    campfire.setLit(v);
    ui.sync();
  },
  resetView: () => {
    resetting = true;
  },
  get info() {
    return {
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      night: dayNight.state.t,
      fireLevel: campfire.state.level,
      lit: campfire.lit
    };
  }
};
