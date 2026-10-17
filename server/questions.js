// Ngân hàng câu hỏi — chỉ nằm ở server để client không đọc được đáp án.
// a = chỉ số đáp án đúng trong options. Thêm câu hỏi mới chỉ cần nối vào mảng.

const vn = [
  ['Tết Nguyên Đán bắt đầu vào ngày nào theo âm lịch?', ['Mùng 1 tháng Giêng', 'Rằm tháng Giêng', 'Mùng 5 tháng 5', '23 tháng Chạp'], 0, 'Tết Nguyên Đán bắt đầu từ mùng 1 tháng Giêng âm lịch.'],
  ['Bánh chưng gắn với truyền thuyết về nhân vật nào?', ['Lang Liêu', 'Thánh Gióng', 'Sơn Tinh', 'An Dương Vương'], 0, 'Lang Liêu dâng bánh chưng, bánh giầy lên vua Hùng tượng trưng cho đất và trời.'],
  ['Giỗ Tổ Hùng Vương diễn ra vào ngày nào âm lịch?', ['10/3', '15/8', '5/5', '15/1'], 0, '"Dù ai đi ngược về xuôi, nhớ ngày Giỗ Tổ mùng mười tháng ba."'],
  ['Tết Đoan Ngọ (Tết diệt sâu bọ) vào ngày nào âm lịch?', ['5/5', '15/7', '10/10', '9/9'], 0, 'Tết Đoan Ngọ là ngày 5/5 âm lịch, người dân ăn rượu nếp, hoa quả để "diệt sâu bọ".'],
  ['Tết Trung Thu diễn ra vào ngày nào âm lịch?', ['15/8', '15/1', '1/10', '15/7'], 0, 'Rằm tháng Tám — Tết của thiếu nhi với đèn ông sao, bánh nướng, bánh dẻo.'],
  ['Ông Công ông Táo "về trời" vào ngày nào?', ['23 tháng Chạp', '30 tháng Chạp', 'Mùng 3 Tết', 'Rằm tháng Giêng'], 0, 'Ngày 23 tháng Chạp, người Việt thả cá chép tiễn Táo Quân về chầu trời.'],
  ['Táo Quân cưỡi con vật gì để về trời?', ['Cá chép', 'Ngựa', 'Hạc', 'Rồng'], 0, 'Cá chép hóa rồng đưa Táo Quân lên thiên đình.'],
  ['Ở miền Nam, loại bánh ngày Tết hình trụ tương tự bánh chưng là?', ['Bánh tét', 'Bánh giầy', 'Bánh cốm', 'Bánh ít'], 0, 'Bánh tét có hình trụ dài, phổ biến ở miền Nam và miền Trung.'],
  ['Ngày Tết, người miền Nam thường chưng hoa gì?', ['Hoa mai vàng', 'Hoa đào', 'Hoa sen', 'Hoa ban'], 0, 'Miền Bắc chuộng đào, miền Nam chuộng mai vàng.'],
  ['"Mâm ngũ quả" ngày Tết gồm bao nhiêu loại quả?', ['5', '3', '7', '9'], 0, '"Ngũ" nghĩa là năm, tượng trưng ngũ hành.'],
  ['Tục "xông đất" diễn ra vào thời điểm nào?', ['Ngay sau giao thừa, đầu năm mới', 'Ngày Rằm tháng Giêng', 'Ngày 23 tháng Chạp', 'Ngày Tết Đoan Ngọ'], 0, 'Người đầu tiên bước vào nhà sau giao thừa được tin là mang vận may cả năm.'],
  ['Phong bao lì xì truyền thống thường có màu gì?', ['Đỏ', 'Trắng', 'Đen', 'Tím'], 0, 'Màu đỏ tượng trưng cho may mắn, sung túc.'],
  ['Lạc Long Quân và Âu Cơ sinh ra bao nhiêu người con?', ['100', '50', '18', '1000'], 0, 'Âu Cơ sinh bọc trăm trứng nở trăm người con — nguồn gốc "đồng bào".'],
  ['Theo truyền thuyết, Thánh Gióng bay về trời ở núi nào?', ['Sóc Sơn', 'Tản Viên', 'Yên Tử', 'Ba Vì'], 0, 'Sau khi đánh tan giặc Ân, Gióng cưỡi ngựa sắt bay về trời từ núi Sóc Sơn.'],
  ['Văn Miếu ở Thăng Long được xây năm 1070 dưới triều vua nào?', ['Lý Thánh Tông', 'Lý Thái Tổ', 'Trần Nhân Tông', 'Lê Thánh Tông'], 0, 'Năm 1070 vua Lý Thánh Tông cho dựng Văn Miếu; năm 1076 lập Quốc Tử Giám.'],
  ['Trường đại học đầu tiên của Việt Nam là?', ['Quốc Tử Giám', 'Trường Bưởi', 'Đại học Đông Dương', 'Quốc Học Huế'], 0, 'Quốc Tử Giám (1076) được xem là trường đại học đầu tiên.'],
  ['Kinh thành Huế là kinh đô của triều đại nào?', ['Nhà Nguyễn', 'Nhà Lý', 'Nhà Trần', 'Nhà Lê'], 0, 'Huế là kinh đô nhà Nguyễn (1802–1945).'],
  ['Nhã nhạc cung đình Huế được UNESCO công nhận năm nào?', ['2003', '1993', '2010', '2017'], 0, 'Năm 2003 — di sản văn hóa phi vật thể đầu tiên của Việt Nam.'],
  ['Không gian văn hóa Cồng chiêng thuộc vùng nào?', ['Tây Nguyên', 'Tây Bắc', 'Đồng bằng sông Cửu Long', 'Đông Bắc'], 0, 'UNESCO công nhận Không gian văn hóa Cồng chiêng Tây Nguyên năm 2005.'],
  ['Dân ca Quan họ là đặc sản của vùng văn hóa nào?', ['Kinh Bắc', 'Xứ Nghệ', 'Nam Bộ', 'Xứ Thanh'], 0, 'Quan họ Bắc Ninh – Bắc Giang (Kinh Bắc), UNESCO ghi danh năm 2009.'],
  ['Đờn ca tài tử phổ biến ở vùng nào?', ['Nam Bộ', 'Bắc Bộ', 'Tây Nguyên', 'Tây Bắc'], 0, 'Đờn ca tài tử Nam Bộ được UNESCO ghi danh năm 2013.'],
  ['Nghệ thuật Bài Chòi gắn với vùng nào?', ['Trung Bộ', 'Nam Bộ', 'Tây Bắc', 'Đông Bắc'], 0, 'Bài Chòi Trung Bộ được UNESCO ghi danh năm 2017.'],
  ['Ví, Giặm là dân ca của vùng nào?', ['Nghệ Tĩnh', 'Quảng Nam', 'Bắc Ninh', 'Huế'], 0, 'Dân ca Ví, Giặm Nghệ Tĩnh được UNESCO ghi danh năm 2014.'],
  ['Thực hành Then là di sản của các dân tộc nào?', ['Tày, Nùng, Thái', 'Ê Đê, Ba Na', 'Chăm, Khmer', 'Mường, Dao'], 0, 'Then là loại hình nghi lễ – âm nhạc của người Tày, Nùng, Thái (UNESCO 2019).'],
  ['Nghệ thuật Xòe là điệu múa của dân tộc nào?', ['Thái', 'Kinh', 'Chăm', 'H\'Mông'], 0, 'Nghệ thuật Xòe Thái được UNESCO ghi danh năm 2021.'],
  ['Múa rối nước bắt nguồn từ vùng nào?', ['Đồng bằng Bắc Bộ', 'Tây Nguyên', 'Nam Trung Bộ', 'Đông Nam Bộ'], 0, 'Múa rối nước gắn với văn minh lúa nước châu thổ sông Hồng.'],
  ['Hội Gióng ở đền Phù Đổng và đền Sóc tưởng nhớ ai?', ['Thánh Gióng', 'Trần Hưng Đạo', 'Hai Bà Trưng', 'Lý Thường Kiệt'], 0, 'Hội Gióng được UNESCO ghi danh năm 2010.'],
  ['Đàn bầu (đàn độc huyền) có mấy dây?', ['1', '2', '16', '36'], 0, 'Đàn bầu chỉ có một dây nhưng tạo được nhiều âm sắc nhờ cần đàn.'],
  ['Dòng tranh dân gian nổi tiếng với bức "Đám cưới chuột" là?', ['Đông Hồ', 'Hàng Trống', 'Kim Hoàng', 'Làng Sình'], 0, 'Tranh Đông Hồ in trên giấy điệp, màu từ nguyên liệu tự nhiên.'],
  ['Trống đồng Ngọc Lũ là hiện vật tiêu biểu của nền văn hóa nào?', ['Đông Sơn', 'Sa Huỳnh', 'Óc Eo', 'Hòa Bình'], 0, 'Văn hóa Đông Sơn rực rỡ với nghệ thuật đúc đồng.'],
  ['Chữ viết do người Việt sáng tạo dựa trên chữ Hán gọi là?', ['Chữ Nôm', 'Chữ Quốc ngữ', 'Chữ Phạn', 'Chữ Chăm'], 0, 'Chữ Nôm dùng để ghi tiếng Việt, đỉnh cao là Truyện Kiều.'],
  ['Tác giả của Truyện Kiều là ai?', ['Nguyễn Du', 'Nguyễn Trãi', 'Hồ Xuân Hương', 'Nguyễn Đình Chiểu'], 0, 'Đại thi hào Nguyễn Du (1766–1820).'],
  ['Ai được mệnh danh là "Bà chúa thơ Nôm"?', ['Hồ Xuân Hương', 'Bà Huyện Thanh Quan', 'Đoàn Thị Điểm', 'Xuân Quỳnh'], 0, 'Hồ Xuân Hương nổi tiếng với thơ Nôm sắc sảo.'],
  ['Di sản thiên nhiên thế giới đầu tiên của Việt Nam là?', ['Vịnh Hạ Long', 'Phong Nha – Kẻ Bàng', 'Tràng An', 'Cát Tiên'], 0, 'Vịnh Hạ Long được UNESCO công nhận năm 1994.'],
  ['Chùa Cầu là biểu tượng của đô thị cổ nào?', ['Hội An', 'Huế', 'Phố Hiến', 'Đồng Văn'], 0, 'Chùa Cầu do thương nhân Nhật Bản xây dựng ở Hội An.'],
  ['"Nón bài thơ" là đặc sản của vùng đất nào?', ['Huế', 'Hà Nội', 'Sài Gòn', 'Đà Lạt'], 0, 'Nón bài thơ xứ Huế có lồng thơ, hình ảnh giữa các lớp lá.'],
  ['Trang phục được xem là quốc phục của phụ nữ Việt Nam là?', ['Áo dài', 'Áo tứ thân', 'Áo bà ba', 'Áo yếm'], 0, 'Áo dài là biểu tượng trang phục Việt Nam.'],
  ['"Cây đa, giếng nước, sân đình" là hình ảnh tiêu biểu của?', ['Làng quê Bắc Bộ', 'Phố cổ Hội An', 'Nhà rông Tây Nguyên', 'Chợ nổi miền Tây'], 0, 'Ba hình ảnh gắn với làng Việt truyền thống ở đồng bằng Bắc Bộ.'],
  ['Nhà rông là kiến trúc đặc trưng của vùng nào?', ['Tây Nguyên', 'Đồng bằng Bắc Bộ', 'Nam Bộ', 'Duyên hải Bắc Bộ'], 0, 'Nhà rông là nơi sinh hoạt cộng đồng của các dân tộc Tây Nguyên.'],
  ['Ngày Nhà giáo Việt Nam là ngày nào?', ['20/11', '8/3', '1/6', '2/9'], 0, 'Ngày 20/11 hằng năm tri ân thầy cô.'],
];

