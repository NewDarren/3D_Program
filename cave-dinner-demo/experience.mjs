import * as THREE from './vendor/three.module.min.js';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';
import { createNavigator } from './navigation.mjs';
import { easeCamera, roundWalkingPath } from './camera-motion.mjs';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const canvas = $('#scene-canvas');
const stage = $('#scene-stage');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const smallScreen = matchMedia('(max-width: 760px)');
let motionEnabled = !reducedMotion.matches, motionOverride = false;
try {
  const saved = localStorage.getItem('cave-camera-motion');
  if (saved !== null) { motionEnabled = saved === 'on'; motionOverride = true; }
} catch { /* Storage is optional; keep the system accessibility preference. */ }
const clamp = THREE.MathUtils.clamp;
const state = { ready: false, started: false, view: 'hall', light: 'dinner', comparing: false,
  comparison: 'hall', overview: false, showRoof: false, animation: null, yaw: 0, pitch: 0,
  pressed: new Set(), pad: new Set(), pointers: new Map(), needsRender: true };
let renderer, scene, camera, manifest, navigator, model;
let roof, walls, heroSpot, hemisphere, ambient, environment;
let groundPosition, orbit = { target: new THREE.Vector3(0, 1, 2), radius: 46, theta: 0.65, phi: 0.88 };
let lastTime = 0, elapsed = 0, lastHotspotTime = -1, lastRenderTime = -1, fps = 60;
const lights = [], occluders = [], hotspots = [];
const direction = new THREE.Vector3(), projected = new THREE.Vector3(), lookTarget = new THREE.Vector3();
const targetQuaternion = new THREE.Quaternion(), scratchCamera = new THREE.PerspectiveCamera();
const raycaster = new THREE.Raycaster();
const cameraEuler = new THREE.Euler(0, 0, 0, 'YXZ');

// These controls are attached before loading, so photos/help survive WebGL failure.
for (const name of ['reference', 'help']) {
  const dialog = $(`#${name}-dialog`), opener = $(`#open-${name}`);
  opener.addEventListener('click', () => { clearInput(); dialog.showModal(); });
  $(`#close-${name}`).addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => opener.focus({ preventScroll: true }));
}
$('#fullscreen').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
    else setStatus('此设备可通过浏览器菜单进入全屏');
  } catch { setStatus('可通过浏览器菜单进入全屏'); }
});
document.addEventListener('fullscreenchange', () => {
  $('#fullscreen').setAttribute('aria-label', document.fullscreenElement ? '退出全屏' : '全屏体验');
  resize();
});

