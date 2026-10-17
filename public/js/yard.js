// Sân trường thanh xuân: MỘT cây anh đào voxel khổng lồ (khối vuông đều nhau kiểu Minecraft) phủ gần cả sân,
// cánh hoa rơi theo gió, chế độ ngày/đêm (ban đêm cây phát sáng), ghế đá quanh gốc ngồi được, nhà trường, cột cờ, sân thể thao.
import * as THREE from 'three';
import { COURT } from './data/court.js';

const matCache = new Map();
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...opts }));
  return matCache.get(key);
}
function box(w, h, d, color, x, y, z, opts) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts));
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  return m;
}
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function flatPlane(w, d, x, z, material, y = 0.01) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  m.receiveShadow = true;
  return m;
}

export const YARD_BOUNDS = { minX: -53.4, maxX: 53.4, minZ: -21.3, maxZ: 51.4 };   // bên trong tường bao
export const YARD_DOOR = new THREE.Vector3(0, 0, -20.2);   // cửa vào dãy lớp học
export const YARD_SPAWN = new THREE.Vector3(0, 0, -18.6);
export const GYM = { x: -29, z: 37.5, w: 44, d: 25 };          // nhà thể chất: tâm & kích thước

const PINKS = ['#ffdbe6', '#ffcadb', '#ffbdd2', '#ffb1c9', '#ffe6ee', '#fdd6e9', '#ffc3d6', '#fff2f6'];
const TREE_X = 0, TREE_Z = 3;          // gốc cây ở trung tâm sân
const VS = 0.32;                        // kích thước MỘT khối voxel (mọi khối bằng nhau, như Minecraft) — nhỏ → cây mềm mại, chi tiết

// Cánh hoa pixel kiểu Minecraft (8×8 điểm ảnh, mép đậm – lõi sáng), lọc nearest để giữ nét vuông
const PETAL_PX = [
  '............',
  '..###..###..',
  '.#####.####.',
  '############',
  '############',
  '############',
  '.##########.',
  '..########..',
  '...######...',
  '....####....',
  '.....##.....',
  '............'];
function petalTexture() {
  const t = canvasTex(12, 12, (ctx) => {
    ctx.clearRect(0, 0, 12, 12);
    PETAL_PX.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch !== '#') return;
      const edge = PETAL_PX[y - 1]?.[x] !== '#' || PETAL_PX[y + 1]?.[x] !== '#' || row[x - 1] !== '#' || row[x + 1] !== '#';
      ctx.fillStyle = edge ? '#e2cfd6' : y < 4 ? '#ffffff' : '#fbf3f6';   // viền đậm hơn, gần khía sáng nhất
      ctx.fillRect(x, y, 1, 1);
    }));
  });
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}

// Bầu trời theo mẫu: xanh trên cao, sương hồng tím, chân trời vàng; mặt trời hoàng hôn có quầng sáng; mây trôi chậm.
// Ban đêm chuyển tím thẫm (uNight). Màu > 1 ở mặt trời để hiệu ứng bloom toả sáng.
const SKY = {
  day: { top: new THREE.Color('#3f78d6'), mid: new THREE.Color('#f2bfd8'), low: new THREE.Color('#ffcf8a') },
  night: { top: new THREE.Color('#040820'), mid: new THREE.Color('#1d1440'), low: new THREE.Color('#3a1f52') },
};
const SUN_DIR = new THREE.Vector3(40, 15, 30).normalize();
function skyDome() {
  return new THREE.Mesh(new THREE.SphereGeometry(185, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: SKY.day.top.clone() }, mid: { value: SKY.day.mid.clone() }, low: { value: SKY.day.low.clone() },
      sunDir: { value: SUN_DIR.clone() }, sunCol: { value: new THREE.Color('#ffd27a') }, uTime: { value: 0 }, uNight: { value: 0 },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 low; uniform vec3 sunDir; uniform vec3 sunCol; uniform float uTime; uniform float uNight; varying vec3 vP;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
      float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * vnoise(p); p *= 2.03; a *= 0.5; } return v; }
      void main(){
        vec3 d = normalize(vP); float h = d.y;
        vec3 c = mix(mid, top, smoothstep(0.02, 0.3, h));
        c = mix(low, c, smoothstep(-0.04, 0.07, h));
        float sd = max(dot(d, sunDir), 0.0);
        c += sunCol * (pow(sd, 1200.0) * 6.0 + pow(sd, 14.0) * 0.6 + pow(sd, 3.0) * 0.18) * (1.0 - uNight);
        if (h > 0.0) {
          vec2 uv = d.xz / (h + 0.18) * 1.4 + vec2(uTime * 0.006, uTime * 0.002);
          float cl = smoothstep(0.5, 0.78, fbm(uv));
          vec3 cc = mix(vec3(1.0, 0.84, 0.9), sunCol * 1.3, pow(sd, 3.0) * 0.7);
          cc = mix(cc, vec3(0.16, 0.13, 0.3), uNight);
          c = mix(c, cc, cl * smoothstep(0.0, 0.22, h) * 0.85);
        }
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
}

// ===================== Cây anh đào voxel (theo video tham khảo) =====================
// Thân to, xoắn & nghiêng, gốc loe rộng → tách thành nhiều cành lớn xoắn vặn ở ~8m, vươn vào một VÒM TÁN liền khối
// (ghép từ nhiều cụm mây tròn, rộng hơn cao, mép rủ thấp). Mặt dưới tán thưa để lộ cành bên trong; mép tán có các
// chấm rời rạc. Mọi khối đều cùng kích thước VS. Ban đêm từng khối hoa tự phát sáng (màu phân theo vị trí như video).
const WOOD_COLORS = ['#7a5238', '#5f3e2a', '#3a2419', '#2c1b13', '#8a5e40'];   // sáng, vân, tối, rất tối, rễ
const LEAF_COLORS = ['#ffd9ee', '#ffbfdf', '#ffa6d2', '#fb8cc4', '#ee72b3', '#fff0f8', '#ffc6e4'];   // đỉnh → đáy, điểm trắng, chấm rời
// Màu phát sáng ban đêm theo vùng (theo video): đỉnh/mép trên vàng cam, lõi xanh tím, còn lại hồng tím; lấm tấm trắng
const GLOW_TOP = [['#ffb02e', 0.4], ['#ff3fd0', 0.35], ['#ff8a3d', 0.1], ['#ffffff', 0.15]];
const GLOW_CORE = [['#5a6bff', 0.32], ['#8c4dff', 0.28], ['#ff3fd0', 0.3], ['#ffffff', 0.1]];
const GLOW_MAIN = [['#ff3fd0', 0.55], ['#d04dff', 0.2], ['#6a5bff', 0.1], ['#ffb833', 0.05], ['#ffffff', 0.1]];

// Các cụm mây của vòm tán (toạ độ so với gốc cây): [x, y, z, rx, ry, rz]
function canopyLobes() {
  const L = [[0, 19.2, 0, 10.5, 5.8, 9.5]];
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; L.push([Math.cos(a) * 7.5, 17.2, Math.sin(a) * 7.5, 9, 5.0, 8.5]); }
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.15; L.push([Math.cos(a) * 12.5, 14.6, Math.sin(a) * 12, 7.8, 4.4, 7.4]); }
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.68; L.push([Math.cos(a) * 16.5, 13.0, Math.sin(a) * 15.5, 5.6, 3.5, 5.4]); }
  return L.map(([x, y, z, rx, ry, rz]) => ({ x, y, z, rx, ry, rz, rmin: Math.min(rx, ry, rz) }));
}

