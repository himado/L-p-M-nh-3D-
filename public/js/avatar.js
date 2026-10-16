// Nhân vật dạng khối (voxel) — gốc tọa độ ở chân, mặt hướng về -Z.
// Trạng thái hoạt ảnh là chuỗi "base|action": base ∈ idle, walk, run, sit; action ∈ wave, raise, clap, nod, write, peekL, peekR.
import * as THREE from 'three';
import { ITEM_MAP, DEFAULT_EQUIPPED } from './data/items.js';

const SKIN = '#f1c27d';
const HAIR = '#1b1b1b';
const matCache = new Map();
function mat(color, glow = false) {
  const key = color + glow;
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.75, emissive: glow ? color : '#000000', emissiveIntensity: glow ? 0.35 : 0 }));
  }
  return matCache.get(key);
}
function box(w, h, d, color, glow) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, glow));
  m.castShadow = true;
  return m;
}
// Khối có điểm xoay ở cạnh trên (dùng cho tay, chân).
function limb(w, h, d, color) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, -h / 2, 0);
  const m = new THREE.Mesh(g, mat(color));
  m.castShadow = true;
  return m;
}
const at = (obj, x, y, z) => { obj.position.set(x, y, z); return obj; };

function textSprite(text, { font = 'bold 34px "Be Vietnam Pro", sans-serif', bg = 'rgba(0,0,0,.55)', color = '#fff', w = 512, h = 72, scale = 1 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.font = font;
  const tw = Math.min(w - 8, ctx.measureText(text).width + 36);
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.roundRect((w - tw) / 2, 4, tw, h - 8, 18); ctx.fill();
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 1, w - 30);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set((w / h) * 0.22 * scale, 0.22 * scale, 1);
  s.renderOrder = 10;
  return s;
}

function buildHat(id) {
  const g = new THREE.Group();
  switch (id) {
    case 'hat_nonla': {
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.26, 28, 1, true),
        new THREE.MeshStandardMaterial({ color: '#e9d8a6', roughness: 0.9, side: THREE.DoubleSide }));
      m.castShadow = true; m.position.y = 0.06; g.add(m);
      break;
    }
    case 'hat_khandong': {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.225, 0.22, 0.11, 20), mat('#1e3a8a'));
      m.position.y = -0.05; g.add(m);
      break;
    }
    case 'hat_cap':
      g.add(at(box(0.32, 0.09, 0.32, '#dc2626'), 0, 0.0, 0));
      g.add(at(box(0.3, 0.02, 0.16, '#dc2626'), 0, -0.035, -0.22));
      break;
    case 'hat_grad':
      g.add(at(box(0.31, 0.08, 0.31, '#111827'), 0, 0, 0));
      g.add(at(box(0.48, 0.03, 0.48, '#111827'), 0, 0.055, 0));
      g.add(at(box(0.02, 0.16, 0.02, '#facc15'), 0.22, -0.02, 0.22));
      break;
    case 'hat_canhchuon': {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.17, 0.18, 16), mat('#111111'));
      m.position.y = 0.04; g.add(m);
      for (const s of [-1, 1]) {
        const w = at(box(0.3, 0.1, 0.02, '#111111'), s * 0.3, 0.1, 0.06);
        w.rotation.z = s * 0.15; g.add(w);
      }
      g.add(at(box(0.06, 0.06, 0.02, '#facc15', true), 0, 0.06, -0.165));
      break;
    }
  }
  return g;
}

function starShape(outer, inner) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? inner : outer;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return s;
}

function buildBag(id) {
  const g = new THREE.Group();
  switch (id) {
    case 'bag_school':
      g.add(at(box(0.32, 0.36, 0.14, '#2563eb'), 0, 0.28, 0.19));
      g.add(at(box(0.22, 0.12, 0.04, '#1d4ed8'), 0, 0.2, 0.27));
      break;
    case 'bag_gui': {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.11, 0.5, 12), mat('#a16207'));
      m.position.set(0, 0.3, 0.24); m.castShadow = true; g.add(m);
      break;
    }
    case 'bag_star': {
      g.add(at(box(0.02, 0.7, 0.02, '#78350f'), 0.16, 0.6, 0.18));
      const star = new THREE.Mesh(new THREE.ExtrudeGeometry(starShape(0.18, 0.08), { depth: 0.05, bevelEnabled: false }), mat('#ef4444', true));
      star.position.set(0.16, 0.98, 0.16);
      g.add(star);
      g.userData.spin = star;
      break;
    }
  }
  return g;
}

