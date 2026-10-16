// Bảng sự kiện: điểm danh 7 ngày, nhiệm vụ ngày, lịch lễ hội thường niên, bảng xếp hạng.
import { api } from './net.js';
import { eventStatus } from './data/events.js';
import { $, esc, toast, openModal, rewardText } from './ui.js';

const TABS = [['login', '📅 Điểm danh'], ['missions', '✅ Nhiệm vụ ngày'], ['calendar', '🎊 Lễ hội'], ['leaderboard', '🏆 Xếp hạng']];
const todayKey = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });

export class EventsPanel {
  constructor(hooks) {
    this.h = hooks; // { getProfile(), onProfile(p) }
    this.tab = 'login';
    $('#ev-tabs').innerHTML = TABS.map(([k, n]) => `<button class="tab" data-tab="${k}">${n}</button>`).join('');
    $('#ev-tabs').onclick = (e) => { const t = e.target.dataset.tab; if (t) { this.tab = t; this.render(); } };
  }

  open(tab) { if (tab) this.tab = tab; openModal('#modal-events'); this.render(); }

  async render() {
    for (const b of $('#ev-tabs').children) b.classList.toggle('on', b.dataset.tab === this.tab);
    const p = this.h.getProfile();
    const body = $('#ev-body');
    if (this.tab === 'login') {
      const L = p.login;
      body.innerHTML = `<p class="sub">Điểm danh mỗi ngày để nhận quà. Chuỗi hiện tại: <b>${L.streak} ngày</b>. Bỏ lỡ 1 ngày sẽ bắt đầu lại.</p>
        <div class="login-grid">${L.rewards.map((r, i) => `<div class="lday ${i < L.cycleDone ? 'done' : ''} ${!L.claimedToday && i === L.cycleDone ? 'today' : ''}">
          Ngày ${i + 1}<b>${r.gems ? '💎' : '🪙'}</b>${rewardText(r)}</div>`).join('')}</div>
        <div class="row end"><button id="ev-claim" class="btn gold" ${L.claimedToday ? 'disabled' : ''}>${L.claimedToday ? 'Đã điểm danh hôm nay' : 'Điểm danh'}</button></div>`;
      $('#ev-claim').onclick = async () => {
        try { const r = await api('/daily/claim', {}); this.h.onProfile(r.profile); toast(`Điểm danh thành công: ${rewardText(r.reward)}`, 'ok'); this.render(); }
        catch (e) { toast(e.message, 'err'); }
      };
    } else if (this.tab === 'missions') {
      body.innerHTML = `<p class="sub">Làm mới lúc 0h mỗi ngày (giờ Việt Nam).</p>` + p.missions.map((m) => `
        <div class="mission"><div class="grow"><b>${esc(m.title)}</b> <small>· ${rewardText(m.reward)}</small>
          <div class="bar"><i style="width:${(m.progress / m.goal) * 100}%"></i></div><small>${m.progress}/${m.goal}</small></div>
          <button class="btn sm ${m.progress >= m.goal && !m.claimed ? 'gold' : ''}" data-m="${m.id}" ${m.claimed || m.progress < m.goal ? 'disabled' : ''}>${m.claimed ? 'Đã nhận' : 'Nhận'}</button></div>`).join('');
      body.onclick = async (e) => {
        const id = e.target.dataset.m;
        if (!id) return;
        try { const r = await api('/mission/claim', { id }); this.h.onProfile(r.profile); toast(`Nhận ${rewardText(r.reward)}`, 'ok'); this.render(); }
        catch (err) { toast(err.message, 'err'); }
      };
    } else if (this.tab === 'calendar') {
      body.onclick = null;
      body.innerHTML = `<p class="sub">Sự kiện thường niên theo lịch Việt Nam & thế giới. Trong thời gian sự kiện, xu nhận được được nhân hệ số.</p>` +
        eventStatus(todayKey()).map((ev) => `<div class="evrow ${ev.active ? 'active' : ''}"><span class="ic">${ev.icon}</span>
          <div class="grow"><b>${esc(ev.name)}</b> ${ev.active ? '<span class="lv">ĐANG DIỄN RA</span>' : ''}<br><small>${esc(ev.desc)}</small></div>
          <div style="text-align:right"><b>x${ev.coinMul}</b><br><small>${ev.date ? (ev.active ? `${fmtDate(ev.date)}` : `còn ${ev.diff} ngày`) : 'chưa có lịch'}</small></div></div>`).join('');
    } else {
      body.onclick = null;
      body.innerHTML = '<p class="sub">Đang tải…</p>';
      try {
        const rows = await api('/leaderboard');
        body.innerHTML = `<p class="sub">Xếp hạng theo điểm kinh nghiệm (XP) — mỗi câu đúng +10 XP.</p>` + rows.map((r, i) => `
          <div class="lbrow ${r.name === p.name ? 'me' : ''}"><span class="rk">${['🥇', '🥈', '🥉'][i] || i + 1}</span>
          <b style="flex:1">${esc(r.name)}</b><span class="lv">Lv ${r.level}</span><span>${r.xp} XP</span><small>✅ ${r.correct}</small></div>`).join('');
      } catch (e) { body.innerHTML = `<p class="error">${esc(e.message)}</p>`; }
    }
  }
}

const fmtDate = (d) => d.split('-').reverse().join('/');