function setStatus(text) { if ($('#scene-status').textContent !== text) $('#scene-status').textContent = text; }
function fallback(error) {
  console.error('Cave scene could not be displayed:', error);
  state.ready = false;
  canvas.dataset.ready = 'error';
  $('#loading').hidden = true;
  $('#scene-fallback').hidden = false;
  document.body.classList.add('scene-started');
  $$('[data-view],[data-light],[data-move],#enter-scene,#tour-replay,#tour-skip,#open-compare,#reset-view,#toggle-roof')
    .forEach(button => { button.disabled = true; });
  setStatus('三维场景暂不可用 · 可查看实景参考');
}
function clearInput() {
  state.pressed.clear(); state.pad.clear(); state.pointers.clear();
  $$('[data-move]').forEach(button => button.classList.remove('is-active'));
}
function resize() {
  if (!renderer || !camera) return;
  const width = Math.max(1, stage.clientWidth), height = Math.max(1, stage.clientHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, smallScreen.matches ? 1.2 : 1.65));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  state.needsRender = true;
  lastHotspotTime = -1;
}
function setPressed(selector, attribute, value) {
  $$(selector).forEach(button => {
    const active = button.dataset[attribute] === value;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}
function beginExploration() {
  state.started = true;
  document.body.classList.add('scene-started');
}
function syncAngles() {
  cameraEuler.setFromQuaternion(camera.quaternion, 'YXZ');
  state.yaw = cameraEuler.y; state.pitch = cameraEuler.x;
}
function applyAngles() {
  camera.rotation.set(state.pitch, state.yaw, 0, 'YXZ');
  camera.updateMatrixWorld();
  state.needsRender = true;
}
function setPose(pose) {
  camera.position.fromArray(pose.pos);
  camera.lookAt(...pose.look);
  camera.fov = pose.fov || 64;
  camera.updateProjectionMatrix();
  syncAngles();
  camera.updateMatrixWorld();
  state.needsRender = true;
}
function updateShell() {
  const visible = !state.overview || state.showRoof;
  if (roof) roof.visible = visible;
  if (walls) walls.visible = visible;
  $('#toggle-roof').setAttribute('aria-pressed', String(state.showRoof));
  $('#toggle-roof span').textContent = state.showRoof ? '剖开洞顶查看内部' : '显示完整洞顶';
  state.needsRender = true;
}
function closeDetail() { $('#detail-panel').hidden = true; }
function cancelAnimation(preserveCamera = false) {
  if (!state.animation) return;
  // An aerial transition cannot be interrupted into a first-person position in midair.
  if (state.animation.type === 'flight') {
    if (preserveCamera) {
      state.overview = camera.position.y > 2.6 || !navigator.canStand(camera.position.x, camera.position.z);
    } else {
    const destination = state.animation.destination;
    state.animation = null;
    selectView(destination, { instant: true });
    return;
    }
  }
  state.animation = null;
  $('#tour-skip').hidden = true;
  document.body.classList.remove('is-travelling');
  syncAngles();
  setStatus(state.overview ? '拖动旋转 · 滚轮缩放' : '自由探索 · 可靠近桌区');
  state.needsRender = true;
}
function pathInformation(points) {
  const cumulative = [0];
  for (let index = 1; index < points.length; index++) cumulative.push(cumulative.at(-1)
    + Math.hypot(points[index].x - points[index - 1].x, points[index].z - points[index - 1].z));
  return { points, cumulative, length: cumulative.at(-1) };
}
function samplePath(path, distance) {
  const d = clamp(distance, 0, path.length);
  for (let index = 1; index < path.points.length; index++) {
    if (d <= path.cumulative[index]) {
      const length = path.cumulative[index] - path.cumulative[index - 1];
      const t = length ? (d - path.cumulative[index - 1]) / length : 1;
      return { x: THREE.MathUtils.lerp(path.points[index - 1].x, path.points[index].x, t),
        z: THREE.MathUtils.lerp(path.points[index - 1].z, path.points[index].z, t) };
    }
  }
  return path.points.at(-1);
}
function safeRoute(from, to) {
  const route = navigator.findPath(from, to);
  if (!route.length) setStatus('该位置暂时无法到达，请沿中央通道参观');
  return route;
}
function closeComparison(focus = false) {
  state.comparing = false;
  document.body.classList.remove('is-comparing');
  $('#compare-panel').hidden = true;
  $('#open-compare').setAttribute('aria-expanded', 'false');
  resize();
  if (focus) $('#open-compare').focus({ preventScroll: true });
}
function selectView(name, options = {}) {
  if (!state.ready || !manifest.views[name]) return;
  beginExploration();
  clearInput(); cancelAnimation(true); closeDetail();
  document.body.classList.remove('is-travelling'); $('#tour-skip').hidden = true;
  if (state.comparing) closeComparison();
  const pose = manifest.views[name], wasOverview = state.overview;
  const departure = { pos: camera.position.clone(), quaternion: camera.quaternion.clone(), fov: camera.fov };
  if (!wasOverview) groundPosition = camera.position.clone();
  state.view = name; state.overview = name === 'overview';
  document.body.classList.toggle('is-overview', state.overview);
  setPressed('[data-view]', 'view', name);
  $('#view-label').textContent = pose.label;
  updateShell();
  if (state.overview) {
    const position = new THREE.Vector3().fromArray(pose.pos).sub(orbit.target);
    orbit.radius = position.length(); orbit.theta = Math.atan2(position.x, position.z);
    orbit.phi = Math.acos(position.y / orbit.radius);
    if (!options.instant && motionEnabled) { startOverviewFlight(departure, name, wasOverview); return; }
    camera.fov = pose.fov; camera.updateProjectionMatrix();
    updateOrbit(); setStatus('拖动旋转 · 查看完整模型或内部布局');
    return;
  }
  if (wasOverview) {
    if (!options.instant && motionEnabled) { startOverviewFlight(departure, name, true); return; }
    camera.position.copy(groundPosition || new THREE.Vector3().fromArray(manifest.views.hall.pos));
    camera.position.y = 1.63;
  }
  if (options.instant || !motionEnabled) { setPose(pose); setStatus('自由探索 · 可靠近桌区'); return; }
  const from = { x: camera.position.x, z: camera.position.z }, to = { x: pose.pos[0], z: pose.pos[2] };
  const points = safeRoute(from, to);
  if (!points.length) return;
  scratchCamera.position.fromArray(pose.pos); scratchCamera.lookAt(...pose.look);
  const path = pathInformation(roundWalkingPath(points, navigator));
  state.animation = { type: 'view', path, time: 0, duration: clamp(path.length / 1.8, 1.8, 14),
    fromY: camera.position.y, toY: pose.pos[1], fromFov: camera.fov, toFov: pose.fov,
    fromQuaternion: camera.quaternion.clone(), toQuaternion: scratchCamera.quaternion.clone(), pose };
  showTravel(`正在前往${pose.label.split(' · ')[0]} · 拖动可接管`);
}
function showTravel(message) {
  document.body.classList.add('is-travelling');
  $('#tour-skip').hidden = false;
  $('#tour-skip').textContent = '跳过过场 ↗';
  setStatus(message);
}
function startOverviewFlight(departure, destination, wasOverview) {
  const entrance = manifest.views.entrance.pos, pose = manifest.views[destination];
  const door = new THREE.Vector3(...entrance);
  const highDoor = new THREE.Vector3(entrance[0], 13, 18);
  let points;
  if (destination === 'overview' && !wasOverview) {
    const route = safeRoute(departure.pos, { x: door.x, z: door.z });
    if (!route.length) { selectView(destination, { instant: true }); return; }
    points = roundWalkingPath(route, navigator).map(p => new THREE.Vector3(p.x, 1.63, p.z));
    points[0].copy(departure.pos);
    points.push(highDoor, new THREE.Vector3(...pose.pos));
  } else if (destination !== 'overview') {
    const route = safeRoute({ x: door.x, z: door.z }, { x: pose.pos[0], z: pose.pos[2] });
    if (!route.length) { selectView(destination, { instant: true }); return; }
    points = [departure.pos, new THREE.Vector3(departure.pos.x, Math.max(13, departure.pos.y), departure.pos.z), highDoor,
      ...roundWalkingPath(route, navigator).map(p => new THREE.Vector3(p.x, 1.63, p.z))];
    points.at(-1).y = pose.pos[1];
  } else points = [departure.pos, new THREE.Vector3(...pose.pos)];
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths.at(-1) + points[i].distanceTo(points[i - 1]));
  scratchCamera.position.fromArray(pose.pos); scratchCamera.lookAt(...pose.look);
  state.animation = { type: 'flight', destination, points, lengths, length: lengths.at(-1), time: 0,
    duration: clamp(lengths.at(-1) / 4.5, 3.5, 17), fromFov: departure.fov, toFov: pose.fov,
    fromQuaternion: departure.quaternion, toQuaternion: scratchCamera.quaternion.clone(), pose };
  camera.position.copy(departure.pos); camera.quaternion.copy(departure.quaternion);
  showTravel(destination === 'overview' ? '沿入口退出，升起查看全景' : '镜头降至入口，沿通道进入餐厅');
}
function sampleFlight(animation, distance) {
  for (let i = 1; i < animation.points.length; i++) {
    if (distance <= animation.lengths[i]) {
      const length = animation.lengths[i] - animation.lengths[i - 1];
      return animation.points[i - 1].clone().lerp(animation.points[i], length ? (distance - animation.lengths[i - 1]) / length : 1);
    }
  }
  return animation.points.at(-1).clone();
}
function updateOrbit() {
  camera.position.set(orbit.target.x + orbit.radius * Math.sin(orbit.phi) * Math.sin(orbit.theta),
    orbit.target.y + orbit.radius * Math.cos(orbit.phi),
    orbit.target.z + orbit.radius * Math.sin(orbit.phi) * Math.cos(orbit.theta));
  camera.lookAt(orbit.target); camera.updateMatrixWorld();
  state.needsRender = true;
}
function startTour() {
  if (!state.ready) return;
  beginExploration(); clearInput(); cancelAnimation(); closeDetail();
  if (state.comparing) closeComparison();
  state.overview = false; state.view = 'entrance';
  document.body.classList.remove('is-overview'); updateShell();
  setPressed('[data-view]', 'view', 'entrance');
  setPose(manifest.views.entrance);
  if (!motionEnabled) { selectView('table', { instant: true }); return; }
  const points = [{ ...manifest.tour[0] }];
  for (let index = 1; index < manifest.tour.length; index++) {
    const segment = safeRoute(points.at(-1), manifest.tour[index]);
    if (!segment.length) { selectView('hall', { instant: true }); return; }
    points.push(...segment.slice(1));
  }
  const path = pathInformation(roundWalkingPath(points, navigator));
  state.animation = { type: 'tour', path, time: 0, duration: Math.max(11, path.length / 1.05),
    fromQuaternion: camera.quaternion.clone() };
  showTravel('正在引导 · 可随时拖动或跳过');
  $('#view-label').textContent = '循光入洞 · 从山间入口走近晚宴';
  setStatus('正在引导 · 可随时拖动或跳过');
}
function finishTour() {
  state.animation = null; $('#tour-skip').hidden = true;
  document.body.classList.remove('is-travelling');
  state.view = 'table'; setPressed('[data-view]', 'view', 'table');
  $('#view-label').textContent = manifest.views.table.label;
  camera.lookAt(...manifest.views.table.look); syncAngles();
  setStatus('已到达晚宴桌 · 开始自由探索');
  state.needsRender = true;
}
function updateAnimation(delta) {
  const animation = state.animation;
  if (!animation) return;
  animation.time += delta;
  const progress = clamp(animation.time / animation.duration, 0, 1);
  const eased = easeCamera(progress);
  document.body.style.setProperty('--travel-progress', `${progress * 100}%`);
  if (animation.type === 'flight') {
    camera.position.copy(sampleFlight(animation, eased * animation.length));
    const ahead = sampleFlight(animation, Math.min(animation.length, eased * animation.length + 2.5));
    lookTarget.copy(ahead); lookTarget.y = camera.position.y < 2.5 ? 1.85 : Math.min(ahead.y, 3);
    scratchCamera.position.copy(camera.position); scratchCamera.lookAt(lookTarget);
    const settle = easeCamera(clamp((progress - 0.68) / 0.32, 0, 1));
    targetQuaternion.copy(scratchCamera.quaternion).slerp(animation.toQuaternion, settle);
    camera.quaternion.slerp(targetQuaternion, 1 - Math.exp(-delta * 3.5));
    camera.fov = THREE.MathUtils.lerp(animation.fromFov, animation.toFov, eased);
    camera.updateProjectionMatrix();
    // Only expose the cutaway once the camera is safely above the entire roof.
    const fullShell = camera.position.y < 8 || state.showRoof;
    roof.visible = fullShell; walls.visible = fullShell;
    if (progress === 1) {
      state.animation = null; selectView(animation.destination, { instant: true });
      document.body.classList.remove('is-travelling'); $('#tour-skip').hidden = true;
    }
    camera.updateMatrixWorld(); state.needsRender = true; return;
  }
  const point = samplePath(animation.path, eased * animation.path.length);
  camera.position.x = point.x; camera.position.z = point.z;
  if (animation.type === 'view') {
    camera.position.y = THREE.MathUtils.lerp(animation.fromY, animation.toY, eased);
    const ahead = samplePath(animation.path, Math.min(animation.path.length, eased * animation.path.length + 1.6));
    scratchCamera.position.copy(camera.position); scratchCamera.lookAt(ahead.x, camera.position.y + 0.05, ahead.z);
    const faceRoute = easeCamera(clamp(progress / 0.20, 0, 1));
    const arrival = easeCamera(clamp((progress - 0.64) / 0.36, 0, 1));
    targetQuaternion.copy(animation.fromQuaternion).slerp(scratchCamera.quaternion, animation.path.length > 0.5 ? faceRoute : 0);
    targetQuaternion.slerp(animation.toQuaternion, arrival);
    camera.quaternion.slerp(targetQuaternion, 1 - Math.exp(-delta * 5));
    if (progress > 0.92) camera.quaternion.slerp(animation.toQuaternion, easeCamera((progress - 0.92) / 0.08));
    camera.fov = THREE.MathUtils.lerp(animation.fromFov, animation.toFov, eased);
    camera.updateProjectionMatrix();
    if (progress === 1) { setPose(animation.pose); cancelAnimation(); }
  } else {
    camera.position.y = 1.63;
    const ahead = samplePath(animation.path, Math.min(animation.path.length, eased * animation.path.length + 2.5));
    lookTarget.set(ahead.x, 1.9, ahead.z);
    if (progress > 0.64) {
      const reveal = clamp((progress - 0.64) / 0.3, 0, 1);
      lookTarget.lerp(new THREE.Vector3().fromArray(manifest.views.table.look), reveal);
    }
    scratchCamera.position.copy(camera.position); scratchCamera.lookAt(lookTarget);
    targetQuaternion.copy(scratchCamera.quaternion);
    camera.quaternion.slerp(targetQuaternion, 1 - Math.exp(-delta * 2.4));
    if (progress === 1) finishTour();
  }
  camera.updateMatrixWorld(); state.needsRender = true;
}
function applyLighting(delta = 1) {
  const natural = state.light === 'natural';
  const tour = state.animation?.type === 'tour';
  const reveal = tour ? clamp((16.4 - camera.position.z) / 11, 0, 1) : 1;
  const factor = delta >= 1 ? 1 : 1 - Math.exp(-delta * 3);
  hemisphere.intensity = THREE.MathUtils.lerp(hemisphere.intensity, natural ? 1.45 : 0.7, factor);
  ambient.intensity = THREE.MathUtils.lerp(ambient.intensity, natural ? 0.42 : 0.2, factor);
  scene.environmentIntensity = THREE.MathUtils.lerp(scene.environmentIntensity, natural ? 0.42 : 0.25, factor);
  for (const light of lights) {
    const role = light.userData.lightingRole;
    const brightness = role === 'entry' ? (natural ? 1.1 : 0.85)
      : role === 'rock' ? (natural ? 0.7 : 0.42 + 0.58 * reveal) : (natural ? 0.95 : 0.6 + 0.4 * reveal);
    light.intensity = THREE.MathUtils.lerp(light.intensity, light.userData.baseIntensity * brightness, factor);
    if (role === 'rock') light.color.lerp(new THREE.Color(natural ? 0xffe3bd : 0xffc27a), factor);
  }
  const flicker = reducedMotion.matches ? 1 : 1 + Math.sin(elapsed * 2.3) * 0.012 + Math.sin(elapsed * 4.7) * 0.005;
  heroSpot.intensity = THREE.MathUtils.lerp(heroSpot.intensity, (natural ? 27 : 36) * (0.6 + 0.4 * reveal) * flicker, factor);
}
function selectLight(name) {
  if (!state.ready) return;
  state.light = name; setPressed('[data-light]', 'light', name);
  applyLighting(); state.needsRender = true;
  setStatus(name === 'natural' ? '明亮参观 · 看清岩壁与布局' : '烛光晚宴 · 暖光沿岩壁铺开');
}
function selectComparison(name) {
  if (!state.ready || !manifest.comparisons[name]) return;
  beginExploration(); clearInput(); cancelAnimation(); closeDetail();
  state.comparing = true; state.comparison = name; state.overview = false;
  document.body.classList.add('is-comparing'); document.body.classList.remove('is-overview');
  $('#compare-panel').hidden = false; $('#open-compare').setAttribute('aria-expanded', 'true');
  setPressed('[data-compare]', 'compare', name);
  const comparison = manifest.comparisons[name];
  $('#compare-image').src = comparison.image;
  $('#compare-image').alt = `岩洞餐厅实拍：${comparison.label}`;
  $('#compare-caption').textContent = comparison.label;
  $('.compare-note').textContent = comparison.note;
  $('#view-label').textContent = `${comparison.label} · 近似机位`;
  updateShell(); setPose(comparison); resize();
  setStatus('实拍对照 · 可拖动观察相同空间');
}
function turn(dx, dy) {
  cancelAnimation();
  if (state.overview) {
    orbit.theta -= dx * 0.006; orbit.phi = clamp(orbit.phi - dy * 0.005, 0.22, 1.47); updateOrbit();
  } else {
    state.yaw -= dx * 0.0035; state.pitch = clamp(state.pitch - dy * 0.0035, -1.18, 1.22); applyAngles();
  }
}
function zoom(amount) {
  if (!state.ready) return;
  cancelAnimation();
  if (state.overview) { orbit.radius = clamp(orbit.radius * Math.exp(amount), 15, 70); updateOrbit(); }
  else { camera.fov = clamp(camera.fov + amount * 32, 34, 83); camera.updateProjectionMatrix(); state.needsRender = true; }
}
function updateWalking(delta) {
  if (!state.started || state.overview || state.comparing || $('dialog[open]')) return;
  const has = (key, pad) => state.pressed.has(key) || state.pad.has(pad);
  let forward = Number(has('KeyW', 'forward')) - Number(has('KeyS', 'backward'));
  let side = Number(has('KeyD', 'right')) - Number(has('KeyA', 'left'));
  if (!forward && !side) return;
  cancelAnimation();
  const length = Math.hypot(forward, side); forward /= length; side /= length;
  const speed = state.pressed.has('ShiftLeft') || state.pressed.has('ShiftRight') ? 2.45 : 1.65;
  const dx = (-Math.sin(state.yaw) * forward + Math.cos(state.yaw) * side) * speed * delta;
  const dz = (-Math.cos(state.yaw) * forward - Math.sin(state.yaw) * side) * speed * delta;
  const next = navigator.move({ x: camera.position.x, z: camera.position.z }, dx, dz);
  camera.position.set(next.x, 1.63, next.z); camera.updateMatrixWorld();
  groundPosition = camera.position.clone(); state.needsRender = true;
  setStatus(next.blocked ? '前方有岩壁或家具 · 可转向继续参观' : '自由行走 · 拖动环顾四周');
}
function buildHotspots() {
  for (const [index, data] of manifest.hotspots.entries()) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'scene-hotspot'; button.hidden = true;
    button.setAttribute('aria-label', `了解${data.name}`);
    const number = document.createElement('span'); number.className = 'hotspot-number'; number.textContent = String(index + 1).padStart(2, '0');
    const label = document.createElement('span'); label.textContent = data.name;
    button.append(number, label); $('#hotspot-layer').append(button);
    button.addEventListener('click', () => {
      cancelAnimation(); $('#detail-title').textContent = data.title; $('#detail-copy').textContent = data.copy;
      $('#detail-panel').hidden = false; $('#detail-close').focus({ preventScroll: true });
    });
    hotspots.push({ data, button, position: new THREE.Vector3().fromArray(data.pos), occluded: false });
  }
}
function updateHotspots(time) {
  const enabled = state.started && !state.overview && !state.animation;
  const refreshOcclusion = time - lastHotspotTime > 0.35;
  if (refreshOcclusion) lastHotspotTime = time;
  for (const hotspot of hotspots) {
    if (!enabled) { hotspot.button.hidden = true; continue; }
    projected.copy(hotspot.position).project(camera);
    const inFrame = projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < 0.91 && Math.abs(projected.y) < 0.8;
    if (!inFrame) { hotspot.button.hidden = true; continue; }
    if (refreshOcclusion) {
      direction.copy(hotspot.position).sub(camera.position);
      const distance = direction.length(); raycaster.set(camera.position, direction.normalize());
      raycaster.far = Math.max(0.01, distance - 0.22);
      hotspot.occluded = raycaster.intersectObjects(occluders, false).some(hit => hit.object.visible && hit.distance < distance - 0.22);
    }
    hotspot.button.hidden = hotspot.occluded;
    if (!hotspot.occluded) {
      hotspot.button.style.transform = `translate(${(projected.x + 1) * stage.clientWidth / 2}px,${(1 - projected.y) * stage.clientHeight / 2}px) translate(-50%,-50%)`;
    }
  }
}
function bindSceneControls() {
  const motionButton = $('#toggle-motion');
  const syncMotionButton = () => {
    motionButton.setAttribute('aria-pressed', String(motionEnabled));
    motionButton.setAttribute('aria-label', `镜头动画：${motionEnabled ? '开启' : '关闭'}`);
    motionButton.title = motionEnabled ? '镜头动画已开启 · 点击关闭' : '镜头动画已关闭 · 点击开启';
    canvas.dataset.motion = String(motionEnabled);
  };
  syncMotionButton();
  motionButton.addEventListener('click', () => {
    motionOverride = true; motionEnabled = !motionEnabled;
    try { localStorage.setItem('cave-camera-motion', motionEnabled ? 'on' : 'off'); } catch {}
    if (!motionEnabled && state.animation) {
      const destination = state.animation.type === 'tour' ? 'table' : state.animation.destination || state.view;
      state.animation = null; selectView(destination, { instant: true });
    }
    syncMotionButton();
    setStatus(motionEnabled ? '镜头动画已开启 · 点击下方视角体验过场' : '镜头动画已关闭 · 视角立即切换');
  });
  $('#enter-scene').addEventListener('click', startTour);
  $('#tour-replay').addEventListener('click', startTour);
  $('#tour-skip').addEventListener('click', () => {
    const destination = state.animation?.type === 'tour' ? 'table' : state.animation?.destination || state.view;
    state.animation = null; selectView(destination, { instant: true });
  });
  $$('[data-view]').forEach(button => button.addEventListener('click', () => selectView(button.dataset.view)));
  $$('[data-light]').forEach(button => button.addEventListener('click', () => selectLight(button.dataset.light)));
  $$('[data-compare]').forEach(button => button.addEventListener('click', () => selectComparison(button.dataset.compare)));
  $('#open-compare').addEventListener('click', () => state.comparing ? closeComparison(true) : selectComparison(state.comparison));
  $('#close-compare').addEventListener('click', () => closeComparison(true));
  $('#toggle-roof').addEventListener('click', () => { state.showRoof = !state.showRoof; updateShell(); });
  $('#reset-view').addEventListener('click', () => {
    if (state.comparing) selectComparison(state.comparison);
    else selectView(state.view, { instant: true });
  });
  $('#detail-close').addEventListener('click', () => { closeDetail(); canvas.focus({ preventScroll: true }); });
  canvas.addEventListener('pointerdown', event => {
    if (!state.ready) return;
    event.preventDefault(); canvas.focus({ preventScroll: true }); cancelAnimation();
    canvas.setPointerCapture(event.pointerId);
    state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  });
  canvas.addEventListener('pointermove', event => {
    const old = state.pointers.get(event.pointerId);
    if (!old) return;
    const next = { x: event.clientX, y: event.clientY };
    if (state.pointers.size === 1) turn(next.x - old.x, next.y - old.y);
    else if (state.pointers.size === 2) {
      const other = [...state.pointers.entries()].find(([id]) => id !== event.pointerId)?.[1];
      if (other) {
        const previousDistance = Math.hypot(old.x - other.x, old.y - other.y);
        const nextDistance = Math.hypot(next.x - other.x, next.y - other.y);
        if (previousDistance > 5 && nextDistance > 5) zoom(Math.log(previousDistance / nextDistance));
      }
    }
    state.pointers.set(event.pointerId, next);
  });
  const releasePointer = event => state.pointers.delete(event.pointerId);
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(name => canvas.addEventListener(name, releasePointer));
  canvas.addEventListener('wheel', event => { event.preventDefault(); zoom(clamp(event.deltaY, -120, 120) * 0.0015); }, { passive: false });
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  for (const button of $$('[data-move]')) {
    button.addEventListener('pointerdown', event => {
      event.preventDefault(); if (!state.ready) return;
      beginExploration(); cancelAnimation(); button.setPointerCapture(event.pointerId);
      state.pad.add(button.dataset.move); button.classList.add('is-active');
    });
    const release = () => { state.pad.delete(button.dataset.move); button.classList.remove('is-active'); };
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(name => button.addEventListener(name, release));
    button.addEventListener('keydown', event => {
      if (event.code === 'Space' || event.code === 'Enter') { event.preventDefault(); state.pad.add(button.dataset.move); }
    });
    button.addEventListener('keyup', release); button.addEventListener('blur', release);
  }
  document.addEventListener('keydown', event => {
    if (event.code === 'Escape') { closeDetail(); if (state.comparing && !$('dialog[open]')) closeComparison(); cancelAnimation(); return; }
    if (!state.ready || $('dialog[open]') || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) return;
    if (event.code === 'Home') { event.preventDefault(); selectView('hall', { instant: true }); return; }
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(event.code)) {
      event.preventDefault(); beginExploration(); cancelAnimation(); state.pressed.add(event.code);
    }
  });
  document.addEventListener('keyup', event => state.pressed.delete(event.code));
  window.addEventListener('blur', clearInput);
  document.addEventListener('visibilitychange', () => { clearInput(); lastTime = 0; if (!document.hidden) state.needsRender = true; });
  reducedMotion.addEventListener('change', () => {
    if (!motionOverride) {
      motionEnabled = !reducedMotion.matches; syncMotionButton();
      if (!motionEnabled && state.animation) $('#tour-skip').click();
    }
    state.needsRender = true;
  });
  new ResizeObserver(resize).observe(stage);
  smallScreen.addEventListener('change', resize);
}
function makeEnvironment() {
  const room = new THREE.Scene(); room.background = new THREE.Color(0x776e60);
  const shell = new THREE.Mesh(new THREE.BoxGeometry(24, 16, 26), new THREE.MeshBasicMaterial({ color: 0x67645b, side: THREE.BackSide }));
  room.add(shell);
  for (const [position, size, color] of [
    [[-7, 4, 1], [4, 6], 0xf1ead9], [[7, 3, -5], [3, 5], 0xf4dfb3], [[1, 6, 8], [6, 3], 0xd7dde0],
  ]) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(...size), new THREE.MeshBasicMaterial({ color }));
    panel.position.fromArray(position); panel.lookAt(0, 1, 0); room.add(panel);
  }
  const generator = new THREE.PMREMGenerator(renderer);
  environment = generator.fromScene(room, 0);
  scene.environment = environment.texture; scene.environmentIntensity = 0.25;
  generator.dispose(); room.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
}
function publishDiagnostics(delta) {
  if (delta > 0) fps = THREE.MathUtils.lerp(fps, 1 / delta, 0.08);
  canvas.dataset.ready = String(state.ready);
  canvas.dataset.position = JSON.stringify(camera.position.toArray().map(value => +value.toFixed(3)));
  canvas.dataset.rotation = JSON.stringify([camera.rotation.x, camera.rotation.y, camera.rotation.z].map(value => +value.toFixed(3)));
  canvas.dataset.drawCalls = String(renderer.info.render.calls);
  canvas.dataset.triangles = String(renderer.info.render.triangles);
  canvas.dataset.animating = state.animation?.type || 'false';
  canvas.dataset.transitionProgress = state.animation ? (state.animation.time / state.animation.duration).toFixed(3) : '1';
  canvas.dataset.view = state.overview ? 'overview' : state.comparing ? `compare-${state.comparison}` : state.view;
  canvas.dataset.light = state.light;
  canvas.dataset.fps = String(Math.round(fps));
  canvas.dataset.roofVisible = String(roof?.visible ?? true);
  canvas.dataset.wallsVisible = String(walls?.visible ?? true);
}
function frame(timeMilliseconds) {
  requestAnimationFrame(frame);
  if (!state.ready || document.hidden) { lastTime = 0; return; }
  const time = timeMilliseconds / 1000;
  const delta = lastTime ? Math.min(time - lastTime, 0.05) : 0;
  lastTime = time; elapsed += delta;
  if (!$('dialog[open]')) {
    updateAnimation(delta); updateWalking(delta);
    let dx = Number(state.pressed.has('ArrowRight')) - Number(state.pressed.has('ArrowLeft'));
    let dy = Number(state.pressed.has('ArrowDown')) - Number(state.pressed.has('ArrowUp'));
    if (dx || dy) turn(dx * delta * 230, dy * delta * 230);
  }
  const idleInterval = reducedMotion.matches ? 1 : 1 / 30;
  if (state.needsRender || state.animation || time - lastRenderTime >= idleInterval) {
    applyLighting(delta); camera.updateMatrixWorld();
    renderer.render(scene, camera); updateHotspots(time);
    publishDiagnostics(lastRenderTime >= 0 ? time - lastRenderTime : delta);
    lastRenderTime = time; state.needsRender = false;
  }
}

