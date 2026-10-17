// Xã hội: người chơi online (bạn bè trên đầu), lời mời (cầu lông / kết bạn / trao đổi / oẳn tù tì),
// ra câu hỏi trên bảng (cần Phấn Ra Đề), trao đổi đồ, oẳn tù tì có cốc đầu.
import { $, esc, toast, openModal, closeModal } from './ui.js';
import { ITEM_MAP, FLOWER, isTradeable } from './data/items.js';

const WHERE = { yard: '🌳 Sân trường', class: '🏫 Lớp học', menu: '🏠 Sảnh / vượt ải' };
const RPS = { rock: '✊', paper: '✋', scissors: '✌️' };

/**
 * c: { send(t, d), S, me, avatarOf(pid), setEmote(action, secs), shake(), inYard(), inMatch(), enterYard(), joinCourt(),
 *      acceptBm(invite), board, openShop(tab), sysChat(text) }
 */
export function createSocial(c) {
  const { S } = c;

  // ---------------- Hàng đợi popup ----------------
  const queue = [];
  let cur = null, curTimer = null;
  function pop(p) { queue.push(p); next(); }
  function next() {
    if (cur || !queue.length) return;
    cur = queue.shift();
    $('#invite-pop .ip-text').innerHTML = cur.html;
    $('#ip-yes').textContent = cur.yes || 'Đồng ý';
    $('#ip-no').textContent = cur.no || 'Từ chối';
    $('#invite-pop').classList.remove('hidden');
    curTimer = setTimeout(() => close(null), cur.ms || 40000);
  }
  function close(choice) {
    if (!cur) return;
    clearTimeout(curTimer);
    const p = cur;
    cur = null;
    $('#invite-pop').classList.add('hidden');
    if (choice === true) p.onYes?.();
    if (choice === false) p.onNo?.();
    setTimeout(next, 250);
  }
  $('#ip-yes').onclick = () => close(true);
  $('#ip-no').onclick = () => close(false);

  // ---------------- Người chơi online ----------------
  function openPeople() {
    $('#online-list').innerHTML = '<p class="sub">Đang tải…</p>';
    openModal('#modal-invite');
    c.send('online');
  }
  function row(u, isFriend) {
    const acts = u.online === false
      ? `<button class="btn sm ghost" data-act="unfriend" data-name="${esc(u.name)}">Huỷ kết bạn</button>`
      : `<button class="btn sm gold" data-act="bm" data-id="${u.id}">🏸 Cầu lông</button>
         <button class="btn sm" data-act="rps" data-id="${u.id}">✊ Oẳn tù tì</button>
         <button class="btn sm" data-act="trade" data-id="${u.id}" data-name="${esc(u.name)}">🔁 Đổi đồ</button>
         ${isFriend ? `<button class="btn sm ghost" data-act="unfriend" data-name="${esc(u.name)}" title="Huỷ kết bạn">✕</button>`
    : `<button class="btn sm" data-act="friend" data-id="${u.id}">➕ Kết bạn</button>`}`;
    const where = u.online === false ? 'offline' : `${WHERE[u.where] || ''}${u.playing ? ' · đang đánh cầu' : ''}`;
    return `<div class="online-row ${u.online === false ? 'off' : ''}"><span class="online-dot ${u.online === false ? 'off' : ''}"></span>
      <div class="grow"><b>${isFriend ? '<span class="fr">⭐</span> ' : ''}${esc(u.name)}</b> <small>Lv ${u.level || 1}</small><br><small>${where}</small></div>
      <div class="acts">${acts}</div></div>`;
  }
  function renderOnline(m) {
    const friends = m.users.filter((u) => u.friend);
    const others = m.users.filter((u) => !u.friend);
    const offline = (m.friends || []).filter((f) => !f.online);
    let html = '';
    if (friends.length || offline.length) {
      html += '<div class="online-sec">⭐ BẠN BÈ</div>' + friends.map((u) => row(u, true)).join('') + offline.map((f) => row({ ...f, online: false }, true)).join('');
    }
    html += `<div class="online-sec">🌏 ĐANG ONLINE (${others.length})</div>` +
      (others.length ? others.map((u) => row(u, false)).join('') : '<p class="sub">Chưa có ai khác online. Gửi link cho bạn bè rồi bấm Làm mới nhé!</p>');
    $('#online-list').innerHTML = html;
  }
  $('#online-list').onclick = (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const id = b.dataset.id != null ? +b.dataset.id : null;
    switch (b.dataset.act) {
      case 'bm':
        // Chưa ở sân / chưa vào sân → tự đưa ra sân & mở phiên riêng rồi mới gửi lời mời
        if (!c.inYard()) c.enterYard();
        if (!c.inMatch()) c.joinCourt();
        c.send('bm_invite', { to: id });
        break;
      case 'rps': c.send('rps_challenge', { to: id }); break;
      case 'trade': closeModal('#modal-invite'); openTrade(id, b.dataset.name); return;
      case 'friend': c.send('friend_req', { to: id }); break;
      case 'unfriend': c.send('friend_remove', { name: b.dataset.name }); setTimeout(() => c.send('online'), 300); return;
    }
    b.disabled = true;
    b.textContent = 'Đã gửi ✓';
  };
  $('#online-refresh').onclick = () => c.send('online');

  // ---------------- Lời mời đến ----------------
  const onBmInvite = (m) => pop({ html: `🏸 <b>${esc(m.fromName)}</b> mời bạn đánh cầu lông ở sân trường!`, yes: '🏸 Nhận lời',
    onYes: () => c.acceptBm(m), onNo: () => c.send('bm_decline', { mid: m.mid }) });
  const onFriendReq = (m) => pop({ html: `💌 <b>${esc(m.fromName)}</b> muốn kết bạn với bạn`, yes: '🤝 Kết bạn',
    onYes: () => c.send('friend_accept', { from: m.from }), onNo: () => c.send('friend_decline', { from: m.from }) });
  const onTradeReq = (m) => pop({ html: `🔁 <b>${esc(m.fromName)}</b> đề nghị trao đổi<br><small>Bạn nhận: <b>${esc(m.giveText)}</b><br>Bạn đưa: <b>${esc(m.wantText)}</b></small>`,
    yes: '✅ Đồng ý đổi', onYes: () => c.send('trade_accept', { id: m.id }), onNo: () => c.send('trade_decline', { id: m.id }), ms: 55000 });
  const onRpsChallenge = (m) => pop({ html: `✊ <b>${esc(m.fromName)}</b> thách bạn oẳn tù tì — thua bị cốc đầu đấy 😆`, yes: 'Chơi luôn!',
    onYes: () => c.send('rps_accept', { id: m.id }), onNo: () => c.send('rps_decline', { id: m.id }), ms: 28000 });
  function onFriends(m) {
    S.friends = m.friends;
    if ($('#modal-invite').classList.contains('open')) c.send('online');
  }

  // ---------------- Oẳn tù tì ----------------
  let rps = null, lastOpp = null, lastOppName = '';
  /** Chơi lại với người vừa đấu gần nhất. Trả về false nếu chưa đấu với ai. */
  function rematch() {
    if (lastOpp == null) return false;
    if (cur && cur.html.includes('Đấu tiếp')) close(null);   // đóng popup kết quả nếu còn đang hiện
    c.send('rps_challenge', { to: lastOpp });
    return true;
  }
  function onRpsStart(m) {
    rps = { id: m.id, left: 10, picked: null };
    $('#rps-title').innerHTML = `Oẳn tù tì với <b>${esc(m.vs)}</b>! Ra cái gì?`;
    for (const b of $('#rps-pop').querySelectorAll('[data-rps]')) { b.classList.remove('on'); b.disabled = false; }
    $('#rps-pop').classList.remove('hidden');
    clearInterval(rps.iv);
    rps.iv = setInterval(() => { if (!rps) return; rps.left--; $('#rps-timer').textContent = `Còn ${Math.max(0, rps.left)} giây — không chọn là thua!`; }, 1000);
    $('#rps-timer').textContent = 'Còn 10 giây — không chọn là thua!';
  }
  $('#rps-pop').onclick = (e) => {
    const b = e.target.closest('[data-rps]');
    if (!b || !rps || rps.picked) return;
    rps.picked = b.dataset.rps;
    b.classList.add('on');
    for (const x of $('#rps-pop').querySelectorAll('[data-rps]')) x.disabled = true;
    c.send('rps_pick', { id: rps.id, pick: rps.picked });
    $('#rps-timer').textContent = 'Đã chọn! Chờ đối thủ…';
  };
  function onRpsResult(m) {
    if (rps?.id === m.id) { clearInterval(rps.iv); rps = null; $('#rps-pop').classList.add('hidden'); }
    const me = S.myId;
    const involved = m.a === me || m.b === me;
    const pa = m.picks.a ? RPS[m.picks.a] : '❔', pb = m.picks.b ? RPS[m.picks.b] : '❔';
    const winName = m.winner === m.a ? m.aName : m.winner === m.b ? m.bName : null;
    const loser = m.winner == null ? null : m.winner === m.a ? m.b : m.a;
    const text = `${esc(m.aName)} ${pa} vs ${pb} ${esc(m.bName)} — ${winName ? `${esc(winName)} thắng và cốc đầu! 👊` : 'Hòa nhau! 🤝'}`;
    if (involved) {
      lastOpp = m.a === me ? m.b : m.a;
      lastOppName = m.a === me ? m.bName : m.aName;
      toast(text, m.winner === me ? 'gold' : m.winner == null ? 'info' : 'err', 5000);
      // Nút chơi lại ngay với người vừa đấu (hoặc bấm phím T bất cứ lúc nào)
      pop({ html: `${text}<br><small>Đấu tiếp với <b>${esc(lastOppName)}</b>?</small>`, yes: '🔁 Chơi lại (T)', no: 'Thôi',
        onYes: () => rematch(), ms: 15000 });
    } else c.sysChat(text.replace(/<[^>]+>/g, ''));
    if (m.winner == null) return;
    // Hiệu ứng: người thắng giơ tay cốc, người thua choáng sao quay
    c.avatarOf(m.winner)?.say('Cốc! 👊');
    const la = c.avatarOf(loser);
    la?.say('Ui da! 😵');
    la?.hurt();
    if (m.winner === me) c.setEmote('bonk', 1.6);
    if (loser === me) { c.setEmote('dizzy', 2.8); c.shake(); }
  }

  // ---------------- Ra câu hỏi trên bảng ----------------
  let qmAnswer = 0;
  function openQuizMaker() {
    if (!S.profile.owned.includes('tool_quizchalk')) {
      toast('Bạn cần <b>🪄 Phấn Ra Đề</b> để ra câu hỏi — có bán ở Cửa hàng (tab Dụng cụ) hoặc rơi từ rương Kho tàng', 'gold', 5000);
      c.openShop('tool');
      return;
    }
    qmAnswer = 0;
    $('#qm-q').value = '';
    $('#qm-opts').innerHTML = [0, 1, 2, 3].map((i) => `<div class="qm-opt"><button class="btn sm ${i === 0 ? 'on' : ''}" data-ans="${i}">${'ABCD'[i]}</button>
      <input maxlength="60" data-opt="${i}" placeholder="Đáp án ${'ABCD'[i]}"></div>`).join('');
    openModal('#modal-quizmake');
    setTimeout(() => $('#qm-q').focus(), 50);
  }
  $('#qm-opts').onclick = (e) => {
    const b = e.target.closest('[data-ans]');
    if (!b) return;
    qmAnswer = +b.dataset.ans;
    for (const x of $('#qm-opts').querySelectorAll('[data-ans]')) x.classList.toggle('on', +x.dataset.ans === qmAnswer);
  };
  $('#qm-send').onclick = () => {
    const q = $('#qm-q').value.trim();
    const options = [...$('#qm-opts').querySelectorAll('[data-opt]')].map((i) => i.value.trim());
    if (q.length < 5 || options.some((o) => !o)) return toast('Nhập câu hỏi và đủ 4 đáp án nhé', 'err');
    c.send('quiz_create', { q, options, answer: qmAnswer });
    closeModal('#modal-quizmake');
  };

  let quiz = null;
  function onQuiz(m) {
    quiz = { ...m, picked: null };
    c.board.setQuiz({ by: m.by, q: m.q, options: m.options });
    const mine = m.byPid === S.myId;
    $('#qp-by').textContent = `❓ ${mine ? 'Câu hỏi của bạn' : 'Câu hỏi của ' + m.by}`;
    $('#qp-q').textContent = m.q;
    $('#qp-opts').innerHTML = mine ? '<p class="hint">Cả trường đang trả lời… bạn được +5 xu cho mỗi người đúng.</p>'
      : m.options.map((o, i) => `<button class="opt" data-qa="${i}">${'ABCD'[i]}. ${esc(o)}</button>`).join('');
    $('#qp-res').textContent = mine ? '' : 'Trả lời đúng nhận 🌸 Hoa Điểm 10 + 10 xu';
    $('#quiz-pop').classList.remove('hidden');
    clearInterval(quiz.iv);
    const tick = () => { if (!quiz) return; const s = Math.max(0, Math.ceil((quiz.endsAt - Date.now()) / 1000)); $('#qp-timer').textContent = `⏱ ${s}s`; };
    tick();
    quiz.iv = setInterval(tick, 500);
  }
  $('#qp-opts').onclick = (e) => {
    const b = e.target.closest('[data-qa]');
    if (!b || !quiz || quiz.picked != null) return;
    quiz.picked = +b.dataset.qa;
    b.classList.add('sel');
    for (const x of $('#qp-opts').querySelectorAll('[data-qa]')) x.disabled = true;
    c.send('quiz_answer', { id: quiz.id, choice: quiz.picked });
  };
  $('#qp-close').onclick = () => $('#quiz-pop').classList.add('hidden');
  function onQuizResult(m) {
    if (!quiz || m.id !== quiz.id) return;
    const btns = [...$('#qp-opts').querySelectorAll('[data-qa]')];
    btns.forEach((b, i) => { if (i === m.answer) b.classList.add('right'); else if (i === quiz.picked) b.classList.add('wrong'); });
    $('#qp-res').innerHTML = m.correct ? '✅ Chính xác! Nhận <b>🌸 1 Hoa Điểm 10</b> + 10 xu' : '❌ Chưa đúng rồi!';
    if (m.correct) toast('🌸 +1 Hoa Điểm 10 · +10 xu', 'ok');
  }
  function onQuizEnd(m) {
    c.board.setQuiz({ by: m.by, q: quiz?.q || '', options: m.options, answer: m.answer });
    setTimeout(() => c.board.setQuiz(null), 7000);
    if (quiz) clearInterval(quiz.iv);
    $('#qp-timer').textContent = 'Hết giờ';
    $('#qp-res').innerHTML = `Đáp án: <b>${'ABCD'[m.answer]}. ${esc(m.options[m.answer])}</b> · ${m.winners.length ? `${m.winners.length} bạn đúng: ${m.winners.slice(0, 8).map(esc).join(', ')}` : 'Chưa ai trả lời đúng'}`;
    for (const b of $('#qp-opts').querySelectorAll('[data-qa]')) { b.disabled = true; if (+b.dataset.qa === m.answer) b.classList.add('right'); }
    quiz = null;
    setTimeout(() => $('#quiz-pop').classList.add('hidden'), 7000);
  }

  // ---------------- Trao đổi đồ ----------------
  let trade = null;
  function itemCell(id, side) {
    const it = ITEM_MAP[id];
    return `<button class="trade-item" data-side="${side}" data-item="${id}"><i>${it.icon}</i>${esc(it.name)}</button>`;
  }
  function openTrade(id, name) {
    trade = { id, name, give: new Set(), want: new Set(), theirFlowers: 0 };
    $('#tr-name').textContent = name;
    const mine = S.profile.owned.filter((x) => isTradeable(ITEM_MAP[x]));
    $('#tr-give').innerHTML = mine.length ? mine.map((x) => itemCell(x, 'give')).join('') : '<p class="hint">Bạn chưa có món nào đổi được (đồ mặc định & khóa học không đổi được)</p>';
    $('#tr-want').innerHTML = '<p class="hint">Đang xem đồ của bạn ấy…</p>';
    $('#tr-give-fl').value = 0; $('#tr-give-fl').max = S.profile.bag?.[FLOWER] || 0;
    $('#tr-want-fl').value = 0;
    openModal('#modal-trade');
    c.send('trade_inv', { to: id });
  }
  function onTradeInv(m) {
    if (!trade || m.id !== trade.id) return;
    trade.theirFlowers = m.flowers;
    $('#tr-want').innerHTML = m.items.length ? m.items.map((x) => itemCell(x, 'want')).join('') : '<p class="hint">Bạn ấy chưa có món nào đổi được</p>';
    $('#tr-want-fl').max = m.flowers;
  }
  $('#modal-trade').addEventListener('click', (e) => {
    const b = e.target.closest('.trade-item');
    if (!b || !trade) return;
    const set = trade[b.dataset.side];
    set.has(b.dataset.item) ? set.delete(b.dataset.item) : set.add(b.dataset.item);
    b.classList.toggle('on');
  });
  $('#tr-send').onclick = () => {
    if (!trade) return;
    const give = { items: [...trade.give], flowers: Math.min(+$('#tr-give-fl').value || 0, S.profile.bag?.[FLOWER] || 0) };
    const want = { items: [...trade.want], flowers: Math.min(+$('#tr-want-fl').value || 0, trade.theirFlowers) };
    c.send('trade_req', { to: trade.id, give, want });
    closeModal('#modal-trade');
  };

  return { openPeople, renderOnline, onBmInvite, onFriendReq, onFriends, onTradeReq, onTradeInv, onRpsChallenge, onRpsStart, onRpsResult, rematch,
    openQuizMaker, onQuiz, onQuizResult, onQuizEnd, openTrade };
}
