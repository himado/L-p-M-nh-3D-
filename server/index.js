// Lớp mình 3D server: phục vụ file tĩnh, REST API (tài khoản, kinh tế, câu hỏi) và WebSocket (đồng bộ lớp học).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { ITEMS, ITEM_MAP, DEFAULT_OWNED, DEFAULT_EQUIPPED, PACKS, isTradeable, FLOWER } from '../public/js/data/items.js';
import { activeEvent } from '../public/js/data/events.js';
import { BM, rallyWinner, gameOver } from '../public/js/data/court.js';
import { QUESTIONS, TOPICS } from './questions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const DB_FILE = path.join(__dirname, 'db.json');
const PORT = Number(process.env.PORT) || 3000;
const SEAT_COUNT = 30;

// ===================== Lưu trữ (JSON file — thay bằng PostgreSQL khi lên production) =====================
let db = { users: {}, sessions: {} };
try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch { /* lần chạy đầu */ }
for (const u of Object.values(db.users)) { u.bag ||= {}; u.friends ||= []; }   // nâng cấp dữ liệu cũ
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => fs.writeFile(DB_FILE, JSON.stringify(db), () => {}), 300);
}

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
const dayDiff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString('hex');
const level = (xp) => Math.floor(Math.sqrt(xp / 50)) + 1;
const coinMul = () => activeEvent(today())?.coinMul || 1;

function fail(message, status = 400) { const e = new Error(message); e.status = status; throw e; }
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}

function newUser(name, password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return {
    name, salt, hash: hashPw(password, salt), coins: 300, gems: 3, xp: 0,
    owned: [...DEFAULT_OWNED], equipped: { ...DEFAULT_EQUIPPED },
    stats: { correct: 0, answered: 0, runs: 0, exams: 0, perfect: 0 },
    daily: null, login: { last: null, streak: 0 }, created: Date.now(), bag: {}, friends: [],
  };
}

// ===================== Nhiệm vụ ngày & điểm danh =====================
const MISSIONS = [
  { id: 'correct10', title: 'Trả lời đúng 10 câu hỏi', key: 'correct', goal: 10, reward: { coins: 100 } },
  { id: 'run1', title: 'Vượt đích 1 lượt Kho tàng tri thức', key: 'runs', goal: 1, reward: { coins: 80 } },
  { id: 'exam1', title: 'Nộp 1 bài kiểm tra trong lớp', key: 'exams', goal: 1, reward: { gems: 1 } },
  { id: 'chat3', title: 'Trò chuyện 3 lần trong lớp', key: 'chats', goal: 3, reward: { coins: 40 } },
  { id: 'board1', title: 'Viết lên bảng đen', key: 'board', goal: 1, reward: { coins: 40 } },
];
const LOGIN_REWARDS = [{ coins: 50 }, { coins: 80 }, { coins: 100 }, { gems: 1 }, { coins: 150 }, { coins: 200 }, { gems: 5 }];

function daily(u) {
  const d = today();
  if (!u.daily || u.daily.date !== d) u.daily = { date: d, correct: 0, runs: 0, chats: 0, board: 0, exams: 0, claimed: [] };
  return u.daily;
}
function loginState(u) {
  const d = today();
  const claimedToday = u.login.last === d;
  const continuing = !!u.login.last && dayDiff(u.login.last, d) === 1;
  const streak = claimedToday || continuing ? u.login.streak : 0;
  const cycleDone = claimedToday ? ((streak - 1) % 7) + 1 : streak % 7;
  return { claimedToday, streak, cycleDone, rewards: LOGIN_REWARDS };
}
function grant(u, r) { u.coins += r.coins || 0; u.gems += r.gems || 0; }

function profile(u) {
  const dl = daily(u);
  return {
    name: u.name, coins: u.coins, gems: u.gems, xp: u.xp, level: level(u.xp),
    owned: u.owned, equipped: u.equipped, stats: u.stats,
    packs: Object.keys(PACKS).filter((p) => u.owned.includes(PACKS[p].item)),
    missions: MISSIONS.map((m) => ({ ...m, progress: Math.min(dl[m.key], m.goal), claimed: dl.claimed.includes(m.id) })),
    login: loginState(u), event: activeEvent(today()), bag: u.bag, topic: topicOf(today()),
  };
}

// ===================== Cửa hàng: hàng nổi bật xoay vòng mỗi ngày (kiểu Fortnite Item Shop) =====================
function seeded(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function featured() {
  const d = today();
  const rnd = seeded(Number(d.replaceAll('-', '')));
  const pool = ITEMS.filter((i) => i.price > 0 && !i.hidden);
  const ids = [];
  while (ids.length < 4 && pool.length) ids.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0].id);
  return { date: d, ids, discount: 0.2 };
}
function priceOf(item) {
  const f = featured();
  return f.ids.includes(item.id) ? Math.round(item.price * (1 - f.discount)) : item.price;
}

// ===================== Lượt chơi (vượt ải / bài kiểm tra) =====================
const runs = new Map();
function newRun(u, kind, packs, n, preset) {
  for (const [k, r] of runs) if (Date.now() - r.created > 3600e3) runs.delete(k);
  // Xáo trộn đáp án cho từng câu, ghi nhớ vị trí đáp án đúng.
  const qs = preset || shuffle(QUESTIONS.filter((q) => packs.includes(q.pack))).slice(0, n).map((q) => {
    const order = shuffle([0, 1, 2, 3]);
    return { ...q, options: order.map((i) => q.options[i]), a: order.indexOf(q.a) };
  });
  const run = { id: crypto.randomUUID(), user: u.name, kind, qs, next: 0, hearts: 3, streak: 0, correct: 0, coins: 0, done: false, created: Date.now() };
  runs.set(run.id, run);
  return run;
}
function getRun(u, id, kind) {
  const r = runs.get(id);
  if (!r || r.user !== u.name || r.kind !== kind) fail('Lượt chơi không tồn tại hoặc đã hết hạn');
  return r;
}
const publicQ = (q) => ({ q: q.q, options: q.options, pack: q.pack });

