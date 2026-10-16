export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmt = (n) => Number(n).toLocaleString('vi-VN');

export function toast(msg, kind = 'info', ms = 2800) {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), ms);
}

export function openModal(id) { $(id).classList.add('open'); }
export function closeModal(id) { $(id).classList.remove('open'); }
export const anyModalOpen = () => $$('.modal.open').length > 0;

export function rewardText(r = {}) {
  const parts = [];
  if (r.coins) parts.push(`🪙 ${fmt(r.coins)}`);
  if (r.gems) parts.push(`💎 ${fmt(r.gems)}`);
  return parts.join(' · ');
}

// Đóng modal bằng nút [data-close] hoặc click nền (trừ modal .noclose).
document.addEventListener('click', (e) => {
  const m = e.target.closest('.modal');
  if (!m) return;
  if (e.target.matches('[data-close]') || (e.target === m && !m.classList.contains('noclose'))) {
    m.classList.remove('open');
    m.dispatchEvent(new Event('closed'));
  }
});
