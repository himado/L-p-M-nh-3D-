// Lịch sự kiện thường niên (dùng chung client + server).
// Ngày âm lịch được quy đổi sẵn sang dương lịch theo từng năm — bổ sung khi sang năm mới.
// before/after: số ngày sự kiện mở trước/sau ngày chính. coinMul: hệ số nhân xu.

export const EVENTS = [
  { id: 'tet', name: 'Tết Nguyên Đán', icon: '🧧', lunar: { 2026: '02-17', 2027: '02-06', 2028: '01-26' }, before: 7, after: 5, coinMul: 2,
    desc: 'Lì xì đầu năm, x2 xu mọi hoạt động. Mở bán Áo dài đỏ & Mũ cánh chuồn.' },
  { id: 'hungking', name: 'Giỗ Tổ Hùng Vương (10/3 âm)', icon: '🏔️', lunar: { 2026: '04-26', 2027: '04-16' }, before: 3, after: 1, coinMul: 1.5,
    desc: 'Chuỗi câu hỏi về thời đại Hùng Vương, x1.5 xu.' },
  { id: 'children', name: 'Quốc tế Thiếu nhi', icon: '🎈', date: '06-01', before: 3, after: 1, coinMul: 1.5,
    desc: 'Nhân đôi phần thưởng điểm danh cho người chơi mới.' },
  { id: 'national', name: 'Quốc khánh 2/9', icon: '🇻🇳', date: '09-02', before: 3, after: 1, coinMul: 1.5,
    desc: 'Câu hỏi lịch sử – văn hóa, x1.5 xu.' },
  { id: 'school', name: 'Khai giảng năm học mới', icon: '🏫', date: '09-05', before: 2, after: 5, coinMul: 1.5,
    desc: 'Tặng cặp sách cho học sinh mới, x1.5 xu khi làm bài kiểm tra.' },
  { id: 'midautumn', name: 'Tết Trung Thu (15/8 âm)', icon: '🥮', lunar: { 2026: '09-25', 2027: '09-15' }, before: 5, after: 1, coinMul: 1.5,
    desc: 'Rước đèn ông sao, phá cỗ — giảm giá vật phẩm Trung Thu.' },
  { id: 'halloween', name: 'Lễ hội hóa trang thế giới', icon: '🎃', date: '10-31', before: 5, after: 1, coinMul: 1.5,
    desc: 'Tìm hiểu lễ hội các nước, x1.5 xu ở Kho tàng tri thức.' },
  { id: 'teacher', name: 'Ngày Nhà giáo Việt Nam 20/11', icon: '💐', date: '11-20', before: 5, after: 1, coinMul: 2,
    desc: 'Tri ân thầy cô — x2 xu khi nộp bài kiểm tra trong lớp.' },
  { id: 'xmas', name: 'Giáng sinh', icon: '🎄', date: '12-25', before: 4, after: 1, coinMul: 1.5,
    desc: 'Rương quà Giáng sinh sau mỗi lượt vượt ải.' },
];

const DAY = 86400000;

function occurrences(ev, year) {
  if (ev.date) return [`${year}-${ev.date}`];
  const d = ev.lunar?.[year];
  return d ? [`${year}-${d}`] : [];
}

/** Trạng thái mọi sự kiện so với ngày `dateKey` (YYYY-MM-DD): đang diễn ra trước, sau đó sắp tới gần nhất. */
export function eventStatus(dateKey) {
  const y = Number(dateKey.slice(0, 4));
  const now = Date.parse(dateKey);
  return EVENTS.map((ev) => {
    const cands = [];
    for (const yy of [y - 1, y, y + 1]) {
      for (const d of occurrences(ev, yy)) {
        const diff = Math.round((Date.parse(d) - now) / DAY); // số ngày tới ngày chính
        cands.push({ date: d, diff, active: diff <= ev.before && diff >= -ev.after });
      }
    }
    const best = cands.find((c) => c.active) ||
      cands.filter((c) => c.diff > 0).sort((a, b) => a.diff - b.diff)[0] ||
      { date: null, diff: null, active: false };
    return { ...ev, ...best };
  }).sort((a, b) => (b.active - a.active) || ((a.diff ?? 1e9) - (b.diff ?? 1e9)));
}

export function activeEvent(dateKey) {
  return eventStatus(dateKey).filter((e) => e.active).sort((a, b) => b.coinMul - a.coinMul)[0] || null;
}