// Chủ đề bài thi đổi mỗi ngày (xoay vòng 7 chủ đề)
function topicOf(dateKey) { return TOPICS[Math.floor(Date.parse(dateKey) / 86400000) % TOPICS.length]; }

// Ca thi chung: cả lớp trong cùng 10 phút nhận cùng đề, cùng thứ tự đáp án → nhìn bài nhau mới có nghĩa.
const EXAM_SLOT = 600e3;
const examCache = new Map();
function examSet(ca = Math.floor(Date.now() / EXAM_SLOT)) {
  if (!examCache.has(ca)) {
    const rnd = seeded(ca * 7919 + 13);
    const topic = topicOf(new Date(ca * EXAM_SLOT).toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }));
    // ưu tiên câu thuộc chủ đề hôm nay, thiếu thì bù bằng câu Việt Nam khác
    const main = QUESTIONS.filter((q) => (topic.id === 'mix' ? q.pack === 'vn' : q.topic === topic.id));
    const rest = QUESTIONS.filter((q) => q.pack === 'vn' && !main.includes(q));
    const qs = [];
    while (qs.length < 10) {
      const pool = main.length ? main : rest;
      const q = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
      const order = [0, 1, 2, 3];
      for (let i = 3; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      qs.push({ ...q, options: order.map((i) => q.options[i]), a: order.indexOf(q.a) });
    }
    examCache.set(ca, qs);
    if (examCache.size > 12) examCache.delete(examCache.keys().next().value);
  }
  return { ca, qs: examCache.get(ca) };
}
// Bài làm của bạn ảo: mỗi bạn một trình độ (55–90%), làm dần theo thời gian của ca thi.
function npcPaper(ca, seat) {
  const { qs } = examSet(ca);
  const rnd = seeded(ca * 131 + seat * 977 + 1);
  const skill = 0.55 + rnd() * 0.35;
  const elapsed = (Date.now() - ca * EXAM_SLOT) / 1000;
  const progress = Math.min(10, 2 + Math.floor(elapsed / (18 + (seat % 5) * 5)));
  return qs.map((q, i) => {
    const r1 = rnd(), r2 = rnd();
    if (i >= progress) return null;
    return r1 < skill ? q.a : [0, 1, 2, 3].filter((k) => k !== q.a)[Math.floor(r2 * 3)];
  });
}

function rollChest(u, run) {
  const perfect = run.correct === run.qs.length;
  const reward = { coins: Math.round((100 + run.hearts * 30) * coinMul()), gems: 0, item: null, tier: 'rare' };
  const unowned = (rar) => ITEMS.filter((i) => !i.hidden && i.price > 0 && i.type !== 'course' && rar.includes(i.rarity) && !u.owned.includes(i.id));
  const r = Math.random();
  let pool = [];
  if (r < (perfect ? 0.35 : 0.12)) { pool = unowned(['epic', 'legendary']); reward.tier = 'legendary'; }
  else if (r < (perfect ? 0.7 : 0.4)) { pool = unowned(['common', 'rare']); reward.tier = 'epic'; }
  if (pool.length) { const it = pool[Math.floor(Math.random() * pool.length)]; reward.item = it.id; u.owned.push(it.id); }
  else reward.gems += perfect ? 3 : 1;
  if (perfect) { reward.gems += 2; u.stats.perfect++; }
  grant(u, reward);
  return reward;
}

// ===================== REST API =====================
function authUser(req) {
  const t = (req.headers.authorization || '').replace(/^Bearer\s+/, '');
  const name = t && db.sessions[t];
  return name ? db.users[name] : null;
}
function need(u) { if (!u) fail('Bạn cần đăng nhập', 401); return u; }
function issueToken(u) { const t = crypto.randomBytes(24).toString('hex'); db.sessions[t] = u.name.toLowerCase(); save(); return t; }

