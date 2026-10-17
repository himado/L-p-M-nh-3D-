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
import { createSocial } from './social.js';
import { Papers, drawPaper } from './papers.js';
import { buildYard, YARD_DOOR, YARD_SPAWN } from './yard.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Badminton } from './badminton.js';
import { COURT, BM, sideOfZ, otherSide } from './data/court.js';
import { ITEM_MAP, PACKS } from './data/items.js';
import { $, esc, toast, openModal, closeModal, anyModalOpen, fmt } from './ui.js';

const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const r2 = (v) => Math.round(v * 100) / 100;

const S = {
  profile: null, mode: 'login', myId: null, seats: Array(30).fill(null), remotes: new Map(),
  inClass: false, mySeat: null, wantSeat: null, pendingSeat: null, boardMode: false,
  emote: '', emoteT: 0, chatScope: 'all', peekSide: null, chalk: '#f8fafc',
  myPaper: null, npcPapers: { ca: 0, papers: {} }, viewSeat: null, viewPeek: false,
  zone: 'class', bm: null, matches: [], pidMatch: new Map(), invite: null, friends: [],
  swingT: 0, swingSide: 'R', shake: 0, benchSeat: null, nightOverride: null,
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
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 400);

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
ctrl.lockable = () => S.inClass && !anyModalOpen() && !S.boardMode && !bm.mySide && document.activeElement !== $('#chat-input');
ctrl.onViewChange = (v) => { $('#view-label').textContent = v.toUpperCase(); };

// ===================== Sân trường & cầu lông =====================
const yard = buildYard();
// Hậu kỳ cho sân trường: bloom làm hoa anh đào / đèn lồng toả sáng (mạnh về đêm). Chỉ tạo khi ra sân lần đầu.
let yardFx = null;
function yardComposer() {
  if (!yardFx) {
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(yard.scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.35, 0.6, 0.9);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    yardFx = { composer, bloom };
  }
  return yardFx;
}
const bm = new Badminton({
  scene: yard.scene, camera, keys: ctrl.keys, me,
  send: (t, d) => socket?.send(t, d),
  getRemote(side) {
    const id = S.bm?.[side];
    const r = id != null && id !== S.myId ? S.remotes.get(id) : null;
    return r ? { pos: r.av.group.position, av: r.av, k: r.k } : null;
  },
  onLeaveRequest: () => requestLeaveCourt(),
  onInviteRequest: () => social.openPeople(),
  onPauseRequest: () => togglePause(),
});

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
  $('#tb-flowers').textContent = fmt(p.bag?.collect_flower10 || 0);
  if (p.topic) board.setTopic(p.topic.name);
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
      if (m.quiz) social.onQuiz(m.quiz);
      if (S.inClass) socket.send('join', { zone: S.zone, seat: S.mySeat, p: [ctrl.pos.x, 0, ctrl.pos.z] }); // kết nối lại
    },
    join(m) {
      if (m.player.id === S.myId) return onJoined(m.player);
      addRemote(m.player);
      if (m.player.zone === S.zone) sysChat(`${m.player.name} đã vào ${m.player.zone === 'yard' ? 'sân trường' : 'lớp'}`);
    },
    leave(m) { removeRemote(m.id); },
    state(m) {
      const r = S.remotes.get(m.id);
      if (!r) return;
      r.target.set(m.p[0], m.p[1] || 0, m.p[2]);
      r.yaw = m.r;
      r.av.setAnim(m.a);
      if (m.k) (r.k ||= new THREE.Vector3()).set(...m.k); else r.k = null;
    },
    bm: onBm,
    bm_hit(m) { bm.remoteHit(m); },
    bm_notice(m) { toast(esc(m.text), m.kind || 'info', 4500); if (bm.active) bm.flash(esc(m.text), 3000); },
    bm_invite: (m) => social.onBmInvite(m),
    online: (m) => social.renderOnline(m),
    friends: (m) => social.onFriends(m),
    friend_req: (m) => social.onFriendReq(m),
    profile: (m) => setProfile(m.profile),
    quiz: (m) => social.onQuiz(m),
    quiz_result: (m) => social.onQuizResult(m),
    quiz_end: (m) => social.onQuizEnd(m),
    trade_req: (m) => social.onTradeReq(m),
    trade_inv: (m) => social.onTradeInv(m),
    rps_challenge: (m) => social.onRpsChallenge(m),
    rps_start: (m) => social.onRpsStart(m),
    rps_result: (m) => social.onRpsResult(m),
    hit(m) {                          // mình bị đấm → văng ra sau
      if (!S.inClass || bm.mySide) return;
      ctrl.knock(m.dir[0], m.dir[1], 6.5);
      S.shake = 0.35;
    },
    hurt(m) { avatarOf(m.id)?.hurt(); },
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
  const zone = p.zone === 'yard' ? 'yard' : 'class';
  (zone === 'yard' ? yard.scene : scene).add(av.group);   // mỗi khu vực một scene riêng
  S.remotes.set(p.id, { id: p.id, av, name: p.name, zone, paper: p.paper, k: p.k ? new THREE.Vector3(...p.k) : null,
    target: new THREE.Vector3(p.p[0], 0, p.p[2]), yaw: p.r });
}
function removeRemote(id) {
  const r = S.remotes.get(id);
  if (!r) return;
  r.av.group.parent?.remove(r.av.group);
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
  if (m.scope === 'near' && !mine && av) canHear = r.zone === S.zone && av.group.position.distanceTo(me.group.position) < 4;
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
  $('#hud').classList.toggle('hidden', mode !== 'class' && mode !== 'yard');
  $('#teacher-eye').classList.toggle('hidden', mode !== 'class');
  $('#daynight').classList.toggle('hidden', mode !== 'yard');
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
  if (S.inClass && S.zone === 'class') return toast('Bạn đang ở trong lớp rồi — đi tới ghế trống và nhấn E để ngồi');
  renderSeatGrid();
  openModal('#modal-seat');
}

