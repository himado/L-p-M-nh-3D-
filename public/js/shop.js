// Cửa hàng: hàng nổi bật xoay vòng mỗi ngày (Fortnite), độ hiếm (PUBG), phòng thử đồ 3D (Roblox/Fortnite Locker).
import * as THREE from 'three';
import { api } from './net.js';
import { createAvatar } from './avatar.js';
import { ITEMS, ITEM_MAP, RARITY, SLOTS } from './data/items.js';
import { $, esc, toast, openModal, fmt } from './ui.js';

const TABS = [['featured', '⭐ Nổi bật'], ['skin', SLOTS.skin], ['hat', SLOTS.hat], ['bag', SLOTS.bag], ['chalk', SLOTS.chalk], ['course', SLOTS.course]];

export class Shop {
  constructor(hooks) {
    this.h = hooks; // { getProfile(), onProfile(p) }
    this.tab = 'featured';
    this.sel = null;
    this.featured = { ids: [], discount: 0 };
    $('#shop-tabs').innerHTML = TABS.map(([k, n]) => `<button class="tab" data-tab="${k}">${n}</button>`).join('');
    $('#shop-tabs').onclick = (e) => { const t = e.target.dataset.tab; if (t) { this.tab = t; this.render(); } };
    $('#shop-grid').onclick = (e) => { const c = e.target.closest('.item'); if (c) this.select(c.dataset.id); };
    $('#modal-shop').addEventListener('closed', () => { this.running = false; });
  }

  async open(tab) {
    if (tab) this.tab = tab;
    try { this.featured = await api('/shop/featured'); } catch { /* vẫn mở được */ }
    openModal('#modal-shop');
    this.ensurePreview();
    this.running = true;
    this.loop();
    this.render();
  }

  ensurePreview() {
    if (this.renderer) return;
    const canvas = $('#shop-preview');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(300, 340, false);
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#334155', 1.4));
    const d = new THREE.DirectionalLight('#ffffff', 1.4); d.position.set(2, 3, -3); this.scene.add(d);
    this.cam = new THREE.PerspectiveCamera(35, 300 / 340, 0.1, 20);
    this.cam.position.set(0, 1.25, -3.6);
    this.cam.lookAt(0, 0.95, 0);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.05, 40), new THREE.MeshStandardMaterial({ color: '#f2c14e', metalness: 0.3, roughness: 0.4 }));
    disc.position.y = -0.03; this.scene.add(disc);
    this.av = createAvatar(this.h.getProfile().equipped, '');
    this.scene.add(this.av.group);
    this.clock = new THREE.Clock();
  }

  loop() {
    if (!this.running) return;
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.av.group.rotation.y += dt * 0.8;
    this.av.setAnim(this.sel && ITEM_MAP[this.sel]?.type === 'chalk' ? 'idle|write' : 'idle|');
    this.av.update(dt);
    this.renderer.render(this.scene, this.cam);
    requestAnimationFrame(() => this.loop());
  }

  price(it) {
    const f = this.featured.ids.includes(it.id);
    return { now: f ? Math.round(it.price * (1 - this.featured.discount)) : it.price, sale: f };
  }

  render() {
    const p = this.h.getProfile();
    for (const b of $('#shop-tabs').children) b.classList.toggle('on', b.dataset.tab === this.tab);
    const list = this.tab === 'featured'
      ? this.featured.ids.map((id) => ITEM_MAP[id]).filter(Boolean)
      : ITEMS.filter((i) => i.type === this.tab && !i.hidden);
    const banner = this.tab === 'featured'
      ? `<div class="featured-banner">🔥 Hàng nổi bật hôm nay — giảm ${Math.round(this.featured.discount * 100)}%. Làm mới lúc 0h mỗi ngày.</div>` : '';
    $('#shop-grid').innerHTML = banner + list.map((it) => {
      const owned = p.owned.includes(it.id);
      const equipped = p.equipped[it.type] === it.id;
      const pr = this.price(it);
      const cur = it.currency === 'gems' ? '💎' : '🪙';
      return `<button class="item ${this.sel === it.id ? 'sel' : ''}" data-id="${it.id}" style="--rc:${RARITY[it.rarity].color}">
        ${equipped ? '<span class="tag">ĐANG DÙNG</span>' : owned ? '<span class="tag">ĐÃ CÓ</span>' : pr.sale ? '<span class="tag sale">-20%</span>' : ''}
        <span class="ic">${it.icon}</span><span class="nm">${esc(it.name)}</span>
        <span class="pr">${owned ? '✔' : it.price === 0 ? 'Miễn phí' : `${pr.sale ? `<s>${fmt(it.price)}</s>` : ''}${cur} ${fmt(pr.now)}`}</span></button>`;
    }).join('');
    this.renderDetail();
  }

  select(id) {
    this.sel = id;
    const it = ITEM_MAP[id];
    if (this.av && ['skin', 'hat', 'bag'].includes(it.type)) this.av.setLook({ ...this.h.getProfile().equipped, [it.type]: id });
    this.render();
  }

  renderDetail() {
    const box = $('#shop-detail');
    const it = this.sel && ITEM_MAP[this.sel];
    if (!it) { box.innerHTML = '<p>Chọn một vật phẩm để thử và xem chi tiết.</p>'; return; }
    const p = this.h.getProfile();
    const owned = p.owned.includes(it.id);
    const equipped = p.equipped[it.type] === it.id;
    const pr = this.price(it);
    const cur = it.currency === 'gems' ? '💎' : '🪙';
    let btn;
    if (it.type === 'course') btn = owned ? '<button class="btn" disabled>Đã mở khóa</button>' : `<button class="btn gold" id="shop-buy">Mở khóa · ${cur} ${fmt(pr.now)}</button>`;
    else if (equipped) btn = '<button class="btn" disabled>Đang sử dụng</button>';
    else if (owned) btn = '<button class="btn primary" id="shop-equip">Trang bị</button>';
    else btn = `<button class="btn gold" id="shop-buy">Mua · ${cur} ${fmt(pr.now)}</button>`;
    box.innerHTML = `<div class="rar" style="color:${RARITY[it.rarity].color}">${RARITY[it.rarity].name.toUpperCase()} · ${SLOTS[it.type]}</div>
      <h3 style="margin:4px 0">${it.icon} ${esc(it.name)}</h3><p>${esc(it.desc || '')}</p>${btn}`;
    $('#shop-buy')?.addEventListener('click', () => this.buy(it));
    $('#shop-equip')?.addEventListener('click', () => this.equip(it));
  }

  async buy(it) {
    try {
      const r = await api('/shop/buy', { id: it.id });
      this.h.onProfile(r.profile);
      toast(`Đã mua ${it.icon} ${esc(it.name)}!`, 'ok');
      if (it.type !== 'course') await this.equip(it);
      else this.render();
    } catch (e) { toast(e.message, 'err'); }
  }

  async equip(it) {
    try {
      const r = await api('/equip', { id: it.id });
      this.h.onProfile(r.profile, true);
      this.render();
    } catch (e) { toast(e.message, 'err'); }
  }
}