const routes = {
  'POST /api/register': ({ body }) => {
    const name = String(body.name || '').trim();
    const pw = String(body.password || '');
    if (!/^[\p{L}\p{N}_ .-]{3,20}$/u.test(name)) fail('Tên 3–20 ký tự (chữ, số, _ . -)');
    if (pw.length < 4) fail('Mật khẩu tối thiểu 4 ký tự');
    const key = name.toLowerCase();
    if (db.users[key]) fail('Tên đã được sử dụng');
    const u = newUser(name, pw);
    db.users[key] = u;
    return { token: issueToken(u), profile: profile(u) };
  },
  'POST /api/login': ({ body }) => {
    const u = db.users[String(body.name || '').trim().toLowerCase()];
    if (!u || hashPw(String(body.password || ''), u.salt) !== u.hash) fail('Sai tên hoặc mật khẩu', 401);
    return { token: issueToken(u), profile: profile(u) };
  },
  'POST /api/logout': ({ req }) => {
    const t = (req.headers.authorization || '').replace(/^Bearer\s+/, '');
    delete db.sessions[t]; save();
    return { ok: true };
  },
  'GET /api/me': ({ user }) => profile(need(user)),

  'POST /api/daily/claim': ({ user }) => {
    const u = need(user);
    const st = loginState(u);
    if (st.claimedToday) fail('Hôm nay bạn đã điểm danh rồi');
    const streak = st.streak + 1;
    const reward = LOGIN_REWARDS[(streak - 1) % 7];
    grant(u, reward);
    u.login = { last: today(), streak };
    save();
    return { reward, profile: profile(u) };
  },
  'POST /api/mission/claim': ({ user, body }) => {
    const u = need(user);
    const m = MISSIONS.find((x) => x.id === body.id);
    const dl = daily(u);
    if (!m) fail('Nhiệm vụ không tồn tại');
    if (dl.claimed.includes(m.id)) fail('Đã nhận thưởng');
    if (dl[m.key] < m.goal) fail('Chưa hoàn thành nhiệm vụ');
    dl.claimed.push(m.id);
    grant(u, m.reward);
    save();
    return { reward: m.reward, profile: profile(u) };
  },

  'GET /api/shop/featured': () => featured(),
  'POST /api/shop/buy': ({ user, body }) => {
    const u = need(user);
    const it = ITEM_MAP[body.id];
    if (!it || it.hidden) fail('Vật phẩm không tồn tại');
    if (u.owned.includes(it.id)) fail('Bạn đã sở hữu vật phẩm này');
    const cur = it.currency === 'gems' ? 'gems' : 'coins';
    const price = priceOf(it);
    if (u[cur] < price) fail(cur === 'gems' ? 'Không đủ kim cương' : 'Không đủ xu');
    u[cur] -= price;
    u.owned.push(it.id);
    save();
    return { profile: profile(u) };
  },
  'POST /api/equip': ({ user, body }) => {
    const u = need(user);
    const it = ITEM_MAP[body.id];
    if (!it || !u.owned.includes(it.id) || ['course', 'tool', 'collect'].includes(it.type)) fail('Không thể trang bị');
    u.equipped[it.type] = it.id;
    save();
    return { profile: profile(u) };
  },

  'POST /api/quest/start': ({ user, body }) => {
    const u = need(user);
    const pack = PACKS[body.pack] ? body.pack : 'vn';
    if (!u.owned.includes(PACKS[pack].item)) fail('Bạn cần mở khóa khóa học này trong Cửa hàng');
    const run = newRun(u, 'quest', [pack], 10);
    return { runId: run.id, questions: run.qs.map(publicQ), hearts: run.hearts, mul: coinMul() };
  },
  'POST /api/quest/answer': ({ user, body }) => {
    const u = need(user);
    const run = getRun(u, body.runId, 'quest');
    if (run.done || run.hearts <= 0) fail('Lượt chơi đã kết thúc');
    if (body.i !== run.next) fail('Sai thứ tự câu hỏi');
    const q = run.qs[run.next++];
    const ok = body.choice === q.a;
    const dl = daily(u);
    let coins = 0;
    u.stats.answered++;
    if (ok) {
      run.streak++; run.correct++;
      coins = Math.round((10 + 5 * Math.min(run.streak - 1, 4)) * coinMul());
      run.coins += coins; u.coins += coins; u.xp += 10;
      u.stats.correct++; dl.correct++;
    } else { run.hearts--; run.streak = 0; }
    const failed = run.hearts <= 0;
    const finished = run.next >= run.qs.length;
    if (failed) run.done = true;
    save();
    return { correct: ok, answer: q.a, exp: q.exp, coins, hearts: run.hearts, streak: run.streak, failed, finished, coinsTotal: u.coins };
  },
  'POST /api/quest/finish': ({ user, body }) => {
    const u = need(user);
    const run = getRun(u, body.runId, 'quest');
    if (run.rewarded) fail('Đã nhận rương');
    run.rewarded = true; run.done = true;
    let reward;
    if (run.hearts > 0 && run.next >= run.qs.length) {
      reward = rollChest(u, run);
      u.stats.runs++; daily(u).runs++;
    } else {
      reward = { coins: 20, gems: 0, item: null, tier: 'common' };
      grant(u, reward);
    }
    save();
    return { reward, correct: run.correct, total: run.qs.length, earned: run.coins, profile: profile(u) };
  },

  'POST /api/exam/start': ({ user }) => {
    const u = need(user);
    const { ca, qs } = examSet();
    const run = newRun(u, 'exam', null, 10, qs);
    return { examId: run.id, ca, topic: topicOf(today()), questions: run.qs.map(publicQ), seconds: 360, mul: coinMul() };
  },
  // Tờ bài làm của các bạn ảo trong ca thi hiện tại (để hiển thị trên bàn / khi quay cóp).
  'GET /api/papers/npc': ({ user, url }) => {
    need(user);
    const ca = Math.floor(Date.now() / EXAM_SLOT);
    const seats = String(url.searchParams.get('seats') || '').split(',').map(Number)
      .filter((s) => Number.isInteger(s) && s >= 0 && s < SEAT_COUNT).slice(0, SEAT_COUNT);
    return { ca, papers: Object.fromEntries(seats.map((s) => [s, npcPaper(ca, s)])) };
  },
  'POST /api/exam/submit': ({ user, body }) => {
    const u = need(user);
    const run = getRun(u, body.examId, 'exam');
    if (run.done) fail('Bài đã nộp');
    run.done = true;
    const answers = Array.isArray(body.answers) ? body.answers : [];
    const caught = Math.max(0, Math.min(run.qs.length, Number(body.caught) || 0));
    const results = run.qs.map((q, i) => ({ q: q.q, options: q.options, answer: q.a, yours: answers[i] ?? null, exp: q.exp }));
    const correct = results.filter((r) => r.yours === r.answer).length;
    const coins = Math.max(0, Math.round(correct * 15 * coinMul()) - caught * 20);
    const dl = daily(u);
    u.coins += coins; u.xp += correct * 10;
    u.stats.correct += correct; u.stats.answered += run.qs.length; u.stats.exams++;
    dl.correct += correct; dl.exams++;
    save();
    return { correct, total: run.qs.length, score: Math.round((correct / run.qs.length) * 100) / 10, coins, caught, results, profile: profile(u) };
  },

  'GET /api/leaderboard': () => Object.values(db.users)
    .sort((a, b) => b.xp - a.xp).slice(0, 20)
    .map((u) => ({ name: u.name, level: level(u.xp), xp: u.xp, correct: u.stats.correct, perfect: u.stats.perfect })),
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e5) { reject(new Error('Payload quá lớn')); req.destroy(); } });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('JSON không hợp lệ')); } });
  });
}
function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.glb': 'model/gltf-binary' };
function serveStatic(pathname, res) {
  let file;
  try { file = path.normalize(path.join(PUBLIC_DIR, decodeURIComponent(pathname))); } catch { res.writeHead(400); return res.end(); }
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
  if (pathname.endsWith('/')) file = path.join(file, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/api/')) return serveStatic(url.pathname, res);
  const handler = routes[`${req.method} ${url.pathname}`];
  if (!handler) return json(res, 404, { error: 'API không tồn tại' });
  try {
    const body = req.method === 'POST' ? await readBody(req) : {};
    json(res, 200, await handler({ req, body, user: authUser(req), url }));
  } catch (e) {
    json(res, e.status || 400, { error: e.message });
  }
});

