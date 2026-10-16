// Điều phối: đăng nhập → sảnh → lớp học (nhiều người chơi) / Kho tàng tri thức / Cửa hàng / Sự kiện.
import * as THREE from 'three';
import { api, getToken, setToken, Socket } from './net.js';
import { buildClassroom, DOOR_POS } from './classroom.js';
import { createAvatar } from './avatar.js';
import { PlayerController } from './controls.js';
import { Board } from './board.js';
import { Teacher, Classmates } from './npc.js';
import { Exam } from './exam.js';
import { QuestMode } from './quest.js';
import { Shop } from './shop.js';
import { EventsPanel } from './events.js';
import { Papers, drawPaper } from './papers.js';
import { ITEM_MAP, PACKS } from './data/items.js';
import { $, esc, toast, openModal, closeModal, anyModalOpen, fmt } from './ui.js';

const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const r2 = (v) => Math.round(v * 100) / 100;

const S = {
  profile: null, mode: 'login', myId: null, seats: Array(30).fill(null), remotes: new Map(),
  inClass: false, mySeat: null, wantSeat: null, pendingSeat: null, boardMode: false,
  emote: '', emoteT: 0, chatScope: 'all', peekSide: null, chalk: '#f8fafc',
  myPaper: null, npcPapers: { ca: 0, papers: {} }, viewSeat: null, viewPeek: false,
};

// ===================== Three.js =====================
const canvas = $('#game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#bfe3ff');
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 200);

const room = buildClassroom(scene);
const board = new Board(room.board);
const teacher = new Teacher(scene);
const mates = new Classmates(scene, room.seats);
const papers = new Papers(room.seats);
document.fonts?.ready.then(() => papers.redrawAll());
const me = createAvatar(undefined, '');
me.group.visible = false;
scene.add(me.group);

const ctrl = new PlayerController(camera, canvas, room);
ctrl.lockable = () => S.inClass && !anyModalOpen() && !S.boardMode && document.activeElement !== $('#chat-input');
ctrl.onViewChange = (v) => { $('#view-label').textContent = v.toUpperCase(); };

// ===================== Các module phụ =====================
const exam = new Exam({
  canPeek() {
    if (S.mySeat == null) return 'Bạn cần ngồi vào chỗ';
    const n = neighborOf(S.mySeat);
    if (S.seats[n] == null && !mates.has(n)) return 'Bên cạnh không có ai để "tham khảo" 😅';
    return null;
  },
  onPeek(on) {
    S.peekSide = on ? (S.mySeat % 2 === 0 ? 'R' : 'L') : null;
    ctrl.setPeek(on ? { yaw: S.peekSide === 'R' ? -1.0 : 1.0, pitch: -0.62 } : null);
  },
  onRead(on) {
    if (on) { showPaper(neighborOf(S.mySeat), true); toast('👀 Đang nhìn bài bạn bên cạnh… nhưng bạn ấy có làm đúng không?', 'gold'); }
    else hidePaper();
  },
  onAnswers(p) { S.myPaper = p; socket?.send('paper', p); },
  onProfile: (p) => setProfile(p),
  onClose: () => {},
});
const quest = new QuestMode({ onProfile: (p) => setProfile(p), onExit: () => goMenu(), getLook: () => S.profile.equipped });
const shop = new Shop({ getProfile: () => S.profile, onProfile: (p) => setProfile(p) });
const events = new EventsPanel({ getProfile: () => S.profile, onProfile: (p) => setProfile(p) });

// Ghế chẵn ngồi bên trái bàn đôi → bạn bên phải; ghế lẻ → bạn bên trái.
const neighborOf = (id) => (id % 2 === 0 ? id + 1 : id - 1);

