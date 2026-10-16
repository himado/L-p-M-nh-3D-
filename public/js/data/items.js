// Dữ liệu vật phẩm dùng chung cho client (hiển thị) và server (giá, kiểm tra mua).
// Độ hiếm theo quy ước của PUBG / Fortnite: xám → xanh → tím → vàng.

export const RARITY = {
  common: { name: 'Phổ thông', color: '#9aa4b2' },
  rare: { name: 'Hiếm', color: '#3b82f6' },
  epic: { name: 'Sử thi', color: '#a855f7' },
  legendary: { name: 'Huyền thoại', color: '#f59e0b' },
};

export const SLOTS = {
  skin: 'Trang phục',
  hat: 'Mũ',
  bag: 'Ba lô',
  chalk: 'Phấn viết',
  course: 'Khóa học',
};

export const ITEMS = [
  // ---- Trang phục ----
  { id: 'skin_uniform', type: 'skin', name: 'Đồng phục học sinh', price: 0, rarity: 'common', icon: '👕',
    desc: 'Áo trắng, quần xanh — kinh điển của mọi lớp học Việt Nam.', look: { shirt: '#f5f5f5', pants: '#1e3a8a' } },
  { id: 'skin_scarf', type: 'skin', name: 'Đội viên khăn quàng đỏ', price: 150, rarity: 'common', icon: '🧣',
    desc: 'Đồng phục kèm khăn quàng đỏ của Đội viên.', look: { shirt: '#ffffff', pants: '#1e3a8a', scarf: '#dc2626' } },
  { id: 'skin_aobaba', type: 'skin', name: 'Áo bà ba Nam Bộ', price: 400, rarity: 'rare', icon: '🌾',
    desc: 'Trang phục giản dị của người miền Tây sông nước, đi kèm khăn rằn.', look: { shirt: '#5b3a24', pants: '#111111', scarf: '#1f2937' } },
  { id: 'skin_aodai_white', type: 'skin', name: 'Áo dài trắng nữ sinh', price: 600, rarity: 'rare', icon: '🤍',
    desc: 'Tà áo dài trắng — biểu tượng tuổi học trò.', look: { shirt: '#ffffff', pants: '#ffffff', dress: '#ffffff' } },
  { id: 'skin_aothe', type: 'skin', name: 'Áo the nho sinh', price: 700, rarity: 'rare', icon: '📜',
    desc: 'Áo the đen của sĩ tử thời xưa đi thi Hương, thi Hội.', look: { shirt: '#1f2937', pants: '#f5f5f4', dress: '#1f2937' } },
  { id: 'skin_hanbok', type: 'skin', name: 'Hanbok (Hàn Quốc)', price: 900, rarity: 'rare', icon: '🇰🇷',
    desc: 'Trang phục truyền thống Hàn Quốc với váy chima dài.', look: { shirt: '#f472b6', pants: '#60a5fa', dress: '#60a5fa', sash: '#dc2626', long: true } },
  { id: 'skin_kimono', type: 'skin', name: 'Kimono (Nhật Bản)', price: 900, rarity: 'rare', icon: '🇯🇵',
    desc: 'Kimono đỏ thắt đai obi vàng.', look: { shirt: '#be123c', pants: '#be123c', dress: '#be123c', sash: '#fbbf24', long: true } },
  { id: 'skin_aodai_red', type: 'skin', name: 'Áo dài đỏ du xuân', price: 1200, rarity: 'epic', icon: '🧧',
    desc: 'Áo dài đỏ viền vàng — mặc dịp Tết Nguyên Đán.', look: { shirt: '#c1121f', pants: '#fff7e6', dress: '#c1121f', sash: '#facc15' } },
  { id: 'skin_tuthan', type: 'skin', name: 'Áo tứ thân Kinh Bắc', price: 1500, rarity: 'epic', icon: '🎶',
    desc: 'Trang phục của liền chị quan họ, thắt lưng hoa lý.', look: { shirt: '#8b5a2b', pants: '#111111', dress: '#556b2f', sash: '#f59e0b' } },
  { id: 'skin_hoangbao', type: 'skin', name: 'Hoàng bào triều Nguyễn', price: 30, currency: 'gems', rarity: 'legendary', icon: '🐉',
    desc: 'Long bào màu vàng của hoàng đế triều Nguyễn.', look: { shirt: '#eab308', pants: '#eab308', dress: '#eab308', sash: '#b91c1c', long: true, glow: true } },
  { id: 'skin_teacher', type: 'skin', name: 'Áo dài cô giáo', price: 0, rarity: 'common', hidden: true, icon: '👩‍🏫',
    desc: '', look: { shirt: '#7dd3fc', pants: '#ffffff', dress: '#7dd3fc' } },

  // ---- Mũ ----
  { id: 'hat_none', type: 'hat', name: 'Không đội mũ', price: 0, rarity: 'common', icon: '🚫', desc: 'Để lộ mái tóc.' },
  { id: 'hat_cap', type: 'hat', name: 'Mũ lưỡi trai', price: 100, rarity: 'common', icon: '🧢', desc: 'Mũ đỏ năng động.' },
  { id: 'hat_nonla', type: 'hat', name: 'Nón lá', price: 300, rarity: 'rare', icon: '👒', desc: 'Nón lá truyền thống — nón bài thơ xứ Huế.' },
  { id: 'hat_khandong', type: 'hat', name: 'Khăn đóng', price: 500, rarity: 'rare', icon: '🎩', desc: 'Khăn vấn sẵn đi cùng áo dài nam.' },
  { id: 'hat_grad', type: 'hat', name: 'Mũ tốt nghiệp', price: 800, rarity: 'epic', icon: '🎓', desc: 'Dành cho người học giỏi.' },
  { id: 'hat_canhchuon', type: 'hat', name: 'Mũ cánh chuồn', price: 25, currency: 'gems', rarity: 'legendary', icon: '🏯', desc: 'Mũ quan văn thời phong kiến.' },

  // ---- Ba lô ----
  { id: 'bag_none', type: 'bag', name: 'Không đeo', price: 0, rarity: 'common', icon: '🚫', desc: '' },
  { id: 'bag_school', type: 'bag', name: 'Cặp sách', price: 150, rarity: 'common', icon: '🎒', desc: 'Cặp xanh quen thuộc.' },
  { id: 'bag_gui', type: 'bag', name: 'Gùi Tây Nguyên', price: 450, rarity: 'rare', icon: '🧺', desc: 'Gùi mây tre của đồng bào Tây Nguyên.' },
  { id: 'bag_star', type: 'bag', name: 'Đèn ông sao', price: 20, currency: 'gems', rarity: 'legendary', icon: '⭐', desc: 'Rước đèn Trung Thu mọi lúc mọi nơi.' },

  // ---- Phấn viết bảng ----
  { id: 'chalk_white', type: 'chalk', name: 'Phấn trắng', price: 0, rarity: 'common', icon: '⚪', desc: '', color: '#f8fafc' },
  { id: 'chalk_yellow', type: 'chalk', name: 'Phấn vàng', price: 50, rarity: 'common', icon: '🟡', desc: '', color: '#fde047' },
  { id: 'chalk_pink', type: 'chalk', name: 'Phấn hồng', price: 80, rarity: 'common', icon: '🌸', desc: '', color: '#f9a8d4' },
  { id: 'chalk_blue', type: 'chalk', name: 'Phấn xanh', price: 80, rarity: 'common', icon: '🔵', desc: '', color: '#7dd3fc' },
  { id: 'chalk_rainbow', type: 'chalk', name: 'Phấn cầu vồng', price: 15, currency: 'gems', rarity: 'legendary', icon: '🌈', desc: 'Nét phấn đổi màu theo từng nét.', color: 'rainbow' },

  // ---- Khóa học (mở gói câu hỏi) ----
  { id: 'course_vn', type: 'course', name: 'Văn hóa Việt Nam', price: 0, rarity: 'common', icon: '🇻🇳', desc: 'Gói câu hỏi mặc định.', pack: 'vn' },
  { id: 'course_asia', type: 'course', name: 'Văn hóa Châu Á', price: 800, rarity: 'rare', icon: '🏮', desc: 'Nhật, Hàn, Ấn, Thái, Lào, Campuchia...', pack: 'asia' },
  { id: 'course_world', type: 'course', name: 'Văn hóa Thế giới', price: 1200, rarity: 'epic', icon: '🌍', desc: 'Châu Âu, châu Mỹ, châu Phi, châu Đại Dương.', pack: 'world' },
];

export const ITEM_MAP = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

export const DEFAULT_OWNED = ['skin_uniform', 'hat_none', 'bag_none', 'chalk_white', 'course_vn'];
export const DEFAULT_EQUIPPED = { skin: 'skin_uniform', hat: 'hat_none', bag: 'bag_none', chalk: 'chalk_white' };

export const PACKS = {
  vn: { name: 'Việt Nam', icon: '🇻🇳', item: 'course_vn' },
  asia: { name: 'Châu Á', icon: '🏮', item: 'course_asia' },
  world: { name: 'Thế giới', icon: '🌍', item: 'course_world' },
};
