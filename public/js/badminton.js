// Cầu lông kiểu Pingpong Fury: WASD chạy, vị trí chuột = vị trí vợt, tốc độ vung chuột = lực & hướng cú đánh.
//  - Vút mạnh lên → cầu bổng, bay xa; vợt ở cao + đập mạnh xuống → smash; chạm nhẹ → bỏ nhỏ.
//  - Vật lý: a = g − k·|v|·v (lực cản bình phương vận tốc) → cầu đi rất nhanh rồi "khựng" lại và rơi gần thẳng đứng.
// Chế độ: 'bot' (đấu với máy, tính điểm tại máy), 'pvp' (2 người, server tính điểm), 'watch' (khán giả).
// PvP: người đánh gửi (vị trí, vận tốc) → mọi máy mô phỏng cùng quỹ đạo; bên đang có cầu là bên báo cầu chạm đất.
import * as THREE from 'three';
import { createAvatar } from './avatar.js';
import { COURT, BM, sideOfZ, otherSide, rallyWinner, gameOver } from './data/court.js';
import { $, esc } from './ui.js';

const V = THREE.Vector3;
const STEP = 1 / 120;
const UP = new V(0, 1, 0);
const REACH = 1.1;      // vai → đầu vợt (tay 0.55 + vợt 0.55)
const HIT_R = 0.36;     // bán kính "ăn" cầu của mặt vợt (rộng hơn thật một chút cho dễ chơi)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const FRAMES = {
  A: { fwd: new V(0, 0, -1), right: new V(1, 0, 0), yaw: 0 },
  B: { fwd: new V(0, 0, 1), right: new V(-1, 0, 0), yaw: Math.PI },
};
const halfCenter = (side) => new V(COURT.cx, 0, COURT.netZ + (side === 'A' ? 3.6 : -3.6));
const SHOT_NAME = { smash: '💥 SMASH!', clear: '🌈 Lốp cầu', drive: '➡️ Tạt cầu', drop: '🪶 Bỏ nhỏ', serve: '🏸 Giao cầu' };

function shoulderOf(pos, side) {
  const f = FRAMES[side];
  return pos.clone().addScaledVector(UP, 1.36).addScaledVector(f.right, 0.27);
}

function makeRacket(color) {
  const g = new THREE.Group();
  const m = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, ...o });
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.2, 8), m('#212529'));
  handle.position.y = 0.1;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.25, 6), m('#ced4da', { metalness: 0.7 }));
  shaft.position.y = 0.32;
  const head = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.01, 6, 28), m(color));
  head.scale.set(1, 1.3, 1);
  head.position.y = 0.56;
  const strings = new THREE.Mesh(new THREE.CircleGeometry(0.1, 24),
    new THREE.MeshBasicMaterial({ color: '#f8f9fa', transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
  strings.scale.set(1, 1.3, 1);
  strings.position.y = 0.56;
  g.add(handle, shaft, head, strings);
  g.traverse((o) => { o.castShadow = true; });
  return g;
}

function makeShuttle() {
  const g = new THREE.Group();
  const cork = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 8), new THREE.MeshStandardMaterial({ color: '#f1f3f5' }));
  cork.position.y = 0.012;
  const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.036, 0.07, 14, 1, true),
    new THREE.MeshStandardMaterial({ color: '#ffffff', side: THREE.DoubleSide, transparent: true, opacity: 0.92 }));
  skirt.position.y = -0.035;
  g.add(cork, skirt);
  g.scale.setScalar(1.7);   // to hơn thật cho dễ nhìn
  g.traverse((o) => { o.castShadow = true; });
  return g;
}