// ===================== Hồ sơ & thanh trên =====================
function setProfile(p) {
  const lookChanged = JSON.stringify(S.profile?.equipped) !== JSON.stringify(p.equipped);
  S.profile = p;
  $('#tb-name').textContent = p.name;
  $('#tb-level').textContent = `Lv ${p.level}`;
  $('#tb-coins').textContent = fmt(p.coins);
  $('#tb-gems').textContent = fmt(p.gems);
  $('#menu-name').textContent = p.name;
  const ev = p.event;
  $('#tb-event').classList.toggle('hidden', !ev);
  if (ev) $('#tb-event').textContent = `${ev.icon} ${ev.name} · x${ev.coinMul} xu`;
  const todo = !p.login.claimedToday || p.missions.some((m) => m.progress >= m.goal && !m.claimed);
  $('#tb-dot').classList.toggle('hidden', !todo);
  S.chalk = ITEM_MAP[p.equipped.chalk]?.color || '#f8fafc';
  if (lookChanged) {
    me.setLook(p.equipped);
    if (S.inClass) socket?.send('look');
  }
}

// ===================== WebSocket =====================
let socket = null;
function connectSocket() {
  socket?.close();
  socket = new Socket({
    welcome(m) {
      S.myId = m.id;
      for (const id of [...S.remotes.keys()]) removeRemote(id);
      m.players.forEach(addRemote);
      setSeats(m.seats);
      board.redraw(m.strokes);
      if (S.inClass) socket.send('join', { seat: S.mySeat, p: [ctrl.pos.x, 0, ctrl.pos.z] }); // kết nối lại
    },
    join(m) { if (m.player.id === S.myId) onJoined(m.player); else { addRemote(m.player); sysChat(`${m.player.name} đã vào lớp`); } },
    leave(m) { const r = S.remotes.get(m.id); if (r) sysChat(`${r.name} đã rời lớp`); removeRemote(m.id); },
    state(m) {
      const r = S.remotes.get(m.id);
      if (!r) return;
      r.target.set(m.p[0], 0, m.p[2]);
      r.yaw = m.r;
      r.av.setAnim(m.a);
    },
    seats(m) { setSeats(m.seats); },
    seat_denied() { S.pendingSeat = null; toast('Ghế này vừa có người ngồi!', 'err'); },
    chat: onChat,
    stroke(m) { board.addStroke(m.s); },
    clear(m) { board.redraw([]); sysChat(`${m.by} đã lau bảng`); },
    look(m) { S.remotes.get(m.id)?.av.setLook(m.look); },
    paper(m) { const r = S.remotes.get(m.id); if (r) r.paper = m.paper; },
    closed(e) { if (e.code === 4002) toast('Tài khoản vừa đăng nhập ở nơi khác', 'err', 6000); },
  });
  socket.connect();
}

function addRemote(p) {
  if (p.id === S.myId || S.remotes.has(p.id)) return;
  const av = createAvatar(p.look, p.name);
  av.group.position.set(p.p[0], 0, p.p[2]);
  av.group.rotation.y = p.r;
  av.setAnim(p.a);
  scene.add(av.group);
  S.remotes.set(p.id, { av, name: p.name, paper: p.paper, target: new THREE.Vector3(p.p[0], 0, p.p[2]), yaw: p.r });
}
function removeRemote(id) {
  const r = S.remotes.get(id);
  if (!r) return;
  scene.remove(r.av.group);
  r.av.dispose();
  S.remotes.delete(id);
}

function setSeats(seats) {
  S.seats = seats;
  mates.sync(seats);
  if ($('#modal-seat').classList.contains('open')) renderSeatGrid();
  if (S.pendingSeat != null) {
    if (seats[S.pendingSeat] === S.myId) sitDown(S.pendingSeat);
    S.pendingSeat = null;
  } else if (S.mySeat != null && seats[S.mySeat] !== S.myId) {
    standUp(false);
  }
}

function onJoined(player) {
  if (player.seat != null) sitDown(player.seat);
  else if (S.wantSeat != null) toast('Ghế đã có người — bạn đứng ở cửa lớp, hãy tìm chỗ khác nhé', 'gold');
  S.wantSeat = null;
}