// ===================== WebSocket: phòng học thời gian thực =====================
const wss = new WebSocketServer({ server, path: '/ws' });
const room = { players: new Map(), seats: Array(SEAT_COUNT).fill(null), strokes: [] };
const sockets = new Set();
let nextId = 1;

const send = (ws, msg) => ws.readyState === 1 && ws.send(JSON.stringify(msg));
function broadcast(msg, except) {
  const s = JSON.stringify(msg);
  for (const ws of sockets) if (ws !== except && ws.readyState === 1) ws.send(s);
}
const broadcastSeats = () => broadcast({ t: 'seats', seats: room.seats });
const num = (v, lim = 50) => Math.max(-lim, Math.min(lim, Number(v) || 0));
const vec = (p) => (Array.isArray(p) ? [num(p[0]), Math.max(0, Math.min(3, Number(p[1]) || 0)), num(p[2])] : [0, 0, 0]);   // y: nhảy

function freeSeat(id) { room.seats = room.seats.map((s) => (s === id ? null : s)); }
function takeSeat(id, seat) {
  if (!Number.isInteger(seat) || seat < 0 || seat >= SEAT_COUNT) return null;
  if (room.seats[seat] !== null && room.seats[seat] !== id) return null;
  freeSeat(id);
  room.seats[seat] = id;
  return seat;
}
function leave(ws, reason = 'left') {
  if (!room.players.has(ws.pid)) return;
  room.players.delete(ws.pid);
  freeSeat(ws.pid);
  bmLeave(ws.pid, reason);
  broadcast({ t: 'leave', id: ws.pid });
  broadcastSeats();
}

// ===================== Cầu lông: nhiều trận song song trên "một" sân =====================
// Ai vào sân cũng có phiên riêng (đấu với máy). Muốn đánh với người thật thì mời — người nhận lời vào chung phiên.
// Mọi người chỉ thấy một sân; mỗi máy chỉ hiển thị người chơi của trận mình (hoặc trận nổi bật nếu đang đứng xem).
const matches = new Map();
const invites = new Map();          // `${mid}:${pid người được mời}` → hạn
let nextMid = 1;
const PAUSE_MAX = 120e3;
const vec3 = (p) => (Array.isArray(p) && p.length === 3 ? p.map((n) => num(n, 60)) : null);
const otherSide = (s) => (s === 'A' ? 'B' : 'A');

function newMatch() {
  const m = { id: nextMid++, A: null, B: null, names: { A: '', B: '' }, score: { A: 0, B: 0 }, serving: 'A', rally: 0, lastHitter: null, over: null, paused: null };
  matches.set(m.id, m);
  return m;
}
const matchPublic = (m) => ({ id: m.id, A: m.A, B: m.B, names: m.names, score: m.score, serving: m.serving, rally: m.rally, over: m.over,
  paused: m.paused && { side: m.paused.side, name: m.paused.name, until: m.paused.until } });
const broadcastBm = () => broadcast({ t: 'bm', matches: [...matches.values()].map(matchPublic) });
function matchOf(pid) { for (const m of matches.values()) if (m.A === pid || m.B === pid) return m; return null; }
const sideIn = (m, pid) => (m.A === pid ? 'A' : m.B === pid ? 'B' : null);
function resetMatch(m) { clearTimeout(m.pauseTimer); Object.assign(m, { score: { A: 0, B: 0 }, over: null, lastHitter: null, paused: null }); m.rally++; }
function sockOf(pid) { for (const o of sockets) if (o.pid === pid) return o; return null; }
function notice(pid, text, kind = 'info') { const o = pid != null && sockOf(pid); if (o) send(o, { t: 'bm_notice', text, kind }); }

function bmLeave(pid, reason = 'left') {
  const m = matchOf(pid);
  if (!m) return;
  const side = sideIn(m, pid);
  const name = m.names[side];
  const midGame = m.A && m.B && !m.over && (m.score.A + m.score.B > 0 || m.lastHitter);
  m[side] = null;
  m.names[side] = '';
  const other = m[otherSide(side)];
  if (other != null) {
    notice(other, reason === 'disconnect' ? `📴 ${name} mất kết nối — trận kết thúc, bạn tiếp tục đấu với máy`
      : reason === 'timeout' ? `⌛ ${name} tạm dừng quá 2 phút — trận kết thúc`
      : `🚪 ${name} đã rời trận${midGame ? ' khi chưa hết ván' : ''} — bạn tiếp tục đấu với máy`, 'gold');
  }
  if (m.A == null && m.B == null) { clearTimeout(m.pauseTimer); matches.delete(m.id); } else resetMatch(m);
  broadcastBm();
}

