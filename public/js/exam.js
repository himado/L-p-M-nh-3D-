// Bài kiểm tra ngồi tại chỗ + cơ chế "quay cóp" (giữ C để liếc bài bạn bên cạnh).
import { api } from './net.js';
import { $, esc, toast, openModal, closeModal } from './ui.js';

const PEEK_TIME = 1.3; // giây liếc liên tục để nhìn thấy bài bạn

export class Exam {
  /** hooks: canPeek() → null | lý do; onPeek(bool); onProfile(profile); onClose() */
  constructor(hooks) {
    this.h = hooks;
    this.open = false;
    this.peeking = false;
    $('#exam-prev').onclick = () => this.go(this.i - 1);
    $('#exam-next').onclick = () => this.go(this.i + 1);
    $('#exam-submit').onclick = () => this.submit();
    $('#modal-exam').addEventListener('closed', () => this.abandon());
    addEventListener('keydown', (e) => { if (this.open && e.code === 'KeyC' && !e.repeat) this.startPeek(); });
    addEventListener('keyup', (e) => { if (e.code === 'KeyC') this.stopPeek(); });
  }

  async start() {
    try {
      const d = await api('/exam/start', {});
      Object.assign(this, { id: d.examId, ca: d.ca, qs: d.questions, left: d.seconds, i: 0, answers: d.questions.map(() => null),
        caughtQ: new Set(), caught: 0, peekT: 0, read: false, open: true, submitted: false, mul: d.mul });
      openModal('#modal-exam');
      this.render();
      this.emit();
    } catch (e) { toast(e.message, 'err'); }
  }

  go(i) { if (i >= 0 && i < this.qs.length) { this.i = i; this.render(); } }

  render() {
    const q = this.qs[this.i];
    $('#exam-nav').innerHTML = this.qs.map((_, k) =>
      `<button class="${k === this.i ? 'cur' : ''} ${this.answers[k] !== null ? 'done' : ''} ${this.caughtQ.has(k) ? 'caught' : ''}" data-k="${k}">${k + 1}</button>`).join('');
    $('#exam-nav').onclick = (e) => { const k = e.target.dataset.k; if (k !== undefined) this.go(+k); };
    $('#exam-body').innerHTML = `<h3>Câu ${this.i + 1}. ${esc(q.q)}</h3><div class="options">${q.options.map((o, k) =>
      `<button class="opt ${this.answers[this.i] === k ? 'sel' : ''}" data-k="${k}">${'ABCD'[k]}. ${esc(o)}</button>`).join('')}</div>`;
    $('#exam-body').onclick = (e) => {
      const b = e.target.closest('.opt');
      if (!b || this.submitted) return;
      this.answers[this.i] = +b.dataset.k;
      this.render();
      this.emit();
    };
  }

  /** Bài làm hiện tại → hiện lên tờ giấy trên bàn mình (mọi người đều nhìn thấy). */
  emit(done = false) { this.h.onAnswers({ ca: this.ca, answers: this.answers.slice(), done }); }

  startPeek() {
    if (this.peeking || this.submitted) return;
    const why = this.h.canPeek();
    if (why) return toast(why, 'err');
    this.peeking = true;
    this.peekT = 0;
    $('#modal-exam').classList.add('peeking');
    this.h.onPeek(true);
  }
  stopPeek() {
    if (!this.peeking) return;
    this.peeking = false;
    $('#modal-exam').classList.remove('peeking');
    if (this.read) { this.read = false; this.h.onRead(false); }
    this.h.onPeek(false);
  }

  /** Gọi mỗi khung hình. attention: 0/1/2 từ cô giáo. */
  async tick(dt, attention) {
    if (!this.open || this.submitted) return;
    this.left -= dt;
    const s = Math.max(0, Math.ceil(this.left));
    $('#exam-timer').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    if (this.left <= 0) { toast('Hết giờ! Tự động nộp bài.', 'gold'); this.submit(); return; }
    if (!this.peeking) return;
    if (attention === 2) {
      this.caught++;
      this.caughtQ.add(this.i);
      this.stopPeek();
      this.render();
      toast('🚨 Cô giáo bắt được bạn quay cóp! −20 xu', 'big', 3500);
      return;
    }
    this.peekT += dt;
    if (this.peekT >= PEEK_TIME && !this.read) {
      this.read = true;
      this.h.onRead(true);
    }
  }

  async submit() {
    if (this.submitted) return;
    const blank = this.answers.filter((a) => a === null).length;
    if (blank && this.left > 0 && !confirmInline(blank)) return;
    this.submitted = true;
    this.stopPeek();
    try {
      const r = await api('/exam/submit', { examId: this.id, answers: this.answers, caught: this.caught });
      this.h.onProfile(r.profile);
      this.emit(true);
      $('#exam-nav').innerHTML = '';
      $('#exam-body').innerHTML = `
        <div style="text-align:center"><div class="result-big">${r.score >= 8 ? '🏆' : r.score >= 5 ? '👍' : '📚'}</div>
        <h2>Điểm: ${r.score}/10 (${r.correct}/${r.total} câu)</h2>
        <p>Nhận <b>🪙 ${r.coins}</b> xu${r.caught ? ` · bị bắt ${r.caught} lần (−${r.caught * 20})` : ''}${this.mul > 1 ? ` · sự kiện x${this.mul}` : ''}</p></div>
        ${r.results.map((x, k) => `<div class="exp"><b>${k + 1}. ${esc(x.q)}</b><br>
          ${x.yours === x.answer ? '✅' : '❌'} Đáp án: <b>${esc(x.options[x.answer])}</b>${x.yours !== null && x.yours !== x.answer ? ` · Bạn chọn: ${esc(x.options[x.yours])}` : ''}<br><small>${esc(x.exp)}</small></div>`).join('')}`;
      $('#exam-submit').classList.add('hidden');
      $('#exam-prev').classList.add('hidden');
      $('#exam-next').textContent = 'Đóng';
      $('#exam-next').onclick = () => this.close();
    } catch (e) { this.submitted = false; toast(e.message, 'err'); }
  }

  abandon() { if (this.open) { this.stopPeek(); this.open = false; this.restoreButtons(); this.h.onClose(); } }
  close() { closeModal('#modal-exam'); this.abandon(); }
  restoreButtons() {
    $('#exam-submit').classList.remove('hidden');
    $('#exam-prev').classList.remove('hidden');
    $('#exam-next').textContent = '▶';
    $('#exam-next').onclick = () => this.go(this.i + 1);
  }
}

// Nhấn "Nộp bài" lần đầu khi còn câu trống chỉ cảnh báo; nhấn lần nữa trong 3 giây để nộp.
let armedAt = 0;
function confirmInline(blank) {
  if (Date.now() - armedAt < 3000) return true;
  armedAt = Date.now();
  toast(`Còn ${blank} câu chưa làm — nhấn "Nộp bài" lần nữa để nộp`, 'gold');
  return false;
}