const asia = [
  ['Kimono là trang phục truyền thống của quốc gia nào?', ['Nhật Bản', 'Hàn Quốc', 'Trung Quốc', 'Thái Lan'], 0, 'Kimono nghĩa là "đồ để mặc" trong tiếng Nhật.'],
  ['Hanbok là trang phục truyền thống của quốc gia nào?', ['Hàn Quốc', 'Nhật Bản', 'Mông Cổ', 'Việt Nam'], 0, 'Hanbok gồm áo jeogori và váy chima.'],
  ['Sari là trang phục truyền thống của phụ nữ nước nào?', ['Ấn Độ', 'Indonesia', 'Myanmar', 'Lào'], 0, 'Sari là tấm vải dài quấn quanh người.'],
  ['Lễ hội té nước Songkran là Tết cổ truyền của nước nào?', ['Thái Lan', 'Nhật Bản', 'Philippines', 'Hàn Quốc'], 0, 'Songkran diễn ra giữa tháng 4, mọi người té nước chúc phúc.'],
  ['Tết Chuseok của Hàn Quốc diễn ra vào ngày nào âm lịch?', ['15/8', '1/1', '5/5', '7/7'], 0, 'Chuseok — Tết Trung thu của người Hàn, dịp đoàn tụ gia đình.'],
  ['Diwali — "Lễ hội ánh sáng" là lễ hội lớn của nước nào?', ['Ấn Độ', 'Trung Quốc', 'Nhật Bản', 'Campuchia'], 0, 'Diwali tượng trưng cho ánh sáng chiến thắng bóng tối.'],
  ['Hanami là phong tục gì của người Nhật?', ['Ngắm hoa anh đào', 'Thả đèn lồng', 'Đấu vật sumo', 'Uống trà'], 0, 'Hanami nghĩa là "ngắm hoa", thường vào mùa xuân.'],
  ['Quần thể đền Angkor Wat thuộc quốc gia nào?', ['Campuchia', 'Thái Lan', 'Lào', 'Myanmar'], 0, 'Angkor Wat xuất hiện cả trên quốc kỳ Campuchia.'],
  ['Origami là nghệ thuật gì?', ['Gấp giấy', 'Cắm hoa', 'Viết thư pháp', 'Cắt tỉa cây cảnh'], 0, 'Origami là nghệ thuật gấp giấy của Nhật Bản.'],
  ['Kimchi là món ăn truyền thống của nước nào?', ['Hàn Quốc', 'Nhật Bản', 'Trung Quốc', 'Thái Lan'], 0, 'Văn hóa muối kimchi (Kimjang) được UNESCO ghi danh năm 2013.'],
  ['Lễ hội Thạt Luổng là lễ hội lớn của quốc gia nào?', ['Lào', 'Campuchia', 'Thái Lan', 'Myanmar'], 0, 'Lễ hội tại tháp Thạt Luổng, thủ đô Viêng Chăn.'],
  ['Nghệ thuật nhuộm vải Batik nổi tiếng của nước nào?', ['Indonesia', 'Ấn Độ', 'Nhật Bản', 'Philippines'], 0, 'Batik Indonesia được UNESCO ghi danh năm 2009.'],
  ['Trà đạo (Sadō) là nét văn hóa của nước nào?', ['Nhật Bản', 'Ấn Độ', 'Thái Lan', 'Lào'], 0, 'Trà đạo đề cao tinh thần Hòa – Kính – Thanh – Tịch.'],
  ['Lăng Taj Mahal do vị vua nào cho xây dựng?', ['Shah Jahan', 'Akbar', 'Ashoka', 'Babur'], 0, 'Shah Jahan xây Taj Mahal để tưởng nhớ hoàng hậu Mumtaz Mahal.'],
  ['Lễ hội Naadam với đua ngựa, vật, bắn cung là của nước nào?', ['Mông Cổ', 'Kazakhstan', 'Nepal', 'Bhutan'], 0, 'Naadam gồm "ba môn thể thao của nam nhi".'],
  ['Lễ hội thả đèn trời Yi Peng nổi tiếng ở thành phố nào?', ['Chiang Mai', 'Tokyo', 'Seoul', 'Bali'], 0, 'Yi Peng diễn ra ở Chiang Mai, miền Bắc Thái Lan.'],
];