function handleBadminton(ws, pl, u, msg) {
  const m = pl && matchOf(pl.id);
  const side = m && sideIn(m, pl.id);
  const opp = m && m[otherSide(side)];
  switch (msg.t) {
    case 'bm_join': {                      // vào sân → phiên riêng
      if (!pl || pl.zone !== 'yard') return;
      bmLeave(pl.id);
      const nm = newMatch();
      const s = msg.side === 'B' ? 'B' : 'A';
      nm[s] = pl.id; nm.names[s] = pl.name; nm.serving = s;
      broadcastBm();
      break;
    }
    case 'bm_leave': if (pl) bmLeave(pl.id); break;
    case 'bm_invite': {
      const to = sockOf(Number(msg.to));
      if (!m) return notice(ws.pid, 'Hãy vào sân cầu lông trước khi mời bạn', 'err');
      if (m.A != null && m.B != null) return notice(ws.pid, 'Trận đã đủ 2 người', 'err');
      if (!to || to.pid === ws.pid) return notice(ws.pid, 'Người này không còn online', 'err');
      if (Date.now() - (ws.lastInvite || 0) < 2000) return;
      ws.lastInvite = Date.now();
      invites.set(`${m.id}:${to.pid}`, Date.now() + 60e3);
      send(to, { t: 'bm_invite', mid: m.id, from: ws.pid, fromName: u.name });
      notice(ws.pid, `📨 Đã gửi lời mời tới ${to.user.name}`, 'ok');
      break;
    }
    case 'bm_accept': {                    // người nhận lời phải đã vào sân trường (client tự đưa ra sân trước)
      const key = `${msg.mid}:${ws.pid}`;
      const exp = invites.get(key);
      invites.delete(key);
      const target = matches.get(msg.mid);
      if (!exp || exp < Date.now() || !target) return notice(ws.pid, 'Lời mời đã hết hạn', 'err');
      if (!pl || pl.zone !== 'yard') return;
      if (m && m !== target) bmLeave(pl.id);
      const free = target.A == null ? 'A' : target.B == null ? 'B' : null;
      if (!free) return notice(ws.pid, 'Trận đã đủ người', 'err');
      target[free] = pl.id; target.names[free] = pl.name;
      resetMatch(target);
      target.serving = otherSide(free);    // chủ phòng giao trước
      notice(target[otherSide(free)], `✅ ${pl.name} đã nhận lời — vào trận!`, 'ok');
      broadcastBm();
      break;
    }
    case 'bm_decline': {
      invites.delete(`${msg.mid}:${ws.pid}`);
      const target = matches.get(msg.mid);
      if (target) for (const s of ['A', 'B']) notice(target[s], `🙅 ${u.name} đã từ chối lời mời`, 'err');
      break;
    }
    case 'bm_pause': {                     // tạm dừng khi chưa hết ván, tối đa 2 phút
      if (!m || m.A == null || m.B == null || m.over || m.paused) return;
      m.paused = { side, name: pl.name, until: Date.now() + PAUSE_MAX };
      const pid = pl.id;
      m.pauseTimer = setTimeout(() => { if (m.paused?.side === side && m[side] === pid) bmLeave(pid, 'timeout'); }, PAUSE_MAX);
      notice(opp, `⏸ ${pl.name} xin tạm dừng trận (tối đa 2 phút)`, 'gold');
      broadcastBm();
      break;
    }
    case 'bm_resume': {
      if (!m?.paused || m.paused.side !== side) return;
      clearTimeout(m.pauseTimer);
      m.paused = null;
      m.lastHitter = null;
      m.rally++;                           // đánh lại điểm đang dở
      notice(opp, `▶️ ${pl.name} đã quay lại — tiếp tục trận!`, 'ok');
      broadcastBm();
      break;
    }
    case 'bm_hit': {
      if (!m || m.A == null || m.B == null || msg.rally !== m.rally || m.over || m.paused) return;
      const p = vec3(msg.p), v = vec3(msg.v);
      if (!p || !v || Math.hypot(...v) > 40) return;
      m.lastHitter = side;
      broadcast({ t: 'bm_hit', mid: m.id, side, p, v, rally: m.rally, type: String(msg.type || '').slice(0, 8) }, ws);
      break;
    }
    case 'bm_land': {
      if (!m || m.A == null || m.B == null || msg.rally !== m.rally || !m.lastHitter || m.over || m.paused) return;
      const { winner } = rallyWinner(m.lastHitter, num(msg.x, 60), num(msg.z, 60));
      m.score[winner]++;
      m.serving = winner;
      m.lastHitter = null;
      m.rally++;
      m.over = gameOver(m.score);
      if (m.over) {
        const w = sockOf(m[m.over])?.user;
        if (w) { w.coins += BM.winCoins; w.xp += 20; save(); }
        const rally = m.rally;
        setTimeout(() => { if (matches.get(m.id) === m && m.rally === rally) { resetMatch(m); broadcastBm(); } }, 6000);
      }
      broadcastBm();
      break;
    }
  }
}

// ===================== Xã hội: bạn bè, ra câu hỏi, trao đổi đồ, oẳn tù tì, đánh nhau kiểu Minecraft =====================
const userKey = (u) => u.name.toLowerCase();
const sockOfUser = (u) => [...sockets].find((o) => o.user === u && o.readyState === 1) || null;
function pushProfile(u) { const o = sockOfUser(u); if (o) send(o, { t: 'profile', profile: profile(u) }); }
function friendList(u) {
  return (u.friends || []).map((k) => db.users[k]).filter(Boolean)
    .map((f) => { const o = sockOfUser(f); return { name: f.name, online: !!o, id: o?.pid ?? null, level: level(f.xp) }; });
}
function pushFriends(u) { const o = sockOfUser(u); if (o) send(o, { t: 'friends', friends: friendList(u) }); }
const friendReqs = new Map();   // `${từ}>${tới}` (key user) → hạn

// ---- Câu hỏi trên bảng (cần Phấn Ra Đề) ----
let quiz = null;                // { id, byPid, byUser, q, options, answer, endsAt, answered: Set, winners: [] }
let nextQuiz = 1;
const QUIZ_TIME = 40e3;
function endQuiz() {
  if (!quiz) return;
  const q = quiz;
  quiz = null;
  if (q.winners.length) { q.byUser.coins += 5 * q.winners.length; save(); pushProfile(q.byUser); }
  broadcast({ t: 'quiz_end', id: q.id, by: q.byUser.name, answer: q.answer, options: q.options, winners: q.winners });
}

