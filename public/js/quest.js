// Kho tàng tri thức: nhân vật chạy trên con đường làng, mỗi cổng làng là một ải câu hỏi.
// Trả lời đúng → thanh tre chắn cổng nâng lên; sai → vấp ngã, mất 1 tim. Về đích mở rương báu.
import * as THREE from 'three';
import { api } from './net.js';
import { createAvatar } from './avatar.js';
import { $, esc, toast, openModal, closeModal, fmt } from './ui.js';
import { ITEM_MAP, RARITY } from './data/items.js';

const GAP = 14;
const N = 10;
const RUN_SPEED = 5;
const ANSWER_TIME = 20;

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const m = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });

export class QuestMode {
  constructor(hooks) {
    this.h = hooks; // { onProfile(p), onExit(), getLook() }
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 400);
    this.build();
    $('#qh-exit').onclick = () => this.exit();
    $('#qq-next').onclick = () => this.afterAnswer();
    $('#result-menu').onclick = () => { closeModal('#modal-result'); this.exit(); };
    $('#result-again').onclick = () => { closeModal('#modal-result'); this.start(this.pack); };
  }

  build() {
    const s = this.scene;
    s.background = new THREE.Color('#9fd8ff');
    s.fog = new THREE.Fog('#cfeaff', 40, 160);
    s.add(new THREE.HemisphereLight('#ffffff', '#6b8e23', 1.1));
    const sun = new THREE.DirectionalLight('#fff4d6', 1.8);
    sun.position.set(20, 30, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, far: 80 });
    s.add(sun, sun.target);
    this.sun = sun;

    const length = (N + 3) * GAP;
    // Ruộng lúa
    const rice = canvasTex(256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#7cb342'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#8bc34a'; ctx.lineWidth = 6;
      for (let y = 0; y < h; y += 16) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    });
    rice.wrapS = rice.wrapT = THREE.RepeatWrapping; rice.repeat.set(30, 60);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, length + 200), m('#ffffff', { map: rice }));
    ground.rotation.x = -Math.PI / 2; ground.position.z = -length / 2; ground.receiveShadow = true;
    s.add(ground);
    // Sông hai bên
    for (const x of [-9, 9]) {
      const river = new THREE.Mesh(new THREE.PlaneGeometry(5, length + 200), m('#38bdf8', { roughness: 0.2, metalness: 0.1 }));
      river.rotation.x = -Math.PI / 2; river.position.set(x, 0.02, -length / 2); s.add(river);
    }
    // Đường gạch
    const brick = canvasTex(128, 128, (ctx, w, h) => {
      ctx.fillStyle = '#b45309'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#7c2d12'; ctx.lineWidth = 4;
      for (let y = 0; y <= h; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      for (let y = 0; y < h; y += 32) for (let x = (y / 32) % 2 ? 32 : 0; x <= w; x += 64) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 32); ctx.stroke(); }
    });
    brick.wrapS = brick.wrapT = THREE.RepeatWrapping; brick.repeat.set(2, length / 2);
    const road = new THREE.Mesh(new THREE.BoxGeometry(4, 0.1, length), m('#ffffff', { map: brick }));
    road.position.set(0, 0.05, -length / 2 + 6); road.receiveShadow = true; s.add(road);

    // Đèn lồng, tre, núi
    for (let z = 0; z > -length; z -= 7) {
      for (const x of [-2.6, 2.6]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6), m('#78350f'));
        post.position.set(x, 1.1, z); s.add(post);
        const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), m('#ef4444', { emissive: '#dc2626', emissiveIntensity: 0.6 }));
        lantern.scale.y = 1.25; lantern.position.set(x, 2.3, z); s.add(lantern);
      }
    }
    for (let i = 0; i < 70; i++) {
      const side = i % 2 ? 1 : -1;
      const x = side * (13 + (i * 7.3) % 10), z = -((i * 13.7) % length) + 10;
      const h = 4 + (i % 4);
      const bamboo = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, h, 6), m('#65a30d'));
      bamboo.position.set(x, h / 2, z); bamboo.rotation.z = side * 0.06; s.add(bamboo);
      const leaves = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.8, 7), m('#3f6212'));
      leaves.position.set(x, h, z); s.add(leaves);
    }
    for (let i = 0; i < 16; i++) {
      const side = i % 2 ? 1 : -1;
      const mt = new THREE.Mesh(new THREE.ConeGeometry(14 + (i % 3) * 5, 22 + (i % 4) * 6, 7), m(i % 3 ? '#4d7c0f' : '#3f6212'));
      mt.position.set(side * (60 + (i % 3) * 15), 8, -i * (length / 16)); s.add(mt);
    }

    // Cổng làng (ải)
    this.gates = [];
    for (let i = 0; i < N; i++) {
      const z = -(i + 1) * GAP;
      const g = new THREE.Group(); g.position.z = z;
      for (const x of [-2.3, 2.3]) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.45, 3.4, 0.45), m('#b91c1c'));
        p.position.set(x, 1.7, 0); p.castShadow = true; g.add(p);
      }
      const roof = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.3, 1.1), m('#7f1d1d'));
      roof.position.y = 3.6; roof.castShadow = true; g.add(roof);
      const roof2 = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.25, 0.8), m('#991b1b'));
      roof2.position.y = 3.95; g.add(roof2);
      const plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), m('#ffffff', {
        map: canvasTex(320, 100, (ctx, w, h) => {
          ctx.fillStyle = '#facc15'; ctx.fillRect(0, 0, w, h);
          ctx.fillStyle = '#7f1d1d'; ctx.font = '800 56px "Be Vietnam Pro", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(`ẢI ${i + 1}`, w / 2, h / 2 + 3);
        }),
      }));
      plaque.position.set(0, 3.1, 0.24); g.add(plaque);
      const bars = new THREE.Group();
      for (let b = 0; b < 7; b++) {
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 8), m('#a3a635'));
        bar.position.set(-1.8 + b * 0.6, 1.3, 0); bar.castShadow = true; bars.add(bar);
      }
      const cross = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.2, 8), m('#84862a'));
      cross.rotation.z = Math.PI / 2; cross.position.y = 1.6; bars.add(cross);
      g.add(bars);
      this.scene.add(g);
      this.gates.push({ z, group: g, bars, state: 'closed' });
    }

    // Đích + rương báu
    this.finishZ = -(N + 1) * GAP - 2;
    const arch = new THREE.Group(); arch.position.z = this.finishZ;
    for (const x of [-2.4, 2.4]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 4, 12), m('#facc15', { metalness: 0.4 }));
      p.position.set(x, 2, 0); arch.add(p);
    }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 0.9), m('#ffffff', {
      map: canvasTex(600, 110, (ctx, w, h) => {
        ctx.fillStyle = '#c8102e'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#fde047'; ctx.font = '800 70px "Be Vietnam Pro", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('VỀ ĐÍCH', w / 2, h / 2 + 4);
      }),
    }));
    sign.position.y = 4; arch.add(sign);
    s.add(arch);
    this.chest = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 0.8), m('#92400e'));
    base.position.y = 0.45; base.castShadow = true;
    this.lid = new THREE.Group(); this.lid.position.set(0, 0.8, 0.4);
    const lidMesh = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.3, 0.85), m('#b45309'));
    lidMesh.position.set(0, 0.15, -0.42); this.lid.add(lidMesh);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(1.27, 0.08, 0.87), m('#facc15', { metalness: 0.6, emissive: '#a16207', emissiveIntensity: 0.3 }));
    trim.position.y = 0.62;
    this.chest.add(base, this.lid, trim);
    this.chest.position.z = this.finishZ - 4;
    s.add(this.chest);
    this.glow = new THREE.PointLight('#fde047', 0, 8);
    this.glow.position.set(0, 1.5, this.finishZ - 4);
    s.add(this.glow);
  }

  async start(pack) {
    this.pack = pack;
    let d;
    try { d = await api('/quest/start', { pack }); } catch (e) { toast(e.message, 'err'); return false; }
    Object.assign(this, { runId: d.runId, qs: d.questions, hearts: d.hearts, mul: d.mul, gate: 0, coins: 0, streak: 0, state: 'run', stun: 0, t: 0 });
    if (this.runner) { this.scene.remove(this.runner.group); this.runner.dispose(); }
    this.runner = createAvatar(this.h.getLook(), '');
    this.runner.group.position.set(0, 0.1, 4);
    this.runner.group.rotation.y = 0;
    this.scene.add(this.runner.group);
    for (const g of this.gates) { g.state = 'closed'; g.bars.position.y = 0; g.bars.rotation.x = 0; g.bars.visible = true; g.bars.children.forEach((b) => b.material.color.set('#a3a635')); }
    this.lid.rotation.x = 0; this.glow.intensity = 0;
    $('#quest-hud').classList.remove('hidden');
    this.hud();
    return true;
  }

  hud() {
    $('#qh-hearts').textContent = '❤️'.repeat(Math.max(0, this.hearts)) + '🖤'.repeat(Math.max(0, 3 - this.hearts));
    $('#qh-coins').textContent = this.coins;
    $('#qh-streak').textContent = this.streak;
    $('#qh-mul').textContent = this.mul > 1 ? `🎉 x${this.mul}` : '';
    $('#qh-bar').style.width = `${(this.gate / N) * 100}%`;
  }

  ask() {
    this.last = null;
    this.state = 'ask';
    const q = this.qs[this.gate];
    this.left = ANSWER_TIME;
    this.answered = false;
    $('#qq-step').textContent = `Ải ${this.gate + 1}/${N} · ${q.pack === 'vn' ? '🇻🇳 Việt Nam' : q.pack === 'asia' ? '🏮 Châu Á' : '🌍 Thế giới'}`;
    $('#qq-text').textContent = q.q;
    $('#qq-exp').classList.add('hidden');
    $('#qq-next').classList.add('hidden');
    $('#qq-options').innerHTML = q.options.map((o, k) => `<button class="opt" data-k="${k}">${'ABCD'[k]}. ${esc(o)}</button>`).join('');
    $('#qq-options').onclick = (e) => { const b = e.target.closest('.opt'); if (b) this.answer(+b.dataset.k); };
    openModal('#modal-qq');
  }

  async answer(choice) {
    if (this.answered) return;
    this.answered = true;
    let r;
    try { r = await api('/quest/answer', { runId: this.runId, i: this.gate, choice }); }
    catch (e) { toast(e.message, 'err'); this.answered = false; return; }
    const btns = [...$('#qq-options').children];
    btns.forEach((b, k) => { b.disabled = true; if (k === r.answer) b.classList.add('right'); else if (k === choice) b.classList.add('wrong'); });
    $('#qq-exp').innerHTML = `${r.correct ? `✅ Chính xác! +🪙${r.coins}` : choice < 0 ? '⏰ Hết giờ!' : '❌ Chưa đúng!'} — ${esc(r.exp)}`;
    $('#qq-exp').classList.remove('hidden');
    $('#qq-next').classList.remove('hidden');
    this.last = r;
    this.hearts = r.hearts; this.streak = r.streak; this.coins += r.coins;
    $('#tb-coins').textContent = fmt(r.coinsTotal);
    this.hud();
  }

  afterAnswer() {
    if (!this.answered || !this.last) return;
    closeModal('#modal-qq');
    const r = this.last;
    const g = this.gates[this.gate];
    g.state = r.correct ? 'open' : 'broken';
    if (!r.correct) { g.bars.children.forEach((b) => b.material.color.set('#7f1d1d')); this.stun = 1.0; }
    this.gate++;
    this.hud();
    this.state = r.failed ? 'fail' : 'run';
    if (r.failed) setTimeout(() => this.finish(), 900);
  }

  async finish() {
    this.state = 'done';
    let r;
    try { r = await api('/quest/finish', { runId: this.runId }); } catch (e) { toast(e.message, 'err'); return; }
    this.h.onProfile(r.profile);
    const win = this.hearts > 0;
    const it = r.reward.item && ITEM_MAP[r.reward.item];
    $('#result-body').innerHTML = win ? `
      <div class="chest">🎁</div><h2>Mở rương báu!</h2>
      <p>Đúng ${r.correct}/${r.total} câu · kiếm được 🪙 ${fmt(r.earned)} trên đường</p>
      <div class="reward-row">
        ${r.reward.coins ? `<div class="reward">🪙 +${fmt(r.reward.coins)}</div>` : ''}
        ${r.reward.gems ? `<div class="reward">💎 +${r.reward.gems}</div>` : ''}
        ${it ? `<div class="reward" style="border-color:${RARITY[it.rarity].color}">${it.icon} ${esc(it.name)}<br><small style="color:${RARITY[it.rarity].color}">${RARITY[it.rarity].name}</small></div>` : ''}
      </div>${r.correct === r.total ? '<p>🌟 Hoàn hảo! Thưởng thêm 2 kim cương.</p>' : ''}` : `
      <div class="result-big">💔</div><h2>Hết tim rồi!</h2>
      <p>Đúng ${r.correct} câu. Quà an ủi 🪙 ${r.reward.coins}. Thử lại nhé — kiến thức là kho báu!</p>`;
    openModal('#modal-result');
  }

  exit() {
    closeModal('#modal-qq');
    $('#quest-hud').classList.add('hidden');
    this.state = 'idle';
    this.h.onExit();
  }

  update(dt) {
    if (!this.runner) return;
    this.t += dt;
    const p = this.runner.group.position;
    let anim = 'idle|';

    if (this.state === 'ask' && !this.answered) {
      this.left -= dt;
      $('#qq-timer').textContent = `⏱ ${Math.max(0, Math.ceil(this.left))}s`;
      if (this.left <= 0) this.answer(-1);
    }
    if (this.state === 'run') {
      if (this.stun > 0) { this.stun -= dt; anim = 'idle|nod'; }
      else {
        const nextGate = this.gates[this.gate];
        const stopZ = nextGate ? nextGate.z + 2.2 : this.finishZ - 2.6;
        p.z = Math.max(stopZ, p.z - RUN_SPEED * dt);
        anim = 'run|';
        if (p.z <= stopZ + 0.001) {
          if (nextGate) this.ask();
          else { this.state = 'chest'; this.chestT = 0; }
        }
      }
    }
    if (this.state === 'chest') {
      this.chestT += dt;
      anim = 'idle|clap';
      this.lid.rotation.x = Math.max(-1.9, -this.chestT * 1.5);
      this.glow.intensity = Math.min(6, this.chestT * 5);
      if (this.chestT > 1.4 && this.state === 'chest') this.finish();
    }
    if (this.state === 'done' && this.hearts > 0) anim = 'idle|wave';

    for (const g of this.gates) {
      if (g.state === 'open') g.bars.position.y += (3.0 - g.bars.position.y) * (1 - Math.exp(-4 * dt));
      if (g.state === 'broken') {
        g.bars.rotation.x += (-Math.PI / 2 - g.bars.rotation.x) * (1 - Math.exp(-5 * dt));
        g.bars.position.y += (-1.1 - g.bars.position.y) * (1 - Math.exp(-5 * dt));
      }
    }
    this.runner.setAnim(anim);
    this.runner.update(dt);

    const camTarget = new THREE.Vector3(1.2, 2.6, p.z + 5.5);
    this.camera.position.lerp(camTarget, 1 - Math.exp(-5 * dt));
    this.camera.lookAt(0, 1.4, p.z - 4);
    this.sun.position.set(20, 30, p.z + 10);
    this.sun.target.position.set(0, 0, p.z);
  }
}
