# DOHA — Lớp học ảo 3D & Kho tàng tri thức

## 1. Concept tóm tắt

**Một lớp học truyền thống Việt Nam được số hóa thành không gian 3D nhiều người chơi**, kết hợp game hóa việc học văn hóa các nước (trọng tâm là Việt Nam).

| Trụ cột | Ý tưởng | Vòng lặp người chơi |
|---|---|---|
| **Lớp học ảo** (chức năng chính) | Mỗi ghế là một vị trí. Avatar vào lớp, ngồi, làm bài, viết bảng, đi lại, trò chuyện, quay cóp (và có thể bị cô giáo bắt). Camera kiểu PUBG. | Vào lớp → ngồi → làm bài → nhận xu |
| **Kho tàng tri thức** | Đường làng với 10 cổng làng; mỗi cổng là một câu hỏi. Có 3 tim, chuỗi trả lời đúng (streak) tăng thưởng. Về đích thì mở rương. | Chọn gói → vượt ải → rương → mua đồ |
| **Kinh tế & sưu tầm** | Xu 🪙 (kiếm từ học tập) + kim cương 💎 (hiếm, từ rương/điểm danh). Trang phục truyền thống, mũ, ba lô, phấn, khóa học. | Kiếm → mua → khoe trong lớp |
| **Live-ops** | Điểm danh, nhiệm vụ ngày, lễ hội theo lịch VN, bảng xếp hạng. | Quay lại mỗi ngày |

Thông điệp: *"Học văn hóa để mặc văn hóa"*: kiến thức kiếm được dùng để mở khóa áo dài, nón lá, áo tứ thân… rồi mặc vào lớp học.

## 2. Pipeline phát triển

```
 Giai đoạn 0          Giai đoạn 1 (MVP ✅)      Giai đoạn 2              Giai đoạn 3              Giai đoạn 4
 Thiết kế             Prototype chơi được      Nội dung & đồ họa         Xã hội & quy mô           Vận hành
 ───────────          ─────────────────        ─────────────────         ────────────────          ──────────
 • GDD, luồng UX      • Three.js scene         • Model GLB (Blender)     • Voice chat WebRTC       • Live-ops theo lịch
 • Ngân hàng câu hỏi  • Avatar khối + anim     • Avatar Ready Player Me/ • Nhiều phòng học,        • Battle pass mùa
 • Kinh tế (xu/gem)   • Camera TPP/FPP/Alt       VRoid + Mixamo anim       giáo viên thật tạo lớp  • Analytics, A/B test
 • Moodboard          • WebSocket đồng bộ      • Mở rộng câu hỏi (CMS)   • Colyseus room scaling  • Chống gian lận
                      • Quiz/Shop/Events       • Âm thanh, hiệu ứng      • PostgreSQL + Redis     • Mobile (touch UI)
```

**Quy trình mỗi tính năng:** Thiết kế (GDD) → Prototype → Playtest nội bộ → Điều chỉnh cân bằng → Nội dung → Release → Đo đạc.

**Pipeline asset 3D (giai đoạn 2):** Blender (model low-poly, ~5k tris/bàn ghế) → bake texture → export `.glb` + nén Draco → `GLTFLoader` trong Three.js. Avatar: Ready Player Me hoặc VRoid → rig Mixamo (idle/walk/run/sit/wave/write) → `AnimationMixer`.

## 3. Kiến trúc kỹ thuật (đã cài đặt)