function enterClass(seat) {
  if (socket?.ws?.readyState !== 1) return toast('Đang kết nối máy chủ, thử lại sau giây lát…', 'err');
  if (S.inClass) leaveClass();
  closeModal('#modal-seat');
  S.mode = 'class';
  S.zone = 'class';
  S.inClass = true;
  S.wantSeat = seat;
  setUI('class');
  scene.add(me.group);
  ctrl.world = room;
  ctrl.baseFov = 70; ctrl.maxDist = 4.5; ctrl.dist = Math.min(ctrl.dist, 2.4);
  me.setLook(S.profile.equipped);
  me.group.visible = true;
  ctrl.seated = false;
  ctrl.pos.copy(DOOR_POS);
  ctrl.yaw = ctrl.bodyYaw = Math.PI / 2;
  ctrl.pitch = -0.1;
  ctrl.enabled = true;
  socket.send('join', { zone: 'class', seat, p: [DOOR_POS.x, 0, DOOR_POS.z] });
  sysChat('Chào mừng đến lớp học! Click vào màn hình để điều khiển.');
}

// Ngày / đêm ở sân trường: mặc định theo giờ Việt Nam (18h–6h là đêm), bấm M để đổi
const autoNight = () => {
  const h = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Ho_Chi_Minh' })) % 24;
  return h >= 18 || h < 6;
};
function applyDayNight() {
  const night = S.nightOverride ?? autoNight();
  yard.setNight(night);
  $('#daynight').textContent = night ? '🌙 Ban đêm (M)' : '☀️ Ban ngày (M)';
}
function toggleDayNight() {
  S.nightOverride = !(S.nightOverride ?? autoNight());
  applyDayNight();
  toast(S.nightOverride ? '🌙 Màn đêm buông xuống — cây anh đào bừng sáng' : '☀️ Trời sáng rồi', 'info');
}
$('#daynight').onclick = toggleDayNight;