const world = [
  ['Lễ hội bia Oktoberfest được tổ chức ở thành phố nào?', ['Munich', 'Paris', 'Rome', 'Madrid'], 0, 'Oktoberfest ở Munich (Đức) bắt đầu từ năm 1810.'],
  ['Ngày của người chết (Día de Muertos) là lễ hội của nước nào?', ['Mexico', 'Tây Ban Nha', 'Brazil', 'Chile'], 0, 'Người Mexico trang trí bàn thờ, sọ đường tưởng nhớ người đã khuất.'],
  ['Váy kilt kẻ ô là trang phục truyền thống của?', ['Scotland', 'Ireland', 'Hà Lan', 'Thụy Sĩ'], 0, 'Kilt là trang phục truyền thống của nam giới Scotland.'],
  ['Điệu nhảy Flamenco bắt nguồn từ quốc gia nào?', ['Tây Ban Nha', 'Ý', 'Bồ Đào Nha', 'Pháp'], 0, 'Flamenco gắn với vùng Andalusia, Tây Ban Nha.'],
  ['Lễ hội Carnival với vũ điệu Samba nổi tiếng nhất ở thành phố nào?', ['Rio de Janeiro', 'Buenos Aires', 'Lima', 'Havana'], 0, 'Carnival Rio de Janeiro, Brazil — lễ hội đường phố lớn nhất thế giới.'],
  ['Điệu múa Haka là nét văn hóa của người nào?', ['Người Maori (New Zealand)', 'Người Inuit', 'Người Zulu', 'Người Maya'], 0, 'Haka nổi tiếng nhờ đội bóng bầu dục All Blacks.'],
  ['Búp bê lồng Matryoshka là biểu tượng của nước nào?', ['Nga', 'Ba Lan', 'Ukraina', 'Séc'], 0, 'Matryoshka gồm nhiều búp bê gỗ lồng vào nhau.'],
  ['Giày gỗ và hoa tulip là biểu tượng của nước nào?', ['Hà Lan', 'Đan Mạch', 'Bỉ', 'Thụy Điển'], 0, 'Giày gỗ klompen là nét truyền thống Hà Lan.'],
  ['Lễ Tạ ơn (Thanksgiving) ở Mỹ diễn ra vào ngày nào?', ['Thứ Năm thứ tư của tháng 11', 'Ngày 4/7', 'Ngày 31/10', 'Ngày 25/12'], 0, 'Gia đình quây quần bên gà tây nướng.'],
  ['Kim tự tháp Giza nằm ở quốc gia nào?', ['Ai Cập', 'Mexico', 'Peru', 'Sudan'], 0, 'Đại kim tự tháp Giza là kỳ quan cổ đại duy nhất còn tồn tại.'],
  ['Điệu nhảy Tango bắt nguồn từ vùng nào?', ['Argentina', 'Cuba', 'Brazil', 'Mexico'], 0, 'Tango ra đời ở vùng sông Río de la Plata, Buenos Aires.'],
  ['Halloween bắt nguồn từ lễ hội cổ nào?', ['Samhain của người Celt', 'Saturnalia của La Mã', 'Diwali của Ấn Độ', 'Hanami của Nhật'], 0, 'Samhain đánh dấu kết thúc mùa thu hoạch.'],
  ['Thành cổ Machu Picchu do nền văn minh nào xây dựng?', ['Inca', 'Maya', 'Aztec', 'Ai Cập'], 0, 'Machu Picchu nằm trên dãy Andes, Peru.'],
  ['Lễ hội ném cà chua La Tomatina diễn ra ở nước nào?', ['Tây Ban Nha', 'Ý', 'Mexico', 'Hy Lạp'], 0, 'La Tomatina ở thị trấn Buñol vào tháng 8.'],
  ['Thế vận hội Olympic cổ đại bắt nguồn từ đâu?', ['Hy Lạp', 'La Mã', 'Ai Cập', 'Ba Tư'], 0, 'Olympic cổ đại diễn ra ở Olympia, Hy Lạp.'],
];

