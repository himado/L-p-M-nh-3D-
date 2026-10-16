// Bảng đen dùng chung: nét phấn lưu dạng toạ độ UV (0..1) để mọi người chơi vẽ lại giống nhau.
import * as THREE from 'three';

const WEEKDAYS = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

export class Board {
  constructor({ mesh, canvas, texture }) {
    this.mesh = mesh;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.texture = texture;
    this.strokes = [];
    this.active = false;
    this.ray = new THREE.Raycaster();
    this.redraw([]);
    document.fonts?.ready.then(() => this.redraw(this.strokes));
  }

  drawBase() {
    const { ctx } = this;
    const { width: w, height: h } = this.canvas;
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#1f4d3a'); g.addColorStop(1, '#1a4232');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // vệt phấn mờ cũ
    ctx.globalAlpha = 0.05; ctx.fillStyle = '#fff';
    for (let i = 0; i < 40; i++) ctx.fillRect((i * 397) % w, (i * 211) % h, 180, 6);
    ctx.globalAlpha = 0.85;
    const d = new Date();
    ctx.fillStyle = '#f8fafc'; ctx.textBaseline = 'top';
    ctx.font = '600 40px "Be Vietnam Pro", sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(`${WEEKDAYS[d.getDay()]}, ngày ${d.getDate()} tháng ${d.getMonth() + 1} năm ${d.getFullYear()}`, w - 50, 34);
    ctx.textAlign = 'center'; ctx.font = '800 64px "Be Vietnam Pro", sans-serif'; ctx.fillStyle = '#fde68a';
    ctx.fillText('Bài học: Văn hóa truyền thống Việt Nam', w / 2, 110);
    ctx.globalAlpha = 1;
  }

  drawStroke(s) {
    const { ctx } = this;
    const { width: w, height: h } = this.canvas;
    const pts = s.pts.map(([u, v]) => [u * w, (1 - v) * h]);
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.lineWidth = s.w;
    ctx.globalAlpha = 0.92;
    if (pts.length === 1) pts.push([pts[0][0] + 0.5, pts[0][1]]);
    for (let i = 1; i < pts.length; i++) {
      ctx.strokeStyle = s.c === 'rainbow' ? `hsl(${(i * 6) % 360} 90% 70%)` : s.c;
      ctx.beginPath(); ctx.moveTo(...pts[i - 1]); ctx.lineTo(...pts[i]); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    this.texture.needsUpdate = true;
  }

  addStroke(s) { this.strokes.push(s); this.drawStroke(s); }

  redraw(strokes) {
    this.strokes = strokes.slice();
    this.drawBase();
    for (const s of this.strokes) this.drawStroke(s);
    this.texture.needsUpdate = true;
  }

  /** Bật chế độ viết: con trỏ chuột vẽ lên bảng qua raycast. */
  begin(camera, dom, getStyle, onStroke) {
    this.active = true;
    let cur = null;
    const uvAt = (e) => {
      const r = dom.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.ray.setFromCamera(ndc, camera);
      const hit = this.ray.intersectObject(this.mesh)[0];
      return hit?.uv ? [hit.uv.x, hit.uv.y] : null;
    };
    const flush = () => {
      if (cur && cur.pts.length) { this.strokes.push(cur); onStroke(cur); }
      cur = null;
    };
    const down = (e) => {
      if (e.button !== 0) return;
      const uv = uvAt(e);
      if (!uv) return;
      const st = getStyle();
      cur = { pts: [uv], c: st.color, w: st.width };
      this.drawStroke(cur);
    };
    const move = (e) => {
      if (!cur) return;
      const uv = uvAt(e);
      if (!uv) return;
      const last = cur.pts[cur.pts.length - 1];
      if (Math.hypot(uv[0] - last[0], uv[1] - last[1]) < 0.002) return;
      cur.pts.push(uv);
      this.drawStroke({ ...cur, pts: cur.pts.slice(-2) });
      if (cur.pts.length >= 300) { const keep = uv; flush(); const st = getStyle(); cur = { pts: [keep], c: st.color, w: st.width }; }
    };
    const up = () => flush();
    dom.addEventListener('pointerdown', down);
    dom.addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    this.detach = () => {
      flush();
      dom.removeEventListener('pointerdown', down);
      dom.removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
    };
  }

  end() { this.active = false; this.detach?.(); this.detach = null; }
}
