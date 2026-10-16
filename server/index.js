// Lớp mình 3D server: phục vụ file tĩnh, REST API (tài khoản, kinh tế, câu hỏi) và WebSocket (đồng bộ lớp học).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { ITEMS, ITEM_MAP, DEFAULT_OWNED, DEFAULT_EQUIPPED, PACKS } from '../public/js/data/items.js';
import { activeEvent } from '../public/js/data/events.js';
import { QUESTIONS } from './questions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const DB_FILE = path.join(__dirname, 'db.json');
const PORT = Number(process.env.PORT) || 3000;
const SEAT_COUNT = 30;

// ===================== Lưu trữ (JSON file — thay bằng PostgreSQL khi lên production) =====================
let db = { users: {}, sessions: {} };
try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch { /* lần chạy đầu */ }
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
    daily: null, login: { last: null, streak: 0 }, created: Date.now(),
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
    login: loginState(u), event: activeEvent(today()),
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

// Ca thi chung: cả lớp trong cùng 10 phút nhận cùng đề, cùng thứ tự đáp án → nhìn bài nhau mới có nghĩa.
const EXAM_SLOT = 600e3;
const examCache = new Map();
function examSet(ca = Math.floor(Date.now() / EXAM_SLOT)) {
  if (!examCache.has(ca)) {
    const rnd = seeded(ca * 7919 + 13);
    const pool = QUESTIONS.filter((q) => q.pack === 'vn');
    const qs = [];
    while (qs.length < 10) {
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
    if (!it || !u.owned.includes(it.id) || it.type === 'course') fail('Không thể trang bị');
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
    return { examId: run.id, ca, questions: run.qs.map(publicQ), seconds: 360, mul: coinMul() };
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
const vec = (p) => (Array.isArray(p) ? [num(p[0]), 0, num(p[2])] : [0, 0, 0]);

function freeSeat(id) { room.seats = room.seats.map((s) => (s === id ? null : s)); }
function takeSeat(id, seat) {
  if (!Number.isInteger(seat) || seat < 0 || seat >= SEAT_COUNT) return null;
  if (room.seats[seat] !== null && room.seats[seat] !== id) return null;
  freeSeat(id);
  room.seats[seat] = id;
  return seat;
}
function leave(ws) {
  if (!room.players.has(ws.pid)) return;
  room.players.delete(ws.pid);
  freeSeat(ws.pid);
  broadcast({ t: 'leave', id: ws.pid });
  broadcastSeats();
}

function handle(ws, m) {
  const pl = room.players.get(ws.pid);
  const u = ws.user;
  switch (m.t) {
    case 'join': {
      if (pl) return;
      const seat = takeSeat(ws.pid, m.seat);
      const p = { id: ws.pid, name: u.name, look: u.equipped, p: vec(m.p), r: 0, a: seat !== null ? 'sit|' : 'idle|', seat, paper: null };
      room.players.set(ws.pid, p);
      broadcast({ t: 'join', player: p });
      broadcastSeats();
      break;
    }
    case 'leave': leave(ws); break;
    case 'state':
      if (!pl) return;
      pl.p = vec(m.p); pl.r = num(m.r, 100); pl.a = String(m.a || 'idle|').slice(0, 16);
      broadcast({ t: 'state', id: pl.id, p: pl.p, r: pl.r, a: pl.a }, ws);
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
  send(ws, { t: 'welcome', id: ws.pid, players: [...room.players.values()], seats: room.seats, strokes: room.strokes });
  ws.on('message', (raw) => { let m; try { m = JSON.parse(raw); } catch { return; } handle(ws, m); });
  ws.on('close', () => { sockets.delete(ws); leave(ws); });
});

server.listen(PORT, () => console.log(`Lớp mình 3D đang chạy tại http://localhost:${PORT}`));