export class Badminton {
  /**
   * hooks: scene, camera, keys (Set phím đang giữ), me (avatar), send(t, data),
   *        getRemote(side) → { pos: Vector3, av, k: Vector3|null } cho người chơi thật ở bên đó
   */
  constructor(h) {
    this.h = h;
    this.mode = 'off';
    this.mySide = null;
    this.match = { score: { A: 0, B: 0 }, serving: 'A', rally: 0, over: null, names: { A: '', B: '' } };
    this.sh = { p: new V(), v: new V(), flying: false, held: 'A', lastHitter: null, landed: false, netHit: false };
    this.pos = new V(); this.yaw = 0; this.moving = false;
    this.head = new V(); this.prevHead = new V(); this.vel = new V();
    this.mouse = { nx: 0.3, ny: 0 };
    this.time = 0; this.acc = 0; this.cool = 0; this.resetAt = 0;
    this.remoteHead = { A: new V(), B: new V() };

    this.root = new THREE.Group();
    this.rackets = { A: makeRacket('#e03131'), B: makeRacket('#1971c2') };
    this.shuttle = makeShuttle();
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.09, 16), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.35 }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.trailPts = new Float32Array(30 * 3);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(this.trailPts, 3));
    this.trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ color: '#fff3bf', transparent: true, opacity: 0.7 }));
    this.trail.frustumCulled = false;
    this.root.add(this.rackets.A, this.rackets.B, this.shuttle, this.shadow, this.trail);

    addEventListener('mousemove', (e) => {
      this.mouse.nx = (e.clientX / innerWidth) * 2 - 1;
      this.mouse.ny = -((e.clientY / innerHeight) * 2 - 1);
    });
    $('#bm-leave').onclick = () => this.h.onLeaveRequest?.();
    $('#bm-invite').onclick = () => this.h.onInviteRequest?.();
    $('#bm-pause').onclick = () => this.h.onPauseRequest?.();
  }

  get active() { return this.mode !== 'off'; }
  get playing() { return this.mode === 'bot' || this.mode === 'pvp'; }

  // ---------------- vào / ra ----------------
  enter(mode, mySide, mid) {
    this.exit();
    this.mid = mid;
    this.mode = mode;
    this.mySide = mySide;
    this.h.scene.add(this.root);
    if (mySide) {
      this.pos.copy(halfCenter(mySide));
      this.yaw = FRAMES[mySide].yaw;
      this.head.copy(shoulderOf(this.pos, mySide)).addScaledVector(FRAMES[mySide].fwd, 0.6);
      this.prevHead.copy(this.head);
      this.vel.set(0, 0, 0);
      this.fresh = true;          // khung đầu: vợt nhảy tới vị trí chuột không được tính là cú vung
      this.cool = 0.6;
      $('#bm-shot').textContent = '';
      $('#bm-hud').classList.remove('hidden');
    }
    if (mode === 'bot') {
      const bs = otherSide(mySide);
      const av = createAvatar({ skin: 'skin_scarf', hat: 'hat_cap', bag: 'bag_none' }, 'Thầy thể dục');
      this.h.scene.add(av.group);
      this.bot = { side: bs, av, pos: halfCenter(bs), head: new V(), react: 0, miss: false, serveT: 1.5 };
      this.bot.head.copy(shoulderOf(this.bot.pos, bs)).addScaledVector(FRAMES[bs].fwd, 0.6);
      this.match = { score: { A: 0, B: 0 }, serving: mySide, rally: 0, over: null,
        names: { [mySide]: 'Bạn', [bs]: 'Thầy thể dục' } };
      this.flash('Đấu với Thầy thể dục — chạm 11 điểm là thắng!', 2500);
    }
    this.newRally();
    this.renderHud();
  }

  exit() {
    if (this.mode === 'off') return;
    this.h.scene.remove(this.root);
    if (this.bot) { this.h.scene.remove(this.bot.av.group); this.bot.av.dispose(); this.bot = null; }
    this.h.me.aim = null;
    for (const s of ['A', 'B']) { const r = this.h.getRemote(s); if (r?.av) r.av.aim = null; }
    this.mode = 'off';
    this.mySide = null;
    $('#bm-hud').classList.add('hidden');
    $('#bm-msg').classList.add('hidden');
    $('#bm-pause-msg').classList.add('hidden');
  }

  /** Trạng thái trận từ server (pvp / watch). */
  setMatch(st) {
    if (this.mode !== 'pvp' && this.mode !== 'watch') return;
    const prevRally = this.match.rally;
    this.match = { score: st.score, serving: st.serving, rally: st.rally, over: st.over, names: st.names, paused: st.paused };
    if (st.rally !== prevRally) {
      // vừa vào trận / chưa có cầu bay → bắt đầu lượt ngay; cầu vừa rơi → để người chơi kịp nhìn điểm rơi
      if (!this.sh.flying && !this.sh.landed) this.newRally();
      else this.resetAt = this.time + (this.sh.flying ? 0.4 : 1.1);
    }
    if (st.over) this.flash(`🏆 ${esc(st.names[st.over])} thắng trận ${st.score.A}–${st.score.B}!`, 4500);
    this.renderHud();
  }

  remoteHit(m) {
    if (!this.active || m.mid !== this.mid || m.rally !== this.match.rally) return;
    this.launch(new V(...m.p), new V(...m.v), m.side, m.type);
  }

  // ---------------- vòng chơi ----------------
  newRally() {
    Object.assign(this.sh, { flying: false, landed: false, netHit: false, lastHitter: null, held: this.match.serving });
    this.resetAt = 0;
    this.cool = Math.max(this.cool, 0.35);
    this.trailN = 0;
    if (this.bot) this.bot.serveT = 1.3;
    if (this.mode === 'bot' && this.match.over) {
      this.match.score = { A: 0, B: 0 };
      this.match.over = null;
    }
    this.renderHud();
  }

  launch(p, v, side, type) {
    Object.assign(this.sh, { flying: true, held: null, landed: false, netHit: false, lastHitter: side });
    this.resetAt = 0;   // có cú đánh mới của lượt hiện tại → huỷ mọi lệnh reset đang chờ
    this.sh.p.copy(p);
    this.sh.v.copy(v);
    this.trailN = 0;
    if (this.bot && side !== this.bot.side) {
      // máy dễ hụt hơn khi bị smash / đánh rất nhanh
      this.bot.miss = Math.random() < (v.length() > 18 ? 0.33 : 0.1);
      this.bot.react = 0.12 + Math.random() * 0.12;
    }
    const kmh = Math.round(v.length() * 3.6);
    if (side === this.mySide) $('#bm-shot').textContent = `${SHOT_NAME[type] || ''} · ${kmh} km/h`;
    this.renderHud();
  }

  /** Tính vận tốc cầu sau khi đánh, từ vận tốc vung vợt (đặc tính vật lý chính của game). */
  shot(side, head, vel, playerPos, serve) {
    const { fwd, right } = FRAMES[side];
    const sp = vel.length();
    const up = vel.y;
    const lat = vel.dot(right);
    const forward = Math.max(0, vel.dot(fwd));
    let power = clamp(5.5 + sp * 1.45 + forward * 0.4, 5.5, 31);
    let elev, type;
    if (!serve && head.y > 1.85 && up < -2.5) {                 // đập từ trên cao xuống → smash
      elev = clamp(-0.06 + up * 0.022, -0.5, -0.06);
      power = Math.min(31, power * 1.15);
      type = 'smash';
    } else {                                                      // vung lên càng mạnh → càng bổng
      // trợ lực qua lưới (như Pingpong Fury): đỡ cầu càng thấp thì góc nâng tối thiểu càng lớn
      const minElev = 0.18 + clamp((1.7 - head.y) * 0.22, 0, 0.45);
      elev = clamp(Math.max(0.38 + up * 0.075, minElev), 0.1, 1.25);
      type = power < 9 ? 'drop' : elev > 0.75 ? 'clear' : 'drive';
    }
    if (serve) { power = clamp(power, 10, 19); elev = Math.max(elev, 0.55); type = 'serve'; }
    const offs = head.clone().sub(playerPos).dot(right);          // vợt lệch trái/phải so với người
    const centerFix = -playerPos.clone().sub(new V(COURT.cx, 0, 0)).dot(right) * 0.03;
    const yaw = clamp(lat * 0.045 + offs * 0.1 + centerFix, -0.4, 0.4);
    const v = new V()
      .addScaledVector(fwd, Math.cos(elev) * Math.cos(yaw))
      .addScaledVector(right, Math.cos(elev) * Math.sin(yaw))
      .addScaledVector(UP, Math.sin(elev))
      .multiplyScalar(power);
    return { v, type };
  }

  canHit(side) {
    const s = this.sh;
    return s.held === side || (s.flying && s.lastHitter !== side && sideOfZ(s.p.z) === side);
  }

  tryHit(side, prev, head, vel, playerPos) {
    if (!this.canHit(side)) return false;
    const serve = this.sh.held === side;
    if (serve && vel.length() < 1.2) return false;               // giao cầu phải vung vợt
    // khoảng cách từ cầu tới đoạn quét của mặt vợt (vung nhanh không bị "xuyên" qua cầu)
    const seg = head.clone().sub(prev);
    const t = clamp(this.sh.p.clone().sub(prev).dot(seg) / Math.max(seg.lengthSq(), 1e-6), 0, 1);
    const closest = prev.clone().addScaledVector(seg, t);
    if (closest.distanceTo(this.sh.p) > HIT_R) return false;
    const { v, type } = this.shot(side, head, vel, playerPos, serve);
    const p = this.sh.p.clone();
    this.launch(p, v, side, type);
    if (this.mode === 'pvp') this.h.send('bm_hit', { p: p.toArray().map((n) => +n.toFixed(3)), v: v.toArray().map((n) => +n.toFixed(3)), rally: this.match.rally, type });
    return true;
  }

  stepShuttle(h) {
    const s = this.sh, v = s.v;
    const sp = v.length();
    v.x += -BM.drag * sp * v.x * h;
    v.y += (-BM.g - BM.drag * sp * v.y) * h;
    v.z += -BM.drag * sp * v.z * h;
    const pz = s.p.z;
    s.p.addScaledVector(v, h);
    const { netZ, cx, postHalfW, netH } = COURT;
    if (!s.netHit && (pz - netZ) * (s.p.z - netZ) < 0 && Math.abs(s.p.x - cx) <= postHalfW && s.p.y < netH) {
      s.netHit = true;                                            // mắc lưới → rơi về phía người đánh
      s.p.z = netZ + Math.sign(pz - netZ) * 0.05;
      v.set(0, Math.min(0, v.y) * 0.2, 0);
    }
    if (s.p.y <= 0.03 || Math.abs(s.p.z - netZ) > 25) {
      s.p.y = 0.03;
      s.flying = false;
      s.landed = true;
      this.onLand();
    }
  }

  onLand() {
    const { x, z } = this.sh.p;
    const res = rallyWinner(this.sh.lastHitter, x, z);
    const txt = res.reason === 'net' ? (this.sh.netHit ? '🕸️ Chạm lưới!' : '⬇️ Cầu không qua lưới!') : res.reason === 'out' ? '🚫 Ra ngoài!' : '✅ Cầu trong sân!';
    this.flash(`${txt} Điểm cho ${esc(this.match.names[res.winner] || res.winner)}`, 1400);
    if (this.mode === 'bot') {
      this.match.score[res.winner]++;
      this.match.serving = res.winner;
      this.match.over = gameOver(this.match.score);
      if (this.match.over) {
        const win = this.match.over === this.mySide;
        this.flash(win ? `🏆 Bạn thắng ${this.match.score[this.mySide]}–${this.match.score[this.bot.side]}! Thầy phục rồi!` : '😅 Thầy thể dục thắng. Làm ván nữa nhé!', 3500);
      }
      this.resetAt = this.time + (this.match.over ? 3.6 : 1.4);
      this.renderHud();
    } else if (this.mode === 'pvp' && sideOfZ(z) === this.mySide) {
      // bên có cầu rơi xuống là bên báo kết quả; server tính điểm và phát cho mọi người
      this.h.send('bm_land', { rally: this.match.rally, x: +x.toFixed(3), z: +z.toFixed(3) });
    }
  }

  predictHitPoint(side) {
    const p = this.sh.p.clone(), v = this.sh.v.clone();
    let last = null;
    for (let i = 0; i < 400; i++) {
      const h = STEP * 2, sp = v.length();
      v.x += -BM.drag * sp * v.x * h; v.y += (-BM.g - BM.drag * sp * v.y) * h; v.z += -BM.drag * sp * v.z * h;
      p.addScaledVector(v, h);
      if (sideOfZ(p.z) === side) { last = p.clone(); if (v.y < 0 && p.y < 1.5) return p; }
      if (p.y <= 0) break;
    }
    return last;
  }

  updateBot(dt) {
    const b = this.bot, s = this.sh;
    const { fwd, right } = FRAMES[b.side];
    let target = halfCenter(b.side);
    if (s.flying && s.lastHitter !== b.side) {
      if ((b.react -= dt) <= 0) {
        const hp = this.predictHitPoint(b.side);
        if (hp) target = hp.clone().addScaledVector(right, -0.45).addScaledVector(fwd, -0.25).setY(0);
      } else target = b.pos.clone();
    }
    if (s.held === b.side) target = b.pos.clone();
    const d = target.sub(b.pos).setY(0);
    const step = Math.min(d.length(), 4.6 * dt);
    b.moving = step > 0.01;
    if (b.moving) b.pos.addScaledVector(d.normalize(), step);
    this.clampToHalf(b.pos, b.side);

    const sh = shoulderOf(b.pos, b.side);
    const idle = sh.clone().addScaledVector(fwd.clone().multiplyScalar(0.6).addScaledVector(UP, 0.35).addScaledVector(right, 0.25).normalize(), REACH * 0.9);
    let headTarget = idle;
    const near = s.flying && s.lastHitter !== b.side && sideOfZ(s.p.z) === b.side && sh.distanceTo(s.p) < 1.6;
    if (near && !b.miss) headTarget = sh.clone().addScaledVector(s.p.clone().sub(sh).normalize(), REACH);
    b.head.lerp(headTarget, 1 - Math.exp(-14 * dt));

    if (s.flying && s.lastHitter !== b.side && sideOfZ(s.p.z) === b.side && !b.miss &&
        sh.distanceTo(s.p) < 1.25 && s.p.y > 0.2 && s.p.y < 2.9) {
      b.head.copy(s.p);
      const { v, type } = this.botShot(b.side, s.p);
      this.launch(s.p.clone(), v, b.side, type);
    }
    if (s.held === b.side && (b.serveT -= dt) <= 0) {
      const v = new V().addScaledVector(fwd, Math.cos(0.75)).addScaledVector(UP, Math.sin(0.75)).multiplyScalar(14 + Math.random() * 3);
      this.launch(this.servePos(b.side), v, b.side, 'serve');
    }
    b.av.group.position.copy(b.pos);
    b.av.group.rotation.y = FRAMES[b.side].yaw;
    b.av.aim = b.head;
    b.av.setAnim(b.moving ? 'run|' : 'idle|');
    b.av.update(dt);
  }

  /** Mô phỏng nhanh một cú đánh: có qua lưới không, rơi ở đâu. */
  simulate(p0, v0) {
    const p = p0.clone(), v = v0.clone();
    const { netZ, netH } = COURT;
    let clearsNet = true;
    for (let i = 0; i < 600 && p.y > 0; i++) {
      const h = STEP * 2, sp = v.length(), pz = p.z;
      v.x += -BM.drag * sp * v.x * h; v.y += (-BM.g - BM.drag * sp * v.y) * h; v.z += -BM.drag * sp * v.z * h;
      p.addScaledVector(v, h);
      if ((pz - netZ) * (p.z - netZ) < 0 && p.y < netH + 0.08) clearsNet = false;
    }
    return { clearsNet, land: p };
  }

  /** Máy chọn cú đánh: thử vài phương án theo vật lý, ưu tiên cú qua lưới và rơi trong sân, né về phía trống. */
  botShot(side, from) {
    const { fwd, right } = FRAMES[side];
    const opp = otherSide(side);
    const distNet = Math.abs(from.z - COURT.netZ);
    const r = Math.random();
    const want = from.y > 2.0 && r < 0.4 ? 'smash' : distNet < 3.2 && r < 0.45 ? 'drop' : r < 0.75 ? 'clear' : 'drive';
    const RANGES = { smash: [24, 30, -0.3, -0.08], drop: [6, 9.5, 0.35, 0.7], clear: [16, 25, 0.65, 1.05], drive: [13, 19, 0.2, 0.45] };
    const meOff = this.pos.clone().sub(new V(COURT.cx, 0, 0)).dot(right);
    const mk = (type) => {
      const [p0, p1, e0, e1] = RANGES[type];
      const power = p0 + Math.random() * (p1 - p0), elev = e0 + Math.random() * (e1 - e0);
      const yaw = clamp(-Math.sign(meOff || 1) * Math.random() * 0.3 + (Math.random() - 0.5) * 0.12, -0.35, 0.35);
      const v = new V().addScaledVector(fwd, Math.cos(elev) * Math.cos(yaw)).addScaledVector(right, Math.cos(elev) * Math.sin(yaw))
        .addScaledVector(UP, Math.sin(elev)).multiplyScalar(power);
      return { v, type };
    };
    let fallback = null;
    for (const type of [want, want, want, 'clear', 'drive', 'drop']) {
      for (let i = 0; i < 4; i++) {
        const c = mk(type);
        const { clearsNet, land } = this.simulate(from, c.v);
        const inCourt = Math.abs(land.x - COURT.cx) < COURT.halfW - 0.25 && Math.abs(land.z - COURT.netZ) < COURT.halfLen - 0.25;
        if (clearsNet && inCourt && sideOfZ(land.z) === opp) return c;
        if (clearsNet && !fallback) fallback = c;
      }
    }
    return fallback || mk('clear');
  }

  clampToHalf(p, side) {
    const { cx, netZ, halfLen } = COURT;
    p.x = clamp(p.x, cx - 3.4, cx + 3.4);
    p.z = side === 'A' ? clamp(p.z, netZ + 0.35, netZ + halfLen + 1.5) : clamp(p.z, netZ - halfLen - 1.5, netZ - 0.35);
  }

  playerPos(side) {
    if (side === this.mySide) return this.pos;
    if (this.bot && side === this.bot.side) return this.bot.pos;
    return this.h.getRemote(side)?.pos || halfCenter(side);
  }

  servePos(side) {
    const { fwd, right } = FRAMES[side];
    return this.playerPos(side).clone().addScaledVector(fwd, 0.55).addScaledVector(right, 0.3).setY(1.05);
  }

  // ---------------- mỗi khung hình ----------------
  update(dt) {
    if (!this.active) return;
    // Tạm dừng (PvP, server quyết định) hoặc đang mở bảng mời (đấu máy) → đóng băng trận
    const paused = this.match.paused;
    if (paused || this.localPause) {
      if (paused) {
        const left = Math.max(0, Math.ceil((paused.until - Date.now()) / 1000));
        const mm = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
        $('#bm-pause-msg').innerHTML = paused.side === this.mySide
          ? `⏸ Bạn đang tạm dừng trận — nhấn <kbd>P</kbd> để tiếp tục (còn ${mm})`
          : `⏸ ${esc(paused.name)} đang tạm dừng trận — chờ tối đa ${mm}`;
      }
      $('#bm-pause-msg').classList.toggle('hidden', !paused);
      this.renderObjects();
      if (this.mySide) this.updateCamera(dt);
      return;
    }
    $('#bm-pause-msg').classList.add('hidden');
    this.time += dt;
    this.cool -= dt;

    if (this.mySide) {
      const { fwd, right } = FRAMES[this.mySide];
      const k = this.h.keys;
      let mf = 0, mr = 0;
      if (k.has('KeyW')) mf += 1;
      if (k.has('KeyS')) mf -= 1;
      if (k.has('KeyD')) mr += 1;
      if (k.has('KeyA')) mr -= 1;
      this.moving = !!(mf || mr);
      if (this.moving) {
        const speed = k.has('ShiftLeft') || k.has('ShiftRight') ? 5.4 : 4.2;
        const dir = new V().addScaledVector(fwd, mf).addScaledVector(right, mr).normalize();
        this.pos.addScaledVector(dir, speed * dt);
        this.clampToHalf(this.pos, this.mySide);
      }
      // Chuột → vợt: ngang = trái/phải, dọc = cao/thấp; giới hạn trong tầm với từ vai
      const sh = shoulderOf(this.pos, this.mySide);
      const { nx, ny } = this.mouse;
      const target = this.pos.clone()
        .addScaledVector(right, nx * 1.25)
        .addScaledVector(fwd, 0.35 + Math.max(0, ny) * 0.2)
        .setY(clamp(1.35 + ny * 1.3, 0.15, 2.75));
      const d = target.sub(sh);
      const len = clamp(d.length(), 0.45, REACH);
      this.prevHead.copy(this.head);
      this.head.copy(sh).addScaledVector(d.normalize(), len);
      if (this.fresh) { this.prevHead.copy(this.head); this.fresh = false; }
      const inst = this.head.clone().sub(this.prevHead).divideScalar(Math.max(dt, 1e-3));
      this.vel.lerp(inst, 0.55);
    }
    if (this.bot) this.updateBot(dt);
    for (const s of ['A', 'B']) {
      const r = s !== this.mySide && !(this.bot && this.bot.side === s) ? this.h.getRemote(s) : null;
      if (r?.k) this.remoteHead[s].lerp(r.k, 1 - Math.exp(-18 * dt));
    }

    // Cầu
    const s = this.sh;
    if (s.held) s.p.copy(this.servePos(s.held));
    if (this.mySide && this.cool <= 0 && this.tryHit(this.mySide, this.prevHead, this.head, this.vel, this.pos)) this.cool = 0.25;
    if (s.flying) {
      this.acc += dt;
      while (this.acc >= STEP && s.flying) { this.stepShuttle(STEP); this.acc -= STEP; }
    } else this.acc = 0;
    if (this.resetAt && this.time >= this.resetAt) this.newRally();

    this.renderObjects();
    if (this.mySide) this.updateCamera(dt);
  }

  racketHead(side) {
    if (side === this.mySide) return this.head;
    if (this.bot && side === this.bot.side) return this.bot.head;
    return this.h.getRemote(side)?.k ? this.remoteHead[side] : null;
  }

  renderObjects() {
    for (const side of ['A', 'B']) {
      const rk = this.rackets[side];
      const head = this.racketHead(side);
      rk.visible = !!head;
      if (!head) continue;
      const sh = shoulderOf(this.playerPos(side), side);
      const y = head.clone().sub(sh).normalize();
      const fwd = FRAMES[side].fwd;
      const z = fwd.clone().addScaledVector(y, -fwd.dot(y));
      if (z.lengthSq() < 1e-4) z.copy(FRAMES[side].right);
      z.normalize();
      const x = new V().crossVectors(y, z);
      rk.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
      rk.position.copy(head).addScaledVector(y, -0.56);
      const r = side !== this.mySide && !(this.bot && this.bot.side === side) ? this.h.getRemote(side) : null;
      if (r?.av) r.av.aim = head;
    }
    if (this.mySide) this.h.me.aim = this.head;

    const s = this.sh;
    this.shuttle.position.copy(s.p);
    if (s.flying && s.v.lengthSq() > 0.01) this.shuttle.quaternion.setFromUnitVectors(UP, s.v.clone().normalize());
    else if (s.held) this.shuttle.quaternion.identity();
    else this.shuttle.quaternion.setFromUnitVectors(UP, new V(0.3, 0.2, 0.9).normalize()); // nằm nghiêng trên sân
    this.shadow.position.set(s.p.x, 0.035, s.p.z);
    this.shadow.scale.setScalar(clamp(1.2 - s.p.y * 0.12, 0.4, 1.2));
    // vệt bay
    if (s.flying) {
      if (this.trailN < 30) this.trailN++;
      this.trailPts.copyWithin(3, 0, 29 * 3);
      this.trailPts.set([s.p.x, s.p.y, s.p.z], 0);
    }
    if (!s.flying && !s.landed) this.trailN = 0;
    this.trail.geometry.setDrawRange(0, this.trailN);
    this.trail.geometry.attributes.position.needsUpdate = true;
  }

  updateCamera(dt) {
    const { fwd } = FRAMES[this.mySide];
    const { cx, netZ } = COURT;
    const cam = this.h.camera;
    const target = new V(cx + (this.pos.x - cx) * 0.55, 3.4, this.pos.z).addScaledVector(fwd, -4.4);
    if (COURT.cam) {
      target.x = Math.min(COURT.cam.maxX, Math.max(COURT.cam.minX, target.x));
      target.z = Math.min(COURT.cam.maxZ, Math.max(COURT.cam.minZ, target.z));
    }
    cam.position.lerp(target, 1 - Math.exp(-6 * dt));
    cam.lookAt(new V(cx + (this.pos.x - cx) * 0.3, 1.1, netZ).addScaledVector(fwd, 2));
    if (Math.abs(cam.fov - 62) > 0.1) { cam.fov = 62; cam.updateProjectionMatrix(); }
  }

  renderHud() {
    if (!this.mySide) return;
    const me = this.mySide, op = otherSide(me);
    const { score, serving, names } = this.match;
    $('#bm-score').innerHTML = `<b>${esc(names[me] || 'Bạn')}</b> <span class="sc">${score[me]}</span> – <span class="sc">${score[op]}</span> <b>${esc(names[op] || 'Đối thủ')}</b>`;
    $('#bm-serve').textContent = this.sh.held ? (serving === me ? '🏸 Lượt bạn giao — vung chuột qua quả cầu' : '⏳ Đối thủ giao cầu') : '';
    $('#bm-invite').classList.toggle('hidden', this.mode !== 'bot');
    $('#bm-pause').classList.toggle('hidden', this.mode !== 'pvp');
    $('#bm-pause').textContent = this.match.paused?.side === me ? '▶ Tiếp tục (P)' : '⏸ Tạm dừng (P)';
  }

  flash(html, ms = 1500) {
    const el = $('#bm-msg');
    el.innerHTML = html;
    el.classList.remove('hidden');
    clearTimeout(this.flashT);
    this.flashT = setTimeout(() => el.classList.add('hidden'), ms);
  }
}