function enterYard() {
  if (socket?.ws?.readyState !== 1) return toast('Đang kết nối máy chủ, thử lại sau giây lát…', 'err');
  if (S.inClass && S.zone === 'yard') return toast('Bạn đang ở sân trường rồi');
  if (S.inClass) leaveClass();
  S.mode = 'yard';
  S.zone = 'yard';
  S.inClass = true;
  setUI('yard');
  applyDayNight();
  yard.ensureBuilt();                  // sân trường chỉ được dựng ở lần đầu ra sân
  yard.scene.add(me.group);
  ctrl.world = yard;
  // Mở rộng khung hình ở sân trường: góc nhìn rộng hơn, lùi camera xa được để thấy trọn cây anh đào
  ctrl.baseFov = 80; ctrl.maxDist = 14; ctrl.dist = 6;
  me.setLook(S.profile.equipped);
  me.group.visible = true;
  ctrl.seated = false;
  ctrl.pos.copy(YARD_SPAWN);
  ctrl.yaw = ctrl.bodyYaw = Math.PI;   // nhìn ra sân
  ctrl.pitch = -0.08;
  ctrl.enabled = true;
  socket.send('join', { zone: 'yard', p: [YARD_SPAWN.x, 0, YARD_SPAWN.z] });
  yard.gust(ctrl.pos);
  sysChat('Xuống sân trường! Hoa anh đào đang rơi 🌸 — ra sân cầu lông (bên trái) để đấu, bấm I để mời bạn.');
}

// ---- Cầu lông: trạng thái trận từ server quyết định mình đang chơi PvP, đấu máy hay xem ----
// Nhiều trận song song trên một sân: hiển thị trận của mình, nếu không thì "trận nổi bật" (PvP đầu tiên) để đứng xem.
function onBm(msg) {
  if (msg) {
    S.matches = msg.matches;
    S.pidMatch = new Map();
    for (const m of S.matches) for (const s of ['A', 'B']) if (m[s] != null) S.pidMatch.set(m[s], m.id);
  }
  const mine = S.matches.find((m) => m.A === S.myId || m.B === S.myId);
  const st = mine || S.matches.find((m) => m.A != null && m.B != null) || null;
  const prevOver = S.bm?.id === st?.id ? S.bm?.over : null;
  S.bm = st;
  if (!S.inClass || S.zone !== 'yard' || !st) { if (bm.active) bm.exit(); setPlaying(false); return; }
  const side = st.A === S.myId ? 'A' : st.B === S.myId ? 'B' : null;
  const mode = side ? (st[otherSide(side)] != null ? 'pvp' : 'bot') : 'watch';
  if (mode !== bm.mode || side !== bm.mySide || st.id !== bm.mid) {
    const wasPlaying = !!bm.mySide;
    bm.enter(mode, side, st.id);
    if (mode === 'pvp' && side) toast(`⚔️ Trận đấu với ${esc(st.names[otherSide(side)])} bắt đầu!`, 'gold');
    if (wasPlaying && !side) ctrl.pos.copy(bm.pos);
    setPlaying(!!side);
  }
  bm.setMatch(st);
  if (mode === 'pvp' && st.over && st.over !== prevOver && st.over === side) {
    toast(`🏆 Bạn thắng trận! +${BM.winCoins} xu`, 'gold', 4000);
    api('/me').then(setProfile).catch(() => {});
  }
}

// Rời trận khi chưa hết ván: nhấn 2 lần để chắc chắn — server báo cho đối thủ.
let leaveArmedAt = 0;
function requestLeaveCourt() {
  const midGame = bm.mode === 'pvp' && !bm.match.over && (bm.match.score.A + bm.match.score.B > 0 || bm.sh.flying);
  if (midGame && Date.now() - leaveArmedAt > 3000) {
    leaveArmedAt = Date.now();
    toast('Trận chưa kết thúc! Nhấn <kbd>Q</kbd> / "Rời sân" lần nữa để rời — đối thủ sẽ được thông báo', 'gold', 3000);
    return;
  }
  socket?.send('bm_leave');
}
function togglePause() {
  if (bm.mode !== 'pvp') return toast('Chỉ tạm dừng được khi đấu với người chơi khác', 'err');
  const p = bm.match.paused;
  if (!p) socket?.send('bm_pause');
  else if (p.side === bm.mySide) socket?.send('bm_resume');
  else toast(`${esc(p.name)} đang tạm dừng — chờ bạn ấy quay lại nhé`, 'gold');
}