// ===================== Chat =====================
function addChatLine(html, cls = '') {
  const log = $('#chat-log');
  const el = document.createElement('div');
  el.className = 'm ' + cls;
  el.innerHTML = html;
  log.appendChild(el);
  while (log.children.length > 60) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
}
const sysChat = (t) => addChatLine(esc(t), 'sys');

function onChat(m) {
  const mine = m.id === S.myId;
  const r = S.remotes.get(m.id);
  const av = mine ? me : r?.av;
  let canHear = true;
  if (m.scope === 'near' && !mine && av) canHear = av.group.position.distanceTo(me.group.position) < 4;
  av?.say(canHear ? m.text : '🤫 …');
  if (canHear) addChatLine(`<b>${esc(m.name)}${m.scope === 'near' ? ' (thì thầm)' : ''}:</b> ${esc(m.text)}`, m.scope === 'near' ? 'near' : '');
}

const chatInput = $('#chat-input');
chatInput.addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Enter') {
    const text = chatInput.value.trim();
    if (text) socket?.send('chat', { text, scope: S.chatScope });
    chatInput.value = '';
    chatInput.blur();
  } else if (e.key === 'Escape') chatInput.blur();
  else if (e.key === 'Tab') { e.preventDefault(); toggleScope(); }
});
function toggleScope() {
  S.chatScope = S.chatScope === 'all' ? 'near' : 'all';
  $('#chat-scope').textContent = S.chatScope === 'all' ? 'Cả lớp' : '🤫 Thì thầm';
}
$('#chat-scope').onclick = toggleScope;

// ===================== Lớp học =====================
function setUI(mode) {
  $('#menu').classList.toggle('hidden', mode !== 'menu');
  $('#hud').classList.toggle('hidden', mode !== 'class');
  if (mode !== 'quest') $('#quest-hud').classList.add('hidden');
}

function renderSeatGrid() {
  $('#seat-grid').innerHTML = room.seats.map((s) => {
    const owner = S.seats[s.id];
    const taken = owner != null && owner !== S.myId;
    const npc = !taken && mates.list.find((n) => n.seat === s.id && n.av.group.visible);
    const label = taken ? esc(S.remotes.get(owner)?.name || 'Bạn học') : npc ? `${esc(npc.name)} 🤖` : `Ghế ${s.id + 1}`;
    return `<button class="seat ${taken ? 'taken' : npc ? 'npc' : ''}" data-seat="${s.id}" ${taken ? 'disabled' : ''}>${label}</button>`;
  }).join('');
}
$('#seat-grid').onclick = (e) => { const b = e.target.closest('.seat'); if (b && !b.disabled) enterClass(+b.dataset.seat); };
$('#seat-stand').onclick = () => enterClass(null);

function openSeatPicker() {
  if (S.inClass) return toast('Bạn đang ở trong lớp rồi — đi tới ghế trống và nhấn E để ngồi');
  renderSeatGrid();
  openModal('#modal-seat');
}

function enterClass(seat) {
  if (socket?.ws?.readyState !== 1) return toast('Đang kết nối máy chủ, thử lại sau giây lát…', 'err');
  closeModal('#modal-seat');
  S.mode = 'class';
  S.inClass = true;
  S.wantSeat = seat;
  setUI('class');
  me.setLook(S.profile.equipped);
  me.group.visible = true;
  ctrl.seated = false;
  ctrl.pos.copy(DOOR_POS);
  ctrl.yaw = ctrl.bodyYaw = Math.PI / 2;
  ctrl.pitch = -0.1;
  ctrl.enabled = true;
  socket.send('join', { seat, p: [DOOR_POS.x, 0, DOOR_POS.z] });
  sysChat('Chào mừng đến lớp học! Click vào màn hình để điều khiển.');
}

