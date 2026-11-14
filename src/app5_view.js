// ===== Vẽ =====
const cv = document.getElementById('cv'), ctx = cv.getContext('2d');
const stage = document.getElementById('stage');
let W = 0, H = 0, DPR = 1, colors = {};
const LINKC = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6'];
const offA = document.createElement('canvas'), offB = document.createElement('canvas');
const cA = offA.getContext('2d'), cB = offB.getContext('2d');
function readColors() {
  const cs = getComputedStyle(document.documentElement);
  for (const k of ['paper', 'sheet', 'ink', 'ink-2', 'line', 'grid-minor', 'grid-major', 'accent', ...LINKC, 'ok', 'warn', 'bad', 'panel', 'trace', 'sketch', 'sk-free'])
    colors[k] = cs.getPropertyValue('--' + k).trim();
}
const isDriven = L => S.model.motors.some(m => m.link === L.id || m.cyl === L.id || (m.lin && L.joints.includes(m.lin)) || (m.mate && (S.model.mates.find(q => q.id === m.mate) || {}).a === L.id));
const linkColor = L => isDriven(L) ? colors.accent : colors[LINKC[S.model.links.indexOf(L) % 6]];
const linkColorVar = L => isDriven(L) ? 'var(--accent)' : 'var(--' + LINKC[S.model.links.indexOf(L) % 6] + ')';
function resize() { const r = stage.getBoundingClientRect(); DPR = window.devicePixelRatio || 1; W = r.width; H = r.height; cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); draw(); }
const w2s = p => ({ x: W / 2 + (p.x - S.view.ox) * S.view.s, y: H / 2 - (p.y - S.view.oy) * S.view.s });
const s2w = (x, y) => ({ x: (x - W / 2) / S.view.s + S.view.ox, y: -(y - H / 2) / S.view.s + S.view.oy });
function niceStep(px) { for (const s of [1, 2, 5, 10, 20, 50, 100, 200, 500]) if (s * S.view.s >= px) return s; return 1000; }
const isSel = (k, id) => (S.sel && S.sel.k === k && S.sel.id === id) || (S.msel && S.msel.some(o => o.k === k && o.id === id));
const isHov = (k, id) => S.hover && S.hover.k === k && S.hover.id === id;
const monoFont = () => getComputedStyle(document.documentElement).getPropertyValue('--f-mono');
const bodyFont = () => getComputedStyle(document.body).fontFamily;
const wpx = L => Math.max(5, (L.w || 6) * S.view.s);
const slotPath = (c, pts) => pts.forEach((p, i) => { const q = w2s(p); i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y); }); // đường tâm rãnh (thế giới → màn hình)