// ---- Xã hội (bạn bè, lời mời, câu hỏi, trao đổi, oẳn tù tì) ----
function acceptBmInvite(inv) {
  if (!inv || !S.profile) return;
  for (const md of document.querySelectorAll('.modal.open')) md.classList.remove('open');
  if (S.mode === 'quest') quest.exit();
  if (!(S.inClass && S.zone === 'yard')) enterYard();
  if (S.inClass && S.zone === 'yard') socket?.send('bm_accept', { mid: inv.mid });
}
/** Avatar của người chơi (mình hoặc người khác) nếu đang ở cùng khu vực với mình. */
function avatarOf(pid) {
  if (pid === S.myId) return S.inClass ? me : null;
  const r = S.remotes.get(pid);
  return r && r.zone === S.zone && S.inClass ? r.av : null;
}
const social = createSocial({
  S, me, board,
  send: (t, d) => socket?.send(t, d),
  avatarOf,
  setEmote: (a, secs) => { S.emote = a; S.emoteT = secs; },
  shake: () => { S.shake = 0.5; },
  inYard: () => S.inClass && S.zone === 'yard',
  inMatch: () => !!bm.mySide,
  enterYard: () => enterYard(),
  joinCourt: () => socket?.send('bm_join', { side: 'B' }),
  acceptBm: acceptBmInvite,
  openShop: (tab) => shop.open(tab),
  sysChat: (t) => sysChat(t),
});

// ---- Đấm kiểu Minecraft: chuột trái vung tay trái/phải, trúng người khác → đẩy lùi ----
function doSwing() {
  if (!S.inClass || S.boardMode || S.mySeat != null || S.benchSeat != null || bm.mySide || anyModalOpen()) return;
  if (S.swingT > 0.12) return;
  S.swingSide = S.swingSide === 'L' ? 'R' : 'L';
  S.swingT = 0.28;
  const fx = -Math.sin(ctrl.bodyYaw), fz = -Math.cos(ctrl.bodyYaw);
  const inFront = (pos) => {
    const dx = pos.x - ctrl.pos.x, dz = pos.z - ctrl.pos.z, d = Math.hypot(dx, dz);
    return d < 1.8 && (dx * fx + dz * fz) / (d || 1) > 0.3 ? d : Infinity;
  };
  let best = null, bd = Infinity;
  for (const r of S.remotes.values()) {
    if (r.zone !== S.zone || !r.av.group.visible) continue;
    const d = inFront(r.av.group.position);
    if (d < bd) { bd = d; best = r; }
  }
  if (best) { socket?.send('hit', { target: best.id }); return; }
  // NPC trong lớp chỉ phản ứng tại máy mình
  if (S.zone === 'class') {
    for (const av of [teacher.av, ...mates.list.filter((n) => n.av.group.visible).map((n) => n.av)]) {
      if (inFront(av.group.position) < Infinity) { av.hurt(); av.say(av === teacher.av ? 'Em không được đánh nhau! 😠' : 'Ui da! 😣'); return; }
    }
  }
}
ctrl.onSwing = doSwing;

/** R: thách oẳn tù tì người đứng gần nhất. */
function rpsNearest() {
  let best = null, bd = 3;
  for (const r of S.remotes.values()) {
    if (r.zone !== S.zone || !r.av.group.visible) continue;
    const d = r.av.group.position.distanceTo(me.group.position);
    if (d < bd) { bd = d; best = r; }
  }
  if (!best) return toast('Đứng gần một bạn (dưới 3m) rồi bấm R — hoặc mở 👥 Bạn bè (I) để thách đấu từ xa', 'info');
  socket?.send('rps_challenge', { to: best.id });
}
function setPlaying(on) {
  document.body.classList.toggle('bm-playing', on);
  ctrl.enabled = S.inClass && !on;
  if (on && document.pointerLockElement) document.exitPointerLock();
  $('#crosshair').classList.toggle('hidden', on);
  $('#help').classList.toggle('hidden', on);
  $('#view-label').classList.toggle('hidden', on);
  if (!on) me.aim = null;
}

