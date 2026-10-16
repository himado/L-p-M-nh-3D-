// Dựng phòng học truyền thống Việt Nam bằng hình khối (không cần file model).
// Kích thước: rộng 12m (x), sâu 16m (z), cao 3.6m. Bảng đen ở tường trước (z = -8), học sinh nhìn về -Z.
import * as THREE from 'three';

export const ROOM = { W: 12, D: 16, H: 3.6 };
export const DOOR_POS = new THREE.Vector3(5.2, 0, -6.4);

const matCache = new Map();
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...opts }));
  return matCache.get(key);
}
function box(w, h, d, color, x, y, z, { cast = true, opts } = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts));
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function texPlane(w, h, tex, x, y, z, rotY = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
  m.position.set(x, y, z);
  m.rotation.y = rotY;
  return m;
}

export function buildClassroom(scene) {
  const { W, D, H } = ROOM;
  const hx = W / 2, hz = D / 2;
  const colliders = [];
  const camBlockers = [];
  const spinners = [];
  const addCol = (x, z, w, d) => colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  const root = new THREE.Group();
  scene.add(root);
  const add = (...o) => { root.add(...o); return o[0]; };

  // ---------- Ánh sáng ----------
  add(new THREE.HemisphereLight('#fff8e7', '#8a7a66', 1.0));
  const sun = new THREE.DirectionalLight('#fff1d0', 1.7);
  sun.position.set(-12, 10, 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 40 });
  sun.shadow.bias = -0.0006;
  add(sun);

  // ---------- Sàn, trần, tường ----------
  const floorTex = canvasTex(256, 256, (ctx, w, h) => {
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      ctx.fillStyle = (i + j) % 2 ? '#d9c7a3' : '#e8dcc0';
      ctx.fillRect(i * w / 2, j * h / 2, w / 2, h / 2);
    }
    ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, w, h); ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
  });
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(W / 1.2, D / 1.2);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.7 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  add(floor);

  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), mat('#f6f3ea'));
  ceil.rotation.x = Math.PI / 2; ceil.position.y = H;
  add(ceil); camBlockers.push(ceil);

  const wallMat = mat('#f3e2a9');
  const wainMat = mat('#c8a46a');
  const walls = [
    { w: W, x: 0, z: -hz, ry: 0 }, { w: W, x: 0, z: hz, ry: Math.PI },
    { w: D, x: -hx, z: 0, ry: Math.PI / 2 }, { w: D, x: hx, z: 0, ry: -Math.PI / 2 },
  ];
  for (const wl of walls) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(wl.w, H), wallMat);
    m.position.set(wl.x, H / 2, wl.z); m.rotation.y = wl.ry; m.receiveShadow = true;
    add(m); camBlockers.push(m);
    const wain = new THREE.Mesh(new THREE.PlaneGeometry(wl.w, 1.0), wainMat);
    wain.position.set(wl.x, 0.5, wl.z); wain.rotation.y = wl.ry;
    wain.translateZ(0.01);
    add(wain);
  }

  // ---------- Cửa sổ (tường trái) & cửa ra vào (tường phải) ----------
  const glass = { color: '#cfeaff', emissive: '#a8d8ff', emissiveIntensity: 0.65, roughness: 0.2 };
  for (const z of [-5, -1.5, 2, 5.5]) {
    add(box(0.06, 1.5, 1.8, '#bfdcf5', -hx + 0.02, 1.75, z, { cast: false, opts: glass }));
    add(box(0.1, 0.08, 1.95, '#6b4f2a', -hx + 0.05, 2.52, z), box(0.1, 0.08, 1.95, '#6b4f2a', -hx + 0.05, 0.98, z));
    for (const dz of [-0.95, 0, 0.95]) add(box(0.1, 1.6, 0.06, '#6b4f2a', -hx + 0.05, 1.75, z + dz));
    add(box(0.1, 0.04, 1.8, '#6b4f2a', -hx + 0.05, 1.75, z));
  }
  for (const z of [2.5, 5.8]) {
    add(box(0.06, 1.0, 1.4, '#bfdcf5', hx - 0.02, 2.2, z, { cast: false, opts: glass }));
    add(box(0.1, 1.08, 0.06, '#6b4f2a', hx - 0.05, 2.2, z));
  }
  add(box(0.08, 2.3, 1.1, '#7c4a1e', hx - 0.04, 1.15, DOOR_POS.z));
  add(box(0.1, 0.06, 0.06, '#d4af37', hx - 0.1, 1.1, DOOR_POS.z - 0.4));

  // ---------- Bục giảng, bảng đen, khẩu hiệu ----------
  add(box(7, 0.04, 2.2, '#8b5a2b', 0, 0.02, -hz + 1.1, { cast: false }));
  add(box(5.5, 2.15, 0.08, '#5b3a1e', 0, 1.85, -hz + 0.04));
  const boardCanvas = document.createElement('canvas');
  boardCanvas.width = 2048; boardCanvas.height = 768;
  const boardTex = new THREE.CanvasTexture(boardCanvas);
  boardTex.colorSpace = THREE.SRGBColorSpace;
  boardTex.anisotropy = 8;
  const boardMesh = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.95), new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.95 }));
  boardMesh.position.set(0, 1.85, -hz + 0.085);
  add(boardMesh);
  add(box(5.3, 0.04, 0.12, '#5b3a1e', 0, 0.86, -hz + 0.12));

  const banner = canvasTex(1600, 140, (ctx, w, h) => {
    ctx.fillStyle = '#b91c1c'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#facc15'; ctx.lineWidth = 6; ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = '#fde047'; ctx.font = '800 78px "Be Vietnam Pro", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('TIÊN HỌC LỄ  ·  HẬU HỌC VĂN', w / 2, h / 2 + 4);
  });
  add(texPlane(5.6, 0.49, banner, 0, 3.2, -hz + 0.02));
  for (const [x, text] of [[-3.9, 'DẠY TỐT'], [3.9, 'HỌC TỐT']]) {
    const t = canvasTex(400, 140, (ctx, w, h) => {
      ctx.fillStyle = '#b91c1c'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#fde047'; ctx.font = '800 64px "Be Vietnam Pro", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, w / 2, h / 2 + 3);
    });
    add(texPlane(1.2, 0.42, t, x, 2.5, -hz + 0.02));
  }

  // ---------- Bàn giáo viên ----------
  const td = { x: -3.6, z: -6.0 };
  add(box(1.5, 0.06, 0.75, '#7a4a22', td.x, 0.77, td.z));
  add(box(1.5, 0.7, 0.04, '#6b3f1d', td.x, 0.4, td.z - 0.36));
  for (const sx of [-1, 1]) add(box(0.04, 0.74, 0.7, '#6b3f1d', td.x + sx * 0.72, 0.37, td.z));
  add(box(0.32, 0.05, 0.24, '#1e40af', td.x - 0.35, 0.825, td.z), box(0.3, 0.04, 0.22, '#dc2626', td.x - 0.35, 0.87, td.z));
  const vase = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.22, 12), mat('#0ea5e9'));
  vase.position.set(td.x + 0.45, 0.91, td.z); add(vase);
  for (let i = 0; i < 5; i++) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), mat(['#f43f5e', '#facc15', '#fb7185', '#f97316', '#e879f9'][i]));
    f.position.set(td.x + 0.45 + Math.cos(i * 1.3) * 0.06, 1.1 + (i % 2) * 0.05, td.z + Math.sin(i * 1.3) * 0.06); add(f);
  }
  addCol(td.x, td.z, 1.5, 0.75);
  add(box(0.45, 0.04, 0.45, '#7a4a22', td.x, 0.48, td.z - 0.75), box(0.45, 0.5, 0.04, '#7a4a22', td.x, 0.75, td.z - 0.97));

  // ---------- Bàn ghế học sinh (bàn đôi, 3 dãy × 5 hàng = 30 chỗ) ----------
  const seats = [];
  const paperMat = mat('#fafafa');
  const deskTop = mat('#a0703c');
  const deskLeg = mat('#4b5563');
  for (let r = 0; r < 5; r++) {
    const z = -3 + r * 2;
    for (let g = 0; g < 3; g++) {
      const x = -4 + g * 4;
      const top = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 0.55), deskTop);
      top.position.set(x, 0.76, z); top.castShadow = top.receiveShadow = true; add(top);
      add(box(1.6, 0.36, 0.03, '#8b5e34', x, 0.55, z - 0.26));
      add(box(1.5, 0.03, 0.45, '#8b5e34', x, 0.6, z));
      for (const sx of [-0.76, 0.76]) for (const sz of [-0.24, 0.24]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.74, 0.04), deskLeg);
        leg.position.set(x + sx, 0.37, z + sz); add(leg);
      }
      addCol(x, z, 1.6, 0.58);
      for (let k = 0; k < 2; k++) {
        const sx = x + (k ? 0.4 : -0.4);
        const cz = z + 0.58;
        add(box(0.42, 0.04, 0.4, '#a0703c', sx, 0.45, cz));
        add(box(0.42, 0.36, 0.03, '#a0703c', sx, 0.72, cz + 0.2));
        for (const lx of [-0.18, 0.18]) for (const lz of [-0.17, 0.17]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.45, 0.03), deskLeg);
          leg.position.set(sx + lx, 0.225, cz + lz); add(leg);
        }
        const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.29), paperMat);
        paper.rotation.x = -Math.PI / 2; paper.rotation.z = (k ? -1 : 1) * 0.12;
        paper.position.set(sx, 0.788, z + 0.05); add(paper);
        const pen = box(0.012, 0.012, 0.15, '#1d4ed8', sx + 0.14, 0.795, z + 0.05, { cast: false }); add(pen);
        const col = g * 2 + k;
        seats.push({ id: r * 6 + col, row: r, col, pos: new THREE.Vector3(sx, 0, cz), paper: new THREE.Vector3(sx, 0.79, z + 0.05), paperMesh: paper });
      }
    }
  }
  seats.sort((a, b) => a.id - b.id);

  // ---------- Cuối lớp: tủ sách, bảng tin, đồng hồ, cây xanh, thùng rác ----------
  add(box(2.4, 1.8, 0.4, '#6b3f1d', 4.2, 0.9, hz - 0.22));
  addCol(4.2, hz - 0.22, 2.4, 0.44);
  const bookColors = ['#dc2626', '#2563eb', '#16a34a', '#f59e0b', '#9333ea', '#0891b2', '#e11d48'];
  for (let s = 0; s < 3; s++) {
    add(box(2.3, 0.03, 0.36, '#4a2c12', 4.2, 0.3 + s * 0.55, hz - 0.24, { cast: false }));
    for (let b = 0; b < 16; b++) {
      const bh = 0.32 + ((b * 7 + s * 3) % 5) * 0.03;
      add(box(0.11, bh, 0.26, bookColors[(b + s) % 7], 3.1 + b * 0.135, 0.32 + s * 0.55 + bh / 2, hz - 0.36, { cast: false }));
    }
  }
  const notice = canvasTex(600, 400, (ctx, w, h) => {
    ctx.fillStyle = '#b08350'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1e3a8a'; ctx.font = '800 46px "Be Vietnam Pro", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('BẢNG TIN LỚP', w / 2, 60);
    const notes = [['#fef08a', 'Thời khóa biểu'], ['#bbf7d0', 'Gương người tốt'], ['#fecdd3', 'Lịch trực nhật'], ['#bfdbfe', 'Thi đua tuần']];
    notes.forEach(([c, t], i) => {
      const x = 40 + (i % 2) * 280, y = 100 + Math.floor(i / 2) * 140;
      ctx.fillStyle = c; ctx.fillRect(x, y, 240, 120);
      ctx.fillStyle = '#111'; ctx.font = '600 26px "Be Vietnam Pro", sans-serif'; ctx.fillText(t, x + 120, y + 66);
    });
  });
  add(texPlane(2.4, 1.6, notice, -3, 1.8, hz - 0.02, Math.PI));

  const clockFace = new THREE.Mesh(new THREE.CircleGeometry(0.32, 40), mat('#ffffff'));
  clockFace.position.set(0, 2.9, hz - 0.02); clockFace.rotation.y = Math.PI; add(clockFace);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.025, 8, 40), mat('#111827'));
  rim.position.copy(clockFace.position); rim.rotation.y = Math.PI; add(rim);
  const hand = (len, w, color) => {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, 0.01), mat(color));
    m.position.y = len / 2; g.add(m);
    g.position.set(0, 2.9, hz - 0.035); g.rotation.y = Math.PI;
    add(g); return g;
  };
  const hHour = hand(0.17, 0.03, '#111827'), hMin = hand(0.26, 0.02, '#111827'), hSec = hand(0.28, 0.008, '#dc2626');

  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.2, 0.45, 16), mat('#92400e'));
  pot.position.set(-5.4, 0.225, hz - 0.5); add(pot);
  for (let i = 0; i < 7; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.8, 6), mat('#15803d'));
    leaf.position.set(-5.4 + Math.cos(i) * 0.1, 0.8, hz - 0.5 + Math.sin(i) * 0.1);
    leaf.rotation.set(Math.sin(i * 2) * 0.4, 0, Math.cos(i * 2) * 0.4); add(leaf);
  }
  addCol(-5.4, hz - 0.5, 0.55, 0.55);
  const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.15, 0.4, 12), mat('#16a34a'));
  bin.position.set(5.5, 0.2, -4.2); add(bin);

  // ---------- Đèn tuýp & quạt trần ----------
  for (const x of [-3, 0, 3]) for (const z of [-4, 1, 6]) {
    add(box(0.12, 0.05, 1.2, '#ffffff', x, H - 0.03, z, { cast: false, opts: { emissive: '#ffffff', emissiveIntensity: 0.9 } }));
  }
  for (const [x, z] of [[-3, -1.5], [3, -1.5], [-3, 4], [3, 4]]) {
    add(box(0.03, 0.5, 0.03, '#374151', x, H - 0.25, z, { cast: false }));
    const fan = new THREE.Group();
    fan.position.set(x, H - 0.52, z);
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.1, 16), mat('#e5e7eb'));
    fan.add(motor);
    for (let i = 0; i < 3; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.01, 0.14), mat('#d1d5db'));
      blade.position.x = 0.45; const arm = new THREE.Group(); arm.rotation.y = (i / 3) * Math.PI * 2; arm.add(blade); fan.add(arm);
    }
    add(fan); spinners.push(fan);
  }

  return {
    root, colliders, camBlockers, seats,
    board: { mesh: boardMesh, canvas: boardCanvas, texture: boardTex },
    bounds: { minX: -hx, maxX: hx, minZ: -hz, maxZ: hz },
    boardFrontZ: -hz + 1.6,
    update(dt) {
      for (const f of spinners) f.rotation.y += dt * 9;
      const now = new Date();
      const s = now.getSeconds(), m = now.getMinutes() + s / 60, h = (now.getHours() % 12) + m / 60;
      hSec.rotation.z = -(s / 60) * Math.PI * 2;
      hMin.rotation.z = -(m / 60) * Math.PI * 2;
      hHour.rotation.z = -(h / 12) * Math.PI * 2;
    },
  };
}