function leaveClass() {
  if (!S.inClass) return;
  exitBoard();
  if (exam.open) exam.close();
  hidePaper();
  socket?.send('leave');
  Object.assign(S, { inClass: false, mySeat: null, pendingSeat: null, peekSide: null, myPaper: null });
  ctrl.enabled = false;
  ctrl.seated = false;
  me.group.visible = false;
  if (document.pointerLockElement) document.exitPointerLock();
}

function goMenu() {
  leaveClass();
  S.mode = 'menu';
  setUI('menu');
  camera.fov = 70;
  camera.updateProjectionMatrix();
}

function sitDown(id) {
  S.mySeat = id;
  ctrl.sitAt(room.seats[id]);
  toast(`Đã ngồi vào ghế số ${id + 1} · nhấn X để làm bài kiểm tra`, 'ok');
}
function standUp(send = true) {
  if (S.mySeat == null) return;
  S.mySeat = null;
  ctrl.stand();
  if (send) socket?.send('unseat');
}

function nearestInteraction() {
  if (!S.inClass || S.boardMode) return null;
  if (S.mySeat != null) return { type: 'stand', text: '<kbd>E</kbd> Đứng dậy · <kbd>X</kbd> Làm bài kiểm tra · <kbd>2</kbd> Giơ tay phát biểu' };
  const p = ctrl.pos;
  if (p.z < room.boardFrontZ && Math.abs(p.x) < 2.8) return { type: 'board', text: '<kbd>E</kbd> Viết lên bảng' };
  let best = null, bd = 1.0;
  for (const s of room.seats) {
    const owner = S.seats[s.id];
    if (owner != null && owner !== S.myId) continue;
    const d = Math.hypot(s.pos.x - p.x, s.pos.z - p.z);
    if (d < bd) { bd = d; best = s; }
  }
  if (best) return { type: 'seat', seat: best.id, text: `<kbd>E</kbd> Ngồi vào ghế số ${best.id + 1}${mates.has(best.id) ? ' (bạn ảo sẽ nhường chỗ)' : ''}` };
  return null;
}

function interact() {
  const it = nearestInteraction();
  if (!it) return;
  if (it.type === 'stand') { hidePaper(); standUp(); }
  else if (it.type === 'board') enterBoard();
  else if (it.type === 'seat') { S.pendingSeat = it.seat; socket.send('seat', { seat: it.seat }); }
}

// ===================== Tờ bài làm trên bàn =====================
function paperOf(id) {
  const owner = S.seats[id];
  let p;
  if (owner != null && owner === S.myId && S.inClass) p = { name: S.profile.name, ...(S.myPaper || { answers: null }) };
  else if (owner != null) { const r = S.remotes.get(owner); p = { name: r?.name || 'Bạn học', ...(r?.paper || { answers: null }) }; }
  else {
    const npc = mates.list.find((n) => n.seat === id && n.av.group.visible);
    p = npc ? { name: npc.name, ca: S.npcPapers.ca, answers: S.npcPapers.papers[id] || null } : { name: '', answers: null };
  }
  // Chỉ cảnh báo "khác đề" khi mình đang làm bài và tờ giấy thuộc ca thi khác.
  const stale = !!(exam.open && p.answers && p.ca && p.ca !== exam.ca);
  return { name: p.name, answers: p.answers || null, done: !!p.done, stale };
}

async function fetchNpcPapers() {
  if (!S.profile) return;
  try { S.npcPapers = await api('/papers/npc?seats=' + mates.list.map((n) => n.seat).join(',')); } catch { /* thử lại lần sau */ }
}
setInterval(fetchNpcPapers, 15000);

/** Ghế có tờ giấy để xem: đang ngồi → bạn cùng bàn; đang đứng → bàn gần nhất (không phải bàn mình). */
function nearestPaperSeat() {
  if (!S.inClass || S.boardMode) return null;
  if (S.mySeat != null) return neighborOf(S.mySeat);
  let best = null, bd = 1.1;
  for (const s of room.seats) {
    const d = Math.hypot(s.paper.x - ctrl.pos.x, s.paper.z - ctrl.pos.z);
    if (d < bd) { bd = d; best = s.id; }
  }
  return best;
}