// gốc tọa độ: mũi tên X (đỏ) / Y (xanh) tại gốc O(0, 0); gốc ra ngoài màn hình → biểu tượng hướng trục ở góc dưới trái
function drawOriginAxes() {
  const o = w2s({ x: 0, y: 0 }), on = o.x > 24 && o.x < W - 70 && o.y > 70 && o.y < H - 24, p = on ? o : { x: 34, y: H - 92 }, L = 46;
  ctx.save(); ctx.setLineDash([]); ctx.lineCap = 'round'; ctx.lineWidth = 2; ctx.font = '700 11px ' + monoFont(); ctx.textBaseline = 'middle';
  for (const [dx, dy, col, lb] of [[1, 0, colors.bad, 'X'], [0, -1, colors.ok, 'Y']]) {
    const q = { x: p.x + dx * L, y: p.y + dy * L }, a = Math.atan2(dy, dx);
    ctx.strokeStyle = ctx.fillStyle = col; ctx.globalAlpha = .9;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(q.x + 3 * Math.cos(a), q.y + 3 * Math.sin(a)); ctx.lineTo(q.x - 6 * Math.cos(a - .5), q.y - 6 * Math.sin(a - .5)); ctx.lineTo(q.x - 6 * Math.cos(a + .5), q.y - 6 * Math.sin(a + .5)); ctx.closePath(); ctx.fill();
    ctx.fillText(lb, q.x + (dx ? 8 : -4), q.y + (dy ? -9 : 0));
  }
  ctx.fillStyle = colors['ink-2']; ctx.globalAlpha = .9; ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, 2 * Math.PI); ctx.fill();
  ctx.fillText(on ? 'O (0, 0)' : 'X/Y', p.x + 6, p.y + 10);
  ctx.restore();
}
// thân khâu = thanh/tấm ∪ hình hợp nhất − rãnh − hình khoét, có đường viền chung
function drawLinkBody(L) {
  const pos = S.pos; if (!L.joints.every(id => pos[id])) return;
  const col = linkColor(L), w = wpx(L), hl = isSel('l', L.id) || isHov('l', L.id), hit = S.collHit && S.collHit.has(L.id);
  const pts = L.joints.map(id => w2s(pos[id]));
  const slots = S.model.slots.filter(s => s.link === L.id).map(s => ({ pts: slotPoly(s).pts, w: s.w }));
  // khung bao
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const ext = (p, r = 0) => { x0 = Math.min(x0, p.x - r); x1 = Math.max(x1, p.x + r); y0 = Math.min(y0, p.y - r); y1 = Math.max(y1, p.y + r); };
  pts.forEach(p => ext(p, w));
  featureBBoxPts(L).forEach(p => ext(p));
  x0 = Math.floor(Math.max(-50, x0 - 6)); y0 = Math.floor(Math.max(-50, y0 - 6)); x1 = Math.ceil(Math.min(W + 50, x1 + 6)); y1 = Math.ceil(Math.min(H + 50, y1 + 6));
  const bw = x1 - x0, bh = y1 - y0; if (bw <= 0 || bh <= 0) return;
  for (const c of [offA, offB]) { c.width = Math.ceil(bw * DPR); c.height = Math.ceil(bh * DPR); }
  cA.setTransform(DPR, 0, 0, DPR, -x0 * DPR, -y0 * DPR);
  cA.fillStyle = col; cA.strokeStyle = col; cA.lineCap = 'round'; cA.lineJoin = 'round'; cA.lineWidth = w;
  if (L.kind !== 'body') { cA.beginPath(); pts.forEach((p, i) => i ? cA.lineTo(p.x, p.y) : cA.moveTo(p.x, p.y)); if (pts.length > 2) { cA.closePath(); cA.fill(); } cA.stroke(); }
  applyFeatures(cA, L); cA.fillStyle = col;
  const mat = L.kind === 'body' && L.mat; // part đã gán vật liệu: sọc chéo + viền dày hơn để dễ nhận ra
  cA.globalCompositeOperation = 'destination-out';
  for (const s of slots) { cA.lineWidth = Math.max(3, s.w * S.view.s); cA.beginPath(); slotPath(cA, s.pts); cA.stroke(); }
  cA.globalCompositeOperation = 'source-over';
  if (mat) matHatch(cA, L, x0, y0, bw, bh);
  // viền: giãn hình rồi trừ lõi
  const r = (hl || hit ? 2.4 : mat ? 2.2 : 1.3) * DPR;
  cB.setTransform(1, 0, 0, 1, 0, 0); cB.clearRect(0, 0, offB.width, offB.height);
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; cB.drawImage(offA, Math.cos(a) * r, Math.sin(a) * r); }
  cB.globalCompositeOperation = 'source-in'; cB.fillStyle = hl ? colors.accent : hit ? colors.bad : col; cB.fillRect(0, 0, offB.width, offB.height);
  cB.globalCompositeOperation = 'destination-out'; cB.drawImage(offA, 0, 0); cB.globalCompositeOperation = 'source-over';
  const ghost = mat && feaGhost(L); // đang hiện hình biến dạng: hình gốc chỉ còn bóng mờ để so sánh
  ctx.globalAlpha = ghost ? .1 : .42; ctx.drawImage(offA, x0, y0, bw, bh); ctx.globalAlpha = ghost ? .45 : 1; ctx.drawImage(offB, x0, y0, bw, bh); ctx.globalAlpha = 1;
  // vẽ đậm đường tâm thanh để dễ đọc
  ctx.strokeStyle = col; ctx.globalAlpha = .55; ctx.lineWidth = 1; ctx.setLineDash([]);
  if (pts.length === 2 && L.kind !== 'body') { ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y); ctx.stroke(); }
  ctx.globalAlpha = 1;
}
function drawCylinder(L) {
  const A = S.pos[L.joints[0]], B = S.pos[L.joints[1]]; if (!A || !B) return;
  const a = w2s(A), b = w2s(B), d = Math.hypot(b.x - a.x, b.y - a.y) || 1, ux = (b.x - a.x) / d, uy = (b.y - a.y) / d;
  const col = linkColor(L), w = wpx(L), hl = isSel('l', L.id) || isHov('l', L.id);
  const bl = Math.min(d - 4, (L.cyl ? L.cyl.min : d * .6) * S.view.s * .92);
  ctx.lineCap = 'round';
  ctx.strokeStyle = hl ? colors.accent : colors.ink; ctx.lineWidth = Math.max(2.5, w * .42) + 2; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  ctx.strokeStyle = colors.sheet; ctx.lineWidth = Math.max(2.5, w * .42); ctx.stroke();
  ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(Math.atan2(uy, ux));
  const bh = Math.max(8, w * 1.25);
  ctx.fillStyle = col; ctx.globalAlpha = .45; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-w * .45, -bh / 2, bl + w * .45, bh, 3) : ctx.rect(-w * .45, -bh / 2, bl + w * .45, bh); ctx.fill(); ctx.globalAlpha = 1;
  ctx.strokeStyle = hl ? colors.accent : col; ctx.lineWidth = hl ? 2.5 : 1.6; ctx.stroke();
  ctx.fillStyle = col; ctx.fillRect(bl - 3, -bh / 2, 3, bh);
  ctx.restore();
}
function dimLabel(A, B, txt, boxed, off) {
  let ang = Math.atan2(B.y - A.y, B.x - A.x); if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;
  ctx.save(); ctx.translate((A.x + B.x) / 2, (A.y + B.y) / 2); ctx.rotate(ang);
  ctx.font = '500 11px ' + monoFont(); ctx.fillStyle = colors.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText(txt, 0, -off);
  if (boxed) { const tw = ctx.measureText(txt).width; ctx.strokeStyle = colors.ink; ctx.lineWidth = 1; ctx.strokeRect(-tw / 2 - 3.5, -off - 14, tw + 7, 15); }
  ctx.restore();
}
function drawMeasure(m) {
  const g = measGeom(m); if (!g) return; const P = g.d || g.a;
  const v = measValue(m); const hl = isSel('m', m.id) || isHov('m', m.id);
  const col = hl ? colors.accent : colors.ink;
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1;
  ctx.font = '500 11.5px ' + monoFont();
  if (g.d) {
    const a = w2s(P[0]), b = w2s(P[1]); const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = -(b.y - a.y) / d, ny = (b.x - a.x) / d, o = (m.off ?? 10) * S.view.s;
    const a2 = { x: a.x + nx * o, y: a.y + ny * o }, b2 = { x: b.x + nx * o, y: b.y + ny * o };
    ctx.globalAlpha = .6; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a2.x + nx * 4, a2.y + ny * 4); ctx.moveTo(b.x, b.y); ctx.lineTo(b2.x + nx * 4, b2.y + ny * 4); ctx.stroke(); ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.moveTo(a2.x, a2.y); ctx.lineTo(b2.x, b2.y); ctx.stroke();
    const ux = (b.x - a.x) / d, uy = (b.y - a.y) / d;
    for (const [p, s] of [[a2, 1], [b2, -1]]) { ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + s * ux * 7 + nx * 2.5, p.y + s * uy * 7 + ny * 2.5); ctx.lineTo(p.x + s * ux * 7 - nx * 2.5, p.y + s * uy * 7 - ny * 2.5); ctx.closePath(); ctx.fill(); }
    const txt = m.fixed ? v.toFixed(2) : '(' + v.toFixed(2) + ')';
    dimLabel(a2, b2, txt, m.fixed, 3);
    m._lbl = { x: (a2.x + b2.x) / 2, y: (a2.y + b2.y) / 2 };
  } else {
    const c = w2s(P[1]); const a1 = Math.atan2(-(P[0].y - P[1].y), P[0].x - P[1].x), a2 = Math.atan2(-(P[2].y - P[1].y), P[2].x - P[1].x);
    let da = a2 - a1; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
    const R = 30; ctx.beginPath(); ctx.arc(c.x, c.y, R, a1, a1 + da, da < 0); ctx.stroke();
    ctx.globalAlpha = .5; for (const p of [P[0], P[2]]) { const q = w2s(p); ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(q.x, q.y); ctx.stroke(); } ctx.globalAlpha = 1;
    const am = a1 + da / 2; const tx = c.x + Math.cos(am) * (R + 14), ty = c.y + Math.sin(am) * (R + 14);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('(' + v.toFixed(1) + '°)', tx, ty);
    m._lbl = { x: tx, y: ty };
  }
}
function drawJoint(j) {
  const p0 = S.pos[j.id]; if (!p0 || j.hidden) return; const P = w2s(p0);
  const ls = linksOf(j.id); const w = ls.length ? Math.max(...ls.map(wpx)) : 8; const r = Math.max(3.5, Math.min(9, w * .32));
  if (j.fixed) {
    ctx.fillStyle = lk(j).pos ? colors.ink : colors.panel; ctx.strokeStyle = colors.ink; ctx.lineWidth = 1.6; const t = Math.max(8, Math.min(18, w * 1.1));
    ctx.beginPath(); ctx.moveTo(P.x, P.y); ctx.lineTo(P.x - t, P.y + t * 1.3); ctx.lineTo(P.x + t, P.y + t * 1.3); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); const yb = P.y + t * 1.3; for (let k = -1; k <= 1.01; k += .5) { ctx.moveTo(P.x + k * t, yb); ctx.lineTo(P.x + k * t - 5, yb + 6); } ctx.stroke();
  }
  const mo = motorAt(j.id);
  if (mo) {
    const R = r + 9, a0 = -Math.PI * .85, a1 = Math.PI * .35, ccw = ((mo.ratio ?? 1) * (S.model.drive.reverse ? -1 : 1)) > 0;
    ctx.strokeStyle = colors.accent; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(P.x, P.y, R, a0, a1); ctx.stroke();
    // màn hình lật trục y: quay dương (ngược kim) đi theo chiều giảm góc màn hình
    const ae = ccw ? a0 : a1, s = ccw ? -1 : 1, tx = -Math.sin(ae) * s, ty = Math.cos(ae) * s, ex = P.x + R * Math.cos(ae), ey = P.y + R * Math.sin(ae);
    ctx.fillStyle = colors.accent; ctx.beginPath(); ctx.moveTo(ex + tx * 6, ey + ty * 6); ctx.lineTo(ex - ty * 4, ey + tx * 4); ctx.lineTo(ex + ty * 4, ey - tx * 4); ctx.closePath(); ctx.fill();
    drawLimitArc(mo, P, R + 10);
  }
  ctx.fillStyle = colors.sheet; ctx.strokeStyle = colors.ink; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.arc(P.x, P.y, r, 0, TAU); ctx.fill(); ctx.stroke();
  if (j.slot || j.slider) { ctx.fillStyle = colors.ink; ctx.fillRect(P.x - r * .45, P.y - r * .45, r * .9, r * .9); }
  if (j.trace) { ctx.fillStyle = colors.trace; ctx.beginPath(); ctx.arc(P.x, P.y, 3.2, 0, TAU); ctx.fill(); }
  if (isSel('j', j.id) || isHov('j', j.id) || S.draft.some(d => d.t === 'j' && d.id === j.id)) { ctx.strokeStyle = colors.accent; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(P.x, P.y, r + 5, 0, TAU); ctx.stroke(); }
  ctx.font = '600 11px ' + bodyFont(); ctx.fillStyle = colors['ink-2']; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  ctx.fillText(j.name, P.x + r + 4, P.y - r - 1);
}
function drawLimitArc(mo, P, R) {
  const lim = S.model.drive.limit; if (!lim.on) return;
  const ang = th => -(mo.phase + (mo.ratio ?? 1) * th * D2R); // góc màn hình
  let a0 = ang(lim.min), a1 = ang(lim.max);
  ctx.strokeStyle = colors.accent; ctx.globalAlpha = .28; ctx.lineWidth = 7; ctx.lineCap = 'butt';
  ctx.beginPath(); ctx.arc(P.x, P.y, R, Math.min(a0, a1), Math.max(a0, a1)); ctx.stroke(); ctx.globalAlpha = 1;
  ctx.lineWidth = 2; for (const a of [a0, a1]) { ctx.beginPath(); ctx.moveTo(P.x + Math.cos(a) * (R - 6), P.y + Math.sin(a) * (R - 6)); ctx.lineTo(P.x + Math.cos(a) * (R + 6), P.y + Math.sin(a) * (R + 6)); ctx.stroke(); }
  ctx.lineCap = 'round';
}