// ---- Trao đổi đồ ----
const trades = new Map();       // id → { id, a: user, b: user, give: {items, flowers}, want: {items, flowers}, exp }
let nextTrade = 1;
function tradeableOf(u) {
  return u.owned.filter((id) => isTradeable(ITEM_MAP[id]));
}
function cleanOffer(o) {
  return {
    items: [...new Set((Array.isArray(o?.items) ? o.items : []).map(String))].slice(0, 12),
    flowers: Math.max(0, Math.min(999, Math.floor(Number(o?.flowers) || 0))),
  };
}
function hasOffer(u, o) { return o.items.every((id) => u.owned.includes(id) && isTradeable(ITEM_MAP[id])) && (u.bag?.[FLOWER] || 0) >= o.flowers; }
function moveOffer(from, to, o) {
  for (const id of o.items) {
    from.owned = from.owned.filter((x) => x !== id);
    const it = ITEM_MAP[id];
    if (from.equipped[it.type] === id) from.equipped[it.type] = DEFAULT_EQUIPPED[it.type];
    if (!to.owned.includes(id)) to.owned.push(id);
  }
  from.bag[FLOWER] = (from.bag[FLOWER] || 0) - o.flowers;
  to.bag[FLOWER] = (to.bag[FLOWER] || 0) + o.flowers;
}
const offerText = (o) => [...o.items.map((id) => `${ITEM_MAP[id].icon} ${ITEM_MAP[id].name}`), o.flowers ? `🌸 ${o.flowers} Hoa Điểm 10` : ''].filter(Boolean).join(', ') || '(không có gì)';

// ---- Oẳn tù tì ----
const rpsGames = new Map();     // id → { id, a: pid, b: pid, picks: {}, timer }
let nextRps = 1;
const BEATS = { rock: 'scissors', scissors: 'paper', paper: 'rock' };
function finishRps(g) {
  rpsGames.delete(g.id);
  clearTimeout(g.timer);
  const pa = g.picks[g.a], pb = g.picks[g.b];
  let winner = null;
  if (pa && !pb) winner = g.a; else if (pb && !pa) winner = g.b;
  else if (pa && pb && pa !== pb) winner = BEATS[pa] === pb ? g.a : g.b;
  const name = (pid) => sockOf(pid)?.user.name || '?';
  broadcast({ t: 'rps_result', id: g.id, a: g.a, b: g.b, aName: name(g.a), bName: name(g.b), picks: { a: pa || null, b: pb || null }, winner });
}