function leaveClass() {
  if (!S.inClass) return;
  if (bm.mySide) socket?.send('bm_leave');
  bm.exit();
  setPlaying(false);
  exitBoard();
  if (exam.open) exam.close();
  hidePaper();
  socket?.send('leave');
  if (S.benchSeat != null) { S.benchSeat = null; ctrl.seated = false; }
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

function yardInteraction() {
  if (bm.mySide) return null;
  if (S.benchSeat != null) return { type: 'benchStand', text: '<kbd>E</kbd> Đứng dậy · ngắm hoa anh đào rơi 🌸' };
  const p = ctrl.pos;
  if (p.distanceTo(YARD_DOOR) < 2) return { type: 'toClass', text: '<kbd>E</kbd> Vào lớp học' };
  const dz = p.z - COURT.netZ;
  if (Math.abs(p.x - COURT.cx) < 3.8 && Math.abs(dz) > 0.2 && Math.abs(dz) < 8.4) {
    // Mỗi người vào sân có phiên riêng → không bao giờ phải chờ sân trống
    const side = sideOfZ(p.z);
    return { type: 'bmJoin', side, text: `<kbd>E</kbd> Vào sân cầu lông — 🤖 khởi động với Thầy thể dục, bấm <kbd>I</kbd> để mời bạn đang online` };
  }
  // Ghế đá quanh gốc cây: chọn chỗ trống gần nhất (không có ai đang ngồi)
  let best = -1, bd = 1.4;
  yard.benchSpots.forEach((sp, i) => {
    const d = Math.hypot(sp.pos.x - p.x, sp.pos.z - p.z);
    if (d >= bd) return;
    const taken = [...S.remotes.values()].some((r) => r.zone === 'yard' && r.av.anim.startsWith('sit') && r.av.group.position.distanceTo(sp.pos) < 0.35);
    if (!taken) { bd = d; best = i; }
  });
  if (best >= 0) return { type: 'benchSit', idx: best, text: '<kbd>E</kbd> Ngồi xuống ghế đá dưới gốc anh đào 🪨' };
  return null;
}

function nearestInteraction() {
  if (!S.inClass || S.boardMode) return null;
  if (S.zone === 'yard') return yardInteraction();
  if (S.mySeat != null) return { type: 'stand', text: '<kbd>E</kbd> Đứng dậy · <kbd>X</kbd> Làm bài kiểm tra · <kbd>2</kbd> Giơ tay phát biểu' };
  const p = ctrl.pos;
  if (p.distanceTo(DOOR_POS) < 1.4) return { type: 'toYard', text: '<kbd>E</kbd> Ra sân trường 🌳' };
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
  else if (it.type === 'toYard') enterYard();
  else if (it.type === 'toClass') enterClass(null);
  else if (it.type === 'bmJoin') socket.send('bm_join', { side: it.side });
  else if (it.type === 'benchSit') { S.benchSeat = it.idx; ctrl.sitAt(yard.benchSpots[it.idx]); }
  else if (it.type === 'benchStand') { S.benchSeat = null; ctrl.stand(true); }
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
  if (!S.inClass || S.boardMode || S.zone !== 'class') return null;
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
$('#board-quiz').onclick = () => social.openQuizMaker();

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
  else if (nav === 'yard') { if (S.mode === 'quest') quest.exit(); enterYard(); }
  else if (nav === 'quest') openPackPicker();
  else if (nav === 'shop') shop.open();
  else if (nav === 'events') events.open();
  else if (nav === 'people') social.openPeople();
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
  if (e.code === 'KeyI') return social.openPeople();
  if (e.code === 'KeyN') return events.open();
  if (!S.inClass || S.boardMode) return;
  if (bm.mySide) {                       // đang trên sân cầu lông: WASD + chuột do module cầu lông xử lý
    if (e.code === 'KeyQ') requestLeaveCourt();
    else if (e.code === 'KeyP') togglePause();
    else if (e.code === 'KeyI') social.openPeople();
    else if (e.code === 'Enter') { e.preventDefault(); chatInput.focus(); }
    return;
  }
  if (e.code === 'KeyE') interact();
  else if (e.code === 'KeyX' && S.zone !== 'class') return;
  else if (e.code === 'KeyX') {
    if (S.mySeat == null) toast('Hãy ngồi vào chỗ để làm bài kiểm tra', 'err');
    else { if (document.pointerLockElement) document.exitPointerLock(); exam.start(); }
  } else if (EMOTES[e.code]) { [S.emote, S.emoteT] = EMOTES[e.code]; }
  else if (e.code === 'Enter') { e.preventDefault(); if (document.pointerLockElement) document.exitPointerLock(); chatInput.focus(); }
  else if (e.code === 'KeyH') $('#help').classList.toggle('hidden');
  else if (e.code === 'KeyR') rpsNearest();
  else if (e.code === 'KeyT') { if (!social.rematch()) rpsNearest(); }
  else if (e.code === 'KeyM' && S.zone === 'yard') toggleDayNight();
});

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  for (const c of [camera, quest.camera]) { c.aspect = innerWidth / innerHeight; c.updateProjectionMatrix(); }
  yardFx?.composer.setSize(innerWidth, innerHeight);
});