function buildVoxelSakura(scene) {
  let seed = 20261017;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  // ---- Gỗ: lưới voxel (Map) để chỉ giữ khối lộ mặt ----
  const vox = new Map();
  const key = (i, j, k) => ((i + 256) * 128 + j) * 512 + (k + 256);
  const put = (x, y, z, t) => {
    const j = Math.floor(y / VS);
    if (j < 0 || j >= 127) return;
    vox.set(key(Math.round(x / VS), j, Math.round(z / VS)), t);
  };
  const ball = (p, r, t) => {
    for (let dx = -r; dx <= r; dx += VS) for (let dy = -r; dy <= r; dy += VS) for (let dz = -r; dz <= r; dz += VS) {
      if (dx * dx + dy * dy + dz * dz <= r * r) put(p.x + dx, p.y + dy, p.z + dz, t);
    }
  };
  const L = new THREE.Vector2(0.55, 0.83);
  const barkAt = (dx, dz, r, y) => {
    const lit = (dx * L.x + dz * L.y) / (r || 1) > -0.15;
    if (!lit) return rand() < 0.35 ? 3 : 2;
    return Math.floor(y / VS) % 3 === 0 || rand() < 0.15 ? 1 : 0;
  };

  // Thân: xoắn & nghiêng, loe rộng ở gốc, tách cành ở ~8.5m
  const TRUNK_H = 8.8;
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(1.6, 2.6, 0.7), new THREE.Vector3(0.2, 5.2, -0.6),
    new THREE.Vector3(-0.9, 7.2, 0.2), new THREE.Vector3(-0.3, TRUNK_H, 0.4),
  ]);
  const trunkR = (s) => THREE.MathUtils.lerp(3.1, 1.9, Math.pow(s, 0.8)) + Math.max(0, 0.16 - s) * 14;
  for (let s = 0; s <= 1; s += 0.005) {
    const p = curve.getPoint(s), r = trunkR(s);
    for (let dx = -r; dx <= r; dx += VS) for (let dz = -r; dz <= r; dz += VS) {
      // thân không tròn đều: các gờ dọc như vỏ cây xoắn
      const ang = Math.atan2(dz, dx);
      const rr = r * (1 + 0.09 * Math.sin(ang * 5 + s * 9));
      if (dx * dx + dz * dz <= rr * rr) put(p.x + dx, p.y, p.z + dz, barkAt(dx, dz, r, p.y));
    }
  }
  // Rễ loe toả ra mặt đất
  for (let k = 0; k < 10; k++) {
    let a = ((k + 0.5) / 10) * Math.PI * 2 + (rand() - 0.5) * 0.3;
    const len = 4.4 + rand() * 1.4;
    for (let d = 2.6; d < len; d += VS * 0.6) {
      a += Math.sin(d * 0.8 + k) * 0.03;
      const w = THREE.MathUtils.lerp(1.4, 0.3, d / len);
      const h = Math.max(1, Math.round((1 - d / len) * 4));
      const ux = Math.cos(a), uz = Math.sin(a);
      for (let o = -w; o <= w; o += VS) for (let y = 0; y < h; y++) put(ux * d - uz * o, y * VS, uz * d + ux * o, rand() < 0.3 ? 1 : 4);
    }
  }
  // Cành: đường cong bậc hai từ đỉnh thân vươn vào từng cụm mây, xoắn nhẹ, rồi chẻ thành cành nhỏ
  const lobes = canopyLobes();
  const limbEnds = [];
  function limb(S, E, r0, r1, twigs) {
    const ctrl = S.clone().lerp(E, 0.35).add(new THREE.Vector3((rand() - 0.5) * 3, 2 + rand() * 2, (rand() - 0.5) * 3));
    const bez = new THREE.QuadraticBezierCurve3(S, ctrl, E);
    const n = Math.ceil(bez.getLength() / (VS * 0.7));
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      const p = bez.getPoint(f);
      p.x += Math.sin(f * 9 + r0 * 3) * 0.25; p.z += Math.cos(f * 7 + r0 * 5) * 0.25;   // xoắn vặn
      ball(p, THREE.MathUtils.lerp(r0, r1, f), rand() < 0.3 ? 1 : 2 + (rand() < 0.35 ? 1 : 0));
    }
    for (let t = 0; t < twigs; t++) {
      const dir = new THREE.Vector3(rand() - 0.5, 0.2 + rand() * 0.5, rand() - 0.5).normalize();
      const len = 2.2 + rand() * 2.6;
      const p = E.clone();
      for (let d = 0; d < len; d += VS * 0.7) { ball(p, Math.max(0.17, r1 * (1 - d / len)), 2); p.addScaledVector(dir, VS * 0.7); dir.y -= 0.03; dir.normalize(); }
    }
    limbEnds.push(E);
  }
  const top = curve.getPoint(1);
  lobes.forEach((lb, i) => {
    if (i >= 11) return;                                   // cụm mép ngoài nhận cành con từ cụm vòng dưới
    const S = curve.getPoint(0.82 + rand() * 0.18).add(new THREE.Vector3((rand() - 0.5) * 1.2, 0, (rand() - 0.5) * 1.2));
    const E = new THREE.Vector3(lb.x, lb.y - lb.ry * 0.35, lb.z).multiplyScalar(0.82).setY(lb.y - lb.ry * 0.3);
    limb(S, E, i === 0 ? 1.3 : 1.15, 0.42, 3);
  });
  lobes.slice(11).forEach((lb) => {
    let best = null, bd = Infinity;
    for (const e of limbEnds.slice(5)) { const d = Math.hypot(e.x - lb.x, e.z - lb.z); if (d < bd) { bd = d; best = e; } }
    limb(best.clone(), new THREE.Vector3(lb.x * 0.88, lb.y - lb.ry * 0.25, lb.z * 0.88), 0.5, 0.25, 2);
  });

  // ---- Tán: duyệt lưới, chỉ giữ lớp vỏ ngoài của vòm mây (không cần Map) ----
  const leaf = [];
  const lump = (x, y, z) => 0.55 * Math.sin(x * 0.55 + y * 0.3) * Math.sin(z * 0.5 - y * 0.2) + 0.25 * Math.sin(x * 1.3 + z * 1.1 + y * 0.9);
  const ext = lobes.reduce((b, l) => ({ x0: Math.min(b.x0, l.x - l.rx - 2), x1: Math.max(b.x1, l.x + l.rx + 2), z0: Math.min(b.z0, l.z - l.rz - 2), z1: Math.max(b.z1, l.z + l.rz + 2),
    y0: Math.min(b.y0, l.y - l.ry - 2), y1: Math.max(b.y1, l.y + l.ry + 2) }), { x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9, y0: 1e9, y1: -1e9 });
  const FRINGE = 1.8;
  for (let x = Math.round(ext.x0 / VS) * VS; x <= ext.x1; x += VS) {
    for (let z = Math.round(ext.z0 / VS) * VS; z <= ext.z1; z += VS) {
      if (z + TREE_Z < -20.5) continue;                      // không đè lên dãy nhà
      const near = lobes.filter((l) => ((x - l.x) / (l.rx + FRINGE)) ** 2 + ((z - l.z) / (l.rz + FRINGE)) ** 2 <= 1);
      if (!near.length) continue;
      for (let y = Math.floor(ext.y0 / VS) * VS + VS / 2; y <= ext.y1; y += VS) {
        let f = Infinity, best = null;
        for (const l of near) {
          const dx = (x - l.x) / l.rx, dy = (y - l.y) / l.ry, dz = (z - l.z) / l.rz;
          const d = (Math.sqrt(dx * dx + dy * dy + dz * dz) - 1) * l.rmin;
          if (d < f) { f = d; best = l; }
        }
        f += lump(x, y, z);
        if (f <= 0 && f > -VS * 1.7) {
          const under = y < best.y - best.ry * 0.12;
          if (under && rand() < 0.4) continue;              // mặt dưới thưa → nhìn lên thấy cành & đèn lồng
          const rel = (y - best.y) / best.ry;
          leaf.push(x + TREE_X, y, z + TREE_Z, rel > 0.55 ? (rand() < 0.12 ? 15 : 10) : rel > 0.2 ? 11 : rel > -0.15 ? 12 : rel > -0.45 ? 13 : 14);
        } else if (f > 0 && f < FRINGE && rand() < 0.22 * (1 - f / FRINGE) ** 2) {
          leaf.push(x + TREE_X, y, z + TREE_Z, 16);              // chấm hoa rời ở mép tán
        }
      }
    }
  }

  // ---- Gỗ: chỉ giữ khối có mặt lộ ra ----
  const wood = [];
  for (const [kk, t] of vox) {
    const k = (kk % 512) - 256;
    const rest = (kk - (k + 256)) / 512;
    const j = rest % 128;
    const i = (rest - j) / 128 - 256;
    const exposed = !vox.has(key(i + 1, j, k)) || !vox.has(key(i - 1, j, k)) || !vox.has(key(i, j + 1, k)) ||
      (j > 0 && !vox.has(key(i, j - 1, k))) || !vox.has(key(i, j, k + 1)) || !vox.has(key(i, j, k - 1));
    if (exposed) wood.push(i * VS + TREE_X, j * VS + VS / 2, k * VS + TREE_Z, t);
  }

  const geo = new THREE.BoxGeometry(VS, VS, VS);
  const leafGeo = new THREE.BoxGeometry(VS, VS, VS);
  const woodMat = new THREE.MeshStandardMaterial({ roughness: 0.95 });
  const leafMat = new THREE.MeshStandardMaterial({ roughness: 0.85, emissive: '#ff7ab8', emissiveIntensity: 0.12 });
  // Mỗi khối hoa: màu phát sáng riêng (rgb) + pha nhấp nháy (a), chọn theo vùng
  const nLeaf = leaf.length / 4;
  const glowArr = new Float32Array(nLeaf * 4);
  const gc = new THREE.Color();
  const pick = (tbl) => { let r = rand(); for (const [c, w] of tbl) { if ((r -= w) <= 0) return c; } return tbl[0][0]; };
  for (let q = 0; q < nLeaf; q++) {
    const x = leaf[q * 4] - TREE_X, y = leaf[q * 4 + 1], z = leaf[q * 4 + 2] - TREE_Z;
    const rh = Math.hypot(x, z);
    const tbl = y > 19.5 || (y > 15 && rh > 17) ? GLOW_TOP : rh < 9 && y < 17 ? GLOW_CORE : GLOW_MAIN;
    gc.set(pick(tbl));
    glowArr.set([gc.r, gc.g, gc.b, rand()], q * 4);
  }
  leafGeo.setAttribute('aGlow', new THREE.InstancedBufferAttribute(glowArr, 4));
  const leafUniforms = { uTime: { value: 0 }, uNight: { value: 0 } };
  leafMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, leafUniforms);
    sh.vertexShader = 'uniform float uTime;\nattribute vec4 aGlow;\nvarying vec4 vGlow;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
      vGlow = aGlow;
      vec3 ip = instanceMatrix[3].xyz;               // tán hoa khẽ đung đưa trong gió
      float sway = smoothstep(8.0, 20.0, ip.y);
      transformed.x += sin(uTime * 1.3 + ip.x * 0.22 + ip.y * 0.17) * 0.09 * sway;
      transformed.z += cos(uTime * 1.05 + ip.z * 0.22 + ip.x * 0.08) * 0.07 * sway;`);
    sh.fragmentShader = 'uniform float uTime;\nuniform float uNight;\nvarying vec4 vGlow;\n' + sh.fragmentShader.replace('vec3 totalEmissiveRadiance = emissive;',
      `// sáng đều, không nhấp nháy; mỗi khối độ sáng hơi khác nhau (cố định) cho có chiều sâu
      float tw = 0.5 + 0.35 * fract(vGlow.a * 7.31);
      vec3 totalEmissiveRadiance = emissive * (1.0 - uNight) + vGlow.rgb * uNight * tw * 0.8;`);
  };
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  const mk = (arr, material, palette, base, g = geo) => {
    const n = arr.length / 4;
    const im = new THREE.InstancedMesh(g, material, n);
    for (let q = 0; q < n; q++) {
      dummy.position.set(arr[q * 4], arr[q * 4 + 1], arr[q * 4 + 2]);
      dummy.updateMatrix();
      im.setMatrixAt(q, dummy.matrix);
      im.setColorAt(q, col.set(palette[arr[q * 4 + 3] - base]).offsetHSL(0, 0, (rand() - 0.5) * 0.05));
    }
    im.castShadow = im.receiveShadow = true;
    scene.add(im);
    return im;
  };
  mk(wood, woodMat, WOOD_COLORS, 0);
  mk(leaf, leafMat, LEAF_COLORS, 10, leafGeo);
  // vị trí & bán kính thân ở độ cao h (quấn dây thừng)
  const trunkAt = (h) => {
    const sc = Math.min(1, h / TRUNK_H);
    return { p: curve.getPoint(sc).add(new THREE.Vector3(TREE_X, 0, TREE_Z)), r: trunkR(sc) * 1.08 };
  };
  // đầu cành (toạ độ thế giới) để vắt dây thừng đỏ giữa các cành
  const limbPts = limbEnds.slice(0, 11).map((e) => e.clone().lerp(top, 0.55).add(new THREE.Vector3(TREE_X, 0, TREE_Z)));
  const pads = lobes.map((l) => ({ c: new THREE.Vector3(l.x + TREE_X, l.y, l.z + TREE_Z), rx: Math.min(l.rx, l.rz), ry: l.ry }));
  return { pads, leafMat, leafUniforms, trunkAt, limbPts, blocks: (wood.length + leaf.length) / 4 };
}

/**
 * Sân trường được dựng LƯỜI: buildYard() chỉ tạo scene rỗng; nội dung (nhà, sân, cây voxel ~ hàng chục nghìn khối…)
 * chỉ xây khi người chơi lần đầu ra sân (ensureBuilt) → vào game nhanh, không tốn bộ nhớ nếu không ra sân.
 */
export function buildYard() {
  const scene = new THREE.Scene();
  const colliders = [];
  const camBlockers = [];
  const api = {
    scene, colliders, camBlockers, bounds: YARD_BOUNDS, built: false, toneMapped: true,
    benchSpots: [],                 // chỗ ngồi trên ghế đá quanh gốc cây: { pos, yaw }
    night: 0, nightTarget: 0, exposure: 1.15,
    ensureBuilt() { if (!api.built) { build(); api.built = true; } },
    setNight(on) { api.nightTarget = on ? 1 : 0; },
    gust() {}, update() {},
  };
  return api;

  function build() {
  scene.background = new THREE.Color('#ffe4ee');
  scene.fog = new THREE.Fog('#f7dbe6', 70, 190);
  const sky = skyDome();
  scene.add(sky);
  const addCol = (x, z, w, d) => colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });

  // ---------- Ánh sáng (thay đổi theo ngày / đêm) ----------
  const hemi = new THREE.HemisphereLight('#ffe6f0', '#9c8a78', 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffc98a', 3.0);
  sun.position.copy(SUN_DIR).multiplyScalar(85);           // nắng hoàng hôn chiếu chếch thấp như mẫu
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -64, right: 64, top: 64, bottom: -64, near: 1, far: 170 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);
  const fill = new THREE.DirectionalLight('#c8d8ff', 0.5);
  fill.position.set(-20, 12, -15);
  scene.add(fill);

  // ---------- Nền sân (gạch sáng ấm) + viền cỏ ----------
  const tile = canvasTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#ddd3c6'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 700; i++) { ctx.fillStyle = `rgba(90,70,60,${Math.random() * 0.05})`; ctx.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
    ctx.strokeStyle = 'rgba(120,100,90,.28)'; ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, w, h);
  });
  tile.wrapS = tile.wrapT = THREE.RepeatWrapping;
  tile.repeat.set(53, 41);
  scene.add(flatPlane(106, 82, 0, 10.5, new THREE.MeshStandardMaterial({ map: tile, roughness: 0.92 }), 0));
  const grassMat = mat('#7cb36a');
  // dải cỏ & bồn hoa sát chân tường bao
  scene.add(flatPlane(2.4, 80, -52.6, 10.5, grassMat, 0.005), flatPlane(2.4, 80, 52.6, 10.5, grassMat, 0.005), flatPlane(44, 2.4, -30, 50.6, grassMat, 0.005), flatPlane(44, 2.4, 30, 50.6, grassMat, 0.005));
  scene.add(flatPlane(300, 300, 0, 0, mat('#6f9e5c'), -0.02));
  // bồn hoa & hàng rào thấp dọc hai bên (thay cho hàng cây)
  for (const x of [-52.6, 52.6]) {
    for (let z = -14; z <= 26; z += 8) {
      scene.add(box(1.4, 0.7, 4.2, '#5f8f4e', x, 0.35, z));
      for (let i = 0; i < 6; i++) {
        const f = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), mat(['#ff8fab', '#ffd166', '#ffffff', '#f4acb7'][i % 4]));
        f.position.set(x + (Math.random() - 0.5) * 1.1, 0.75, z + (Math.random() - 0.5) * 3.8);
        scene.add(f);
      }
    }
  }

  // ---------- Dãy nhà lớp học (phía bắc) ----------
  const bz = -25;
  scene.add(box(56, 9, 6, '#f3e2a9', 0, 4.5, bz));
  scene.add(box(56.4, 0.4, 6.6, '#b45309', 0, 9.2, bz));
  scene.add(box(56, 0.3, 1.6, '#e7d18e', 0, 3.3, bz + 3.6));            // hành lang tầng 2
  scene.add(box(56, 0.9, 0.12, '#f8fafc', 0, 3.9, bz + 4.35));          // lan can
  camBlockers.push(scene.children[scene.children.length - 4]);
  for (let x = -24; x <= 24; x += 4) {
    if (Math.abs(x) < 1) continue;
    for (const y of [1.6, 5.8]) {
      scene.add(box(1.8, 1.4, 0.1, '#bfe3ff', x, y, bz + 3.02, { emissive: '#8fc7f0', emissiveIntensity: 0.25, roughness: 0.2 }));
      scene.add(box(2.0, 0.1, 0.14, '#6b4f2a', x, y - 0.75, bz + 3.04));
    }
    scene.add(box(0.3, 3.3, 0.3, '#e7d18e', x + 2, 1.65, bz + 4.3));
  }
  scene.add(box(1.8, 2.5, 0.12, '#5b3a1e', 0, 1.25, bz + 3.03));         // cửa ra vào
  const doorSign = canvasTex(512, 96, (ctx, w, h) => {
    ctx.fillStyle = '#1e3a8a'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fff'; ctx.font = '800 54px "Be Vietnam Pro", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('LỚP HỌC  →', w / 2, h / 2 + 3);
  });
  const ds = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.42), new THREE.MeshStandardMaterial({ map: doorSign }));
  ds.position.set(0, 2.8, bz + 3.1); scene.add(ds);
  const sign = canvasTex(1600, 180, (ctx, w, h) => {
    ctx.fillStyle = '#b91c1c'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#facc15'; ctx.lineWidth = 8; ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.fillStyle = '#fde047'; ctx.font = '800 100px "Be Vietnam Pro", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('TRƯỜNG LỚP MÌNH 3D', w / 2, h / 2 + 6);
  });
  const sg = new THREE.Mesh(new THREE.PlaneGeometry(14, 1.6), new THREE.MeshStandardMaterial({ map: sign }));
  sg.position.set(0, 7.9, bz + 3.05); scene.add(sg);

  // ===================== Khuôn viên mở rộng: 2 dãy phòng học, nhà thể chất, nhà xe, phòng bảo vệ, tường bao, cổng trường =====================
  // Bố cục (nhìn từ trên, bắc ở trên):
  //            [ Dãy A — dãy chính (có lớp học) ]
  //   [Dãy B]          🌸 cây anh đào           [Dãy C]
  //   [Nhà thể chất]     lối vào ─ cổng ─  [Nhà xe] [Bảo vệ]
  const campusGlow = [];
  const glowM = (color, emissive, day, night, extra = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: day, roughness: 0.6, ...extra });
    m.userData = { day, night };
    campusGlow.push(m);
    return m;
  };
  const winMat = glowM('#bfe3ff', '#ffe2a8', 0.15, 0.85, { roughness: 0.2 });
  const add = (m) => { m.castShadow = m.receiveShadow = true; scene.add(m); return m; };
  const boxM = (w, h, d, material, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material); m.position.set(x, y, z); return add(m); };
  const signPlane = (text, w, h, bg, fg, x, y, z, ry = 0) => {
    const tex = canvasTex(Math.round(w * 110), Math.round(h * 110), (ctx, cw, ch) => {
      ctx.fillStyle = bg; ctx.fillRect(0, 0, cw, ch);
      ctx.strokeStyle = fg; ctx.lineWidth = Math.max(4, ch * 0.06); ctx.strokeRect(ch * 0.06, ch * 0.06, cw - ch * 0.12, ch - ch * 0.12);
      ctx.fillStyle = fg; ctx.font = `800 ${Math.round(ch * 0.55)}px "Be Vietnam Pro", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, cw / 2, ch / 2 + ch * 0.04, cw * 0.92);
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex }));
    m.position.set(x, y, z); m.rotation.y = ry;
    scene.add(m);
    return m;
  };

  // ---- Dãy phòng học 2 tầng chạy dọc trục z, hành lang quay vào sân ----
  function classBlock(cx, face, label) {
    const z0 = 2, len = 40, W = 9;
    const wall = mat('#f3e2a9'), trim = mat('#e7d18e');
    camBlockers.push(boxM(W, 9, len, wall, cx, 4.5, z0));
    boxM(W + 0.6, 0.4, len + 0.6, mat('#b45309'), cx, 9.2, z0);
    const fx = cx + face * (W / 2);
    boxM(1.6, 0.3, len, trim, fx + face * 0.8, 3.3, z0);                 // hành lang tầng 2
    boxM(0.12, 0.9, len, mat('#f8fafc'), fx + face * 1.55, 3.9, z0);     // lan can
    boxM(1.8, 0.12, len, trim, fx + face * 0.85, 0.06, z0);              // thềm
    for (let z = z0 - len / 2 + 2; z <= z0 + len / 2 - 2; z += 4) {
      boxM(0.3, 3.3, 0.3, trim, fx + face * 1.5, 1.65, z + 2 > z0 + len / 2 ? z : z + 2);
      for (const y of [1.6, 5.8]) {
        boxM(0.1, 1.4, 1.8, winMat, fx + face * 0.02, y, z);
        boxM(0.14, 0.1, 2.0, mat('#6b4f2a'), fx + face * 0.04, y - 0.75, z);
      }
    }
    for (const z of [z0 - 12, z0, z0 + 12]) boxM(0.12, 2.5, 1.8, mat('#5b3a1e'), fx + face * 0.03, 1.25, z + 2);
    signPlane(label, 9, 1.1, '#1e3a8a', '#ffffff', fx + face * 0.06, 7.8, z0, face > 0 ? Math.PI / 2 : -Math.PI / 2);
    addCol(cx + face * 0.8, z0, W + 1.8, len);
  }
  classBlock(-42, 1, 'DÃY B · KHỐI 10');
  classBlock(42, -1, 'DÃY C · KHỐI 11');

  // ---- Nhà thể chất (góc tây nam): VÀO ĐƯỢC BÊN TRONG — sân cầu lông (chơi được), sân bóng rổ, bóng bàn, khán đài ----
  {
    const gx = GYM.x, gz = GYM.z, GW = GYM.w, GD = GYM.d, H = 9, T = 0.4;
    const x0 = gx - GW / 2, x1 = gx + GW / 2, z0 = gz - GD / 2, z1 = gz + GD / 2;
    const wallM = mat('#ecdcb8'), inner = mat('#f5ecd6');
    // tường có ô cửa: [toạ độ dọc tường bắt đầu, kết thúc] của cửa
    const DOOR_N = [gx - 3, gx + 1];          // cửa chính hướng ra sân (tường bắc), đối diện sân bóng chuyền
    const DOOR_E = [gz - 3, gz + 1];          // cửa phụ hướng ra lối đi có đèn (tường đông)
    const wallX = (z, a, b) => { const m = boxM(b - a, H, T, wallM, (a + b) / 2, H / 2, z); camBlockers.push(m); colliders.push({ minX: a, maxX: b, minZ: z - T, maxZ: z + T }); };
    const wallZ = (x, a, b) => { const m = boxM(T, H, b - a, wallM, x, H / 2, (a + b) / 2); camBlockers.push(m); colliders.push({ minX: x - T, maxX: x + T, minZ: a, maxZ: b }); };
    wallX(z0, x0, DOOR_N[0]); wallX(z0, DOOR_N[1], x1);
    boxM(DOOR_N[1] - DOOR_N[0], H - 3.6, T, wallM, (DOOR_N[0] + DOOR_N[1]) / 2, 3.6 + (H - 3.6) / 2, z0);      // lanh tô trên cửa
    wallX(z1, x0, x1);
    wallZ(x0, z0, z1);
    wallZ(x1, z0, DOOR_E[0]); wallZ(x1, DOOR_E[1], z1);
    boxM(T, H - 3.6, DOOR_E[1] - DOOR_E[0], wallM, x1, 3.6 + (H - 3.6) / 2, (DOOR_E[0] + DOOR_E[1]) / 2);
    // mái vòm tôn xanh (hai mặt để nhìn từ trong cũng thấy)
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(GD / 2 + 0.4, GD / 2 + 0.4, GW + 0.8, 40, 1, false, 0, Math.PI),
      new THREE.MeshStandardMaterial({ color: '#3b82c4', metalness: 0.3, roughness: 0.5, side: THREE.DoubleSide }));
    roof.rotation.z = Math.PI / 2;
    roof.scale.set(0.34, 1, 1);
    roof.position.set(gx, H, gz);
    add(roof);
    // mặt ngoài: dải cửa sổ cao, mái hiên, biển tên ở cả 2 cửa
    for (let x = x0 + 2; x <= x1 - 2; x += 3) if (x < DOOR_N[0] - 1.5 || x > DOOR_N[1] + 1.5) boxM(2.2, 1.1, 0.1, winMat, x, 7, z0 - 0.22);
    for (let x = x0 + 2; x <= x1 - 2; x += 3) boxM(2.2, 1.1, 0.1, winMat, x, 7, z1 + 0.22);
    boxM(6.6, 0.25, 2.2, mat('#d1c3a0'), (DOOR_N[0] + DOOR_N[1]) / 2, 3.9, z0 - 1.1);
    signPlane('NHÀ THỂ CHẤT', 8, 1.1, '#b91c1c', '#fde047', (DOOR_N[0] + DOOR_N[1]) / 2, 4.8, z0 - 0.22, Math.PI);
    signPlane('NHÀ THỂ CHẤT', 6, 0.9, '#b91c1c', '#fde047', x1 + 0.22, 4.6, (DOOR_E[0] + DOOR_E[1]) / 2, Math.PI / 2);
    // bên trong: sàn gỗ, tường sáng, đèn trần
    const floorTex = canvasTex(512, 512, (ctx, w, h) => {
      ctx.fillStyle = '#c98e52'; ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 32) {
        ctx.fillStyle = y % 64 ? '#c3874c' : '#cf955a'; ctx.fillRect(0, y, w, 30);
        ctx.fillStyle = 'rgba(80,40,10,.25)'; ctx.fillRect(0, y + 30, w, 2);
        for (let x = (y / 32) % 2 ? 96 : 0; x < w; x += 192) ctx.fillRect(x, y, 2, 30);
      }
    });
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(GW / 4, GD / 4);
    scene.add(flatPlane(GW - T, GD - T, gx, gz, new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.55 }), 0.007));
    for (const [w, d, x, z] of [[GW - 1, 0.05, gx, z0 + 0.22], [GW - 1, 0.05, gx, z1 - 0.22], [0.05, GD - 1, x0 + 0.22, gz], [0.05, GD - 1, x1 - 0.22, gz]]) boxM(w, 1.2, d, mat('#2b6cb0'), x, 0.6, z);  // ốp chân tường xanh
    const lampM = glowM('#ffffff', '#fff6e0', 1.4, 1.6);
    for (let x = x0 + 4; x <= x1 - 4; x += 6.5) for (const z of [gz - 6, gz + 6]) boxM(2.4, 0.12, 0.5, lampM, x, H + 1.6, z);
    for (const x of [gx - 9, gx + 9]) { const l = new THREE.PointLight('#fff4e0', 60, 30, 1.4); l.position.set(x, H, gz); scene.add(l); }

    // --- Sân bóng rổ (nửa phía đông, trang trí — sẽ triển khai chơi sau) ---
    const bbx = gx + 13, bbz = gz - 2;
    const bbTex = canvasTex(512, 512, (ctx, w, h) => {
      ctx.fillStyle = '#1c7ed6'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#e8590c'; ctx.fillRect(w * 0.36, 0, w * 0.28, h * 0.38); ctx.fillRect(w * 0.36, h * 0.62, w * 0.28, h * 0.38);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 7;
      ctx.strokeRect(6, 6, w - 12, h - 12);
      ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(w / 2, h / 2, w * 0.12, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(w / 2, 40, w * 0.4, 0.05 * Math.PI, 0.95 * Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.arc(w / 2, h - 40, w * 0.4, 1.05 * Math.PI, 1.95 * Math.PI); ctx.stroke();
    });
    scene.add(flatPlane(11, 18, bbx, bbz, new THREE.MeshStandardMaterial({ map: bbTex, roughness: 0.7 }), 0.012));
    for (const s of [-1, 1]) {                        // 2 rổ ở 2 đầu sân
      const pz = bbz + s * 8.6;
      boxM(0.2, 3.3, 0.2, mat('#495057'), bbx, 1.65, pz);
      addCol(bbx, pz, 0.4, 0.4);
      boxM(1.8, 1.1, 0.06, mat('#f8f9fa'), bbx, 3.3, pz - s * 0.45);
      boxM(0.6, 0.45, 0.07, mat('#e03131'), bbx, 3.1, pz - s * 0.49);
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.02, 8, 24), mat('#f76707'));
      hoop.rotation.x = Math.PI / 2; hoop.position.set(bbx, 3.05, pz - s * 0.75); scene.add(hoop);
    }
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), mat('#e8590c'));
    ball.position.set(bbx + 1.5, 0.12, bbz + 2); ball.castShadow = true; scene.add(ball);
    // --- Sân bóng chuyền (giữa nhà, trang trí — sẽ triển khai chơi sau) + khán đài kiểu sân vận động 2 bên chiều dài ---
    {
      const vx = gx - 1.4, vz = gz - 2, VL = 18, VW = 9;
      const vTex = canvasTex(256, 512, (ctx, w, h) => {
        ctx.fillStyle = '#e8742c'; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 6;
        ctx.strokeRect(3, 3, w - 6, h - 6);
        ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();                       // vạch giữa
        for (const f of [1 / 3, 2 / 3]) { ctx.beginPath(); ctx.moveTo(0, h * (f < 0.5 ? 1 / 2 - 3 / 18 : 1 / 2 + 3 / 18)); ctx.lineTo(w, h * (f < 0.5 ? 1 / 2 - 3 / 18 : 1 / 2 + 3 / 18)); ctx.stroke(); }   // vạch 3m
      });
      scene.add(flatPlane(VW + 2, VL + 2, vx, vz, mat('#2563eb'), 0.011));
      scene.add(flatPlane(VW, VL, vx, vz, new THREE.MeshStandardMaterial({ map: vTex, roughness: 0.6 }), 0.013));
      for (const s2 of [-1, 1]) {                       // cột lưới ngoài biên dọc
        boxM(0.14, 2.6, 0.14, mat('#e5e7eb', { metalness: 0.5 }), vx + s2 * (VW / 2 + 0.6), 1.3, vz);
        addCol(vx + s2 * (VW / 2 + 0.6), vz, 0.3, 0.3);
      }
      const vnetTex = canvasTex(256, 32, (ctx, w, h) => {
        ctx.strokeStyle = 'rgba(15,15,15,.9)'; ctx.lineWidth = 1.5;
        for (let x = 0; x <= w; x += 5) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
        for (let y = 0; y <= h; y += 5) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, 3);
      });
      const vnet = new THREE.Mesh(new THREE.PlaneGeometry(VW + 1.2, 1), new THREE.MeshStandardMaterial({ map: vnetTex, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide }));
      vnet.position.set(vx, 2.43 - 0.5, vz);
      scene.add(vnet);
      const vball = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), mat('#fde047'));
      vball.position.set(vx + 1.2, 0.11, vz - 3); scene.add(vball);
      signPlane('BÓNG CHUYỀN', 4, 0.7, '#e8742c', '#ffffff', vx, 6.2, z1 - 0.23, Math.PI);
    }
    // --- Khán đài kiểu sân vận động: 1 dãy duy nhất ôm trọn chiều dài nhà, tựa tường nam, ghế quay vào các sân ---
    {
      const ROWS = 5, STEP_D = 0.7, STEP_H = 0.5;
      const back = z1 - T / 2, front = back - ROWS * STEP_D;
      const sx0 = x0 + T / 2 + 0.2, sx1 = x1 - T / 2 - 0.2, len = sx1 - sx0, mid = (sx0 + sx1) / 2;
      const SEAT = ['#dc2626', '#f59e0b', '#2563eb', '#16a34a', '#7c3aed', '#db2777'];
      const AISLES = [-15, -5, 5, 15].map((d) => mid + d);       // 4 lối lên chia khán đài thành 5 khu
      for (let i = 0; i < ROWS; i++) {
        const z = front + STEP_D * (i + 0.5), h = STEP_H * (i + 1);
        boxM(len, h, STEP_D, mat('#9ca3af'), mid, h / 2, z);                                    // bậc bê tông
        let a = sx0;                                                                              // dãy ghế, chừa lối lên
        for (const ax of [...AISLES, sx1 + 0.6]) {
          const b = ax - 0.6;
          if (b - a > 0.3) boxM(b - a, 0.14, 0.42, mat(SEAT[i]), (a + b) / 2, h + 0.07, z + 0.08);
          a = ax + 0.6;
        }
      }
      for (const ax of AISLES) for (let i = 0; i < ROWS; i++) boxM(1.1, 0.04, STEP_D, mat('#facc15'), ax, STEP_H * (i + 1) + 0.02, front + STEP_D * (i + 0.5));
      boxM(len, 0.9, 0.08, mat('#e5e7eb', { metalness: 0.5 }), mid, 0.45, front - 0.05);            // lan can thấp phía trước
      colliders.push({ minX: sx0, maxX: sx1, minZ: front - 0.15, maxZ: back });
    }

    // --- Bóng bàn: 2 bàn sát tường tây (trang trí) ---
    for (const tz of [gz - 6, gz + 6]) {
      const tx = x0 + 2.2;
      boxM(1.52, 0.06, 2.74, mat('#1e5f9e'), tx, 0.76, tz);
      boxM(1.52, 0.02, 0.02, mat('#ffffff'), tx, 0.8, tz);
      boxM(1.6, 0.15, 0.02, mat('#e5e7eb'), tx, 0.86, tz);
      for (const [lx, lz] of [[-0.6, -1.1], [0.6, -1.1], [-0.6, 1.1], [0.6, 1.1]]) boxM(0.06, 0.74, 0.06, mat('#374151'), tx + lx, 0.37, tz + lz);
      addCol(tx, tz, 1.7, 2.9);
    }
    signPlane('BÓNG BÀN', 3, 0.6, '#1e5f9e', '#ffffff', x0 + 0.23, 3.2, gz, Math.PI / 2);
    signPlane('BÓNG RỔ', 3, 0.6, '#1c7ed6', '#ffffff', bbx, 5.6, z1 - 0.23, Math.PI);
  }

  // ---- Nhà để xe truyền thống phía sau dãy B: mái tôn trên cột sắt, hàng xe máy & xe đạp, chốt bảo vệ ghi vé ----
  {
    const px0 = -53.6, px1 = -49.2, pz0 = -17, pz1 = 21;
    const cx = (px0 + px1) / 2, cz = (pz0 + pz1) / 2, L = pz1 - pz0;
    for (let z = pz0; z <= pz1 + 0.01; z += 4) {
      boxM(0.14, 2.9, 0.14, mat('#6b7280'), px1, 1.45, z);
      boxM(0.14, 2.4, 0.14, mat('#6b7280'), px0 + 0.3, 1.2, z);
    }
    const tonTex = canvasTex(64, 64, (ctx, w, h) => {
      for (let x = 0; x < w; x += 8) { ctx.fillStyle = '#4a7fa8'; ctx.fillRect(x, 0, 5, h); ctx.fillStyle = '#3c6a8f'; ctx.fillRect(x + 5, 0, 3, h); }
    });
    tonTex.wrapS = tonTex.wrapT = THREE.RepeatWrapping; tonTex.repeat.set(4, L / 2);
    const ton = new THREE.Mesh(new THREE.BoxGeometry(px1 - px0 + 0.8, 0.08, L + 1), new THREE.MeshStandardMaterial({ map: tonTex, metalness: 0.35, roughness: 0.55 }));
    ton.position.set(cx + 0.2, 2.75, cz); ton.rotation.z = -0.11;     // mái tôn dốc về phía tường
    add(ton);
    // hàng xe: thân / yên / bánh / ghi-đông dựng bằng khối (InstancedMesh theo từng bộ phận)
    const N = Math.floor(L / 0.95);
    const unit = new THREE.BoxGeometry(1, 1, 1);
    const parts = { body: new THREE.InstancedMesh(unit, new THREE.MeshStandardMaterial({ roughness: 0.5 }), N), seat: new THREE.InstancedMesh(unit, mat('#111827'), N),
      wheel: new THREE.InstancedMesh(unit, mat('#1f2937'), N * 2), bar: new THREE.InstancedMesh(unit, mat('#9ca3af', { metalness: 0.6 }), N) };
    const d = new THREE.Object3D(), c = new THREE.Color();
    const BODY = ['#dc2626', '#1d4ed8', '#111827', '#f8fafc', '#7c3aed', '#059669', '#ea580c', '#6b7280'];
    const set = (im, i, x, y, z, sx, sy, sz) => { d.position.set(x, y, z); d.scale.set(sx, sy, sz); d.updateMatrix(); im.setMatrixAt(i, d.matrix); };
    for (let i = 0; i < N; i++) {
      const z = pz0 + 0.6 + i * 0.95, bike = i % 4 === 3;                    // cứ 4 xe có 1 xe đạp
      const xb = px0 + 1.6;
      set(parts.body, i, xb, bike ? 0.55 : 0.5, z, 1.3, bike ? 0.06 : 0.42, bike ? 0.06 : 0.32);
      parts.body.setColorAt(i, c.set(BODY[(i * 5) % BODY.length]));
      set(parts.seat, i, xb - 0.15, bike ? 0.85 : 0.78, z, bike ? 0.25 : 0.55, 0.1, 0.26);
      set(parts.wheel, i * 2, xb - 0.6, 0.3, z, 0.6, 0.6, bike ? 0.04 : 0.1);
      set(parts.wheel, i * 2 + 1, xb + 0.6, 0.3, z, 0.6, 0.6, bike ? 0.04 : 0.1);
      set(parts.bar, i, xb + 0.55, bike ? 0.95 : 0.98, z, 0.06, 0.06, 0.6);
    }
    for (const im of Object.values(parts)) { im.castShadow = true; scene.add(im); }
    colliders.push({ minX: px0, maxX: px0 + 2.5, minZ: pz0, maxZ: pz1 });
    signPlane('NHÀ ĐỂ XE GIÁO VIÊN · HỌC SINH', 5.6, 0.6, '#1e3a8a', '#ffffff', px1 + 0.08, 2.35, cz, Math.PI / 2);
    // chốt bảo vệ ghi vé ở lối vào phía bắc
    camBlockers.push(boxM(1.6, 2.3, 1.6, mat('#f3e2a9'), -51.6, 1.15, pz0 - 2.4));
    boxM(2.0, 0.2, 2.0, mat('#9a3412'), -51.6, 2.4, pz0 - 2.4);
    boxM(0.9, 0.6, 0.06, winMat, -50.78, 1.4, pz0 - 2.4).rotation.y = Math.PI / 2;
    signPlane('GỬI XE', 1.2, 0.35, '#b91c1c', '#ffffff', -50.78, 2.05, pz0 - 2.4, Math.PI / 2);
    addCol(-51.6, pz0 - 2.4, 1.8, 1.8);
  }

  // ---- Nhà để xe (đông nam) & phòng bảo vệ cạnh cổng ----
  {
    const sx = 33, sz = 43;
    for (const x of [sx - 7, sx, sx + 7]) for (const z of [sz - 2.4, sz + 2.4]) boxM(0.2, 2.8, 0.2, mat('#6b7280'), x, 1.4, z);
    const shedRoof = boxM(15, 0.15, 6, mat('#2f855a', { metalness: 0.2 }), sx, 2.95, sz);
    shedRoof.rotation.x = 0.06;
    for (let i = 0; i < 12; i++) {                    // hàng xe đạp cách điệu
      const x = sx - 6 + i * 1.1;
      boxM(0.08, 0.7, 1.6, mat(['#ef4444', '#3b82f6', '#22c55e', '#f59e0b'][i % 4]), x, 0.5, sz);
    }
    signPlane('NHÀ ĐỂ XE', 4, 0.7, '#2f855a', '#ffffff', sx, 3.5, sz - 3.05, Math.PI);
    addCol(sx, sz, 15, 5.2);
    const gh = { x: 10.5, z: 48 };                    // phòng bảo vệ
    camBlockers.push(boxM(3.6, 3, 3.2, mat('#f3e2a9'), gh.x, 1.5, gh.z));
    boxM(4.2, 0.3, 3.8, mat('#9a3412'), gh.x, 3.15, gh.z);
    boxM(1.6, 1.0, 0.08, winMat, gh.x, 1.7, gh.z - 1.62);
    signPlane('BẢO VỆ', 2, 0.45, '#1e3a8a', '#ffffff', gh.x, 2.65, gh.z - 1.64, Math.PI);
    addCol(gh.x, gh.z, 3.8, 3.4);
  }

  // ---- Lối đi chính từ cổng vào cột cờ + đèn đường ----
  scene.add(flatPlane(7, 40, 0, 32, mat('#c9bba8'), 0.008));
  const lampHead = glowM('#fff3c4', '#ffd98a', 0.1, 2.2);
  for (const z of [22, 30, 38, 46]) for (const x of [-4.4, 4.4]) {
    boxM(0.16, 3.6, 0.16, mat('#374151'), x, 1.8, z);
    boxM(0.5, 0.4, 0.5, lampHead, x, 3.7, z);
    addCol(x, z, 0.3, 0.3);
  }

  // ---- Tường bao quanh trường (trụ mỗi 4m, đỉnh lợp ngói) ----
  const WX = 54, WZ0 = -31, WZ1 = 52, GATE = 6.6;
  const wallMat = mat('#f1e3b5'), capMat = mat('#9a3412'), baseMat = mat('#c8a46a');
  const wallSeg = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const W = alongX ? len : 0.35, D = alongX ? 0.35 : len;
    boxM(W, 2.4, D, wallMat, cx, 1.2, cz);
    boxM(alongX ? len : 0.4, 0.6, alongX ? 0.4 : len, baseMat, cx, 0.3, cz);
    boxM(alongX ? len : 0.6, 0.16, alongX ? 0.6 : len, capMat, cx, 2.48, cz);
    colliders.push({ minX: Math.min(x0, x1) - 0.3, maxX: Math.max(x0, x1) + 0.3, minZ: Math.min(z0, z1) - 0.3, maxZ: Math.max(z0, z1) + 0.3 });
    const n = Math.floor(len / 4);
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 2.9, 0.6), wallMat, n + 1);
    const caps = new THREE.InstancedMesh(new THREE.BoxGeometry(0.8, 0.22, 0.8), capMat, n + 1);
    const d = new THREE.Object3D();
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      d.position.set(x0 + (x1 - x0) * f, 1.45, z0 + (z1 - z0) * f); d.updateMatrix(); posts.setMatrixAt(i, d.matrix);
      d.position.y = 3.0; d.updateMatrix(); caps.setMatrixAt(i, d.matrix);
    }
    posts.castShadow = true;
    scene.add(posts, caps);
  };
  wallSeg(-WX, WZ0, WX, WZ0);
  wallSeg(-WX, WZ0, -WX, WZ1);
  wallSeg(WX, WZ0, WX, WZ1);
  wallSeg(-WX, WZ1, -GATE - 0.8, WZ1);
  wallSeg(GATE + 0.8, WZ1, WX, WZ1);

  // ---- Cổng trường kiểu truyền thống Việt Nam: 2 trụ lớn, biển tên vòm, mái ngói, cổng sắt kéo ----
  {
    const gz = WZ1;
    const pillarMat = mat('#f3e2a9'), redMat = mat('#b91c1c');
    for (const s of [-1, 1]) {
      const px = s * (GATE + 0.8);
      boxM(1.6, 5.6, 1.6, pillarMat, px, 2.8, gz);
      boxM(1.9, 0.5, 1.9, redMat, px, 0.25, gz);
      boxM(2.0, 0.35, 2.0, capMat, px, 5.78, gz);
      boxM(1.2, 0.6, 1.2, capMat, px, 6.2, gz);
      boxM(0.5, 0.6, 0.5, glowM('#ff4d4d', '#ff3b3b', 0.3, 2.0), px, 4.3, gz - 0.95);   // đèn trên trụ (mặt trong)
      colliders.push({ minX: px - 0.9, maxX: px + 0.9, minZ: gz - 0.9, maxZ: gz + 0.9 });
      // trụ phụ & cổng nhỏ cho người đi bộ
      boxM(0.8, 3.2, 0.8, pillarMat, s * (GATE + 3.6), 1.6, gz);
    }
    // xà ngang + biển tên (2 mặt: nhìn từ ngoài vào & từ sân ra)
    boxM(2 * GATE + 3.2, 1.7, 0.7, redMat, 0, 6.3, gz);
    signPlane('TRƯỜNG THPT LỚP MÌNH 3D', 2 * GATE + 2.6, 1.3, '#b91c1c', '#fde047', 0, 6.3, gz + 0.36, 0);
    signPlane('TRƯỜNG THPT LỚP MÌNH 3D', 2 * GATE + 2.6, 1.3, '#b91c1c', '#fde047', 0, 6.3, gz - 0.36, Math.PI);
    boxM(2 * GATE + 4.4, 0.3, 1.8, capMat, 0, 7.3, gz);          // mái ngói
    boxM(2 * GATE + 2.4, 0.3, 1.2, capMat, 0, 7.6, gz);
    boxM(1.2, 0.6, 0.3, mat('#facc15'), 0, 7.95, gz);             // đỉnh mái
    // cổng sắt kéo (đang mở, xếp sát hai bên)
    const ironMat = mat('#4b5563', { metalness: 0.6, roughness: 0.4 });
    for (const s of [-1, 1]) {
      const g = new THREE.Group();
      const part = (w, h, x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), ironMat); m.position.set(x, y, 0); g.add(m); };
      part(3.6, 0.1, 0, 2.1); part(3.6, 0.1, 0, 0.15);
      for (let i = 0; i < 13; i++) part(0.05, 2.0, -1.75 + i * 0.29, 1.12);
      g.position.set(s * (GATE - 1.2), 0, gz - 0.5);
      scene.add(g);
    }
  }

  // ---------- Cột cờ ----------
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 9, 10), mat('#d1d5db', { metalness: 0.6, roughness: 0.3 }));
  pole.position.set(0, 4.5, -12); pole.castShadow = true; scene.add(pole);
  scene.add(box(1.6, 0.4, 1.6, '#9ca3af', 0, 0.2, -12));
  addCol(0, -12, 1.6, 1.6);
  const flagTex = canvasTex(300, 200, (ctx, w, h) => {
    ctx.fillStyle = '#da251d'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffff00'; ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 26 : 66, a = -Math.PI / 2 + (i * Math.PI) / 5;
      ctx[i ? 'lineTo' : 'moveTo'](w / 2 + Math.cos(a) * r, h / 2 + 6 + Math.sin(a) * r);
    }
    ctx.fill();
  });
  const flagGeo = new THREE.PlaneGeometry(2.1, 1.4, 16, 4);
  flagGeo.translate(1.05, 0, 0);
  const flag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide }));
  flag.position.set(0.06, 8.2, -12);
  scene.add(flag);
  const flagBase = flagGeo.attributes.position.array.slice();

  // ---------- Sân cầu lông ----------
  const { cx, netZ, halfLen, halfW, postHalfW, netH } = COURT;
  const courtTex = canvasTex(512, 1024, (ctx, w, h) => {
    ctx.fillStyle = '#2f9e44'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#f8f9fa'; ctx.lineWidth = 8;
    const sx = w / 6.1, sz = h / 13.4;
    const X = (m) => (m + 3.05) * sx, Z = (m) => (m + 6.7) * sz;
    ctx.strokeRect(X(-3.05), Z(-6.7), 6.1 * sx, 13.4 * sz);                          // biên đôi
    ctx.beginPath();
    for (const x of [-2.59, 2.59]) { ctx.moveTo(X(x), Z(-6.7)); ctx.lineTo(X(x), Z(6.7)); } // biên dọc sân đơn
    for (const z of [-1.98, 1.98, -5.94, 5.94]) { ctx.moveTo(X(-3.05), Z(z)); ctx.lineTo(X(3.05), Z(z)); }
    ctx.moveTo(X(0), Z(-6.7)); ctx.lineTo(X(0), Z(-1.98)); ctx.moveTo(X(0), Z(1.98)); ctx.lineTo(X(0), Z(6.7));
    ctx.stroke();
  });
  scene.add(flatPlane(7.2, 15, cx, netZ, mat('#868e96'), 0.012));
  scene.add(flatPlane(6.1, 13.4, cx, netZ, new THREE.MeshStandardMaterial({ map: courtTex, roughness: 0.9 }), 0.02));
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, netH, 10), mat('#495057'));
    post.position.set(cx + s * postHalfW, netH / 2, netZ); post.castShadow = true; scene.add(post);
    addCol(cx + s * postHalfW, netZ, 0.2, 0.2);
  }
  const netTex = canvasTex(256, 64, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(20,20,20,.85)'; ctx.lineWidth = 1.5;
    for (let x = 0; x <= w; x += 6) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y <= h; y += 6) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  });
  netTex.wrapS = THREE.RepeatWrapping; netTex.repeat.set(4, 1);
  const net = new THREE.Mesh(new THREE.PlaneGeometry(postHalfW * 2, 0.76),
    new THREE.MeshStandardMaterial({ map: netTex, transparent: true, side: THREE.DoubleSide, alphaTest: 0.1 }));
  net.position.set(cx, netH - 0.38, netZ); scene.add(net);
  scene.add(box(postHalfW * 2, 0.05, 0.02, '#f8f9fa', cx, netH, netZ));
  const bmSign = canvasTex(512, 110, (ctx, w, h) => {
    ctx.fillStyle = '#2b8a3e'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fff'; ctx.font = '800 50px "Be Vietnam Pro", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🏸 SÂN CẦU LÔNG', w / 2, h / 2 + 3);
  });
  const bs = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.65), new THREE.MeshStandardMaterial({ map: bmSign, side: THREE.DoubleSide }));
  bs.position.set(cx - 4.4, 1.8, netZ); bs.rotation.y = Math.PI / 2; scene.add(bs);
  scene.add(box(0.08, 1.5, 0.08, '#495057', cx - 4.4, 0.75, netZ - 1.2), box(0.08, 1.5, 0.08, '#495057', cx - 4.4, 0.75, netZ + 1.2));

  // ---------- Cây anh đào voxel khổng lồ ----------
  const tree = buildVoxelSakura(scene);
  addCol(TREE_X, TREE_Z, 9.6, 9.6);       // thân + phần loe rộng ở gốc
  api.blocks = tree.blocks;

  // ---------- Trang trí: đèn lồng vàng treo dưới tán, dây thừng đỏ quấn thân, cổng vàng phát sáng ----------
  const decoGlow = [];
  const glowMat = (color, day, night) => { const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: day, roughness: 0.5 }); m.userData = { day, night }; decoGlow.push(m); return m; };
  const lanternMat = glowMat('#ffb43a', 0.25, 1.8);
  const ropeMat = glowMat('#d1132a', 0.05, 1.0);
  const paperMat = glowMat('#fff7e8', 0.05, 0.5);
  const goldMat = glowMat('#ffd84d', 0.12, 1.4);
  const strMat = new THREE.MeshStandardMaterial({ color: '#3a2a20', roughness: 0.9 });
  {
    const d = new THREE.Object3D();
    const LN = 130;
    const lanterns = new THREE.InstancedMesh(new THREE.BoxGeometry(0.26, 0.34, 0.26), lanternMat, LN);
    const strings = new THREE.InstancedMesh(new THREE.BoxGeometry(0.03, 1, 0.03), strMat, LN);
    for (let i = 0; i < LN; i++) {
      const pd = tree.pads[i % tree.pads.length];
      const r = Math.sqrt(Math.random()) * pd.rx * 0.85, a = Math.random() * Math.PI * 2;
      const top = pd.c.y - pd.ry * 0.92;                     // treo hẳn bên dưới cụm hoa
      const len = 0.5 + Math.random() * 1.6;
      const x = pd.c.x + Math.cos(a) * r, z = pd.c.z + Math.sin(a) * r;
      d.position.set(x, top - len - 0.17, z); d.rotation.set(0, Math.random() * 3, 0); d.scale.setScalar(1); d.updateMatrix();
      lanterns.setMatrixAt(i, d.matrix);
      d.position.set(x, top - len / 2, z); d.scale.set(1, len, 1); d.updateMatrix();
      strings.setMatrixAt(i, d.matrix);
    }
    scene.add(lanterns, strings);
    // dây thừng đỏ (shimenawa) quấn thân ở 2 độ cao + tua rua và giấy trắng
    const knots = [];
    for (const h of [2.6, 3.4]) {
      const { p, r } = tree.trunkAt(h);
      const R = r + 0.12;
      for (let k = 0; k < 64; k++) { const a = (k / 64) * Math.PI * 2; knots.push([p.x + Math.cos(a) * R, h + Math.sin(a * 3) * 0.08, p.z + Math.sin(a) * R, ropeMat, 0.2]); }
    }
    const { p: tp, r: tr } = tree.trunkAt(3.4);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + 0.2, R = tr + 0.2;
      for (let q = 0; q < 6; q++) knots.push([tp.x + Math.cos(a) * R, 3.25 - q * 0.17, tp.z + Math.sin(a) * R, q % 2 ? paperMat : ropeMat, 0.14]);
    }
    const lp = [...tree.limbPts].sort((a, b) => Math.atan2(a.z - TREE_Z, a.x - TREE_X) - Math.atan2(b.z - TREE_Z, b.x - TREE_X));
    for (let i = 0; i < lp.length; i++) {
      const A = lp[i], B = lp[(i + 1) % lp.length];
      const span = A.distanceTo(B);
      if (span > 14) continue;
      const steps = Math.ceil(span / 0.22);
      for (let k = 0; k <= steps; k++) {
        const f = k / steps;
        const p = A.clone().lerp(B, f);
        p.y -= Math.sin(f * Math.PI) * Math.min(2.2, span * 0.18);          // võng xuống giữa
        knots.push([p.x, p.y, p.z, ropeMat, 0.16]);
        if (k % 9 === 4) for (let q = 1; q <= 3; q++) knots.push([p.x, p.y - q * 0.15, p.z, q % 2 ? paperMat : ropeMat, 0.12]);
      }
    }
    // gộp mọi khối dây thừng / giấy thành InstancedMesh theo vật liệu → vài lệnh vẽ thay vì hàng trăm
    const unit = new THREE.BoxGeometry(1, 1, 1);
    for (const m of [ropeMat, paperMat]) {
      const list = knots.filter((k) => k[3] === m);
      const im = new THREE.InstancedMesh(unit, m, list.length);
      list.forEach(([x, y, z, , sz], i) => { d.position.set(x, y, z); d.rotation.set(0, 0, 0); d.scale.setScalar(sz); d.updateMatrix(); im.setMatrixAt(i, d.matrix); });
      scene.add(im);
    }
    // một cổng torii (kiểu Nhật: kasagi cong vút hai đầu, nuki xuyên cột, cột hơi nghiêng vào trong) ở đầu con đường có đèn
    {
      const g = new THREE.Group();
      const TZ = 20, HW = 3.3, PH = 5.8;
      for (const s2 of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, PH, 12), goldMat);
        post.position.set(s2 * HW, PH / 2, 0); post.rotation.z = s2 * 0.035; g.add(post);
        const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.45, 12), goldMat); foot.position.set(s2 * HW, 0.22, 0); g.add(foot);
        addCol(s2 * HW, TZ, 0.7, 0.7);
      }
      // kasagi: mặt cắt cong, giữa dày rồi vuốt lên & mỏng dần ở hai đầu
      const L = 2 * HW + 3.4, half = L / 2, shape = new THREE.Shape();
      const top = (x) => 0.62 + 0.55 * Math.pow(Math.abs(x) / half, 2.6);
      const bot = (x) => 0.0 + 0.62 * Math.pow(Math.abs(x) / half, 3.2);
      const N = 40;
      for (let i = 0; i <= N; i++) { const x = -half + (L * i) / N; i ? shape.lineTo(x, top(x)) : shape.moveTo(x, top(x)); }
      for (let i = N; i >= 0; i--) { const x = -half + (L * i) / N; shape.lineTo(x, bot(x)); }
      const kasagi = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.8, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 2 }), goldMat);
      kasagi.position.set(0, PH + 0.05, -0.4); g.add(kasagi);
      const shimaki = new THREE.Mesh(new THREE.BoxGeometry(L - 1.2, 0.3, 0.6), goldMat); shimaki.position.y = PH - 0.1; g.add(shimaki);
      const nuki = new THREE.Mesh(new THREE.BoxGeometry(2 * HW + 1.4, 0.36, 0.38), goldMat); nuki.position.y = PH - 1.45; g.add(nuki);
      const gaku = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.9, 0.3), goldMat); gaku.position.y = PH - 0.75; g.add(gaku);
      g.traverse((o) => { o.castShadow = true; });
      g.position.set(0, 0, TZ);
      scene.add(g);
    }
  }

  // ---------- Vòng ghế đá quanh gốc (ngồi được: mỗi ghế 3 chỗ) ----------
  const stoneTop = mat('#cdc8c0'), stoneLeg = mat('#a29c94');
  const BENCH_R = 7.2;
  for (let b = 0; b < 8; b++) {
    const a = (b / 8) * Math.PI * 2 + Math.PI / 8;
    const ox = Math.cos(a), oz = Math.sin(a);              // hướng ra ngoài (người ngồi quay lưng vào gốc cây)
    const tx = -oz, tz = ox;                                // tiếp tuyến
    const cx0 = TREE_X + ox * BENCH_R, cz0 = TREE_Z + oz * BENCH_R;
    const g = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.14, 0.62), stoneTop);
    seat.position.y = 0.43;
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.5, 0.14), stoneTop);
    back.position.set(0, 0.75, 0.3);
    g.add(seat, back);
    for (const s of [-1.1, 1.1]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.38, 0.5), stoneLeg); leg.position.set(s, 0.19, 0); g.add(leg); }
    g.traverse((o) => { o.castShadow = o.receiveShadow = true; });
    g.position.set(cx0, 0, cz0);
    g.rotation.y = Math.atan2(-ox, -oz);                    // lưng ghế (trục +z cục bộ) quay vào gốc cây, mặt ghế nhìn ra sân
    scene.add(g);
    const yaw = Math.atan2(-ox, -oz);                       // nhân vật nhìn ra ngoài
    for (const off of [-0.85, 0, 0.85]) {
      const pos = new THREE.Vector3(cx0 + tx * off - ox * 0.06, 0, cz0 + tz * off - oz * 0.06);
      api.benchSpots.push({ pos, yaw });
      addCol(pos.x, pos.z, 0.55, 0.55);
    }
  }

  // ---------- Thảm cánh hoa trên sân (dày dưới các đám mây hoa) ----------
  const petalTex = petalTexture();
  const petalGeo = new THREE.PlaneGeometry(0.13, 0.13);
  const petalMat = new THREE.MeshStandardMaterial({ map: petalTex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8, emissive: '#ff8cc0', emissiveIntensity: 0.1 });
  const carpetMat = petalMat.clone();
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  const inYard = (x, z) => x > YARD_BOUNDS.minX && x < YARD_BOUNDS.maxX && z > YARD_BOUNDS.minZ && z < YARD_BOUNDS.maxZ;
  const CARPET = 6500;
  const carpet = new THREE.InstancedMesh(petalGeo, carpetMat, CARPET);
  for (let i = 0; i < CARPET; i++) {
    const pd = tree.pads[i % tree.pads.length];
    let x, z;
    do { const r = Math.sqrt(Math.random()) * pd.rx * 1.2, a = Math.random() * Math.PI * 2; x = pd.c.x + Math.cos(a) * r + 1; z = pd.c.z + Math.sin(a) * r; } while (!inYard(x, z) && Math.random() < 0.9);
    dummy.position.set(x, 0.012 + Math.random() * 0.004, z);
    dummy.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI * 2);
    dummy.scale.setScalar(1.6 + Math.random() * 1.6);
    dummy.updateMatrix();
    carpet.setMatrixAt(i, dummy.matrix);
    carpet.setColorAt(i, col.set(PINKS[i % PINKS.length]));
  }
  carpet.receiveShadow = true;
  scene.add(carpet);

  // ---------- Cánh hoa rơi từ các đám mây hoa ----------
  const N = 1700;
  const petals = new THREE.InstancedMesh(petalGeo, petalMat, N);
  petals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const PL = [];
  function spawn(l, near) {
    if (near) l.p.set(near.x + (Math.random() - 0.5) * 16, 2 + Math.random() * 9, near.z + (Math.random() - 0.5) * 16);
    else {
      const pd = tree.pads[Math.floor(Math.random() * tree.pads.length)];
      const r = Math.sqrt(Math.random()) * pd.rx * 0.9, a = Math.random() * Math.PI * 2;
      l.p.set(pd.c.x + Math.cos(a) * r, pd.c.y - pd.ry * 0.35 - Math.random() * 0.6, pd.c.z + Math.sin(a) * r);
    }
    l.fall = 0.7 + Math.random() * 0.6;
    l.phase = Math.random() * 10;
    l.spin.set(1 + Math.random() * 3, 1 + Math.random() * 3, Math.random() * 2);
    l.size = 1.5 + Math.random() * 1.5;
    l.rest = 0;
  }
  for (let i = 0; i < N; i++) {
    const l = { p: new THREE.Vector3(), rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, 0), spin: new THREE.Vector3(), fall: 1, phase: 0, rest: 0, size: 2 };
    spawn(l);
    l.p.y = Math.random() * l.p.y;
    PL.push(l);
    petals.setColorAt(i, col.set(PINKS[i % PINKS.length]));
  }
  scene.add(petals);

  // ---------- Ban đêm: sao trời, đom đóm, đèn hồng dưới tán ----------
  const starPos = new Float32Array(900 * 3);
  for (let i = 0; i < 900; i++) {
    const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 0.92 + 0.05);
    starPos.set([Math.sin(ph) * Math.cos(th) * 175, Math.cos(ph) * 175, Math.sin(ph) * Math.sin(th) * 175], i * 3);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  scene.add(stars);
  const glowTex = canvasTex(64, 64, (ctx, w, h) => {
    const gr = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,235,1)'); gr.addColorStop(0.35, 'rgba(255,225,240,.55)'); gr.addColorStop(1, 'rgba(255,200,220,0)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
  });
  const FF = 320;
  const ffPos = new Float32Array(FF * 3);
  const ffSeed = Array.from({ length: FF }, () => ({ x: (Math.random() - 0.5) * 50, y: 0.6 + Math.random() * 9, z: TREE_Z + (Math.random() - 0.5) * 42, ph: Math.random() * 10 }));
  const ffGeo = new THREE.BufferGeometry();
  ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos, 3));
  const fireflies = new THREE.Points(ffGeo, new THREE.PointsMaterial({ map: glowTex, color: '#fff2c4', size: 0.32, transparent: true, opacity: 0.15,
    blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(fireflies);
  const glowLights = [...tree.pads].sort((a, b) => b.rx - a.rx).slice(0, 6).map((pd) => {
    const l = new THREE.PointLight('#ff7ab8', 0, 32, 1.1);
    l.position.set(pd.c.x, pd.c.y - pd.ry - 1.5, pd.c.z);
    scene.add(l);
    return l;
  });

  // Màu & cường độ cho ngày / đêm (nội suy mượt khi chuyển)
  const C = (a, b) => [new THREE.Color(a), new THREE.Color(b)];
  const NIGHT = {
    bg: C('#e7bfd8', '#120c2a'), fog: C('#e9c3dc', '#150f30'),
    hemiSky: C('#ffe6f0', '#4b4a8c'), hemiGround: C('#9c8a78', '#2a1f3a'), sun: C('#ffc98a', '#9fb3ff'),
  };
  const lerpC = (pair, n, target) => target.copy(pair[0]).lerp(pair[1], n);
  function applyNight(n) {
    for (const k of ['top', 'mid', 'low']) sky.material.uniforms[k].value.copy(SKY.day[k]).lerp(SKY.night[k], n);
    lerpC(NIGHT.bg, n, scene.background);
    lerpC(NIGHT.fog, n, scene.fog.color);
    lerpC(NIGHT.hemiSky, n, hemi.color);
    lerpC(NIGHT.hemiGround, n, hemi.groundColor);
    lerpC(NIGHT.sun, n, sun.color);
    hemi.intensity = THREE.MathUtils.lerp(1.4, 0.38, n);
    sun.intensity = THREE.MathUtils.lerp(3.0, 0.3, n);
    fill.intensity = THREE.MathUtils.lerp(0.5, 0.1, n);
    tree.leafMat.emissiveIntensity = THREE.MathUtils.lerp(0.22, 0.8, n);      // tán hoa phát sáng
    petalMat.emissiveIntensity = THREE.MathUtils.lerp(0.1, 0.5, n);          // cánh hoa rơi lấp lánh
    carpetMat.emissiveIntensity = THREE.MathUtils.lerp(0.1, 0.28, n);
    for (const l of glowLights) l.intensity = n * 4;
    tree.leafUniforms.uNight.value = n;
    sky.material.uniforms.uNight.value = n;
    for (const m of [...decoGlow, ...campusGlow]) m.emissiveIntensity = THREE.MathUtils.lerp(m.userData.day, m.userData.night, n);
    api.bloomStrength = THREE.MathUtils.lerp(0.3, 0.7, n);
    api.bloomThreshold = THREE.MathUtils.lerp(0.92, 0.62, n);
    stars.material.opacity = n;
    api.exposure = THREE.MathUtils.lerp(1.1, 0.9, n);
  }
  api.night = api.nightTarget;
  applyNight(api.night);

  let gust = 0, t = 0;
  api.gust = (near) => { gust = 4; for (let i = 0; i < N * 0.5; i++) spawn(PL[i], near); };
  api.update = (dt) => {
    t += dt;
    tree.leafUniforms.uTime.value = t;
    sky.material.uniforms.uTime.value = t;
    if (Math.abs(api.night - api.nightTarget) > 0.001) {
      api.night += Math.sign(api.nightTarget - api.night) * Math.min(Math.abs(api.nightTarget - api.night), dt / 1.5);
      applyNight(api.night);
    }
    gust = Math.max(0, gust - dt);
    const wind = 0.45 + Math.sin(t * 0.25) * 0.4 + gust * 1.1;
    for (let i = 0; i < N; i++) {
      const l = PL[i];
      if (l.rest > 0) {
        if ((l.rest -= dt) <= 0) spawn(l);
      } else {
        l.p.x += (wind + Math.sin(t * 1.3 + l.phase) * 0.6) * dt;
        l.p.z += (Math.cos(t * 1.1 + l.phase) * 0.5 + gust * 0.25) * dt;
        l.p.y -= l.fall * (0.6 + 0.4 * Math.sin(t * 2.2 + l.phase)) * dt;
        l.rot.x += l.spin.x * dt; l.rot.y += l.spin.y * dt; l.rot.z += l.spin.z * dt;
        if (l.p.y <= 0.02) { l.p.y = 0.02; l.rot.set(-Math.PI / 2, 0, l.rot.z); l.rest = 3 + Math.random() * 6; }
        if (Math.abs(l.p.x) > 45 || Math.abs(l.p.z) > 45) spawn(l);
      }
      dummy.position.copy(l.p);
      dummy.rotation.copy(l.rot);
      dummy.scale.setScalar(l.size);
      dummy.updateMatrix();
      petals.setMatrixAt(i, dummy.matrix);
    }
    petals.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < FF; i++) {
      const s0 = ffSeed[i];
      ffPos[i * 3] = s0.x + Math.sin(t * 0.3 + s0.ph) * 1.2;
      ffPos[i * 3 + 1] = s0.y + Math.sin(t * 0.7 + s0.ph * 2) * 0.6;
      ffPos[i * 3 + 2] = s0.z + Math.cos(t * 0.25 + s0.ph) * 1.2;
    }
    ffGeo.attributes.position.needsUpdate = true;
    fireflies.material.opacity = 0.12 + api.night * 0.7;
    // cờ bay
    const pos = flagGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = flagBase[i * 3];
      pos.array[i * 3 + 2] = Math.sin(x * 3 - t * 6) * 0.12 * (x / 2.1);
    }
    pos.needsUpdate = true;
    flagGeo.computeVertexNormals();
  };
  }
}