function handleSocial(ws, pl, u, m) {
  const target = m.to != null ? sockOf(Number(m.to)) : null;
  switch (m.t) {
    // ----- bạn bè -----
    case 'friend_req': {
      if (!target || target === ws) return;
      const tu = target.user;
      if ((u.friends || []).includes(userKey(tu))) return notice(ws.pid, `${tu.name} đã là bạn của bạn`, 'info');
      friendReqs.set(`${userKey(u)}>${userKey(tu)}`, Date.now() + 120e3);
      send(target, { t: 'friend_req', from: ws.pid, fromName: u.name });
      notice(ws.pid, `💌 Đã gửi lời mời kết bạn tới ${tu.name}`, 'ok');
      break;
    }
    case 'friend_accept': {
      const from = sockOf(Number(m.from));
      if (!from) return notice(ws.pid, 'Người gửi đã offline', 'err');
      const key = `${userKey(from.user)}>${userKey(u)}`;
      if (!(friendReqs.get(key) > Date.now())) return notice(ws.pid, 'Lời mời kết bạn đã hết hạn', 'err');
      friendReqs.delete(key);
      for (const [x, y] of [[u, from.user], [from.user, u]]) { x.friends ||= []; if (!x.friends.includes(userKey(y))) x.friends.push(userKey(y)); }
      save();
      pushFriends(u); pushFriends(from.user);
      notice(from.pid, `🤝 ${u.name} đã đồng ý kết bạn!`, 'ok');
      notice(ws.pid, `🤝 Bạn và ${from.user.name} đã là bạn bè`, 'ok');
      break;
    }
    case 'friend_decline': { const from = sockOf(Number(m.from)); if (from) notice(from.pid, `${u.name} chưa đồng ý kết bạn`, 'info'); break; }
    case 'friend_remove': {
      const key = String(m.name || '').toLowerCase();
      const f = db.users[key];
      u.friends = (u.friends || []).filter((k) => k !== key);
      if (f) f.friends = (f.friends || []).filter((k) => k !== userKey(u));
      save();
      pushFriends(u); if (f) pushFriends(f);
      break;
    }

    // ----- ra câu hỏi trên bảng -----
    case 'quiz_create': {
      if (!pl || pl.zone !== 'class') return notice(ws.pid, 'Hãy lên bảng trong lớp học để ra câu hỏi', 'err');
      if (!u.owned.includes('tool_quizchalk')) return notice(ws.pid, 'Bạn cần 🪄 Phấn Ra Đề (mua ở Cửa hàng) để ra câu hỏi', 'err');
      if (quiz) return notice(ws.pid, 'Đang có một câu hỏi khác, chờ chút nhé', 'err');
      if (Date.now() - (u.lastQuiz || 0) < 60e3) return notice(ws.pid, 'Mỗi phút chỉ được ra 1 câu hỏi', 'err');
      const q = String(m.q || '').trim().slice(0, 160);
      const options = (Array.isArray(m.options) ? m.options : []).slice(0, 4).map((o) => String(o || '').trim().slice(0, 60));
      const answer = Number(m.answer);
      if (q.length < 5 || options.length !== 4 || options.some((o) => !o) || !(answer >= 0 && answer < 4)) return notice(ws.pid, 'Câu hỏi cần nội dung và đủ 4 đáp án', 'err');
      u.lastQuiz = Date.now();
      // Phấn Ra Đề dùng 1 lần: ra đề xong là hết, muốn ra tiếp phải mua lại
      u.owned = u.owned.filter((id) => id !== 'tool_quizchalk');
      save();
      pushProfile(u);
      notice(ws.pid, '🪄 Đã dùng Phấn Ra Đề — mua viên mới ở Cửa hàng nếu muốn ra đề tiếp', 'info');
      quiz = { id: nextQuiz++, byPid: ws.pid, byUser: u, q, options, answer, endsAt: Date.now() + QUIZ_TIME, answered: new Set([userKey(u)]), winners: [] };
      quiz.timer = setTimeout(endQuiz, QUIZ_TIME);
      broadcast({ t: 'quiz', id: quiz.id, by: u.name, byPid: ws.pid, q, options, endsAt: quiz.endsAt });
      break;
    }
    case 'quiz_answer': {
      if (!quiz || m.id !== quiz.id || quiz.answered.has(userKey(u))) return;
      quiz.answered.add(userKey(u));
      const correct = Number(m.choice) === quiz.answer;
      if (correct) {
        u.bag[FLOWER] = (u.bag[FLOWER] || 0) + 1;
        u.coins += 10;
        save();
        quiz.winners.push(u.name);
        pushProfile(u);
      }
      send(ws, { t: 'quiz_result', id: quiz.id, correct, answer: quiz.answer });
      break;
    }

    // ----- trao đổi đồ -----
    case 'trade_inv': {               // xem đồ có thể đổi của người kia
      if (!target) return;
      send(ws, { t: 'trade_inv', id: target.pid, name: target.user.name, items: tradeableOf(target.user), flowers: target.user.bag?.[FLOWER] || 0 });
      break;
    }
    case 'trade_req': {
      if (!target || target === ws) return;
      const give = cleanOffer(m.give), want = cleanOffer(m.want);
      if (!give.items.length && !give.flowers && !want.items.length && !want.flowers) return notice(ws.pid, 'Hãy chọn ít nhất một món', 'err');
      if (!hasOffer(u, give)) return notice(ws.pid, 'Bạn không còn đủ đồ để đưa', 'err');
      if (!hasOffer(target.user, want)) return notice(ws.pid, `${target.user.name} không còn món bạn muốn`, 'err');
      const tr = { id: nextTrade++, a: u, b: target.user, give, want, exp: Date.now() + 60e3 };
      trades.set(tr.id, tr);
      send(target, { t: 'trade_req', id: tr.id, from: ws.pid, fromName: u.name, giveText: offerText(give), wantText: offerText(want) });
      notice(ws.pid, `🔁 Đã gửi đề nghị trao đổi tới ${target.user.name}`, 'ok');
      break;
    }
    case 'trade_accept': {
      const tr = trades.get(Number(m.id));
      trades.delete(Number(m.id));
      if (!tr || tr.b !== u || tr.exp < Date.now()) return notice(ws.pid, 'Đề nghị trao đổi đã hết hạn', 'err');
      if (!hasOffer(tr.a, tr.give) || !hasOffer(tr.b, tr.want)) return notice(ws.pid, 'Một bên không còn đủ đồ — huỷ trao đổi', 'err');
      moveOffer(tr.a, tr.b, tr.give);   // đổi cùng lúc cho cả hai (không có trạng thái nửa vời)
      moveOffer(tr.b, tr.a, tr.want);
      save();
      pushProfile(tr.a); pushProfile(tr.b);
      for (const x of [tr.a, tr.b]) { const o = sockOfUser(x); if (o) notice(o.pid, `✅ Trao đổi thành công giữa ${tr.a.name} và ${tr.b.name}!`, 'ok'); }
      for (const x of [tr.a, tr.b]) { const o = sockOfUser(x); const p = o && room.players.get(o.pid); if (p) { p.look = x.equipped; broadcast({ t: 'look', id: p.id, look: p.look }); } }
      break;
    }
    case 'trade_decline': {
      const tr = trades.get(Number(m.id));
      trades.delete(Number(m.id));
      if (tr) { const o = sockOfUser(tr.a); if (o) notice(o.pid, `🙅 ${u.name} từ chối trao đổi`, 'err'); }
      break;
    }

    // ----- oẳn tù tì -----
    case 'rps_challenge': {
      if (!target || target === ws) return;
      if ([...rpsGames.values()].some((g) => [g.a, g.b].includes(ws.pid))) return;
      const g = { id: nextRps++, a: ws.pid, b: target.pid, picks: {}, accepted: false };
      rpsGames.set(g.id, g);
      g.timer = setTimeout(() => { if (!g.accepted) { rpsGames.delete(g.id); notice(ws.pid, `${target.user.name} không phản hồi`, 'info'); } }, 30e3);
      send(target, { t: 'rps_challenge', id: g.id, from: ws.pid, fromName: u.name });
      notice(ws.pid, `✊ Đã thách ${target.user.name} oẳn tù tì!`, 'ok');
      break;
    }
    case 'rps_accept': {
      const g = rpsGames.get(Number(m.id));
      if (!g || g.b !== ws.pid || g.accepted) return;
      g.accepted = true;
      clearTimeout(g.timer);
      g.timer = setTimeout(() => finishRps(g), 12e3);
      for (const pid of [g.a, g.b]) { const o = sockOf(pid); if (o) send(o, { t: 'rps_start', id: g.id, vs: sockOf(pid === g.a ? g.b : g.a)?.user.name }); }
      break;
    }
    case 'rps_decline': {
      const g = rpsGames.get(Number(m.id));
      if (g && g.b === ws.pid) { rpsGames.delete(g.id); clearTimeout(g.timer); notice(g.a, `${u.name} từ chối oẳn tù tì`, 'info'); }
      break;
    }
    case 'rps_pick': {
      const g = rpsGames.get(Number(m.id));
      if (!g || !g.accepted || ![g.a, g.b].includes(ws.pid) || !BEATS[m.pick]) return;
      g.picks[ws.pid] = m.pick;
      if (g.picks[g.a] && g.picks[g.b]) finishRps(g);
      break;
    }

    // ----- đấm kiểu Minecraft: đẩy lùi người bị trúng -----
    case 'hit': {
      if (!pl) return;
      const tp = room.players.get(Number(m.target));
      if (!tp || tp.zone !== pl.zone || Date.now() - (ws.lastHit || 0) < 250) return;
      if (Math.hypot(tp.p[0] - pl.p[0], tp.p[2] - pl.p[2]) > 3) return;
      ws.lastHit = Date.now();
      const dx = tp.p[0] - pl.p[0], dz = tp.p[2] - pl.p[2], d = Math.hypot(dx, dz) || 1;
      const victim = sockOf(tp.id);
      if (victim) send(victim, { t: 'hit', from: pl.id, dir: [dx / d, dz / d] });
      broadcast({ t: 'hurt', id: tp.id, by: pl.id });
      break;
    }
  }
}

