// Điều khiển nhân vật + camera kiểu PUBG:
//  - TPP: camera sau vai phải, va chạm tường; FPP: camera ở mắt (V để đổi)
//  - Giữ Alt: nhìn tự do 360° (thân vẫn giữ hướng), thả ra camera quay về
//  - Chuột phải: ngắm gần (FOV hẹp, kéo camera sát vai); con lăn: zoom TPP
import * as THREE from 'three';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const isTyping = (e) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;

export class PlayerController {
  constructor(camera, dom, world) {
    this.camera = camera;
    this.dom = dom;
    this.world = world;
    this.pos = new THREE.Vector3();
    this.bodyYaw = 0;
    this.yaw = 0;
    this.pitch = -0.12;
    this.view = 'tpp';
    this.dist = 2.4;
    this.aim = false;
    this.freeLook = false;
    this.returning = false;
    this.saved = { yaw: 0, pitch: 0 };
    this.peekTarget = null;
    this.seated = false;
    this.enabled = false;
    this.moving = false;
    this.running = false;
    this.keys = new Set();
    this.lockable = () => false;
    this.onViewChange = () => {};
    this.ray = new THREE.Raycaster();

    dom.addEventListener('click', () => { if (this.lockable() && !this.locked) dom.requestPointerLock(); });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked || this.peekTarget) return;
      const s = 0.0022 * (this.aim ? 0.55 : 1);
      this.yaw -= e.movementX * s;
      this.pitch = clamp(this.pitch - e.movementY * s, -1.25, 1.1);
    });
    addEventListener('keydown', (e) => {
      if (isTyping(e)) return;
      this.keys.add(e.code);
      if (e.code.startsWith('Alt')) {
        e.preventDefault();
        if (!this.freeLook && this.enabled) { this.freeLook = true; this.returning = false; this.saved = { yaw: this.yaw, pitch: this.pitch }; }
      }
      if (e.code === 'KeyV' && this.enabled) this.setView(this.view === 'tpp' ? 'fpp' : 'tpp');
    });
    addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code.startsWith('Alt')) { e.preventDefault(); if (this.freeLook) { this.freeLook = false; this.returning = true; } }
    });
    dom.addEventListener('mousedown', (e) => { if (e.button === 2 && this.locked) this.aim = true; });
    addEventListener('mouseup', (e) => { if (e.button === 2) this.aim = false; });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    dom.addEventListener('wheel', (e) => { if (this.locked) this.dist = clamp(this.dist + Math.sign(e.deltaY) * 0.3, 1.2, 4.5); }, { passive: true });
    addEventListener('blur', () => { this.keys.clear(); this.aim = false; });
  }

  get locked() { return document.pointerLockElement === this.dom; }

  setView(v) { this.view = v; this.onViewChange(v); }

  sitAt(seat) {
    this.seated = true;
    this.pos.set(seat.pos.x, 0, seat.pos.z);
    this.bodyYaw = 0;
    this.yaw = 0;
    this.pitch = -0.2;
  }
  stand() {
    this.seated = false;
    this.pos.z += 0.45;
    this.collide(this.pos);
  }
  // Quay cóp: camera bị kéo sang bàn bạn bên cạnh, thả ra thì quay lại.
  setPeek(target) {
    if (target && !this.peekTarget) this.saved = { yaw: this.yaw, pitch: this.pitch };
    if (!target && this.peekTarget) this.returning = true;
    this.peekTarget = target;
  }

  update(dt) {
    const k = 1 - Math.exp(-14 * dt);
    if (this.peekTarget) {
      this.yaw += angDiff(this.yaw, this.peekTarget.yaw) * (1 - Math.exp(-6 * dt));
      this.pitch += (this.peekTarget.pitch - this.pitch) * (1 - Math.exp(-6 * dt));
    } else if (this.returning) {
      this.yaw += angDiff(this.yaw, this.saved.yaw) * k;
      this.pitch += (this.saved.pitch - this.pitch) * k;
      if (Math.abs(angDiff(this.yaw, this.saved.yaw)) < 0.01) this.returning = false;
    }
    const moveYaw = this.freeLook || this.returning ? this.saved.yaw : this.yaw;

    let mx = 0, mz = 0;
    if (this.enabled && !this.seated) {
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) mz -= 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) mz += 1;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) mx -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) mx += 1;
    }
    this.moving = !!(mx || mz);
    this.running = this.moving && !this.aim && (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'));
    if (this.moving) {
      const len = Math.hypot(mx, mz);
      mx /= len; mz /= len;
      const s = Math.sin(moveYaw), c = Math.cos(moveYaw);
      // forward = (-sin, -cos), right = (cos, -sin)
      const dx = c * mx + s * mz;
      const dz = -s * mx + c * mz;
      const speed = this.aim ? 1.3 : this.running ? 4.2 : 2.1;
      this.pos.x += dx * speed * dt;
      this.pos.z += dz * speed * dt;
      this.collide(this.pos);
      const faceYaw = this.view === 'fpp' || this.aim ? moveYaw : Math.atan2(-dx, -dz);
      this.bodyYaw += angDiff(this.bodyYaw, faceYaw) * k;
    } else if ((this.view === 'fpp' || this.aim) && !this.seated && !this.freeLook) {
      this.bodyYaw += angDiff(this.bodyYaw, this.yaw) * k;
    }
    this.updateCamera(dt);
  }

  collide(p) {
    const r = 0.28;
    const b = this.world.bounds;
    p.x = clamp(p.x, b.minX + r, b.maxX - r);
    p.z = clamp(p.z, b.minZ + r, b.maxZ - r);
    for (const c of this.world.colliders) {
      const cx = clamp(p.x, c.minX, c.maxX), cz = clamp(p.z, c.minZ, c.maxZ);
      const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        p.x = cx + (dx / d) * r; p.z = cz + (dz / d) * r;
      } else {
        // Tâm nằm trong hộp: đẩy ra theo cạnh gần nhất.
        const pushes = [[c.minX - r - p.x, 0], [c.maxX + r - p.x, 0], [0, c.minZ - r - p.z], [0, c.maxZ + r - p.z]];
        pushes.sort((a, b2) => Math.abs(a[0] + a[1]) - Math.abs(b2[0] + b2[1]));
        p.x += pushes[0][0]; p.z += pushes[0][1];
      }
    }
  }

  updateCamera(dt) {
    const cam = this.camera;
    const fpp = this.view === 'fpp';
    const eyeY = this.seated ? 1.26 : 1.63;
    const targetFov = this.aim ? 48 : fpp ? 80 : 70;
    if (Math.abs(cam.fov - targetFov) > 0.05) {
      cam.fov += (targetFov - cam.fov) * (1 - Math.exp(-12 * dt));
      cam.updateProjectionMatrix();
    }
    cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    const sy = Math.sin(this.bodyYaw), cy = Math.cos(this.bodyYaw);
    if (fpp) {
      cam.position.set(this.pos.x - sy * 0.13, eyeY, this.pos.z - cy * 0.13);
      return;
    }
    const pivot = new THREE.Vector3(this.pos.x, eyeY - 0.05, this.pos.z);
    const cp = Math.cos(this.pitch);
    const fwd = new THREE.Vector3(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const d = this.aim ? 1.15 : this.seated ? Math.min(this.dist, 2.0) : this.dist;
    const sh = this.aim ? 0.55 : 0.42;
    const desired = pivot.clone().addScaledVector(right, sh).addScaledVector(fwd, -d).add(new THREE.Vector3(0, 0.12, 0));
    const dir = desired.clone().sub(pivot);
    const len = dir.length();
    dir.normalize();
    this.ray.set(pivot, dir);
    this.ray.far = len + 0.2;
    const hit = this.ray.intersectObjects(this.world.camBlockers, false)[0];
    const dd = hit ? Math.max(0.25, hit.distance - 0.2) : len;
    cam.position.copy(pivot).addScaledVector(dir, dd);
    cam.position.y = clamp(cam.position.y, 0.25, 3.4);
  }
}