function draw() {
  if (!W) return;
  XF = skXform();
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = colors.sheet; ctx.fillRect(0, 0, W, H);
  // ảnh nền
  const bg = S.model.bg;
  drawBg(); // ảnh nền: xoay, lật, khung + tay nắm khi chưa khóa (bgxf.js)
  // lưới (ẩn khi xuất hoạt ảnh với tùy chọn “ẩn lưới”)
  if (!S.exportClean) {
  const minor = niceStep(9), major = minor * (minor === 2 ? 5 : minor === 5 ? 2 : 10), tl = s2w(0, 0), br = s2w(W, H);
  for (const [step, col] of [[minor, colors['grid-minor']], [major, colors['grid-major']]]) {
    ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.globalAlpha = bg && S.bgImg ? .6 : 1; ctx.beginPath();
    for (let x = Math.floor(tl.x / step) * step; x <= br.x; x += step) { const sx = Math.round(w2s({ x, y: 0 }).x) + .5; ctx.moveTo(sx, 0); ctx.lineTo(sx, H); }
    for (let y = Math.floor(br.y / step) * step; y <= tl.y; y += step) { const sy = Math.round(w2s({ x: 0, y }).y) + .5; ctx.moveTo(0, sy); ctx.lineTo(W, sy); }
    ctx.stroke(); ctx.globalAlpha = 1;
  }
  const o = w2s({ x: 0, y: 0 });
  ctx.strokeStyle = colors['ink-2']; ctx.globalAlpha = .35; ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(o.x, 0); ctx.lineTo(o.x, H); ctx.moveTo(0, o.y); ctx.lineTo(W, o.y); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
  const pos = S.pos;
  // rãnh trên nền
  for (const sl of S.model.slots) if (!sl.link) {
    const w = Math.max(3, sl.w * S.view.s), hl = isSel('s', sl.id) || isHov('s', sl.id);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = hl ? colors.accent : colors['ink-2']; ctx.lineWidth = w + 3; ctx.beginPath(); slotPath(ctx, slotPoly(sl).pts); ctx.stroke();
    ctx.strokeStyle = colors.sheet; ctx.lineWidth = w; ctx.stroke();
  }
  // rãnh vô hạn (con trượt cũ)
  const slideSkip = new Set(S.model.links.filter(L => L.kind === 'body').map(L => L.joints[1])); // part trượt: chỉ vẽ ray của khớp khung đầu
  for (const j of S.model.joints) if (j.slider && pos[j.id] && !slideSkip.has(j.id)) {
    const ux = Math.cos(j.slider.ang), uy = Math.sin(j.slider.ang); const ts = [0];
    if (S.an) for (const f of S.an.sweep) { const p = f.pos[j.id]; if (p) ts.push((p.x - j.x) * ux + (p.y - j.y) * uy); }
    ts.push((pos[j.id].x - j.x) * ux + (pos[j.id].y - j.y) * uy);
    const t0 = Math.min(...ts) - 10, t1 = Math.max(...ts) + 10, a = w2s({ x: j.x + t0 * ux, y: j.y + t0 * uy }), b = w2s({ x: j.x + t1 * ux, y: j.y + t1 * uy });
    const nx = -(b.y - a.y), ny = b.x - a.x, nl = Math.hypot(nx, ny) || 1, off = 9;
    ctx.strokeStyle = colors['ink-2']; ctx.lineWidth = 1.5;
    for (const sg of [1, -1]) { ctx.beginPath(); ctx.moveTo(a.x + sg * off * nx / nl, a.y + sg * off * ny / nl); ctx.lineTo(b.x + sg * off * nx / nl, b.y + sg * off * ny / nl); ctx.stroke(); }
  }
  // quỹ đạo
  if (S.opt.trace && S.an) for (const id in S.an.traces) {
    const tr = S.an.traces[id]; if (!tr.pts.length) continue;
    ctx.strokeStyle = colors.trace; ctx.lineWidth = 1.6; ctx.globalAlpha = .85; ctx.beginPath();
    tr.pts.forEach((p, i) => { const q = w2s(p); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }); if (tr.closed) ctx.closePath(); ctx.stroke(); ctx.globalAlpha = 1;
  }
  drawSkTraces();
  drawSwept();
  // khâu (viền đỏ nếu đang va chạm)
  S.collHit = collLinkSet();
  for (const L of S.model.links) { if (L.kind === 'cyl') drawCylinder(L); else drawLinkBody(L); }
  drawFea();
  // kích thước khâu
  if (S.opt.dims) for (const L of S.model.links) {
    if (!L.joints.every(id => pos[id]) || L.kind === 'body') continue;
    for (const [a, b] of linkPairs(L)) {
      const A = w2s(pos[a]), B = w2s(pos[b]); if (Math.hypot(B.x - A.x, B.y - A.y) < 60) continue;
      const len = Math.hypot(pos[b].x - pos[a].x, pos[b].y - pos[a].y);
      dimLabel(A, B, len.toFixed(1), L.kind !== 'cyl' && lk(L).len, wpx(L) / 2 + 3);
    }
  }
  drawPathRails(); drawLinMotors();
  drawSketch(); XF = skXform(); // phác thảo vẽ theo vị trí đứng yên; khâu MP trở lại theo tư thế
  drawSkTraceMarkers();
  // rãnh trên khâu được chọn
  for (const sl of S.model.slots) if (sl.link && (isSel('s', sl.id) || isHov('s', sl.id))) {
    ctx.strokeStyle = colors.accent; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); ctx.beginPath(); slotPath(ctx, slotPoly(sl).pts); ctx.stroke(); ctx.setLineDash([]);
  }
  for (const j of S.model.joints) drawJoint(j);
  drawMates();
  drawIC();
  drawCollisions();
  drawGuides();
  drawContactInfo();
  drawFreeDof();
  drawOriginAxes();
  drawFeaOverlay();
  drawSynth();
  for (const m of S.model.measures) drawMeasure(m);
  drawOverlay();
  drawTrimStroke();
  drawBgHandles();
  drawBoxSel();
  mpOverlay(); // xem trước dời / mảng MP
  ivPlace(); // ô nhập giá trị tại chỗ bám theo khi dời / thu phóng
  const el = document.getElementById('scalebar'), st = niceStep(70); el.querySelector('i').style.width = (st * S.view.s) + 'px'; el.querySelector('span').textContent = st + ' mm';
}