```
Trình duyệt (Three.js r160, ES modules, không cần build)
 ├─ classroom.js  phòng học dựng bằng code: 30 ghế, bảng đen canvas, quạt, đồng hồ thật
 ├─ avatar.js     nhân vật khối, anim "base|action", phụ kiện
 ├─ controls.js   di chuyển + va chạm AABB, camera PUBG (TPP vai phải/FPP/Alt free-look/chuột phải ngắm)
 ├─ npc.js        cô giáo đi tuần (vị trí tính theo đồng hồ → mọi máy thấy giống nhau) + bạn học ảo
 ├─ board.js      nét phấn lưu theo UV → đồng bộ cho mọi người
 ├─ exam.js       bài kiểm tra theo ca thi 10 phút (cả lớp cùng đề) + quay cóp
 ├─ papers.js     tờ bài làm 3D trên từng bàn (đáp án cập nhật trực tiếp), xem phóng to bằng F
 ├─ quest.js      scene vượt ải riêng
 ├─ shop.js       cửa hàng + phòng thử đồ 3D
 └─ events.js     điểm danh, nhiệm vụ, lễ hội, xếp hạng
        │  REST (/api/*)                     │  WebSocket (/ws)
        ▼                                    ▼
Node.js server (server/index.js)
 ├─ Tài khoản (scrypt), phiên đăng nhập
 ├─ Server quyết định toàn bộ kinh tế: giá, chấm điểm, rương, thưởng (client không tự cộng xu)
 ├─ Câu hỏi chỉ nằm ở server, đáp án được xáo trộn mỗi lượt
 ├─ Phòng học: ghế (chống ngồi trùng), vị trí, chat, nét phấn
 └─ Lưu: db.json → (production) PostgreSQL + Redis
```

**Nâng cấp lên production:** Colyseus (room/state sync, interest management), xác thực OAuth, PostgreSQL, CDN cho asset, nhận diện gian lận phía server (ví dụ tốc độ trả lời bất thường).

## 4. Điều khiển (theo PUBG)

| Phím | Chức năng |
|---|---|
| WASD / Shift | Đi / chạy |
| Chuột · Lăn chuột | Xoay camera · zoom TPP |
| **V** | Đổi góc nhìn **TPP ↔ FPP** |
| **Giữ Alt** | **Free look**: nhìn 360° mà thân không xoay; thả ra camera tự quay về |
| **Chuột phải** | Ngắm gần: FOV hẹp, camera sát vai, đi chậm |
| E | Ngồi / đứng / viết bảng |
| **F** | **Xem tờ bài làm** của bàn gần nhất (đang ngồi → bạn cùng bàn) |
| X | Làm bài kiểm tra (khi đang ngồi) |
| Giữ C (khi thi) | Quay cóp: ngó sang bàn bên, sau 1.3 giây thấy rõ bài bạn (bài đó chưa chắc đúng!) |
| 1–4 | Vẫy tay, giơ tay phát biểu, vỗ tay, gật đầu |
| Enter / Tab | Chat / đổi Cả lớp ↔ Thì thầm (chỉ người trong bán kính 4m nghe được) |

## 5. Cửa hàng: gợi ý dựa trên các game nổi tiếng

| Cơ chế | Lấy cảm hứng từ | Trạng thái |
|---|---|---|
| Hàng nổi bật xoay vòng mỗi ngày, giảm 20% | Fortnite Item Shop | ✅ |
| 4 bậc độ hiếm (xám/xanh/tím/vàng) | PUBG, Fortnite, Valorant | ✅ |
| Phòng thử đồ 3D trước khi mua | Fortnite Locker, Roblox Avatar Editor | ✅ |
| Rương rơi đồ theo thành tích (không bán rương lấy tiền thật) | PUBG Crate, nhưng an toàn cho học sinh | ✅ |
| Hai loại tiền: xu (kiếm được) + kim cương (hiếm) | Liên Quân, Free Fire, Genshin | ✅ |
| Bộ trang phục theo chủ đề (Bundle) | Valorant Bundle, Liên Quân | 🔜 |
| Skin giới hạn theo sự kiện (áo dài Tết, đèn Trung Thu) | Genshin, Fortnite Seasonal | 🔜 (đã có dữ liệu sự kiện) |
| Đồ do người chơi thiết kế (UGC) | Roblox UGC, Minecraft Marketplace | 🔜 giai đoạn 4 |

