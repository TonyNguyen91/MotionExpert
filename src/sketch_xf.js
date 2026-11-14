// ===== Biến đổi cả khối biên dạng kín: dời, xoay, tỉ lệ, lật gương =====
function regionByKey(k) { return S.regions.find(r => r.key === k) || null; }
function regionEntIds(r) { return new Set([...r.ents, ...r.holeEnts]); }
function regionPtIds(r) { const sk = SKM(), ids = new Set(); for (const id of regionEntIds(r)) { const e = sk.ents.find(x => x.id === id); if (e) SK.entPts(e).forEach(p => ids.add(p)); } return ids; }
function regionCentroid(r) {
  if (r.kind === 'c') { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of r.pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); } return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }; }
  const P = r.outer; let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const f = P[j].x * P[i].y - P[i].x * P[j].y; a += f; cx += (P[j].x + P[i].x) * f; cy += (P[j].y + P[i].y) * f; }
  if (Math.abs(a) < 1e-9) return { x: P.reduce((s, p) => s + p.x, 0) / P.length, y: P.reduce((s, p) => s + p.y, 0) / P.length };
  return { x: cx / (3 * a), y: cy / (3 * a) };
}
function xfPoint(xf, p) {
  const c = xf.c;
  if (xf.type === 'move') return { x: p.x + xf.dx, y: p.y + xf.dy };
  if (xf.type === 'rot') { const co = Math.cos(xf.a), si = Math.sin(xf.a), x = p.x - c.x, y = p.y - c.y; return { x: c.x + x * co - y * si, y: c.y + x * si + y * co }; }
  if (xf.type === 'scale') return { x: c.x + (p.x - c.x) * xf.k, y: c.y + (p.y - c.y) * xf.k };
  if (xf.type === 'mirror') return xf.axis === 'v' ? { x: 2 * c.x - p.x, y: p.y } : { x: p.x, y: 2 * c.y - p.y };
  return p;
}
function hvLabel(a) { const w = SK.angNorm(a) % Math.PI; return Math.abs(w) < 1e-6 || Math.abs(w - Math.PI) < 1e-6 ? 'h' : Math.abs(w - Math.PI / 2) < 1e-6 ? 'v' : null; }
// áp biến đổi trực tiếp lên tọa độ và cập nhật các ràng buộc liên quan
function applyXf(r, xf) {
  const sk = SKM(), ids = regionPtIds(r), ents = regionEntIds(r), ctx2 = skCtx();
  for (const p of sk.pts) if (ids.has(p.id)) { const q = xfPoint(xf, p); p.x = q.x; p.y = q.y; }
  for (const e of sk.ents) if (ents.has(e.id)) {
    if (e.type === 'circle' && xf.type === 'scale') e.r *= xf.k;
    if (e.type === 'arc' && xf.type === 'mirror') { const t = e.a; e.a = e.b; e.b = t; }
  }
  for (const c of sk.cons) {
    const mine = (c.e1 && ents.has(c.e1)) || (!c.e1 && c.p && ids.has(c.p) && (!c.q || ids.has(c.q)));
    if (c.type === 'hv' && mine) {
      if (xf.type === 'rot') c.a += xf.a;
      if (xf.type === 'mirror') { const own = c.owner ? ctx2.ownerAng(c.owner) : 0, w = c.a + own, w2 = xf.axis === 'v' ? Math.PI - w : -w; c.a = w2 - own; }
      if (xf.type === 'rot' || xf.type === 'mirror') c.hv = hvLabel(c.a + (c.owner ? ctx2.ownerAng(c.owner) : 0));
    }
    if (c.type === 'fix' && ids.has(c.p)) {
      const own = S.skPtOwner.get(c.p), f = own && ctx2.ownerFrame(own);
      const w = f ? toWorld(f, { u: c.x, v: c.y }) : { x: c.x, y: c.y }, q = xfPoint(xf, w);
      if (f) { const l = toLocal(f, q); c.x = l.u; c.y = l.v; } else { c.x = q.x; c.y = q.y; }
    }
    if (c.type === 'tan' && xf.type === 'mirror' && ents.has(c.e1) && ents.has(c.e2)) c.s = -(c.s || 1);
  }
  for (const d of sk.dims) {
    const inside = (!d.e1 || ents.has(d.e1)) && (!d.e2 || ents.has(d.e2)) && (!d.p || ids.has(d.p)) && (!d.q || ids.has(d.q));
    if (!inside) continue;
    if (xf.type === 'scale' && d.type !== 'ang') d.v *= xf.k;
    if (xf.type === 'mirror' && d.type === 'ang') d.sign = -(d.sign || 1);
    if (xf.type === 'rot' && d.type === 'rad') d.ang = (d.ang ?? Math.PI / 4) + xf.a;
  }
}
function xfCommit(key, xf) {
  if (guardLocked({ k: 'r', id: key })) return;
  skBegin(); const r = regionByKey(key); if (!r) return;
  const prev = skSnapshot(); xf.c = xf.c || regionCentroid(r);
  applyXf(r, xf); sketchChanged({ prev });
}
// ----- tay nắm (gizmo) khi đang chọn một biên dạng -----
function gizmoGeom() {
  if (S.sel && lockedItem(S.sel)) return null; // CP của part: không có tay nắm dời / xoay / tỉ lệ
  if (!S.sel || S.sel.k !== 'r' || S.tool !== 'select') return null;
  const r = regionByKey(S.sel.id); if (!r) return null;
  const pts = regionScreenPts(r); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  x0 -= 8; y0 -= 8; x1 += 8; y1 += 8;
  const own = regionOwner(r), f = own && XF[own], cw = regionCentroid(r), c = w2s(f ? f(cw) : cw);
  return { r, x0, y0, x1, y1, c, corners: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], rot: { x: (x0 + x1) / 2, y: y0 - 26 } };
}
function drawGizmo() {
  const g = gizmoGeom(); if (!g) return;
  ctx.strokeStyle = colors.accent; ctx.lineWidth = 1; ctx.setLineDash([5, 4]);
  ctx.strokeRect(g.x0, g.y0, g.x1 - g.x0, g.y1 - g.y0); ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(g.rot.x, g.y0); ctx.lineTo(g.rot.x, g.rot.y + 7); ctx.stroke();
  ctx.fillStyle = colors.panel; ctx.lineWidth = 1.6;
  for (const [x, y] of g.corners) { ctx.fillRect(x - 5, y - 5, 10, 10); ctx.strokeRect(x - 5, y - 5, 10, 10); }
  ctx.beginPath(); ctx.arc(g.rot.x, g.rot.y, 7, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(g.rot.x, g.rot.y, 3.5, -Math.PI * .9, Math.PI * .5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(g.c.x - 6, g.c.y); ctx.lineTo(g.c.x + 6, g.c.y); ctx.moveTo(g.c.x, g.c.y - 6); ctx.lineTo(g.c.x, g.c.y + 6); ctx.stroke();
}
function hitGizmo(x, y) {
  const g = gizmoGeom(); if (!g) return null;
  if (Math.hypot(x - g.rot.x, y - g.rot.y) < 10) return 'rot';
  for (const [cx, cy] of g.corners) if (Math.abs(x - cx) < 8 && Math.abs(y - cy) < 8) return 'scale';
  return null;
}
// ----- kéo tương tác -----
function xfDragStart(key, mode, x, y) {
  if (guardLocked({ k: 'r', id: key })) return { kind: 'locked', moved: true };
  skBegin(); const r = regionByKey(key); if (!r) return null;
  return { kind: 'skxf', key, mode, prev: skSnapshot(), c: regionCentroid(r), w0: s2w(x, y), x0: x, y0: y, moved: false, entsKey: r.ents.slice() };
}
function xfDragMove(x, y, ev) {
  const d = drag, w = s2w(x, y);
  if (!d.moved && Math.hypot(x - d.x0, y - d.y0) < 4) return;
  d.moved = true;
  skRestore(d.prev); updateRegions();
  const r = S.regions.find(q => q.key === d.key) || SK.matchRegion(S.regions, d.entsKey); if (!r) return;
  let xf;
  if (d.mode === 'move') { let dx = w.x - d.w0.x, dy = w.y - d.w0.y; if (S.opt.snap) { dx = Math.round(dx); dy = Math.round(dy); } xf = { type: 'move', dx, dy }; d.label = `Δ ${dx.toFixed(1)}, ${dy.toFixed(1)} mm`; }
  else if (d.mode === 'rot') { let a = Math.atan2(w.y - d.c.y, w.x - d.c.x) - Math.atan2(d.w0.y - d.c.y, d.w0.x - d.c.x); if (ev && ev.shiftKey || S.opt.snap) { const st = (ev && ev.shiftKey ? 15 : 1) * D2R; a = Math.round(a / st) * st; } xf = { type: 'rot', a }; d.label = `${(a * R2D).toFixed(1)}°`; }
  else { const k0 = Math.hypot(d.w0.x - d.c.x, d.w0.y - d.c.y) || 1; let k = Math.max(0.05, Math.hypot(w.x - d.c.x, w.y - d.c.y) / k0); k = Math.round(k * 100) / 100; xf = { type: 'scale', k }; d.label = `× ${k.toFixed(2)}`; }
  xf.c = d.c; applyXf(r, xf);
  solveSketch({ fast: true }); updateRegions();
  S.snap = { t: 'grid', p: w, label: d.label };
  draw();
}
function xfDragEnd(d) {
  S.snap = null;
  if (!d.moved) { draw(); return; }
  sketchChanged({ prev: d.prev });
}