// nét nháp, dấu bắt điểm, đường gióng
function drawOverlay() {
  const sn = S.snap;
  skOverlay();
  for (const g of S.guides) { const p = w2s(g.p); ctx.strokeStyle = colors.accent; ctx.globalAlpha = .55; ctx.setLineDash([3, 4]); ctx.lineWidth = 1; ctx.beginPath(); if (g.axis === 'x') { ctx.moveTo(p.x, 0); ctx.lineTo(p.x, H); } else { ctx.moveTo(0, p.y); ctx.lineTo(W, p.y); } ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; }
  if (S.tool !== 'select' && !isSkTool(S.tool) && (S.draft.length || sn)) {
    const pts = S.draft.map(d => d.p).concat(sn ? [sn.p] : []);
    const t = S.tool; ctx.strokeStyle = colors.accent; ctx.lineWidth = 1.8; ctx.setLineDash([6, 4]);
    if (pts.length >= 2) {
      if (t === 'rect') { const a = w2s(pts[0]), b = w2s(pts[1]); ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)); }
      else if (t === 'circle') { const a = w2s(pts[0]); ctx.beginPath(); ctx.arc(a.x, a.y, Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) * S.view.s, 0, TAU); ctx.stroke(); }
      else if (t === 'slot') { const a = w2s(pts[0]), b = w2s(pts[1]); ctx.lineWidth = Math.max(3, 3 * S.view.s); ctx.globalAlpha = .35; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.globalAlpha = 1; }
      else { ctx.beginPath(); pts.forEach((p, i) => { const q = w2s(p); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }); if (t === 'poly' && pts.length > 2) ctx.closePath(); ctx.stroke(); }
      if ((t === 'link' || t === 'cyl' || (t === 'mdist' && S.draft[0].t !== 'e') || t === 'line') && pts.length === 2) {
        const a = w2s(pts[0]), b = w2s(pts[1]); ctx.setLineDash([]); dimLabel(a, b, Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y).toFixed(1), false, 6);
      }
    }
    ctx.setLineDash([]);
  }
  if (sn) {
    const q = w2s(sn.p); ctx.strokeStyle = colors.accent; ctx.fillStyle = colors.accent;
    const ring = sn.t && (sn.t !== 'grid' || S.opt.snap); // bắt vào đối tượng hoặc nút lưới nền (khi bật bắt lưới): vòng tròn rõ nhưng gọn (r 7 px)
    if (ring) {
      ctx.globalAlpha = .18; ctx.beginPath(); ctx.arc(q.x, q.y, 7, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
      ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(q.x, q.y, 7, 0, TAU); ctx.stroke(); ctx.lineWidth = 1.4;
    }
    if (sn.t === 'slot') { ctx.beginPath(); ctx.moveTo(q.x, q.y - 3.5); ctx.lineTo(q.x + 3.5, q.y); ctx.lineTo(q.x, q.y + 3.5); ctx.lineTo(q.x - 3.5, q.y); ctx.closePath(); ctx.stroke(); }
    else if (sn.t === 'mid') { ctx.beginPath(); ctx.moveTo(q.x, q.y - 3.5); ctx.lineTo(q.x + 3.5, q.y + 2.5); ctx.lineTo(q.x - 3.5, q.y + 2.5); ctx.closePath(); ctx.stroke(); }
    else if (sn.t === 'x') { ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(q.x - 4, q.y - 4); ctx.lineTo(q.x + 4, q.y + 4); ctx.moveTo(q.x + 4, q.y - 4); ctx.lineTo(q.x - 4, q.y + 4); ctx.stroke(); }
    else if (sn.t === 'on') { ctx.beginPath(); ctx.moveTo(q.x - 3, q.y - 3); ctx.lineTo(q.x + 3, q.y + 3); ctx.moveTo(q.x + 3, q.y - 3); ctx.lineTo(q.x - 3, q.y + 3); ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(q.x, q.y, ring ? 2.2 : 3, 0, TAU); ctx.fill(); }
    if (sn.label) {
      ctx.font = '600 11.5px ' + bodyFont(); const tw = ctx.measureText(sn.label).width;
      const lx = Math.min(W - tw - 18, q.x + 14), ly = Math.max(18, q.y - 16);
      ctx.fillStyle = colors.ink; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(lx, ly - 15, tw + 12, 20, 4) : ctx.rect(lx, ly - 15, tw + 12, 20); ctx.fill();
      ctx.fillStyle = colors.panel; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(sn.label, lx + 6, ly - 5);
    }
  }
}

