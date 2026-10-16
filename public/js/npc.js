// NPC: cô giáo đi tuần (vị trí tính từ đồng hồ → mọi máy thấy giống nhau, không cần server)
// và các bạn học ảo ngồi sẵn để lớp không trống.
import * as THREE from 'three';
import { createAvatar } from './avatar.js';

const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

// [x, z, dừng (giây)]
const PATROL = [
  [0, -6.2, 6], [-2, -4.4, 0], [-2, 6.6, 2], [2, 6.6, 0], [2, -4.4, 0], [0, -6.2, 6],
  [5.4, -4.4, 0], [5.4, 6.6, 2], [-5.4, 6.6, 0], [-5.4, -4.4, 0],
];
const SPEED = 0.85;

function buildTimeline() {
  const segs = [];
  let t = 0;
  for (let i = 0; i < PATROL.length; i++) {
    const [x, z, pause] = PATROL[i];
    const [nx, nz] = PATROL[(i + 1) % PATROL.length];
    if (pause) { segs.push({ t0: t, t1: t + pause, x, z, pause: true }); t += pause; }
    const len = Math.hypot(nx - x, nz - z);
    if (len > 0) { segs.push({ t0: t, t1: t + len / SPEED, x, z, nx, nz }); t += len / SPEED; }
  }
  return { segs, total: t };
}

export class Teacher {
  constructor(scene) {
    this.av = createAvatar({ skin: 'skin_teacher', hat: 'hat_none', bag: 'bag_none' }, 'Cô Hương');
    scene.add(this.av.group);
    this.timeline = buildTimeline();
    this.yaw = Math.PI;
    this.pos = new THREE.Vector3();
  }
  update(dt) {
    const { segs, total } = this.timeline;
    const t = (Date.now() / 1000) % total;
    const s = segs.find((g) => t >= g.t0 && t < g.t1) || segs[0];
    let targetYaw, anim;
    if (s.pause) {
      this.pos.set(s.x, 0, s.z);
      // Đứng nhìn quanh lớp (hướng về phía học sinh nếu ở bục giảng).
      const base = s.z < -5 ? Math.PI : Math.atan2(-(0 - s.x), -(0 - s.z));
      targetYaw = base + Math.sin(t * 0.9) * 0.9;
      anim = 'idle|';
    } else {
      const f = (t - s.t0) / (s.t1 - s.t0);
      this.pos.set(s.x + (s.nx - s.x) * f, 0, s.z + (s.nz - s.z) * f);
      targetYaw = Math.atan2(-(s.nx - s.x), -(s.nz - s.z));
      anim = 'walk|';
    }
    this.yaw += angDiff(this.yaw, targetYaw) * (1 - Math.exp(-6 * dt));
    this.av.group.position.copy(this.pos);
    this.av.group.rotation.y = this.yaw;
    this.av.setAnim(anim);
    this.av.update(dt);
  }
  /** Mức chú ý tới một điểm: 0 = không thấy, 1 = ở gần, 2 = đang nhìn thẳng. */
  attention(p) {
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 8) return 0;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const cos = (dx * fx + dz * fz) / (d || 1);
    return cos > Math.cos((55 * Math.PI) / 180) ? 2 : 1;
  }
}

const NPC_DEF = [
  [1, 'Minh', 'skin_uniform', 'hat_none'], [4, 'Lan', 'skin_aodai_white', 'hat_none'], [8, 'Hùng', 'skin_scarf', 'hat_none'],
  [11, 'Mai', 'skin_aodai_white', 'hat_none'], [13, 'Tuấn', 'skin_uniform', 'hat_cap'], [16, 'Hoa', 'skin_scarf', 'hat_none'],
  [19, 'Nam', 'skin_uniform', 'hat_none'], [22, 'Linh', 'skin_aodai_white', 'hat_none'], [26, 'Phúc', 'skin_scarf', 'hat_none'],
  [29, 'Thảo', 'skin_uniform', 'hat_none'],
];

export class Classmates {
  constructor(scene, seats) {
    this.list = NPC_DEF.map(([seat, name, skin, hat], i) => {
      const av = createAvatar({ skin, hat, bag: 'bag_none' }, name);
      av.group.position.copy(seats[seat].pos);
      av.setAnim('sit|');
      scene.add(av.group);
      return { seat, name, av, next: 4 + i * 3.7, action: '' };
    });
  }
  /** NPC nhường chỗ nếu người chơi thật ngồi vào. */
  sync(seatOwners) { for (const n of this.list) n.av.group.visible = seatOwners[n.seat] == null; }
  has(seat) { return this.list.some((n) => n.seat === seat && n.av.group.visible); }
  update(dt) {
    for (const n of this.list) {
      if (!n.av.group.visible) continue;
      if ((n.next -= dt) <= 0) {
        n.action = n.action ? '' : ['raise', 'nod', 'write', '', ''][Math.floor(Math.random() * 5)];
        n.next = n.action ? 2.5 : 6 + Math.random() * 10;
      }
      n.av.setAnim('sit|' + n.action);
      n.av.update(dt);
    }
  }
}
