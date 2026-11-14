# MotionExpert — MrT Motion Gen

Phần mềm mô phỏng và tổng hợp **cơ cấu thanh phẳng** cho thiết kế chuyển động đồ chơi (tương tự motiongen.io). Giao diện song ngữ **Tiếng Việt / English**.

## Chạy
**Mở trực tuyến:** https://tonynguyen91.github.io/MotionExpert/

Hoặc tải file [`MrT-Motion-Gen.html`](MrT-Motion-Gen.html) và mở bằng Edge/Chrome. Không cần cài đặt, chạy hoàn toàn offline (phông chữ nhúng sẵn, không thư viện/CDN ngoài, không gửi dữ liệu đi, không dùng localStorage/cookie).

## Tính năng chính
- Khâu, tấm, xi lanh, rãnh, motor quay / tịnh tiến, giới hạn góc, vị trí đã lưu
- Phác thảo + ràng buộc + chỉnh sửa theo thao tác **Onshape**; closed profile → part; mate (cố định, xoay, trượt, song song, bằng nhau, đồng tâm, tiếp tuyến)
- Va chạm và tương tác vật lý gần tĩnh, trọng lực / lò xo, tự hãm do ma sát, kẹt ngăn kéo
- Phân tích: Grashof, vị trí biên, điểm chết, góc truyền, tâm quay tức thời, vùng quét, bậc tự do chưa dẫn
- Vật liệu nhựa + FEA ứng suất phẳng cho part (ABS, PP, POM, PA6, PC, HIPS, PE)
- Tổng hợp cơ cấu 4 khâu theo tư thế
- Xuất DXF (Onshape), STEP AP214, PNG / video / GIF; lưu/mở dự án `.xcc`

## Phát triển
```
python build.py        # ghép src/* → MrT-Motion-Gen.html + index.html (GitHub Pages) + xuong-co-cau.html (bị .gitignore)
```
- Mã nguồn: `src/` (thứ tự ghép module trong `build.py`)
- Kiến trúc, quy ước và quy trình làm việc: [`CLAUDE.md`](CLAUDE.md)
- Bàn giao / trạng thái hiện tại: [`docs/HANDOFF.md`](docs/HANDOFF.md)
- Kiểm chứng vật lý: `tests/physics/`, tác tử hỗ trợ: `agents/`

Mục tiêu tiếp theo: đóng gói thành ứng dụng Windows 11 (.exe), ví dụ bằng Electron/Tauri.