// ===== Chọn trúng =====
function segDist(px, py, a, b) { const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1; let t = ((px - a.x) * dx + (py - a.y) * dy) / l2; t = Math.max(0, Math.min(1, t)); return { d: Math.hypot(a.x + t * dx - px, a.y + t * dy - py), t }; }
function inPoly(x, y, pts) { let c = false; for (let i = 0, k = pts.length - 1; i < pts.length; k = i++) { const a = pts[i], b = pts[k]; if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) c = !c; } return c; }
function hitJoint(x, y, exclude) {
  let best = null, bd = 13;
  for (const j of S.model.joints) { if (j.hidden || (exclude && exclude.has(j.id))) continue; const p = S.pos[j.id]; if (!p) continue; const P = w2s(p); const d = Math.hypot(P.x - x, P.y - y); if (d < bd) { bd = d; best = j.id; } }
  return best;
}
function hitLink(x, y, exclude) {
  for (let i = S.model.links.length - 1; i >= 0; i--) {
    const L = S.model.links[i]; if (exclude && exclude.has(L.id)) continue;
    const pts = L.joints.map(id => S.pos[id] && w2s(S.pos[id])); if (pts.some(p => !p)) continue;
    const n = pts.length, half = wpx(L) / 2 + 2;
    if (L.kind !== 'body') {
      for (let k = 0; k < (n > 2 ? n : 1); k++) if (segDist(x, y, pts[k], pts[(k + 1) % n]).d < half) return L.id;
      if (n > 2 && inPoly(x, y, pts)) return L.id;
    }
    XF = skXform(); const w = s2w(x, y);
    for (const f of S.model.features) if (f.link === L.id && f.op === 'union' && S.featReg[f.id] && insideAtWorld(S.featReg[f.id], w)) return L.id;
  }
  return null;
}
function hitSlot(x, y, excludeLinks) {
  let best = null, bd = Infinity;
  for (const sl of S.model.slots) {
    if (sl.link && excludeLinks && excludeLinks.has(sl.link)) continue;
    const r = polyNear(x, y, slotPoly(sl).pts.map(w2s)), tol = Math.max(7, sl.w * S.view.s / 2 + 4);
    if (r.d < tol && r.d < bd) { bd = r.d; best = { id: sl.id, p: s2w(r.p.x, r.p.y) }; }
  }
  return best;
}
function hitMeasure(x, y) { for (const m of S.model.measures) if (m._lbl && Math.hypot(m._lbl.x - x, m._lbl.y - y) < 22) return m.id; return null; }
function hitAny(x, y) {
  const j = hitJoint(x, y); if (j) return { k: 'j', id: j };
  const m = hitMeasure(x, y); if (m) return { k: 'm', id: m };
  const q = hitMate(x, y); if (q) return { k: 'q', id: q };
  const sk = hitSketch(x, y); if (sk) return sk;
  const s = hitSlot(x, y); if (s) return { k: 's', id: s.id };
  const rf = hitRegion(x, y, true); if (rf) return rf;
  const l = hitLink(x, y); if (l) return { k: 'l', id: l };
  const ra = hitRegion(x, y); if (ra) return ra;
  return null;
}