const pvCtx = $('#pv-canvas').getContext('2d');
function renderPaperView() {
  if (S.viewSeat == null) return;
  const p = paperOf(S.viewSeat);
  drawPaper(pvCtx, 512, 708, p);
  $('#pv-title').textContent = `📄 Bài của ${p.name || 'ghế trống'} · ghế ${S.viewSeat + 1}`;
  $('#pv-hint').textContent = S.viewPeek ? 'thả C để thôi nhìn' : 'F / Esc để đóng';
}
function showPaper(seat, byPeek = false) {
  S.viewSeat = seat;
  S.viewPeek = byPeek;
  // Ngồi xem bài bạn cùng bàn (ngoài giờ thi) cũng ngó sang như thật.
  if (!byPeek && S.mySeat != null) {
    S.peekSide = S.mySeat % 2 === 0 ? 'R' : 'L';
    ctrl.setPeek({ yaw: S.peekSide === 'R' ? -1.0 : 1.0, pitch: -0.62 });
  }
  renderPaperView();
  $('#paper-view').classList.remove('hidden');
}
function hidePaper() {
  if (S.viewSeat == null) return;
  if (!S.viewPeek && S.peekSide) { S.peekSide = null; ctrl.setPeek(null); }
  S.viewSeat = null;
  $('#paper-view').classList.add('hidden');
}

// ===================== Bảng đen =====================
function enterBoard() {
  S.boardMode = true;
  if (document.pointerLockElement) document.exitPointerLock();
  ctrl.enabled = false;
  ctrl.pos.set(2.95, 0, -7.15);
  ctrl.bodyYaw = 0.75;
  camera.position.set(0, 1.85, -4.4);
  camera.rotation.set(0, 0, 0);
  camera.fov = 62;
  camera.updateProjectionMatrix();
  const chalks = S.profile.owned.map((id) => ITEM_MAP[id]).filter((i) => i?.type === 'chalk');
  $('#chalk-list').innerHTML = chalks.map((c) => `<span class="chalk ${c.color === S.chalk ? 'on' : ''}" data-c="${c.color}" title="${esc(c.name)}"
    style="background:${c.color === 'rainbow' ? 'conic-gradient(red,orange,yellow,lime,cyan,blue,magenta,red)' : c.color}"></span>`).join('');
  $('#board-tools').classList.remove('hidden');
  $('#crosshair').classList.add('hidden');
  board.begin(camera, canvas, () => ({ color: S.chalk, width: +$('#chalk-size').value }), (s) => socket.send('stroke', { s }));
  toast('Dùng chuột để viết phấn lên bảng. Mọi người trong lớp đều thấy!', 'info');
}
function exitBoard() {
  if (!S.boardMode) return;
  board.end();
  S.boardMode = false;
  $('#board-tools').classList.add('hidden');
  $('#crosshair').classList.remove('hidden');
  ctrl.pos.set(2.4, 0, -6.2);
  ctrl.yaw = Math.PI;
  ctrl.enabled = true;
}
$('#chalk-list').onclick = (e) => {
  const c = e.target.dataset.c;
  if (!c) return;
  S.chalk = c;
  for (const el of $('#chalk-list').children) el.classList.toggle('on', el.dataset.c === c);
};
$('#board-clear').onclick = () => { socket.send('clear'); board.redraw([]); };
$('#board-exit').onclick = exitBoard;

