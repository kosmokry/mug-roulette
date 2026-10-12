import * as THREE from './vendor/three.module.js';
import { RoomEnvironment } from './vendor/env/RoomEnvironment.js';

/* ---------- данные ---------- */
const NAMES = [
  'Оранжевая · Life is for fun',
  'Белая · Do your best',
  'Синяя ребристая',
  'Starbucks · Coffee for all',
  'Полосатая с цветком',
  'Сардины',
  'Кот',
  'Розовая с котиком',
];
const RIBBED = new Set([2, 7]);
const BUST = '?b=' + Date.now();
const $ = (s) => document.querySelector(s);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const rgb = (a) => new THREE.Color().setRGB(a[0] / 255, a[1] / 255, a[2] / 255, THREE.SRGBColorSpace);

/* ---------- сцена ---------- */
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(location.search.includes('lo') ? 1 : Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.NoToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.75;
const key = new THREE.DirectionalLight(0xfff0d8, 2.2);
key.position.set(-3, 5, 6);
scene.add(key);
const rim = new THREE.DirectionalLight(0xffb070, 1.2);
rim.position.set(5, 2, -4);
scene.add(rim);

const FOV = 30;
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
const STILL = location.search.includes('still');
const TILT = 0; // только вид сбоку

/* ---------- сборка кружки из данных фото ---------- */
const texLoader = new THREE.TextureLoader();
const loadTex = (u, srgb = true) => new Promise((res, rej) => texLoader.load(u, (t) => {
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  res(t);
}, undefined, rej));

function profileR(prof, h) {
  if (h <= prof[0][1]) return prof[0][0];
  for (let i = 1; i < prof.length; i++) {
    if (h <= prof[i][1]) {
      const t = (h - prof[i - 1][1]) / (prof[i][1] - prof[i - 1][1]);
      return lerp(prof[i - 1][0], prof[i][0], t);
    }
  }
  return prof[prof.length - 1][0];
}


const DISSOLVE_NOISE = `
uniform float uD; uniform vec3 uC; varying vec3 vDPos;
float dh(vec3 p){ p = fract(p * 0.3183099 + .1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float dn(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(dh(i),dh(i+vec3(1,0,0)),f.x),mix(dh(i+vec3(0,1,0)),dh(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(dh(i+vec3(0,0,1)),dh(i+vec3(1,0,1)),f.x),mix(dh(i+vec3(0,1,1)),dh(i+vec3(1,1,1)),f.x),f.y),f.z); }
`;
function patchDissolve(mat, uni) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uD = uni.uD; sh.uniforms.uC = uni.uC;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDPos; uniform vec3 uC;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDPos = (modelMatrix * vec4(position, 1.0)).xyz - uC;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + DISSOLVE_NOISE)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
float dEdge = 0.0;
if (uD > 0.0) {
  float sweep = clamp((vDPos.x + 1.2) / 2.4, 0.0, 1.0);
  float dv = 0.55 * dn(vDPos * 7.0) + 0.15 * dn(vDPos * 22.0) + 0.30 * sweep;
  float th = uD * 1.12 - 0.06;
  if (dv < th) discard;
  dEdge = smoothstep(th + 0.07, th, dv);
}`)
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.rgb += vec3(1.0, 0.55, 0.18) * dEdge * 1.6;');
  };
  mat.customProgramCacheKey = () => 'dissolve';
}

function makePodium() {
  const group = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0x1c1411, roughness: 0.45, metalness: 0.55 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.3, 0.62, 56), stone);
  body.position.y = -0.31 - 0.0;
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xe9c46a, roughness: 0.25, metalness: 1, emissive: 0x3a2506, emissiveIntensity: 0.5 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.14, 0.045, 12, 72), goldMat);
  ring.rotation.x = Math.PI / 2; ring.position.y = -0.015;
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.27, 0.03, 10, 72), goldMat);
  ring2.rotation.x = Math.PI / 2; ring2.position.y = -0.58;
  const topMat = new THREE.MeshBasicMaterial({ map: podTopTex, color: 0xffd27a, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending });
  const top = new THREE.Mesh(new THREE.CircleGeometry(1.12, 56), topMat);
  top.rotation.x = -Math.PI / 2; top.position.y = 0.004;
  group.add(body, ring, ring2, top);
  return { group, goldMat, topMat, ring };
}

async function buildMug(d, i) {
  const [tex, floorTex] = await Promise.all([loadTex(`assets/mug${i}.jpg${BUST}`), loadTex(`assets/floor${i}.jpg${BUST}`)]);
  const mats = [];
  const uni = { uD: { value: 0 }, uC: { value: new THREE.Vector3() } };
  const reg = (m, base) => { m.userData.base = base.clone(); mats.push(m); patchDissolve(m, uni); return m; };
  const g = new THREE.Group();
  const H = d.H, prof = d.profile, wall = 0.07;

  // наружная стенка — фото-развёртка
  const outerMat = reg(new THREE.MeshPhysicalMaterial({
    map: tex, emissiveMap: tex, emissive: new THREE.Color(1,1,1), emissiveIntensity: 0.95, roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.25, side: THREE.DoubleSide,
    ...(RIBBED.has(i) ? { bumpMap: tex, bumpScale: 1.4 } : {}),
  }), new THREE.Color(0.35, 0.35, 0.35));
  const outerPts = prof.map(([r, h]) => new THREE.Vector2(r, h));
  g.add(new THREE.Mesh(new THREE.LatheGeometry(outerPts, 96), outerMat));

  // дно
  const baseCol = rgb(d.baseColor);
  const botMat = reg(new THREE.MeshStandardMaterial({ color: baseCol, roughness: 0.5 }), baseCol);
  const bot = new THREE.Mesh(new THREE.CircleGeometry(prof[0][0], 48), botMat);
  bot.rotation.x = Math.PI / 2;
  g.add(bot);

  // внутренняя стенка
  const wallCol = rgb(d.wallColor);
  const wallMat = reg(new THREE.MeshPhysicalMaterial({ color: wallCol, emissive: wallCol, emissiveIntensity: 0.15, roughness: 0.3, clearcoat: 0.6, side: THREE.DoubleSide }), wallCol);
  const floorH = 0.14;
  const inner = [];
  for (let k = 0; k < 14; k++) {
    const h = lerp(floorH, H, k / 13);
    inner.push(new THREE.Vector2(profileR(prof, h) - wall, h));
  }
  {
    const ig = new THREE.LatheGeometry(inner, 72);
    const pos = ig.attributes.position, col = new Float32Array(pos.count * 3);
    for (let v = 0; v < pos.count; v++) { const k = clamp((pos.getY(v) - floorH) / (H - floorH), 0, 1); const c = lerp(0.5, 1, Math.sqrt(k)); col.set([c, c, c], v * 3); }
    ig.setAttribute('color', new THREE.BufferAttribute(col, 3));
    wallMat.vertexColors = true;
    g.add(new THREE.Mesh(ig, wallMat));
  }
  // кромка
  const rimCol = baseCol.clone();
  const rimMat = reg(new THREE.MeshStandardMaterial({ color: rimCol, roughness: 0.35, side: THREE.DoubleSide }), rimCol);
  const rimMesh = new THREE.Mesh(new THREE.RingGeometry(prof[prof.length - 1][0] - wall, prof[prof.length - 1][0], 64), rimMat);
  rimMesh.rotation.x = -Math.PI / 2; rimMesh.position.y = H;
  g.add(rimMesh);
  // дно внутри — фото донышка
  const floorMat = reg(new THREE.MeshPhysicalMaterial({ map: floorTex, emissiveMap: floorTex, emissive: new THREE.Color(1,1,1), emissiveIntensity: 0.4, roughness: 0.25, clearcoat: 0.8 }), new THREE.Color(1, 1, 1));
  const floor = new THREE.Mesh(new THREE.CircleGeometry(inner[0].x, 48), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.y = floorH;
  floor.rotation.z = -Math.PI / 2; // ручка у фото справа (+x)
  g.add(floor);

  // ручка — силуэт со снимка, выдавленный в объём
  const hp = d.handle[0];
  if (hp) {
    const pts = hp.pts.map(([x, y]) => {
      const edge = profileR(prof, clamp(y, 0, H));
      return new THREE.Vector2(x < edge + 0.07 ? x - 0.16 : x, y);
    });
    const shape = new THREE.Shape(pts);
    const depth = clamp(d.handleStroke * 0.9, 0.12, 0.34);
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth, bevelEnabled: true, bevelThickness: depth * 0.38, bevelSize: 0.028, bevelSegments: 5, curveSegments: 1, steps: 1,
    });
    geo.translate(0, 0, -depth / 2);
    const hc = rgb(d.handleColor);
    const hm = reg(new THREE.MeshPhysicalMaterial({ color: hc, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15 }), hc);
    g.add(new THREE.Mesh(geo, hm));
  }

  // особые детали
  if (i === 6) { // кот: ушки
    const ec = rgb(d.baseColor);
    for (const s of [-1, 1]) {
      const m = reg(new THREE.MeshPhysicalMaterial({ color: ec, roughness: 0.3, clearcoat: 0.7 }), ec);
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.42, 4), m);
      ear.scale.z = 0.35;
      ear.position.set(s * 0.74, H + 0.04, 0);
      ear.rotation.z = -s * 0.3;
      ear.rotation.y = Math.PI / 4;
      g.add(ear);
    }
  }
  if (i === 7) { // котик на ободке
    const wc = new THREE.Color(0xf6efe6);
    const m = reg(new THREE.MeshPhysicalMaterial({ color: wc, roughness: 0.35, clearcoat: 0.6 }), wc);
    const k = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 14), m); body.scale.set(1.2, 0.8, 0.9);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 14), m); head.position.set(0.14, 0.07, 0);
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.07, 4), m); e.position.set(0.15, 0.17, s * 0.06); k.add(e);
    }
    k.add(body, head);
    const a = -0.7, rr = prof[prof.length - 1][0] - 0.02;
    k.position.set(Math.sin(a) * rr, H + 0.07, Math.cos(a) * rr);
    k.rotation.y = a + Math.PI / 2;
    g.add(k);
  }

  // нормализуем размер, центр по середине
  const box = new THREE.Box3().setFromObject(g);
  const size = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  const SPAN = 2.0;
  const sc = SPAN / Math.max(size.y, size.x * 0.95);
  g.position.set(-c.x, -box.min.y, -c.z);
  const pivot = new THREE.Group();   // вращение вокруг своей оси
  pivot.add(g);
  const root = new THREE.Group();
  root.add(pivot);
  root.scale.setScalar(sc);

  // свечение за кружкой
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffd27a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.set(4.2, 4.2, 1);
  glow.position.z = -0.8;

  const holder = new THREE.Group();
  const pod = makePodium();
  glow.position.y = size.y * sc * 0.5;
  holder.add(pod.group, glow, root);
  scene.add(holder);
  const mugH = size.y * sc;

  return {
    i, name: NAMES[i], holder, root, pivot, glow, mats, uni, pod, mugH, lift: 0,
    baseScale: sc, pos: new THREE.Vector3(), target: new THREE.Vector3(), tScale: 1, scale: 1,
    dim: 1, tDim: 1, glowT: 0, alive: true, phase: Math.random() * 6.28, spin: 0.45 + Math.random() * 0.2,
    fx: null, rot: location.search.includes('still') ? 0 : Math.random() * 6.28,
  };
}

function radialTex(stops) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const x = cv.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const glowTex = radialTex([[0, 'rgba(255,255,255,.95)'], [0.25, 'rgba(255,255,255,.4)'], [1, 'rgba(255,255,255,0)']]);
const podTopTex = radialTex([[0, 'rgba(255,255,255,1)'], [0.7, 'rgba(255,255,255,.35)'], [1, 'rgba(255,255,255,0)']]);
const sparkTex = radialTex([[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,255,255,.6)'], [1, 'rgba(255,255,255,0)']]);

/* ---------- частицы ---------- */
const NP = 700;
const pPos = new Float32Array(NP * 3), pCol = new Float32Array(NP * 3), pVel = new Float32Array(NP * 3), pLife = new Float32Array(NP), pSize = new Float32Array(NP);
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const pMat = new THREE.PointsMaterial({ size: 0.16, map: sparkTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
const points = new THREE.Points(pGeo, pMat);
points.frustumCulled = false;
scene.add(points);
let pCursor = 0;
function burst(origin, n, colors, speed = 4, grav = 6) {
  for (let k = 0; k < n; k++) {
    const j = pCursor++ % NP;
    const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.3) * 1.6, s = speed * (0.35 + Math.random());
    pPos.set([origin.x, origin.y, origin.z + 0.5], j * 3);
    pVel.set([Math.cos(a) * s, Math.sin(e) * s * 0.9 + 1, Math.sin(a) * s * 0.6], j * 3);
    const c = colors[(Math.random() * colors.length) | 0];
    pCol.set([c.r, c.g, c.b], j * 3);
    pLife[j] = 0.9 + Math.random() * 0.9;
  }
  burst.grav = grav;
}
burst.grav = 6;
function stepParticles(dt) {
  for (let j = 0; j < NP; j++) {
    if (pLife[j] <= 0) { pPos[j * 3 + 1] = -999; continue; }
    pLife[j] -= dt;
    pVel[j * 3 + 1] -= burst.grav * dt;
    for (let a = 0; a < 3; a++) pPos[j * 3 + a] += pVel[j * 3 + a] * dt;
    const f = clamp(pLife[j] * 1.6, 0, 1);
    pCol[j * 3] *= 1 - dt * 0.4; pCol[j * 3 + 1] *= 1 - dt * 0.5; pCol[j * 3 + 2] *= 1 - dt * 0.5;
    if (f < 1) { pCol[j * 3] *= f; pCol[j * 3 + 1] *= f; pCol[j * 3 + 2] *= f; }
  }
  pGeo.attributes.position.needsUpdate = true;
  pGeo.attributes.color.needsUpdate = true;
}
const GOLD = [new THREE.Color(1, 0.82, 0.35), new THREE.Color(1, 0.95, 0.7), new THREE.Color(1, 0.6, 0.2)];
const RED = [new THREE.Color(1, 0.25, 0.15), new THREE.Color(1, 0.55, 0.2), new THREE.Color(0.9, 0.9, 0.9)];

/* ---------- энергия вокруг выбранной кружки и шар раскрытия ---------- */
const swirl = new THREE.Group();
const swirlMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
const rings = [];
for (let k = 0; k < 4; k++) {
  const r = new THREE.Mesh(new THREE.TorusGeometry(1.35 + k * 0.22, 0.014 + k * 0.004, 6, 160, Math.PI * (1.2 + k * 0.15)), swirlMat);
  r.rotation.set(1.1 + k * 0.5, k * 0.9, k * 1.3); rings.push(r); swirl.add(r);
}
scene.add(swirl);
const orbMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xcff6ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
const orb = new THREE.Sprite(orbMat); orb.visible = false; scene.add(orb);
const flashEl = document.createElement('div'); flashEl.id = 'flash'; document.body.appendChild(flashEl);
let pulse = 0, focusAmt = 0, focusPos = new THREE.Vector3(), orbT = -1;

/* ---------- музыка: барабаны + скрипка (синтез) ---------- */
let actx = null, master = null, muted = false, noiseBuf = null;
function audio() {
  if (!actx) {
    try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
    master = actx.createGain(); master.gain.value = muted ? 0 : 0.9;
    const comp = actx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp).connect(actx.destination);
    noiseBuf = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
    const ch = noiseBuf.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  }
  if (actx.state === 'suspended') actx.resume();
  return actx;
}
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
function env(g, t, a, peak, d, end = 0.0001) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(end, t + a + d); }

function kick(t, v = 1) {
  const o = actx.createOscillator(), g = actx.createGain();
  o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
  env(g, t, 0.004, 0.95 * v, 0.28); o.connect(g).connect(master); o.start(t); o.stop(t + 0.4);
}
function snare(t, v = 1) {
  const n = actx.createBufferSource(); n.buffer = noiseBuf; const f = actx.createBiquadFilter(), g = actx.createGain();
  f.type = 'bandpass'; f.frequency.value = 2200; f.Q.value = 0.7; env(g, t, 0.002, 0.55 * v, 0.14);
  n.connect(f).connect(g).connect(master); n.start(t, Math.random() * 0.5, 0.25);
  const o = actx.createOscillator(), og = actx.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(230, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
  env(og, t, 0.002, 0.35 * v, 0.1); o.connect(og).connect(master); o.start(t); o.stop(t + 0.2);
}
function hat(t, v = 1) {
  const n = actx.createBufferSource(); n.buffer = noiseBuf; const f = actx.createBiquadFilter(), g = actx.createGain();
  f.type = 'highpass'; f.frequency.value = 7000; env(g, t, 0.001, 0.16 * v, 0.045);
  n.connect(f).connect(g).connect(master); n.start(t, Math.random() * 0.5, 0.1);
}
function tom(t, f0 = 110, v = 1) {
  const o = actx.createOscillator(), g = actx.createGain();
  o.frequency.setValueAtTime(f0 * 1.6, t); o.frequency.exponentialRampToValueAtTime(f0, t + 0.12);
  env(g, t, 0.003, 0.85 * v, 0.5); o.connect(g).connect(master); o.start(t); o.stop(t + 0.7);
}
function crash(t, v = 1) {
  const n = actx.createBufferSource(); n.buffer = noiseBuf; n.loop = true; const f = actx.createBiquadFilter(), g = actx.createGain();
  f.type = 'highpass'; f.frequency.value = 3500; env(g, t, 0.005, 0.5 * v, 2.2);
  n.connect(f).connect(g).connect(master); n.start(t); n.stop(t + 2.4);
}
// скрипка: две расстроенные пилы + вибрато + формантный фильтр
function violin(t, midi, dur, v = 1, vib = 1) {
  const g = actx.createGain(), lp = actx.createBiquadFilter(), pk = actx.createBiquadFilter(), pk2 = actx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 4200; pk.type = 'peaking'; pk.frequency.value = 900; pk.gain.value = 7; pk2.type = 'peaking'; pk2.frequency.value = 2600; pk2.gain.value = 5;
  const att = Math.min(0.05, dur * 0.4);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2 * v, t + att); g.gain.setValueAtTime(0.2 * v, t + Math.max(att, dur - 0.06)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
  const lfo = actx.createOscillator(), lg = actx.createGain(); lfo.frequency.value = 5.6; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(7 * vib, t + Math.min(dur, 0.25)); lfo.connect(lg);
  [-5, 5].forEach((d) => { const o = actx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(midi); o.detune.value = d; lg.connect(o.detune); o.connect(lp); o.start(t); o.stop(t + dur + 0.1); });
  lfo.start(t); lfo.stop(t + dur + 0.1);
  lp.connect(pk).connect(pk2).connect(g).connect(master);
}

// ровный барабанный ритм: 150 bpm, 2 доли вступления, 7 раундов по 3 доли, финальный удар
const BEAT = 0.4;
const ROUND_BEATS = [3, 3, 3, 3, 3, 3, 3];
const ROUND_ENDS = ROUND_BEATS.reduce((acc, b) => { acc.push((acc.length ? acc[acc.length - 1] : 2) + b); return acc; }, []);
const REVEAL_BEAT = ROUND_ENDS[ROUND_ENDS.length - 1] + 2.4;
function scheduleTheme(t0) {
  const a = audio(); if (!a) return;
  const T = (beat) => t0 + beat * BEAT;
  for (let b = 0; b < REVEAL_BEAT - 0.5; b++) {
    kick(T(b), 1);
    if (b % 2 === 1) snare(T(b), 0.9);
    hat(T(b), 0.8); hat(T(b + 0.5), 0.6);
  }
  // финальный удар на раскрытии
  const fin = T(REVEAL_BEAT);
  crash(fin, 1); kick(fin, 1.2); tom(fin, 70, 1.2); snare(fin, 0.8);
}
$('#mute').onclick = () => { muted = !muted; $('#mute').textContent = muted ? '🔇' : '🔊'; if (master) master.gain.value = muted ? 0 : 0.9; };

/* ---------- состояние ---------- */
let mugs = [];
let mode = 'browse';
let W = innerWidth, H = innerHeight;
const SP = 2.6;                 // шаг между подиумами
let itemW = 300, camXs = 0;
const scroller = $('#scroller'), track = $('#track');
let portrait = false;
const TAN = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
const dFor = (visibleW) => visibleW / (2 * TAN * camera.aspect);   // дистанция, при которой в кадре visibleW мировых единиц по ширине

function layout() {
  W = innerWidth; H = innerHeight;
  renderer.setSize(W, H, false);
  camera.aspect = W / H; camera.updateProjectionMatrix();
  portrait = W / H < 1.0;
  itemW = portrait ? W * 0.7 : clamp(W / 3.6, 280, 400);
  const pad = (W - itemW) / 2;
  track.style.paddingLeft = pad + 'px'; track.style.paddingRight = pad + 'px';
  track.innerHTML = '';
  for (let k = 0; k < 8; k++) { const el = document.createElement('i'); el.style.width = itemW + 'px'; track.appendChild(el); }
  mugs.forEach((m, k) => { m.target.set(stageActive ? STAGE_X : k * SP, 0, 0); });
}
const fitAll = () => W / (8 * SP) > 48;   // все 8 влезают с нормальным размером

function setMode(m) {
  mode = m;
  document.body.classList.remove('browse', 'spin', 'win');
  document.body.classList.add(m);
}

/* ---------- кадр ---------- */
let camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), shake = 0;
let nearest = 0, lastNearest = -1, curId = -1, winnerId = -1, stageActive = false;
const STAGE_X = 3.5 * SP;
const clock = new THREE.Clock();
const DUST = [new THREE.Color(1, 0.8, 0.5), new THREE.Color(0.9, 0.75, 0.6), new THREE.Color(0.7, 0.65, 0.6), new THREE.Color(1, 0.55, 0.2)];
function emit(x, y, z, vx, vy, vz, col, life) {
  const j = pCursor++ % NP;
  pPos[j * 3] = x; pPos[j * 3 + 1] = y; pPos[j * 3 + 2] = z;
  pVel[j * 3] = vx; pVel[j * 3 + 1] = vy; pVel[j * 3 + 2] = vz;
  pCol[j * 3] = col.r; pCol[j * 3 + 1] = col.g; pCol[j * 3 + 2] = col.b; pLife[j] = life;
}

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  // --- камера
  let cx, vw;
  if (mode === 'browse') {
    const tgt = (scroller.scrollLeft / itemW) * SP;
    camXs = lerp(camXs, tgt, 1 - Math.exp(-dt * 14));
    cx = camXs; vw = (W / itemW) * SP;
    nearest = clamp(Math.round(scroller.scrollLeft / itemW), 0, 7);
    if (nearest !== lastNearest) { lastNearest = nearest; $('#name').textContent = NAMES[nearest]; document.querySelectorAll('#dots b').forEach((b, k) => b.classList.toggle('on', k === nearest)); }
    if (scroller.scrollLeft > 20) document.body.classList.add('moved');
  } else if (mode === 'win') {
    cx = STAGE_X; vw = portrait ? 3.4 : 6.8;
  } else if (stageActive) {
    cx = STAGE_X; vw = portrait ? 3.3 : 6.2;         // одна сцена в центре
  } else if (fitAll()) {
    cx = 3.5 * SP; vw = 8 * SP - 0.1;
  } else {
    cx = 0; vw = (portrait ? 2.5 : 3.4) * SP;
  }
  const ty = mode === 'win' ? 0.78 : (mode === 'spin' && stageActive) ? 0.95 : (portrait ? 0.62 : 0.5);
  const tp = new THREE.Vector3(cx, ty, dFor(vw)), tl = new THREE.Vector3(cx, ty, 0);
  const k = 1 - Math.exp(-dt * (mode === 'browse' ? 30 : mode === 'spin' ? 6 : 3.4));
  if (!camPos.lengthSq()) { camPos.copy(tp); camLook.copy(tl); }
  camPos.lerp(tp, k); camLook.lerp(tl, k);
  shake = Math.max(0, shake - dt * 2.8);
  camera.position.copy(camPos).add(new THREE.Vector3((Math.random() - 0.5) * shake * 0.3, (Math.random() - 0.5) * shake * 0.3, 0));
  camera.lookAt(camLook);

  // --- кружки и подиумы
  for (const m of mugs) {
    m.holder.position.copy(m.target);
    m.scale = lerp(m.scale, m.tScale, 1 - Math.exp(-dt * 9));
    m.dim = lerp(m.dim, m.tDim, 1 - Math.exp(-dt * 10));
    m.lift = lerp(m.lift, m.tLift || 0, 1 - Math.exp(-dt * 8));
    if (!STILL) m.rot += dt * m.spin * (mode === 'spin' ? 2.2 : (mode === 'browse' && m.i === nearest ? 1.6 : 1));
    m.root.position.y = m.lift + Math.sin(t * 1.6 + m.phase) * 0.03 * (m.lift > 0.05 ? 1 : 0);
    m.root.scale.setScalar(m.baseScale * m.scale);
    m.pivot.rotation.y = m.rot;
    m.uni.uC.value.set(m.holder.position.x, m.holder.position.y + m.root.position.y + m.mugH * 0.5 * m.scale, 0);
    if (m.fx) {   // щелчок Таноса: рассыпаемся в пыль
      m.fx.t += dt;
      const p = clamp((m.fx.t - 0.05) / 0.7, 0, 1);
      m.uni.uD.value = p;
      m.glow.material.opacity = Math.max(0, m.glow.material.opacity - dt * 2);
      const n = Math.ceil(70 * dt * (p > 0 && p < 1 ? 1 : 0.2) * 3);
      const sw = clamp(p * 1.12, 0, 1);
      for (let q = 0; q < n && p > 0; q++) {
        const rx = -1.15 + Math.random() * 2.3 * Math.max(0.06, sw);
        const col = DUST[(Math.random() * DUST.length) | 0];
        emit(m.holder.position.x + rx * m.scale, m.holder.position.y + m.lift + Math.random() * m.mugH * m.scale, (Math.random() - 0.5) * 0.8,
          0.9 + Math.random() * 2.2, 0.3 + Math.random() * 1.6, (Math.random() - 0.5) * 0.8, col, 1.2 + Math.random() * 1.2);
      }
      if (p >= 1) { m.root.visible = false; m.fx = null; }
    } else {
      m.glow.material.opacity = lerp(m.glow.material.opacity, m.glowT, 1 - Math.exp(-dt * 14));
    }
    // подиум
    m.pod.topMat.opacity = lerp(m.pod.topMat.opacity, 0.12 + 0.75 * m.glowT, 1 - Math.exp(-dt * 12));
    m.pod.goldMat.emissiveIntensity = lerp(m.pod.goldMat.emissiveIntensity, 0.35 + 2.2 * m.glowT, 1 - Math.exp(-dt * 12));
    m.mats.forEach((mt) => { mt.color.copy(mt.userData.base).multiplyScalar(m.dim); if (mt.userData.em === undefined) mt.userData.em = mt.emissiveIntensity || 0; if (mt.userData.em) mt.emissiveIntensity = mt.userData.em * m.dim; });
  }
  // энергия вокруг кружки в фокусе
  const fm = mode === 'spin' && stageActive && curId >= 0 ? mugs[curId] : (mode === 'win' && winnerId >= 0 ? mugs[winnerId] : null);
  focusAmt = lerp(focusAmt, fm ? 1 : 0, 1 - Math.exp(-dt * 8));
  if (fm) focusPos.set(fm.holder.position.x, fm.holder.position.y + fm.root.position.y + fm.mugH * 0.5 * fm.scale, 0);
  swirl.position.lerp(focusPos, 1 - Math.exp(-dt * 12));
  swirl.visible = focusAmt > 0.02;
  swirlMat.opacity = 0.85 * focusAmt * (mode === 'win' ? 0.45 : 1);
  rings.forEach((r, k) => { r.rotation.z += dt * (2.2 + k * 0.9) * (k % 2 ? -1 : 1); r.rotation.x += dt * 0.4; });
  pulse = Math.max(0, pulse - dt * 4);
  swirl.scale.setScalar(1 + 0.04 * Math.sin(t * 6) + pulse * 0.25);
  if (orbT >= 0) {   // шар раскрытия
    orbT += dt; const q = clamp(orbT / 1.1, 0, 1);
    orb.visible = true; orb.position.copy(focusPos); orb.position.z = -0.2;
    orb.scale.setScalar(0.6 + q * q * 7); orbMat.opacity = Math.min(1, q * 1.6) * (q > 0.97 ? 0 : 1);
  } else orb.visible = false;
  stepParticles(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

/* ---------- розыгрыш ---------- */
let running = false;
const status = (s) => { $('#status').textContent = s; };

const poolEl = $('#pool');
function setPool(alive, cur) {
  poolEl.querySelectorAll('img').forEach((im, k) => { im.classList.toggle('out', !alive.includes(k)); im.classList.toggle('on', k === cur); });
}
function showOnly(id) {
  mugs.forEach((m) => { m.holder.visible = m.i === id; });
}

async function startSpin() {
  if (running) return; running = true;
  const ac = audio();
  setMode('spin');
  scroller.scrollTo({ left: 0 });
  mugs.forEach((m) => { m.holder.visible = true; m.root.visible = true; m.fx = null; m.uni.uD.value = 0; m.alive = true; m.tScale = 1; m.tDim = 1; m.glowT = 0; m.tLift = 0; m.scale = 1; });
  burst.grav = -0.25; orbT = -1; curId = -1; stageActive = false; winnerId = -1;
  status('');
  const T0 = performance.now() + 150;
  if (ac) scheduleTheme(ac.currentTime + 0.15);
  const at = (beat) => wait(Math.max(0, T0 + beat * BEAT * 1000 - performance.now()));
  const rnd = (n) => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };
  const ids = mugs.map((m) => m.i);
  const winner = ids[rnd(ids.length)];
  const out = ids.filter((x) => x !== winner);
  for (let k = out.length - 1; k > 0; k--) { const j = rnd(k + 1); [out[k], out[j]] = [out[j], out[k]]; }
  let alive = [...ids]; let prev = -1;
  setPool(alive, -1);

  // выводим на сцену одну кружку (все рендерятся в одной точке)
  const present = (id) => {
    const m = mugs[id];
    mugs.forEach((q) => { q.target.set(STAGE_X, 0, 0); });
    showOnly(id);
    curId = id; prev = id;
    m.root.visible = true; m.fx = null; m.uni.uD.value = 0; m.alive = true;
    m.scale = 0.78; m.tScale = 1.2; m.tDim = 1.1; m.tLift = 0.4; m.glowT = 1; m.dim = 1.1; m.lift = 0.1; m.spin = 1.6;
    pulse = 1; setPool(alive, id);
  };
  await at(2);                                            // вступление: общий план, ритм идёт
  stageActive = true;
  for (let round = 0; round < out.length; round++) {
    const victim = out[round], start = ROUND_ENDS[round] - ROUND_BEATS[round];
    status(`Осталось ${alive.length}`);
    // 1 доля — любая оставшаяся кружка, 2 доли — «жертва» с щелчком
    let filler; do { filler = alive[rnd(alive.length)]; } while (filler === victim || filler === prev && alive.length > 2);
    present(filler);
    await at(start + 1);
    present(victim);
    await at(start + 1.45);
    const m = mugs[victim];
    shake = 0.5; m.fx = { t: 0 }; m.glowT = 0; m.tScale = 1.1;
    alive = alive.filter((x) => x !== victim);
    await at(ROUND_ENDS[round]);
    m.holder.visible = false; m.alive = false;
    setPool(alive, -1);
  }
  // победитель: шар энергии, вспышка, раскрытие
  present(winner); status('');
  winnerId = winner;
  orbT = 0;
  await at(REVEAL_BEAT - 0.18);
  flashEl.classList.add('on');
  await at(REVEAL_BEAT);
  setMode('win'); orbT = -1;
  const w = mugs[winner];
  w.tScale = 1.1; w.tDim = 1.12; w.glowT = 1; w.tLift = 0.4;
  $('#winName').textContent = w.name;
  shake = 0.7; burst.grav = 3;
  burst(new THREE.Vector3(STAGE_X, 1.2, 0), 320, GOLD, 7, 3);
  setTimeout(() => flashEl.classList.remove('on'), 120);
  await wait(500);
  burst(new THREE.Vector3(STAGE_X, 2, 0), 220, GOLD, 5, 2.5);
  running = false;
}

function reset() {
  stageActive = false; setPool([0,1,2,3,4,5,6,7], -1);
  orbT = -1; flashEl.classList.remove('on');
  mugs.forEach((m) => { m.holder.visible = true; m.root.visible = true; m.fx = null; m.uni.uD.value = 0; m.alive = true; m.tScale = 1; m.scale = 1; m.tDim = 1; m.glowT = 0; m.dim = 1; m.tLift = 0; m.lift = 0; });
  curId = -1; winnerId = -1;
  setMode('browse');
  camPos.set(0, 0, 0);
  scroller.scrollLeft = 0; camXs = 0;
  layout();
  lastNearest = -1;
}

/* ---------- ввод ---------- */
$('#start').onclick = startSpin;
$('#again').onclick = reset;
addEventListener('keydown', (e) => {
  if (mode !== 'browse') return;
  if (e.key === 'ArrowRight') scroller.scrollBy({ left: itemW, behavior: 'smooth' });
  if (e.key === 'ArrowLeft') scroller.scrollBy({ left: -itemW, behavior: 'smooth' });
  if (e.key === 'Enter' || e.key === ' ') startSpin();
});
scroller.addEventListener('wheel', (e) => {
  if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { scroller.scrollLeft += e.deltaY; e.preventDefault(); }
}, { passive: false });
let drag = null;
scroller.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') { drag = { x: e.clientX, s: scroller.scrollLeft, moved: false }; scroller.classList.add('drag'); scroller.setPointerCapture(e.pointerId); } });
scroller.addEventListener('pointermove', (e) => { if (drag) { if (Math.abs(e.clientX - drag.x) > 4) drag.moved = true; scroller.scrollLeft = drag.s - (e.clientX - drag.x); } });
const endDrag = () => { if (drag) { const was = drag; drag = null; was.ended = true; scroller.classList.remove('drag'); scroller.scrollTo({ left: Math.round(scroller.scrollLeft / itemW) * itemW, behavior: 'smooth' }); lastDragMoved = was.moved; } };
let lastDragMoved = false;
scroller.addEventListener('pointerup', endDrag); scroller.addEventListener('pointercancel', endDrag);
scroller.addEventListener('click', (e) => {
  if (lastDragMoved) { lastDragMoved = false; return; }
  const k = Math.round((e.clientX - W / 2) / itemW);
  if (k) scroller.scrollBy({ left: k * itemW, behavior: 'smooth' });
});
addEventListener('resize', layout);

/* ---------- старт ---------- */
(async () => {
  const data = await (await fetch('assets/mugs.json' + BUST)).json();
  mugs = await Promise.all(data.map((d, i) => buildMug(d, i)));
  for (let k = 0; k < 8; k++) { const im = document.createElement('img'); im.src = `assets/thumb${k}.png`; im.alt = ''; poolEl.appendChild(im); }
  const dots = $('#dots'); for (let k = 0; k < 8; k++) dots.appendChild(document.createElement('b'));
  layout();
  mugs.forEach((m) => m.holder.position.copy(m.target));
  if (location.search.includes('spin')) { setMode('spin'); mugs.forEach((m) => { m.tDim = m.dim = 0.7; m.tScale = m.scale = 0.96; }); curId = 2; mugs[2].tDim = mugs[2].dim = 1.12; mugs[2].glowT = 1; mugs[2].tScale = mugs[2].scale = 1.1; mugs[2].tLift = mugs[2].lift = 0.28; $('#status').textContent = 'Осталось 8'; }
  $('#loader').classList.add('off');
  requestAnimationFrame(frame);
  window.__mugs = { mugs, startSpin, reset, get mode() { return mode; } };
})();
