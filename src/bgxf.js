// ===== Ảnh nền: xoay, lật, kéo tay nắm đổi kích thước =====
// bg = { src, x, y (tâm, mm), w (rộng, mm), rot (độ, ngược chiều kim đồng hồ), fx, fy (lật ngang / dọc), op, show, lock }
const bgReady = () => { const bg = S.model.bg; return bg && bg.show !== false && S.bgImg && S.bgImg.complete && S.bgImg.naturalWidth ? bg : null; };
const bgH = bg => bg.w * S.bgImg.naturalHeight / S.bgImg.naturalWidth;
const bgEditable = () => { const bg = bgReady(); return bg && !bg.lock && S.tool === 'select' ? bg : null; };
// hệ cục bộ của ảnh (u sang phải, v lên trên, chưa xoay) ↔ thế giới
function bgToWorld(bg, u, v) { const a = (bg.rot || 0) * D2R, c = Math.cos(a), s = Math.sin(a); return { x: bg.x + u * c - v * s, y: bg.y + u * s + v * c }; }
function bgToLocal(bg, w) { const a = (bg.rot || 0) * D2R, c = Math.cos(a), s = Math.sin(a), dx = w.x - bg.x, dy = w.y - bg.y; return { u: dx * c + dy * s, v: -dx * s + dy * c }; }
// 4 góc (thứ tự: trên-trái, trên-phải, dưới-phải, dưới-trái theo hệ ảnh) + tay nắm xoay
function bgHandles(bg) {
  const hw = bg.w / 2, hh = bgH(bg) / 2, off = 26 / S.view.s;
  return { corners: [[-hw, hh], [hw, hh], [hw, -hh], [-hw, -hh]].map(([u, v]) => bgToWorld(bg, u, v)), rot: bgToWorld(bg, 0, hh + off), top: bgToWorld(bg, 0, hh) };
}
function drawBg() {
  const bg = bgReady(); if (!bg) return;
  const h = bgH(bg), c = w2s(bg), s = S.view.s;
  ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(-(bg.rot || 0) * D2R); ctx.scale(bg.fx ? -1 : 1, bg.fy ? -1 : 1);
  ctx.globalAlpha = bg.op ?? .5; ctx.drawImage(S.bgImg, -bg.w * s / 2, -h * s / 2, bg.w * s, h * s); ctx.restore(); ctx.globalAlpha = 1;
}
// khung + tay nắm: vẽ sau cùng (trên các khâu) để luôn bấm/nhìn thấy được
function drawBgHandles() {
  const bg = bgEditable(); if (!bg) return;
  const H = bgHandles(bg), P = H.corners.map(w2s), r = w2s(H.rot), t = w2s(H.top);
  ctx.strokeStyle = colors.accent; ctx.lineWidth = 1; ctx.setLineDash([6, 4]); ctx.beginPath(); P.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(t.x, t.y); ctx.lineTo(r.x, r.y); ctx.stroke();
  ctx.fillStyle = colors.panel; ctx.lineWidth = 1.5;
  for (const p of P) { ctx.beginPath(); ctx.rect(p.x - 6, p.y - 6, 12, 12); ctx.fill(); ctx.stroke(); }
  ctx.beginPath(); ctx.arc(r.x, r.y, 7.5, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(r.x, r.y, 2.4, 0, TAU); ctx.fillStyle = colors.accent; ctx.fill();
}
// chọn trúng tay nắm (tọa độ màn hình)
function bgHandleHit(x, y) {
  const bg = bgEditable(); if (!bg) return null; const H = bgHandles(bg), r = w2s(H.rot);
  if (Math.hypot(r.x - x, r.y - y) < 11) return { k: 'rot' };
  for (let i = 0; i < 4; i++) { const p = w2s(H.corners[i]); if (Math.abs(p.x - x) < 9 && Math.abs(p.y - y) < 9) return { k: 'corner', i }; }
  return null;
}
function bgXfStart(hh, x, y) {
  const bg = S.model.bg, H = bgHandles(bg), m = s2w(x, y);
  return { kind: 'bgxf', hh, moved: false, w0: bg.w, x0: bg.x, y0: bg.y, rot0: bg.rot || 0, a0: Math.atan2(m.y - bg.y, m.x - bg.x), corner: hh.k === 'corner' ? H.corners[hh.i] : null, anchor: hh.k === 'corner' ? H.corners[(hh.i + 2) % 4] : null };
}
function bgXfMove(d, x, y, ev) {
  const bg = S.model.bg, m = s2w(x, y); d.moved = true;
  if (d.hh.k === 'rot') { // xoay quanh tâm; Shift: bước 15°
    let r = d.rot0 + (Math.atan2(m.y - d.y0, m.x - d.x0) - d.a0) * R2D; if (ev && ev.shiftKey) r = Math.round(r / 15) * 15;
    bg.rot = ((r % 360) + 540) % 360 - 180; return;
  }
  // kéo góc: giữ góc đối diện (Shift: giữ tâm), giữ tỉ lệ ảnh
  const centre = ev && ev.shiftKey, A = centre ? { x: d.x0, y: d.y0 } : d.anchor, D = { x: d.corner.x - A.x, y: d.corner.y - A.y }, L2 = D.x * D.x + D.y * D.y || 1;
  const k = Math.max(0.02, ((m.x - A.x) * D.x + (m.y - A.y) * D.y) / L2);
  bg.w = Math.max(2, d.w0 * k);
  if (centre) { bg.x = d.x0; bg.y = d.y0; } else { bg.x = A.x + D.x * k / 2; bg.y = A.y + D.y * k / 2; }
}
// thao tác nhanh từ bảng Ảnh nền
function bgOp(op) {
  const bg = S.model.bg; if (!bg) return;
  if (op === 'r+') bg.rot = (((bg.rot || 0) + 90 + 540) % 360) - 180;
  else if (op === 'r-') bg.rot = (((bg.rot || 0) - 90 + 540) % 360) - 180;
  else if (op === 'fx') bg.fx = !bg.fx;
  else if (op === 'fy') bg.fy = !bg.fy;
  else if (op === 'reset') { bg.rot = 0; bg.fx = false; bg.fy = false; }
  syncBgPanel(); changed();
}
