# Lớp mình 3D — Lớp học ảo 3D

Lớp học truyền thống 3D nhiều người chơi + sân trường (lá bay, cầu lông đối kháng) + vượt ải kiến thức văn hóa + cửa hàng + sự kiện.
Concept, pipeline và gợi ý tính năng nằm trong [PLAN.md](PLAN.md).

## Chạy

```bash
npm install
npm start          # http://localhost:3000
```

Mở 2 tab (hoặc 2 máy cùng mạng LAN, truy cập `http://<IP-máy-chủ>:3000`) và tạo 2 nhân vật để thấy nhau trong lớp.

## Cấu trúc

```
server/index.js       REST API + WebSocket + lưu db.json
server/questions.js   Ngân hàng câu hỏi (vn / asia / world)
public/index.html     Giao diện
public/js/            classroom, avatar, controls (camera PUBG), board, npc, exam, quest, shop, events, main
public/js/data/       items.js (vật phẩm), events.js (lịch lễ hội)
```

Thêm câu hỏi: nối vào mảng trong `server/questions.js` (đáp án đúng đặt ở vị trí đầu tiên, server sẽ tự xáo trộn).
Thêm vật phẩm: thêm vào `public/js/data/items.js` và (nếu là mũ/ba lô mới) dựng hình trong `buildHat`/`buildBag` ở `avatar.js`.
