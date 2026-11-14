# Báo cáo kiểm chứng (đợt 1: cơ cấu bốn khâu) — 2026-10-25

Build: OK (build.py, 30 module) · node --check trên toàn bộ script: OK · Lỗi JS khi chạy trong Chromium: 0

## Tóm tắt
- Động học four-bar crank-rocker: 300/300 đạt
- Phân loại Grashof (gr_crock / gr_dcrank / gr_drock / gr_none): 300/300 đạt
- Kết luận: solver động học bốn khâu đạt ở các tiêu chí dưới đây. Chưa kiểm: slider-crank, cơ cấu sáu khâu, va chạm, tự hãm, xuất STEP/DXF, .xcc round-trip, undo/redo, cơ cấu đồ chơi.

## Tiêu chí và oracle
Oracle là mô phỏng hình học độc lập (giao hai đường tròn theo góc tay quay, không dùng LM của solver), không dùng công thức đóng.

| Tiêu chí | Ngưỡng | Kết quả lớn nhất |
|---|---|---|
| Đóng vòng (|G1J1|=a, |J1J2|=b, |J2G2|=c) | < 1e-4 mm | 1.4e-6 mm |
| Khoảng cách G2–J1 cực trị so với |g−a|, g+a | < 0.05 mm | 0.023 mm (một chiều, do lấy mẫu góc rời rạc) |
| Biên độ hành trình khâu lắc so với mô phỏng độc lập | < 0.05° | 0.047° (sai số lấy mẫu) |
| Vị trí J2 tại mỗi góc tay quay so với nghiệm hình học | < 1e-3 mm | 5.9e-5 mm |
| Quay đủ một vòng tay quay | có | 300/300 |

Phân loại Grashof: 300 bộ chiều dài ngẫu nhiên, dựng cơ cấu hình học nhất quán, so với quy tắc Grashof tính tay. Phân bố: gr_none 140, gr_crock 81, gr_dcrank 41, gr_drock 38.

## Ghi chú về quá trình
- Hai lần chạy đầu thất bại hoàn toàn. Nguyên nhân nằm ở oracle giải tích do tôi viết (quên góc γ, rồi dùng sai vị trí biên), không phải solver. Sau khi thay bằng mô phỏng độc lập, solver khớp với sai số lấy mẫu.
- Ngưỡng khoảng cách biên 0.05 mm được chọn từ sai số lấy mẫu (solver chỉ có các khung theo góc rời rạc), không phải để làm test đạt.
- Chưa có: đối chiếu với bộ golden của dự án, và chưa kiểm động học tại các cấu hình gần điểm chết.

## File liên quan
- physics/run_fourbar.py — script chạy, đường dẫn HTML đang trỏ tới /mnt/user-data/uploads/xuong-co-cau/MrT-Motion-Gen.html (đổi nếu chạy trên máy khác)