function handle(ws, m) {
  const pl = room.players.get(ws.pid);
  const u = ws.user;
  if (m.t?.startsWith('bm_')) return handleBadminton(ws, pl, u, m);
  if (/^(friend_|quiz_|trade_|rps_|hit$)/.test(m.t || '')) return handleSocial(ws, pl, u, m);
  switch (m.t) {
    case 'join': {
      if (pl) return;
      const zone = m.zone === 'yard' ? 'yard' : 'class';
      const seat = zone === 'class' ? takeSeat(ws.pid, m.seat) : null;
      const p = { id: ws.pid, name: u.name, look: u.equipped, zone, p: vec(m.p), r: 0, a: seat !== null ? 'sit|' : 'idle|', seat, paper: null, k: null };
      room.players.set(ws.pid, p);
      broadcast({ t: 'join', player: p });
      broadcastSeats();
      send(ws, { t: 'bm', matches: [...matches.values()].map(matchPublic) });
      break;
    }
    case 'leave': leave(ws); break;
    case 'online':                       // danh sách người đang online để mời đánh cầu
      send(ws, { t: 'online', users: [...sockets].filter((o) => o !== ws && o.readyState === 1).map((o) => {
        const p = room.players.get(o.pid);
        const mm = matchOf(o.pid);
        return { id: o.pid, name: o.user.name, level: level(o.user.xp), where: p ? p.zone : 'menu', playing: !!(mm && mm.A != null && mm.B != null),
          friend: (u.friends || []).includes(o.user.name.toLowerCase()) };
      }), friends: friendList(u) });
      break;
    case 'state':
      if (!pl) return;
      pl.p = vec(m.p); pl.r = num(m.r, 100); pl.a = String(m.a || 'idle|').slice(0, 16); pl.k = vec3(m.k);
      broadcast({ t: 'state', id: pl.id, p: pl.p, r: pl.r, a: pl.a, k: pl.k }, ws);
      break;
    case 'seat': {
      if (!pl) return;
      const s = takeSeat(pl.id, m.seat);
      if (s === null) send(ws, { t: 'seat_denied', seat: m.seat });
      else pl.seat = s;
      broadcastSeats();
      break;
    }
    case 'unseat': if (!pl) return; freeSeat(pl.id); pl.seat = null; broadcastSeats(); break;
    case 'chat': {
      if (!pl) return;
      const text = String(m.text || '').trim().slice(0, 200);
      if (!text) return;
      daily(u).chats++; save();
      broadcast({ t: 'chat', id: pl.id, name: pl.name, text, scope: m.scope === 'near' ? 'near' : 'all' });
      break;
    }
    case 'stroke': {
      if (!pl || !Array.isArray(m.s?.pts)) return;
      const pts = m.s.pts.slice(0, 400).filter((q) => Array.isArray(q)).map(([x, y]) => [+(+x).toFixed(4), +(+y).toFixed(4)]);
      if (pts.length < 1) return;
      const s = { pts, c: String(m.s.c || '#fff').slice(0, 16), w: Math.max(2, Math.min(30, Number(m.s.w) || 6)) };
      room.strokes.push(s);
      if (room.strokes.length > 4000) room.strokes.shift();
      daily(u).board++; save();
      broadcast({ t: 'stroke', s }, ws);
      break;
    }
    case 'paper': {
      if (!pl) return;
      const answers = (Array.isArray(m.answers) ? m.answers : []).slice(0, 10)
        .map((a) => (Number.isInteger(a) && a >= 0 && a < 4 ? a : null));
      pl.paper = { ca: Number(m.ca) || 0, answers, done: !!m.done };
      broadcast({ t: 'paper', id: pl.id, paper: pl.paper }, ws);
      break;
    }
    case 'clear': if (!pl) return; room.strokes = []; broadcast({ t: 'clear', by: pl.name }); break;
    case 'look': if (!pl) return; pl.look = u.equipped; broadcast({ t: 'look', id: pl.id, look: pl.look }); break;
  }
}

wss.on('connection', (ws, req) => {
  const token = new URL(req.url, 'http://localhost').searchParams.get('token');
  const name = token && db.sessions[token];
  const u = name && db.users[name];
  if (!u) { ws.close(4001, 'unauthorized'); return; }
  for (const o of sockets) if (o.user === u) o.close(4002, 'Tài khoản đăng nhập ở nơi khác');
  ws.user = u;
  ws.pid = nextId++;
  sockets.add(ws);
  send(ws, { t: 'welcome', id: ws.pid, players: [...room.players.values()], seats: room.seats, strokes: room.strokes,
    quiz: quiz && { id: quiz.id, by: quiz.byUser.name, byPid: quiz.byPid, q: quiz.q, options: quiz.options, endsAt: quiz.endsAt } });
  send(ws, { t: 'friends', friends: friendList(u) });
  for (const f of u.friends.map((k) => db.users[k]).filter(Boolean)) pushFriends(f);   // báo bạn bè: mình vừa online
  ws.on('message', (raw) => { let m; try { m = JSON.parse(raw); } catch { return; } handle(ws, m); });
  ws.on('close', () => { sockets.delete(ws); leave(ws, 'disconnect'); for (const f of (u.friends || []).map((k) => db.users[k]).filter(Boolean)) pushFriends(f); });
});

server.listen(PORT, () => console.log(`Lớp mình 3D đang chạy tại http://localhost:${PORT}`));