async function initialize() {
  canvas.dataset.ready = 'loading';
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene = new THREE.Scene(); scene.background = new THREE.Color(0x1e2420);
  camera = new THREE.PerspectiveCamera(66, 1, 0.045, 130);
  hemisphere = new THREE.HemisphereLight(0xe8e3d6, 0x414139, 0.7);
  ambient = new THREE.AmbientLight(0xffffff, 0.2); scene.add(hemisphere, ambient);
  heroSpot = new THREE.SpotLight(0xffe3b4, 36, 11, Math.PI / 3.1, 0.85, 2);
  heroSpot.position.set(3.5, 3.1, 5.3); heroSpot.target.position.set(3.1, 0.7, 3.3);
  heroSpot.castShadow = true;
  const shadowSize = smallScreen.matches ? 1024 : 2048;
  heroSpot.shadow.mapSize.set(shadowSize, shadowSize); heroSpot.shadow.bias = -0.0004;
  heroSpot.shadow.normalBias = 0.025; heroSpot.shadow.camera.near = 0.15; heroSpot.shadow.camera.far = 11;
  scene.add(heroSpot, heroSpot.target);
  makeEnvironment(); resize();
  const [loadedManifest, gltf] = await Promise.all([
    fetch('./models/scene-manifest.json').then(response => {
      if (!response.ok) throw new Error(`Manifest could not load (${response.status})`);
      return response.json();
    }),
    new GLTFLoader().loadAsync('./models/cave-restaurant.glb', progress => {
      const percent = progress.total ? Math.round(progress.loaded / progress.total * 100) : 0;
      $('#loading-label').textContent = percent ? `正在打开完整溶洞场景 · ${percent}%` : '正在打开完整溶洞场景';
    }),
  ]);
  manifest = loadedManifest; navigator = createNavigator(manifest.navigation);
  model = gltf.scene; scene.add(model);
  roof = model.getObjectByName('ShellRoof'); walls = model.getObjectByName('ShellWalls');
  const anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), smallScreen.matches ? 4 : 8);
  const processedMaterials = new Set();
  model.traverse(object => {
    if (object.isLight) {
      object.userData.baseIntensity ??= object.intensity;
      object.userData.lightingRole ??= object.parent?.userData.lightingRole || 'table';
      object.castShadow = false; lights.push(object);
    }
    if (!object.isMesh) return;
    const rock = /Limestone|ShellRoof|ShellWalls/.test(object.name);
    object.castShadow = !rock && !/Glass|Flame|Grounds/.test(object.name);
    object.receiveShadow = !/Flame/.test(object.name);
    if (/ShellRoof|ShellWalls|Facade/.test(object.name) && !/Glass/.test(object.name)) occluders.push(object);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (processedMaterials.has(material)) continue;
      processedMaterials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) value.anisotropy = anisotropy;
    }
  });
  setPose(manifest.views.hall); groundPosition = camera.position.clone();
  $('#view-label').textContent = manifest.views.hall.label;
  buildHotspots(); bindSceneControls(); applyLighting();
  $('#loading-label').textContent = '正在点亮岩壁与餐桌';
  if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
  renderer.render(scene, camera);
  renderer.shadowMap.autoUpdate = false;
  state.ready = true;
  $('#loading').hidden = true; setStatus('场景已就绪 · 进入溶洞开始参观');
  publishDiagnostics(0); requestAnimationFrame(frame);
}

canvas.addEventListener('webglcontextlost', event => {
  event.preventDefault(); fallback(new Error('WebGL context was lost. Reload to restore the complete scene.'));
});
initialize().catch(fallback);