// ===================== Vòng lặp =====================
function myAnim() {
  const base = S.mySeat != null || S.benchSeat != null ? 'sit' : ctrl.airborne ? 'air' : ctrl.moving ? (ctrl.running ? 'run' : 'walk') : 'idle';
  let action = S.emoteT > 0 ? S.emote : '';
  if (S.swingT > 0) action = S.swingSide === 'L' ? 'swingL' : 'swingR';
  if (S.boardMode) action = 'write';
  if (S.peekSide) action = S.peekSide === 'R' ? 'peekR' : 'peekL';
  return `${base}|${action}`;
}

const clock = new THREE.Clock();
let sendT = 0, lastSent = '', paperT = 0;
// Bảng toàn màn hình: khi đang mở thì tạm dừng vẽ 3D phía sau — chỉ "render" bảng đó
const FULL_PANELS = ['#modal-shop', '#modal-events', '#modal-invite', '#modal-pack', '#modal-seat', '#modal-trade', '#modal-quizmake', '#modal-result'];
const panelOpen = () => FULL_PANELS.some((id) => $(id).classList.contains('open'));

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  // Sảnh / đăng nhập: không vẽ 3D gì cả
  const no3d = S.mode === 'menu' || S.mode === 'login';
  document.body.classList.toggle('no3d', no3d);
  if (no3d) return;
  const covered = panelOpen();
  if (S.mode === 'quest') {                   // chỉ vẽ màn vượt ải
    if (covered) return;
    quest.update(dt);
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.render(quest.scene, quest.camera);
    return;
  }
  const inYard = S.inClass && S.zone === 'yard';
  if (covered) {                              // tạm dừng; trận PvP vẫn mô phỏng để không lệch với đối thủ
    if (inYard && bm.mode === 'pvp') bm.update(dt);
    return;
  }
  if (!inYard) {                              // chỉ cập nhật lớp học khi đang ở trong lớp
    room.update(dt);
    teacher.update(dt);
    mates.update(dt);
    if ((paperT += dt) > 0.4) {
      paperT = 0;
      for (const s of room.seats) papers.set(s.id, paperOf(s.id));
      renderPaperView();
    }
  }
  const kr = 1 - Math.exp(-10 * dt);
  for (const r of S.remotes.values()) {
    if (r.zone !== S.zone) continue;          // người ở khu khác: không cập nhật / không vẽ
    const g = r.av.group;
    g.position.lerp(r.target, kr);
    g.rotation.y += angDiff(g.rotation.y, r.yaw) * kr;
    if (!r.k) r.av.aim = null;
    // Người đang chơi ở trận khác (cùng một sân) thì ẩn đi để không chồng lên trận mình đang xem
    if (r.zone === 'yard') { const mid = S.pidMatch.get(r.id); g.visible = mid == null || mid === S.bm?.id; }
    r.av.update(dt);
  }

  if (S.emoteT > 0) S.emoteT -= dt;
  if (S.swingT > 0) S.swingT -= dt;
  const playing = inYard && !!bm.mySide;
  if (inYard) { yard.update(dt); bm.localPause = bm.mode === 'bot' && anyModalOpen(); bm.update(dt); }
  if (playing) {
    me.group.position.copy(bm.pos);
    me.group.rotation.y = bm.yaw;
  } else {
    if (!S.boardMode) ctrl.update(dt);
    me.group.position.set(ctrl.pos.x, ctrl.y, ctrl.pos.z);
    if (S.shake > 0) { S.shake -= dt; camera.position.x += (Math.random() - 0.5) * S.shake * 0.25; camera.position.y += (Math.random() - 0.5) * S.shake * 0.25; }
    me.group.rotation.y = ctrl.bodyYaw;
  }
  me.head.visible = playing || S.boardMode || ctrl.view !== 'fpp';
  const anim = playing ? (bm.moving ? 'run|' : 'idle|') : myAnim();
  me.setAnim(anim);
  me.update(dt);

  const it = nearestInteraction();
  const ps = S.viewSeat == null ? nearestPaperSeat() : null;
  const psName = ps != null ? paperOf(ps).name : '';
  const promptHtml = [it?.text, psName ? `<kbd>F</kbd> Xem bài của ${esc(psName)}` : null].filter(Boolean).join(' · ');
  $('#prompt').classList.toggle('hidden', !promptHtml || anyModalOpen());
  if (promptHtml) $('#prompt').innerHTML = promptHtml;
  if (!inYard) {
    // Đi xa khỏi bàn thì tự đóng tờ giấy đang xem.
    if (S.viewSeat != null && !S.viewPeek && S.mySeat == null) {
      const pp = room.seats[S.viewSeat].paper;
      if (Math.hypot(pp.x - ctrl.pos.x, pp.z - ctrl.pos.z) > 2) hidePaper();
    }
    const att = teacher.attention(ctrl.pos);
    $('#teacher-eye').classList.toggle('near', att === 1);
    $('#teacher-eye').classList.toggle('watching', att === 2);
    if (exam.open) exam.tick(dt, att);
  }
  $('#click-hint').classList.toggle('hidden', playing || ctrl.locked || anyModalOpen() || S.boardMode || document.activeElement === chatInput);
  // Bảng tên mờ dần khi camera ở quá gần (tránh che màn hình).
  const others = [...S.remotes.values()].filter((r) => r.zone === S.zone).map((r) => r.av);
  for (const av of inYard ? others : [teacher.av, ...mates.list.map((n) => n.av), ...others]) {
    const d = camera.position.distanceTo(av.group.position.clone().setY(1.9));
    av.nameTag.material.opacity = Math.min(1, Math.max(0, (d - 1.2) / 1.2));
  }

  sendT += dt;
  if (sendT > (playing ? 0.05 : 0.08)) {
    const p = playing ? bm.pos : ctrl.pos;
    const msg = { p: [r2(p.x), playing ? 0 : r2(ctrl.y), r2(p.z)], r: r2(playing ? bm.yaw : ctrl.bodyYaw), a: anim };
    if (playing) msg.k = bm.head.toArray().map(r2);
    const key = JSON.stringify(msg);
    if (key !== lastSent || sendT > 1) { socket?.send('state', msg); lastSent = key; sendT = 0; }
  }
  // Sân trường dùng tone mapping điện ảnh (ACES), độ phơi sáng theo ngày/đêm; lớp học giữ màu gốc
  renderer.toneMapping = inYard ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
  renderer.toneMappingExposure = inYard ? yard.exposure : 1;
  if (inYard) {
    const fx = yardComposer();
    fx.bloom.strength = yard.bloomStrength ?? 0.35;
    fx.bloom.threshold = yard.bloomThreshold ?? 0.9;
    fx.composer.render();
  } else renderer.render(scene, camera);
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

// Hook kiểm thử tự động — chỉ bật khi mở với ?debug
if (new URLSearchParams(location.search).has('debug')) window.__lm3d = { S, ctrl, bm, yard, camera, renderer };