// ===== Bắt điểm (snap) =====
// mode 'joint': khớp, rãnh, thân khâu, lưới · mode 'pt': khớp, đỉnh hình, lưới
function snapAt(x, y, mode, ex = {}) {
  S.guides = [];
  const w = s2w(x, y);
  const jid = hitJoint(x, y, ex.joints);
  if (jid) return { t: 'j', id: jid, p: { ...S.pos[jid] }, label: T(ex.merge ? 'sn_merge' : 'sn_joint', { n: jname(jid) }) };
  if (mode === 'pt') {
    const sk = S.model.sketch, pm = SK.ptMap(sk); XF = skXform(true);
    for (const id of SK.usedPts(sk)) { const p = skP(id, pm); if (!p) continue; const q = w2s(p); if (Math.hypot(q.x - x, q.y - y) < 10) return { t: 'sp', id, p: { ...p }, label: T('sn_pt') }; }
  }
  if (mode === 'joint' && !ex.noSlot) { const s = hitSlot(x, y, ex.links); if (s) return { t: 'slot', id: s.id, p: s.p, label: T('sn_slot', { n: getSlot(s.id).name }) }; }
  if (mode === 'joint' && !ex.noLink) { const l = hitLink(x, y, ex.links); if (l && getL(l).kind !== 'cyl') { const p = S.opt.snap ? { x: Math.round(w.x), y: Math.round(w.y) } : w; return { t: 'link', id: l, p, label: T('sn_link', { n: getL(l).name }) }; } }
  // lưới + gióng thẳng hàng
  let p = S.opt.snap ? { x: Math.round(w.x), y: Math.round(w.y) } : { ...w };
  if (S.opt.infer) {
    const cands = []; for (const j of S.model.joints) if (!(ex.joints && ex.joints.has(j.id)) && S.pos[j.id]) cands.push(S.pos[j.id]);
    for (const d of S.draft) cands.push(d.p);
    let bx = 6, by = 6, gx = null, gy = null;
    for (const c of cands) { const q = w2s(c); if (Math.abs(q.x - x) < bx) { bx = Math.abs(q.x - x); gx = c; } if (Math.abs(q.y - y) < by) { by = Math.abs(q.y - y); gy = c; } }
    if (gx) { p.x = gx.x; S.guides.push({ axis: 'x', p: gx }); }
    if (gy) { p.y = gy.y; S.guides.push({ axis: 'y', p: gy }); }
  }
  return { t: 'grid', p, label: null };
}
