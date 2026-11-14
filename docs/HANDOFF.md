# Bàn giao dự án MotionExpert (MrT Motion Gen)

Cập nhật: 2026-11-14. Đọc file này trước, sau đó đọc [`CLAUDE.md`](../CLAUDE.md) (kiến trúc + quy ước, rất chi tiết).

## Người dùng
- Tung, kỹ sư thiết kế cơ khí đồ chơi (Onshape, 2 năm); trước đó 10 năm thiết kế vỏ ô tô/xe máy (CATIA V5).
- **Luôn trả lời bằng tiếng Việt.** Câu hỏi thường ngắn, hay gửi ảnh chụp màn hình: đọc ảnh kỹ, sửa thẳng vào mã, kiểm thử rồi báo kết quả ngắn gọn.
- Thao tác phác thảo phải **giống Onshape** (chuẩn đối chiếu khi có tranh cãi).
- Người dùng mang phần mềm lên công ty: **tuyệt đối offline**, không CDN/thư viện ngoài, không gửi dữ liệu, không localStorage/cookie/IndexedDB.

## Nơi để mã
| Nơi | Vai trò |
|---|---|
| GitHub `TonyNguyen91/MotionExpert`, nhánh `main` (public) | Nguồn chuẩn. **Mỗi lần cập nhật: build → kiểm tra → commit → `git push origin main`** (xem mục Git trong CLAUDE.md). |
| `D:\xuong-co-cau` trên máy Windows 11 của người dùng | Thư mục người dùng mở app hằng ngày (`MrT-Motion-Gen.html`). Không phải repo git. Phiên có liên kết máy thì ghi file đã đổi về đây sau mỗi lần push. Người dùng cũng có thể chạy Claude Code (PowerShell) trực tiếp trong thư mục này. |
| `D:\xuong-co-cau\MotionExpert\` | Bản clone riêng của người dùng, đã `.gitignore`, đừng đụng tới. |

Quy trình chuẩn của một phiên mới (cloud):
1. Clone repo (`git clone --depth 1 https://github.com/TonyNguyen91/MotionExpert`).
2. Nếu có liên kết máy: so sánh `D:\xuong-co-cau\src` với repo (kích thước/mtime, rồi đọc diff). Máy mới hơn → commit "Đồng bộ từ máy" trước.
3. Sửa trong `src/` → `python build.py` → `node --check` từng khối `<script>` của bản build → Playwright (Chromium có sẵn, `require('playwright')`) mở `file://.../MrT-Motion-Gen.html`, thao tác thử, bắt `pageerror`.
4. Commit tiếng Việt + push. Ghi file về `D:\xuong-co-cau` (src/*, CLAUDE.md, docs/*, `MrT-Motion-Gen.html` và bản sao `xuong-co-cau.html`). Khi ghi về máy, dùng mtime vừa stage làm `expectedMtimeMs` để không ghi đè sửa đổi của người dùng.
5. Báo người dùng: đã sửa gì, F5 để tải lại.

## Trạng thái hiện tại (v1.0)
App đầy đủ: khâu/tấm/xi lanh/rãnh/motor, phác thảo kiểu Onshape, part + mate, va chạm & vật lý gần tĩnh, tự hãm ma sát, FEA nhựa, tổng hợp 4 khâu, xuất DXF/STEP/PNG/video/GIF, lưu `.xcc`. Chi tiết từng module trong CLAUDE.md.

### Việc làm gần nhất (2026-10-31): thanh điều khiển motor (dock dưới vùng vẽ)
- Làm lại thanh motor cho to hơn, trực quan hơn nhưng vẫn gọn (khoảng 76 px): mặt đồng hồ mini, chip motor, θ chữ to + chiều quay ↺/↻, Δ biên độ, thanh θ 2 núm có nhãn giá trị và vạch chia, ô nhập Đầu/Cuối, nút Đảo chiều có chữ, công tắc Giới hạn có nhãn, 5 ghi chú (?) song ngữ. Mã: `ui5.html` (.dmotor), `layout5.css`, `app5_main.js` (renderDock/renderDial/renderTicks/setLimit/endRangeDrag), chuỗi `d_*`/`dtip_*` trong `app5_i18n.js`.
- Sửa lỗi núm dính chuột sau khi nhả (do bôi chọn chữ → kéo-thả chữ → pointercancel): pointerdown `preventDefault`, xử lý pointercancel/lostpointercapture/blur, kiểm `e.buttons`; dock `user-select: none`.
- Chữ nhòe: nhãn/vạch chia căn bằng hộp rộng cố định + làm tròn px (không dùng `translateX(-50%)`); hai núm sát nhau thì tự tách nhãn.
- Ô Đầu/Cuối là input **text** (không phải number) để tránh bộ ↑↓/lăn 0.1 dùng chung của `sk_onshape.js`; ↑↓/lăn ±1°, Shift ±10°.
- Mục Hiển thị: thêm 2 ô tích `optMkLim` / `optMkDead` (S.opt.mklim / mkdead) để ẩn/hiện vạch vị trí biên (xanh) và điểm chết (cam) trên thanh θ (`renderThetaMarks` trong `insight.js`).

## Gợi ý việc tiếp theo (chưa ai yêu cầu cụ thể, chỉ để tham khảo)
- Đóng gói Windows 11 (.exe) bằng Electron/Tauri (mục tiêu đã nêu trong CLAUDE.md).
- Các giới hạn đã biết ở cuối CLAUDE.md: vật lý gần tĩnh (chưa quán tính), mate bằng nhau chỉ 1:1, chưa có lăn không trượt, CP tự do chưa là vật cản nền, xi lanh chưa xuất STEP.
- `tests/physics/REPORT.md`: mới kiểm chứng four-bar; chưa kiểm slider-crank, 6 khâu, va chạm, tự hãm, round-trip `.xcc`.

## Nhật ký thay đổi
- 2026-11-14 — Đưa toàn bộ dự án lên GitHub (commit đầu), thêm README, .gitignore, quy tắc Git trong CLAUDE.md, tài liệu bàn giao này.
- 2026-10-31 — Thanh motor mới + sửa núm dính chuột + tùy chọn ẩn vạch biên/điểm chết (xem trên).