// ===================== Kho tàng tri thức =====================
function openPackPicker() {
  const p = S.profile;
  $('#pack-list').innerHTML = Object.entries(PACKS).map(([k, pk]) => {
    const owned = p.packs.includes(k);
    const item = ITEM_MAP[pk.item];
    return `<button class="pack ${owned ? '' : 'locked'}" data-pack="${k}"><i>${pk.icon}</i>
      <div><b>${pk.name}</b><br><small>${esc(item.desc)}</small></div>
      <span style="margin-left:auto;white-space:nowrap">${owned ? '▶ Chơi' : `🔒 ${fmt(item.price)} 🪙`}</span></button>`;
  }).join('');
  openModal('#modal-pack');
}
$('#pack-list').onclick = async (e) => {
  const b = e.target.closest('.pack');
  if (!b) return;
  const k = b.dataset.pack;
  closeModal('#modal-pack');
  if (!S.profile.packs.includes(k)) { toast('Mở khóa khóa học này trong Cửa hàng nhé!', 'gold'); shop.open('course'); return; }
  leaveClass();
  S.mode = 'quest';
  setUI('quest');
  if (!(await quest.start(k))) goMenu();
};

// ===================== Điều hướng & phím tắt =====================
document.addEventListener('click', async (e) => {
  const nav = e.target.closest('[data-nav]')?.dataset.nav;
  if (!nav || !S.profile) return;
  if (nav === 'class') { if (S.mode === 'quest') quest.exit(); openSeatPicker(); }
  else if (nav === 'quest') openPackPicker();
  else if (nav === 'shop') shop.open();
  else if (nav === 'events') events.open();
  else if (nav === 'menu') { if (S.mode === 'quest') quest.exit(); else goMenu(); }
  else if (nav === 'logout') {
    try { await api('/logout', {}); } catch { /* bỏ qua */ }
    setToken(null);
    socket?.close();
    location.reload();
  }
});

const EMOTES = { Digit1: ['wave', 3], Digit2: ['raise', 5], Digit3: ['clap', 3], Digit4: ['nod', 2.5] };
addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || !S.profile) return;
  if (e.code === 'Escape' && S.boardMode) return exitBoard();
  if (e.code === 'Escape' && S.viewSeat != null && !S.viewPeek) return hidePaper();
  if (anyModalOpen()) return;
  if (e.code === 'KeyF' && S.inClass && !S.boardMode) {
    if (S.viewSeat != null) return hidePaper();
    const seat = nearestPaperSeat();
    if (seat != null) showPaper(seat);
    return;
  }
  if (e.code === 'KeyB') return shop.open();
  if (e.code === 'KeyN') return events.open();
  if (!S.inClass || S.boardMode) return;
  if (e.code === 'KeyE') interact();
  else if (e.code === 'KeyX') {
    if (S.mySeat == null) toast('Hãy ngồi vào chỗ để làm bài kiểm tra', 'err');
    else { if (document.pointerLockElement) document.exitPointerLock(); exam.start(); }
  } else if (EMOTES[e.code]) { [S.emote, S.emoteT] = EMOTES[e.code]; }
  else if (e.code === 'Enter') { e.preventDefault(); if (document.pointerLockElement) document.exitPointerLock(); chatInput.focus(); }
  else if (e.code === 'KeyH') $('#help').classList.toggle('hidden');
});

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  for (const c of [camera, quest.camera]) { c.aspect = innerWidth / innerHeight; c.updateProjectionMatrix(); }
});

// ===================== Vòng lặp =====================
function myAnim() {
  const base = S.mySeat != null ? 'sit' : ctrl.moving ? (ctrl.running ? 'run' : 'walk') : 'idle';
  let action = S.emoteT > 0 ? S.emote : '';
  if (S.boardMode) action = 'write';
  if (S.peekSide) action = S.peekSide === 'R' ? 'peekR' : 'peekL';
  return `${base}|${action}`;
}