**Danh mục đề xuất:** Trang phục (đồng phục, áo dài, áo bà ba, áo tứ thân, áo the, hanbok, kimono, hoàng bào) · Mũ (nón lá, khăn đóng, mũ cánh chuồn, mũ tốt nghiệp) · Ba lô (cặp sách, gùi Tây Nguyên, đèn ông sao) · Phấn màu · Khóa học (gói câu hỏi Châu Á, Thế giới) · *sắp tới:* biểu cảm, khung tên, thú cưng (trâu, chim Lạc), trang trí bàn học, nhạc nền.

## 6. Tính năng phụ phổ biến trong game: research & gợi ý

| Tính năng | Game tham khảo | Áp dụng cho Doha | Trạng thái |
|---|---|---|---|
| **Điểm danh 7 ngày** | Genshin, Liên Quân | Chuỗi 7 ngày, ngày 7 tặng 5💎, lỡ 1 ngày thì tính lại | ✅ |
| **Nhiệm vụ ngày** | Hầu hết game mobile | Trả lời đúng 10 câu, vượt 1 ải, nộp bài, chat, viết bảng | ✅ |
| **Sự kiện thường niên** | Fortnite, Genshin | Tết, Giỗ Tổ, Trung Thu, 20/11, 2/9, Khai giảng, Halloween, Giáng sinh, nhân xu x1.5–x2 | ✅ |
| **Bảng xếp hạng** | Mọi game cạnh tranh | Theo XP; sau này thêm bảng tuần, bảng theo lớp/trường | ✅ |
| **Battle Pass / "Sổ liên lạc"** | Fortnite, PUBG, Liên Quân | Mùa 3 tháng, 50 cấp, nhánh miễn phí và nhánh cao cấp | 🔜 |
| **Thành tựu & danh hiệu** | Steam, Xbox | "Trạng nguyên" (100 câu đúng), "Sĩ tử liều" (bị bắt quay cóp 10 lần) | 🔜 |
| **Thi đấu theo giờ** (Live quiz) | Kahoot, Trivia Crack | 20h mỗi tối: cả server trả lời cùng lúc, top 10 nhận quà | 🔜 |
| **Hội nhóm / Lớp** | Clan trong Liên Quân | Lập lớp, thi đua giữa các lớp, thầy cô tạo đề riêng | 🔜 |
| **Bạn bè, tặng quà** | Liên Quân, Roblox | Kết bạn, tặng skin dịp 20/11 hoặc 8/3 | 🔜 |
| **Mini-game trong lớp** | Among Us, Roblox | "Ô ăn quan", "Rung chuông vàng", "Đuổi hình bắt chữ" | 🔜 |
| **Thú cưng / đồng hành** | Genshin, Free Fire | Trâu vàng, chim Lạc đi theo avatar | 🔜 |
| **Thời tiết / ngày đêm** | Animal Crossing | Mưa bên cửa sổ, nắng sớm, lớp học buổi tối | 🔜 |
| **Phòng riêng / trang trí** | Animal Crossing, Roblox | Góc học tập riêng trang trí bằng đồ sưu tầm | 🔜 |

**Lưu ý cho đối tượng học sinh:** không bán rương may rủi bằng tiền thật, có giới hạn thời gian chơi, bộ lọc chat và nút báo cáo, chế độ lớp riêng cho giáo viên.

## 7. Lộ trình gợi ý

1. **Tuần 1–2:** playtest MVP với 5–10 người, cân bằng xu và giá đồ, mở rộng lên 200+ câu hỏi.
2. **Tuần 3–6:** thay model khối bằng GLB, avatar Mixamo, âm thanh (trống trường, tiếng phấn), hỗ trợ mobile.
3. **Tuần 7–10:** voice chat theo khoảng cách (WebRTC), Battle pass, thành tựu, live quiz.
4. **Tuần 11+:** Colyseus + PostgreSQL, nhiều phòng, công cụ cho giáo viên, triển khai cloud.