export function createAvatar(look = DEFAULT_EQUIPPED, name = '') {
  const group = new THREE.Group();
  const body = new THREE.Group(); group.add(body);

  const hips = at(new THREE.Group(), 0, 0.84, 0); body.add(hips);
  const torso = new THREE.Group(); hips.add(torso);
  const chest = at(box(0.42, 0.56, 0.24, '#fff'), 0, 0.28, 0); torso.add(chest);

  const head = at(new THREE.Group(), 0, 0.58, 0); torso.add(head);
  head.add(at(box(0.3, 0.3, 0.3, SKIN), 0, 0.17, 0));
  head.add(at(box(0.32, 0.1, 0.32, HAIR), 0, 0.31, 0));
  head.add(at(box(0.32, 0.22, 0.06, HAIR), 0, 0.22, 0.14));
  for (const s of [-1, 1]) head.add(at(box(0.05, 0.05, 0.02, '#111'), s * 0.07, 0.19, -0.151));
  head.add(at(box(0.08, 0.02, 0.02, '#9a3412'), 0, 0.09, -0.151));
  const hatSlot = at(new THREE.Group(), 0, 0.33, 0); head.add(hatSlot);

  const mkArm = (s) => {
    const pivot = at(new THREE.Group(), s * 0.27, 0.52, 0);
    pivot.rotation.order = 'YXZ';
    const sleeve = limb(0.12, 0.48, 0.12, '#fff');
    const hand = at(box(0.11, 0.1, 0.11, SKIN), 0, -0.53, 0);
    pivot.add(sleeve, hand);
    torso.add(pivot);
    return { pivot, sleeve };
  };
  const armL = mkArm(-1), armR = mkArm(1);

  const mkLeg = (s) => {
    const thigh = at(new THREE.Group(), s * 0.11, 0, 0);
    const thighMesh = limb(0.16, 0.42, 0.17, '#000');
    const shin = at(new THREE.Group(), 0, -0.42, 0);
    const shinMesh = limb(0.15, 0.42, 0.16, '#000');
    shin.add(shinMesh, at(box(0.16, 0.07, 0.24, '#222'), 0, -0.39, -0.03));
    thigh.add(thighMesh, shin);
    hips.add(thigh);
    return { thigh, shin, meshes: [thighMesh, shinMesh] };
  };
  const legL = mkLeg(-1), legR = mkLeg(1);

  const outfit = new THREE.Group(); torso.add(outfit);       // khăn, thắt lưng
  const skirtF = new THREE.Group(); hips.add(skirtF);        // tà trước (xoay theo đùi khi ngồi)
  const skirtB = new THREE.Group(); hips.add(skirtB);        // tà sau
  const bagSlot = new THREE.Group(); torso.add(bagSlot);

  const nameTag = textSprite(name || ' ');
  nameTag.position.y = 2.02;
  nameTag.visible = !!name;
  body.add(nameTag);
  let bubble = null, bubbleTimer = 0;

  const api = {
    group, head, body, nameTag, look: null, anim: 'idle|',
    setLook(lk) {
      const eq = { ...DEFAULT_EQUIPPED, ...lk };
      api.look = eq;
      const L = ITEM_MAP[eq.skin]?.look || ITEM_MAP.skin_uniform.look;
      chest.material = mat(L.shirt, L.glow);
      armL.sleeve.material = armR.sleeve.material = mat(L.shirt, L.glow);
      for (const leg of [legL, legR]) for (const m of leg.meshes) m.material = mat(L.pants);
      for (const g of [outfit, skirtF, skirtB, hatSlot, bagSlot]) {
        g.traverse((o) => o.geometry?.dispose());
        g.clear();
      }
      if (L.dress) {
        const len = L.long ? 0.74 : 0.56;
        const wdt = L.long ? 0.44 : 0.38;
        skirtF.add(at(limb(wdt, len, 0.03, L.dress), 0, 0, -0.12));
        skirtB.add(at(limb(wdt, len, 0.03, L.dress), 0, 0, 0.12));
        if (L.long) for (const s of [-1, 1]) skirtB.add(at(limb(0.03, len, 0.24, L.dress), s * 0.215, 0, 0));
      }
      if (L.sash) outfit.add(at(box(0.44, 0.08, 0.26, L.sash), 0, 0.04, 0));
      if (L.scarf) {
        outfit.add(at(box(0.3, 0.07, 0.27, L.scarf), 0, 0.53, 0));
        const tri = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 3), mat(L.scarf));
        tri.rotation.x = Math.PI; tri.position.set(0, 0.42, -0.135);
        outfit.add(tri);
      }
      hatSlot.add(buildHat(eq.hat));
      bagSlot.add(buildBag(eq.bag));
    },
    setName(n) {
      body.remove(nameTag);
      nameTag.material.map.dispose();
      const t = textSprite(n);
      nameTag.material = t.material;
      nameTag.visible = !!n;
      body.add(nameTag);
    },
    say(text) {
      if (bubble) { body.remove(bubble); bubble.material.map.dispose(); }
      bubble = textSprite(text.length > 38 ? text.slice(0, 36) + '…' : text,
        { bg: 'rgba(255,255,255,.95)', color: '#0f172a', font: '600 30px "Be Vietnam Pro", sans-serif', w: 768, h: 76, scale: 1.1 });
      bubble.position.y = 2.32;
      body.add(bubble);
      bubbleTimer = 5;
    },
    setAnim(a) { api.anim = a || 'idle|'; },
    update: (dt) => update(dt),
    dispose() { group.traverse((o) => { o.geometry?.dispose(); if (o.isSprite) o.material.map?.dispose(); }); },
  };

  let t = Math.random() * 10, phase = 0;
  const damp = (cur, target, k) => cur + (target - cur) * k;
  function update(dt) {
    t += dt;
    const [base, action] = api.anim.split('|');
    const seated = base === 'sit';
    const moving = base === 'walk' || base === 'run';
    const k = 1 - Math.exp(-14 * dt);
    if (moving) phase += dt * (base === 'run' ? 11 : 7.5);
    const sw = moving ? Math.sin(phase) * (base === 'run' ? 0.9 : 0.6) : 0;

    // Chân
    const tl = seated ? Math.PI / 2 : sw, tr = seated ? Math.PI / 2 : -sw;
    const kl = seated ? -Math.PI / 2 : moving ? -Math.max(0, Math.sin(phase + 1.2)) * 0.9 : 0;
    const kr = seated ? -Math.PI / 2 : moving ? -Math.max(0, Math.sin(phase + 1.2 + Math.PI)) * 0.9 : 0;
    legL.thigh.rotation.x = damp(legL.thigh.rotation.x, tl, k);
    legR.thigh.rotation.x = damp(legR.thigh.rotation.x, tr, k);
    legL.shin.rotation.x = damp(legL.shin.rotation.x, kl, k);
    legR.shin.rotation.x = damp(legR.shin.rotation.x, kr, k);
    skirtF.rotation.x = Math.max(0, (legL.thigh.rotation.x + legR.thigh.rotation.x) / 2) * (seated ? 1 : 0.6);

    // Tay
    let aL = { x: seated ? 1.05 : -sw * 0.9, y: 0, z: seated ? 0 : -0.06 };
    let aR = { x: seated ? 1.05 : sw * 0.9, y: 0, z: seated ? 0 : 0.06 };
    let tz = 0, tx = moving ? 0.06 : Math.sin(t * 1.6) * 0.015, hy = 0, hx = 0;
    switch (action) {
      case 'wave': aR = { x: 2.7, y: 0, z: Math.sin(t * 10) * 0.35 }; break;
      case 'raise': aR = { x: Math.PI - 0.08, y: 0, z: 0 }; break;
      case 'clap': {
        const c = 0.45 + Math.sin(t * 16) * 0.22;
        aL = { x: 1.35, y: -c, z: 0 }; aR = { x: 1.35, y: c, z: 0 };
        break;
      }
      case 'nod': hx = Math.sin(t * 8) * 0.3; break;
      case 'write': aR = { x: 2.1 + Math.sin(t * 9) * 0.15, y: 0.2, z: Math.cos(t * 7) * 0.1 }; break;
      case 'peekL': tz = 0.2; hy = 0.95; hx = -0.4; break;
      case 'peekR': tz = -0.2; hy = -0.95; hx = -0.4; break;
    }
    for (const [arm, a] of [[armL, aL], [armR, aR]]) {
      arm.pivot.rotation.x = damp(arm.pivot.rotation.x, a.x, k);
      arm.pivot.rotation.y = damp(arm.pivot.rotation.y, a.y, k);
      arm.pivot.rotation.z = damp(arm.pivot.rotation.z, a.z, k);
    }
    torso.rotation.z = damp(torso.rotation.z, tz, k);
    torso.rotation.x = damp(torso.rotation.x, tx, k);
    head.rotation.y = damp(head.rotation.y, hy, k);
    head.rotation.x = damp(head.rotation.x, hx, k);

    body.position.y = damp(body.position.y, seated ? -0.37 : moving ? Math.abs(Math.sin(phase)) * 0.04 : 0, k);

    const spin = bagSlot.children[0]?.userData.spin;
    if (spin) spin.rotation.y += dt * 1.5;
    if (bubble && (bubbleTimer -= dt) <= 0) { body.remove(bubble); bubble.material.map.dispose(); bubble = null; }
  }

  api.setLook(look);
  return api;
}