const clock = new THREE.Clock();
let sendT = 0, lastSent = '', menuT = 0, paperT = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (S.mode === 'quest') {
    quest.update(dt);
    renderer.render(quest.scene, quest.camera);
    return;
  }
  room.update(dt);
  teacher.update(dt);
  mates.update(dt);
  if ((paperT += dt) > 0.4) {
    paperT = 0;
    for (const s of room.seats) papers.set(s.id, paperOf(s.id));
    renderPaperView();
  }
  const kr = 1 - Math.exp(-10 * dt);
  for (const r of S.remotes.values()) {
    const g = r.av.group;
    g.position.lerp(r.target, kr);
    g.rotation.y += angDiff(g.rotation.y, r.yaw) * kr;
    r.av.update(dt);
  }

  if (S.inClass) {
    if (S.emoteT > 0) S.emoteT -= dt;
    if (!S.boardMode) ctrl.update(dt);
    me.group.position.set(ctrl.pos.x, 0, ctrl.pos.z);
    me.group.rotation.y = ctrl.bodyYaw;
    me.head.visible = S.boardMode || ctrl.view !== 'fpp';
    me.setAnim(myAnim());
    me.update(dt);

    const it = nearestInteraction();
    const ps = S.viewSeat == null ? nearestPaperSeat() : null;
    const psName = ps != null ? paperOf(ps).name : '';
    const promptHtml = [it?.text, psName ? `<kbd>F</kbd> Xem bài của ${esc(psName)}` : null].filter(Boolean).join(' · ');
    $('#prompt').classList.toggle('hidden', !promptHtml || anyModalOpen());
    if (promptHtml) $('#prompt').innerHTML = promptHtml;
    // Đi xa khỏi bàn thì tự đóng tờ giấy đang xem.
    if (S.viewSeat != null && !S.viewPeek && S.mySeat == null) {
      const pp = room.seats[S.viewSeat].paper;
      if (Math.hypot(pp.x - ctrl.pos.x, pp.z - ctrl.pos.z) > 2) hidePaper();
    }
    const att = teacher.attention(ctrl.pos);
    $('#teacher-eye').classList.toggle('near', att === 1);
    $('#teacher-eye').classList.toggle('watching', att === 2);
    if (exam.open) exam.tick(dt, att);
    $('#click-hint').classList.toggle('hidden', ctrl.locked || anyModalOpen() || S.boardMode || document.activeElement === chatInput);
    // Bảng tên mờ dần khi camera ở quá gần (tránh che màn hình).
    for (const av of [teacher.av, ...mates.list.map((n) => n.av), ...[...S.remotes.values()].map((r) => r.av)]) {
      const d = camera.position.distanceTo(av.group.position.clone().setY(1.9));
      av.nameTag.material.opacity = Math.min(1, Math.max(0, (d - 1.2) / 1.2));
    }

    sendT += dt;
    if (sendT > 0.08) {
      const msg = { p: [r2(ctrl.pos.x), 0, r2(ctrl.pos.z)], r: r2(ctrl.bodyYaw), a: myAnim() };
      const key = JSON.stringify(msg);
      if (key !== lastSent || sendT > 1) { socket?.send('state', msg); lastSent = key; sendT = 0; }
    }
  } else {
    menuT += dt * 0.1;
    camera.position.set(Math.sin(menuT) * 4.5, 3.0, 2 + Math.cos(menuT) * 5);
    camera.lookAt(0, 1.1, -2);
  }
  renderer.render(scene, camera);
}

// ===================== Đăng nhập =====================
async function doAuth(kind) {
  $('#login-error').textContent = '';
  try {
    const r = await api('/' + kind, { name: $('#login-name').value.trim(), password: $('#login-pw').value });
    setToken(r.token);
    afterLogin(r.profile);
  } catch (e) { $('#login-error').textContent = e.message; }
}
$('#btn-login').onclick = () => doAuth('login');
$('#btn-register').onclick = () => doAuth('register');
$('#login-pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') doAuth('login'); });

function afterLogin(p) {
  setProfile(p);
  $('#screen-login').classList.add('hidden');
  $('#topbar').classList.remove('hidden');
  connectSocket();
  fetchNpcPapers();
  goMenu();
  if (!p.login.claimedToday) setTimeout(() => events.open('login'), 700);
}

async function boot() {
  frame();
  if (getToken()) {
    try { return afterLogin(await api('/me')); } catch { setToken(null); }
  }
  $('#screen-login').classList.remove('hidden');
}
boot();
