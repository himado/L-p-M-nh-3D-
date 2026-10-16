// Tờ bài làm trên mỗi bàn: vẽ bằng canvas → làm texture cho tờ giấy 3D, và vẽ lại bản to khi xem bằng phím F / quay cóp.
import * as THREE from 'three';

const W = 512, H = 708; // tỉ lệ giấy A4 (0.21 × 0.29 m)
const HAND = '"Segoe Print", "Comic Sans MS", "Be Vietnam Pro", cursive';

/** p = { name, answers: (0..3|null)[] | null, done, stale } */
export function drawPaper(ctx, w, h, p) {
  const s = w / W;
  ctx.fillStyle = '#fbfaf3';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#bcd3f0';
  ctx.lineWidth = 2 * s;
  for (let y = 150 * s; y < h - 20 * s; y += 50 * s) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  ctx.strokeStyle = '#f0a3a3';
  ctx.beginPath(); ctx.moveTo(62 * s, 0); ctx.lineTo(62 * s, h); ctx.stroke();

  ctx.fillStyle = '#1e3a8a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `800 ${32 * s}px "Be Vietnam Pro", sans-serif`;
  ctx.fillText(p.answers ? 'BÀI KIỂM TRA' : 'GIẤY NHÁP', w / 2, 52 * s);
  ctx.textAlign = 'left';
  ctx.font = `600 ${24 * s}px "Be Vietnam Pro", sans-serif`;
  ctx.fillText('Họ tên:', 78 * s, 100 * s);
  ctx.fillStyle = '#1d4ed8';
  ctx.font = `600 ${30 * s}px ${HAND}`;
  ctx.fillText(p.name || '……………', 175 * s, 102 * s);

  if (!p.answers) {
    ctx.fillStyle = 'rgba(29,78,216,.45)';
    ctx.font = `${26 * s}px ${HAND}`;
    ctx.fillText(p.name ? '(chưa làm bài)' : '', 90 * s, 245 * s);
    return;
  }
  for (let i = 0; i < 10; i++) {
    const col = i < 5 ? 0 : 1;
    const x = (80 + col * 215) * s;
    const y = (190 + (i % 5) * 100) * s;
    ctx.fillStyle = '#334155';
    ctx.font = `600 ${26 * s}px "Be Vietnam Pro", sans-serif`;
    ctx.fillText(`Câu ${i + 1}:`, x, y);
    const a = p.answers[i];
    ctx.font = `700 ${46 * s}px ${HAND}`;
    ctx.fillStyle = a == null ? '#cbd5e1' : '#1d4ed8';
    ctx.fillText(a == null ? '…' : 'ABCD'[a], x + 110 * s, y + 4 * s);
    if (a != null) { // khoanh tròn đáp án như học sinh thật
      ctx.strokeStyle = 'rgba(29,78,216,.6)';
      ctx.lineWidth = 2.5 * s;
      ctx.beginPath(); ctx.ellipse(x + 126 * s, y - 13 * s, 30 * s, 27 * s, -0.2, 0, Math.PI * 2); ctx.stroke();
    }
  }
  if (p.done) {
    ctx.save();
    ctx.translate(w * 0.68, h * 0.9);
    ctx.rotate(-0.25);
    ctx.strokeStyle = ctx.fillStyle = '#dc2626';
    ctx.lineWidth = 5 * s;
    ctx.strokeRect(-110 * s, -38 * s, 220 * s, 64 * s);
    ctx.font = `800 ${38 * s}px "Be Vietnam Pro", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('ĐÃ NỘP', 0, 8 * s);
    ctx.restore();
  }
  if (p.stale) {
    ctx.fillStyle = '#b45309';
    ctx.font = `600 ${22 * s}px "Be Vietnam Pro", sans-serif`;
    ctx.fillText('⚠ Đề ca thi khác — không chép được!', 78 * s, h - 24 * s);
  }
}

export class Papers {
  constructor(seats) {
    this.items = seats.map((seat) => {
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      seat.paperMesh.material = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
      return { canvas, ctx: canvas.getContext('2d'), tex, key: '' };
    });
  }
  /** Chỉ vẽ lại khi nội dung đổi. */
  set(seat, p) {
    const it = this.items[seat];
    const key = JSON.stringify(p);
    if (key === it.key) return;
    it.key = key;
    drawPaper(it.ctx, W, H, p);
    it.tex.needsUpdate = true;
  }
  redrawAll() { for (const it of this.items) it.key = ''; }
}