// Chủ đề của từng câu Việt Nam (theo thứ tự trong mảng vn) — dùng cho đề thi đổi chủ đề mỗi ngày.
const VN_TOPIC = ['tet', 'tet', 'tet', 'tet', 'tet', 'tet', 'tet', 'tet', 'tet', 'tet', 'tet', 'tet', 'lichsu', 'lichsu', 'lichsu', 'lichsu', 'lichsu',
  'disan', 'disan', 'disan', 'disan', 'disan', 'disan', 'disan', 'disan', 'nghethuat', 'disan', 'nghethuat', 'nghethuat', 'lichsu',
  'nghethuat', 'nghethuat', 'nghethuat', 'disan', 'disan', 'nghethuat', 'nghethuat', 'nghethuat', 'nghethuat', 'tet'];

let id = 0;
const build = (pack, rows) => rows.map(([q, options, a, exp], i) => ({ id: ++id, pack, topic: pack === 'vn' ? VN_TOPIC[i] : pack, q, options, a, exp }));

export const QUESTIONS = [...build('vn', vn), ...build('asia', asia), ...build('world', world)];

// Chủ đề bài thi trong lớp xoay vòng theo ngày (giờ Việt Nam)
export const TOPICS = [
  { id: 'tet', name: 'Lễ Tết & phong tục Việt Nam' },
  { id: 'disan', name: 'Di sản UNESCO của Việt Nam' },
  { id: 'lichsu', name: 'Truyền thuyết & lịch sử dựng nước' },
  { id: 'nghethuat', name: 'Văn học & nghệ thuật dân gian' },
  { id: 'asia', name: 'Văn hóa các nước Châu Á' },
  { id: 'world', name: 'Văn hóa các nước trên thế giới' },
  { id: 'mix', name: 'Tổng hợp văn hóa Việt Nam' },
];
