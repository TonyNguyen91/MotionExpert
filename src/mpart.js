// ===== Nhóm lệnh Moving Part (MP = part, khâu kind 'body'): dời / xoay, căn chỉnh kiểu Excel, mảng thẳng / tròn =====
// Dời MP là phép biến đổi CỨNG cả khối ở tư thế thiết kế (mọi khớp của part + rãnh dẫn, điểm nghỉ lò xo, gốc motor tịnh tiến);
// hình phác thảo của part đi theo khung khâu (syncOwnedSketch) nên part vẫn "khóa hình", chỉ đổi vị trí.
// Mảng: chép trọn gói part (packLinks/placePack trong selcopy.js) — khớp, chốt cố định, rãnh, motor, mate trong nhóm, lò xo, trọng lực, vật liệu.
Object.assign(S.topt, { mdx: 10, mdy: 0, mang: 90, mth: 0, mcx: 0, mcy: 0, rcx: 0, rcy: 0, rang: 90 });
S.mpat = null;
const isMP = id => isBody(getL(id));
const isMPTool = t => /^mp_/.test(t || '');
const mpAt = (x, y) => { const id = bodyAt(x, y); return id && isMP(id) ? id : null; };
const mpSelIds = () => selectedParts();
function mpSetSel(ids) { S.msel = ids.map(id => ({ k: 'l', id })); S.sel = S.msel[S.msel.length - 1] || null; }

// ---- hình học: biên thế giới, khung bao, hình chiếu lên một phương ----
function mpExtent(ids, u, P = S.pos) { // [lo, hi] hình chiếu biên của các MP lên phương u
  let lo = Infinity, hi = -Infinity;
  for (const id of ids) for (const p of linkWorldOutline(getL(id), P)) { const s = p.x * u.x + p.y * u.y; if (s < lo) lo = s; if (s > hi) hi = s; }
  return lo <= hi ? { lo, hi, mid: (lo + hi) / 2 } : null;
}
function mpBox(ids, P = S.pos) {
  const ex = mpExtent(ids, { x: 1, y: 0 }, P), ey = mpExtent(ids, { x: 0, y: 1 }, P);
  return ex && ey ? { x0: ex.lo, x1: ex.hi, y0: ey.lo, y1: ey.hi, cx: ex.mid, cy: ey.mid } : null;
}
const mpTr = (dx, dy) => p => ({ x: p.x + dx, y: p.y + dy });
const mpRot = (c, a) => { const co = Math.cos(a), si = Math.sin(a); return p => ({ x: c.x + (p.x - c.x) * co - (p.y - c.y) * si, y: c.y + (p.x - c.x) * si + (p.y - c.y) * co }); };

// ---- áp phép biến đổi cứng lên tư thế thiết kế: items = [{ id, f, ang }] (khớp dùng chung giữa 2 MP chỉ dời theo MP đầu) ----
function mpApply(items) {
  const M = S.model, done = new Set();
  for (const it of items) for (const id of getL(it.id).joints) { const j = getJ(id); if (j.fixed && lk(j).pos) { toast(T('toast_mp_lockpos', { l: getL(it.id).name })); rebuild({ noUndo: true }); return false; } }
  for (const it of items) {
    const L = getL(it.id), f = it.f, ang = it.ang || 0;
    for (const id of L.joints) {
      if (done.has(id)) continue; done.add(id);
      const j = getJ(id), p = f(j); j.x = p.x; j.y = p.y;
      if (ang && j.slider) j.slider = { ...j.slider, ang: j.slider.ang + ang };
      for (const mo of M.motors) if (mo.lin === id && mo.o) mo.o = f(mo.o);
    }
    if (L.rest) L.rest = L.rest.map(f);
    if (L.guide) { const p = f(L.guide); L.guide = { ...L.guide, x: +p.x.toFixed(2), y: +p.y.toFixed(2) }; }
  }
  refreshMotorPhases(); rebuild(); return true;
}
function mpNeed(n) { const ids = mpSelIds(); if (ids.length < n) { toast(T(n > 1 ? 'toast_mp_need' : 'toast_mp_none', { n })); return null; } return ids; }
function mpBegin() { if (S.playing) togglePlay(); commitPose(); }
// dời / xoay số (thanh tùy chọn hoặc bảng MP)
function mpMoveBy(dx, dy) {
  const ids = mpNeed(1); if (!ids || (!dx && !dy)) return; mpBegin();
  if (mpApply(ids.map(id => ({ id, f: mpTr(dx, dy) })))) { mpSetSel(ids); toast(T('toast_mp_moved', { n: ids.length, x: +dx.toFixed(2), y: +dy.toFixed(2) })); renderAll(); }
}
function mpRotateBy(deg) {
  const ids = mpNeed(1); if (!ids || !deg) return; mpBegin();
  const b = mpBox(ids); if (!b) return; const f = mpRot({ x: b.cx, y: b.cy }, deg * D2R);
  if (mpApply(ids.map(id => ({ id, f, ang: deg * D2R })))) { mpSetSel(ids); toast(T('toast_mp_rot', { n: ids.length, a: +deg.toFixed(2) })); renderAll(); }
}

// xoay các MP đã chọn quanh tâm tùy chọn (rcx, rcy) một góc rang (°)
function mpRotAccept() {
  const ids = mpNeed(1); if (!ids) return; const a = (+S.topt.rang || 0) * D2R; if (!a) return; mpBegin();
  const f = mpRot({ x: +S.topt.rcx || 0, y: +S.topt.rcy || 0 }, a);
  if (mpApply(ids.map(id => ({ id, f, ang: a })))) { mpSetSel(ids); toast(T('toast_mp_rot', { n: ids.length, a: +S.topt.rang })); renderAll(); toolDone(); }
}

// ---- căn chỉnh kiểu Excel (Align / Distribute) + phương tùy chọn θ ----
// l/c/r: theo trục X (trái = biên trái nhỏ nhất, giữa = giữa khung bao chung, phải = biên phải lớn nhất); t/m/b: theo trục Y;
// dh/dv/td: phân phối đều — khoảng hở giữa các MP bằng nhau, giữ hai MP ngoài cùng; tl: tâm các MP nằm trên đường phương θ qua MP chọn đầu tiên
const MP_ALIGN = [
  { k: 'l', n: 2, i: '<path d="M4 3v18"/><rect x="4" y="6" width="13" height="4" rx=".8" fill="currentColor" fill-opacity=".25"/><rect x="4" y="14" width="8" height="4" rx=".8" fill="currentColor" fill-opacity=".25"/>' },
  { k: 'c', n: 2, i: '<path d="M12 3v18"/><rect x="5" y="6" width="14" height="4" rx=".8" fill="currentColor" fill-opacity=".25"/><rect x="8" y="14" width="8" height="4" rx=".8" fill="currentColor" fill-opacity=".25"/>' },
  { k: 'r', n: 2, i: '<path d="M20 3v18"/><rect x="7" y="6" width="13" height="4" rx=".8" fill="currentColor" fill-opacity=".25"/><rect x="12" y="14" width="8" height="4" rx=".8" fill="currentColor" fill-opacity=".25"/>' },
  { k: 't', n: 2, i: '<path d="M3 4h18"/><rect x="6" y="4" width="4" height="13" rx=".8" fill="currentColor" fill-opacity=".25"/><rect x="14" y="4" width="4" height="8" rx=".8" fill="currentColor" fill-opacity=".25"/>' },
  { k: 'm', n: 2, i: '<path d="M3 12h18"/><rect x="6" y="5" width="4" height="14" rx=".8" fill="currentColor" fill-opacity=".25"/><rect x="14" y="8" width="4" height="8" rx=".8" fill="currentColor" fill-opacity=".25"/>' },
  { k: 'b', n: 2, i: '<path d="M3 20h18"/><rect x="6" y="7" width="4" height="13" rx=".8" fill="currentColor" fill-opacity=".25"/><rect x="14" y="12" width="4" height="8" rx=".8" fill="currentColor" fill-opacity=".25"/>' },
  { k: 'dh', n: 3, i: '<path d="M3 4v16M21 4v16" opacity=".5"/><rect x="5" y="8" width="3" height="8" rx=".6" fill="currentColor" fill-opacity=".25"/><rect x="10.5" y="6" width="3" height="12" rx=".6" fill="currentColor" fill-opacity=".25"/><rect x="16" y="9" width="3" height="6" rx=".6" fill="currentColor" fill-opacity=".25"/>' },
  { k: 'dv', n: 3, i: '<path d="M4 3h16M4 21h16" opacity=".5"/><rect x="8" y="5" width="8" height="3" rx=".6" fill="currentColor" fill-opacity=".25"/><rect x="6" y="10.5" width="12" height="3" rx=".6" fill="currentColor" fill-opacity=".25"/><rect x="9" y="16" width="6" height="3" rx=".6" fill="currentColor" fill-opacity=".25"/>' },
  { k: 'tl', n: 2, i: '<path d="M3 20L21 4" stroke-dasharray="2 2"/><rect x="3.5" y="14.5" width="5" height="5" rx=".8" transform="rotate(-42 6 17)" fill="currentColor" fill-opacity=".25"/><rect x="9.5" y="9.5" width="5" height="5" rx=".8" transform="rotate(-42 12 12)" fill="currentColor" fill-opacity=".25"/><rect x="15.5" y="4.5" width="5" height="5" rx=".8" transform="rotate(-42 18 7)" fill="currentColor" fill-opacity=".25"/>' },
  { k: 'td', n: 3, i: '<path d="M3 20L21 4" opacity=".4"/><circle cx="6" cy="17.3" r="2.2" fill="currentColor" fill-opacity=".25"/><circle cx="12" cy="12" r="2.2" fill="currentColor" fill-opacity=".25"/><circle cx="18" cy="6.7" r="2.2" fill="currentColor" fill-opacity=".25"/><path d="M8 21l2.5-2.2M14 15.7l2.5-2.2" opacity=".7"/>' },
];
// kế hoạch căn chỉnh (không đổi gì): { ids, items } — dùng chung cho lệnh và hình mờ xem trước
function mpAlignPlan(k) {
  const a = MP_ALIGN.find(q => q.k === k); if (!a) return null; const ids = mpSelIds(); if (ids.length < a.n) return null;
  const th = (S.topt.mth || 0) * D2R, X = { x: 1, y: 0 }, Y = { x: 0, y: 1 };
  const u = 'lcr'.includes(k) || k === 'dh' ? X : 'tmb'.includes(k) || k === 'dv' ? Y : k === 'td' ? { x: Math.cos(th), y: Math.sin(th) } : { x: -Math.sin(th), y: Math.cos(th) };
  const ex = ids.map(id => ({ id, e: mpExtent([id], u) })).filter(o => o.e); if (ex.length < a.n) return null;
  const all = mpExtent(ids, u), shift = new Map();
  if (k === 'l' || k === 'b') ex.forEach(o => shift.set(o.id, all.lo - o.e.lo));
  else if (k === 'r' || k === 't') ex.forEach(o => shift.set(o.id, all.hi - o.e.hi));
  else if (k === 'c' || k === 'm') ex.forEach(o => shift.set(o.id, all.mid - o.e.mid));
  else if (k === 'tl') { const ref = ex[0].e.mid; ex.forEach(o => shift.set(o.id, ref - o.e.mid)); }
  else { // phân phối đều: sắp theo tâm, khoảng hở bằng nhau giữa MP đầu và cuối
    const ord = ex.slice().sort((p, q) => p.e.mid - q.e.mid), n = ord.length, f = ord[0].e, l = ord[n - 1].e;
    const gap = ((l.hi - f.lo) - ord.reduce((s, o) => s + o.e.hi - o.e.lo, 0)) / (n - 1);
    let at = f.lo; ord.forEach(o => { shift.set(o.id, at - o.e.lo); at += o.e.hi - o.e.lo + gap; });
  }
  const items = [...shift].filter(([, d]) => Math.abs(d) > 1e-9).map(([id, d]) => ({ id, f: mpTr(u.x * d, u.y * d) }));
  return { ids, items };
}
function mpAlign(k) {
  const a = MP_ALIGN.find(q => q.k === k); if (!a || !mpNeed(a.n)) return; mpBegin();
  const pl = mpAlignPlan(k); if (!pl) return;
  if (pl.items.length && !mpApply(pl.items)) return;
  mpSetSel(pl.ids); toast(T('toast_mp_aligned', { n: pl.ids.length, t: T('mpa_' + k) })); renderAll(); toolDone();
}

// ---- công cụ Dời MP: kéo = tịnh tiến (bắt 0.5 mm, Shift = tự do), Alt + kéo = xoay quanh tâm nhóm (bắt 1°, Shift = tự do) ----
function mpDown(x, y, ev) {
  const t = S.tool, add = ev.shiftKey || ev.ctrlKey || ev.metaKey, lid = mpAt(x, y);
  if (t === 'mp_lpat' || t === 'mp_cpat') return mpPatDown(x, y, lid);
  if (!lid) {
    if (t === 'mp_rot') { const w = s2w(x, y), r = v => S.opt.snap && !ev.shiftKey ? Math.round(v * 2) / 2 : +v.toFixed(2); S.topt.rcx = r(w.x); S.topt.rcy = r(w.y); renderToolOpts(); draw(); return null; } // bấm nền = đặt tâm xoay
    if (t === 'mp_mirror') { // bấm một đoạn thẳng phác thảo → trục đối xứng
      const h = hitSketch(x, y, 'e'), e = h && SKM().ents.find(q => q.id === h.id);
      if (e && e.type === 'line') { XF = skXform(); const pm = SK.ptMap(SKM()), A = skP(e.a, pm), B = skP(e.b, pm), n = Math.hypot(B.x - A.x, B.y - A.y) || 1; S.mmir = { mode: 'line', p: A, d: { x: (B.x - A.x) / n, y: (B.y - A.y) / n } }; renderToolOpts(); toast(T('toast_mp_mirror_axis')); draw(); return null; }
    }
    if (t === 'mp_align') { // bấm một đoạn thẳng phác thảo → lấy phương θ
      const h = hitSketch(x, y, 'e'), e = h && SKM().ents.find(q => q.id === h.id);
      if (e && e.type === 'line') { XF = skXform(); const pm = SK.ptMap(SKM()), A = skP(e.a, pm), B = skP(e.b, pm); S.topt.mth = +(Math.atan2(B.y - A.y, B.x - A.x) * R2D).toFixed(3); renderToolOpts(); toast(T('toast_mp_th', { a: S.topt.mth })); draw(); return null; }
    }
    S.boxSel = { x0: x, y0: y, x1: x, y1: y, add, mpOnly: true }; return { kind: 'box', add };
  }
  const was = S.msel.some(o => o.k === 'l' && o.id === lid);
  S.msel = S.msel.filter(o => o.k === 'l' && isMP(o.id));
  if (add) { if (was) S.msel = S.msel.filter(o => o.id !== lid); else S.msel.push({ k: 'l', id: lid }); S.sel = S.msel[S.msel.length - 1] || null; renderList(); renderProps(); draw(); return null; }
  if (!was) { S.msel = [{ k: 'l', id: lid }]; S.sel = S.msel[0]; renderList(); renderProps(); }
  if (t !== 'mp_move') { draw(); return null; }
  mpBegin(); const ids = mpSelIds(), b = mpBox(ids);
  return { kind: 'mpmove', ids, start: designMap(S.model), w0: s2w(x, y), x0: x, y0: y, c: b ? { x: b.cx, y: b.cy } : s2w(x, y), rot: ev.altKey, moved: false, f: null, ang: 0, dx: 0, dy: 0 };
}
function mpDragMove(d, x, y, w) {
  if (d.kind === 'mppathandle') { mpPatDrag(x, y); return; }
  if (!d.moved && Math.hypot(x - d.x0, y - d.y0) < 3) return; d.moved = true;
  const free = S.shiftDown || !S.opt.snap;
  if (d.rot) {
    let a = (Math.atan2(w.y - d.c.y, w.x - d.c.x) - Math.atan2(d.w0.y - d.c.y, d.w0.x - d.c.x)) * R2D; a = ((a + 540) % 360) - 180;
    d.deg = free ? +a.toFixed(2) : Math.round(a); d.ang = d.deg * D2R; d.f = mpRot(d.c, d.ang);
  } else { const r = v => free ? +v.toFixed(2) : Math.round(v * 2) / 2; d.dx = r(w.x - d.w0.x); d.dy = r(w.y - d.w0.y); d.f = mpTr(d.dx, d.dy); }
  draw(); // hình mờ tại vị trí đích; MP gốc giữ nguyên đến khi thả chuột
}
function mpDragEnd(d) {
  if (d.kind !== 'mpmove' || !d.moved || !d.f) return;
  S.pos = d.start; // mpApply biến đổi từ tư thế thiết kế
  if (!mpApply(d.ids.map(id => ({ id, f: d.f, ang: d.rot ? d.ang : 0 })))) return;
  mpSetSel(d.ids); toast(d.rot ? T('toast_mp_rot', { n: d.ids.length, a: d.deg }) : T('toast_mp_moved', { n: d.ids.length, x: d.dx, y: d.dy })); renderAll(); toolDone();
}
function mpHover(x, y) {
  const t = S.tool; let cur = 'crosshair';
  if (S.mpat && S.mpat.ids.length) { const h = mpPatHandles(); if (h && (patNear(h.H, x, y, 12))) { S.hover = null; cv.style.cursor = 'move'; draw(); return; } if (h && patNear(h.lbl, x, y, 18)) cur = 'ns-resize'; }
  const id = mpAt(x, y); S.hover = id ? { k: 'l', id } : null;
  if (id) cur = t === 'mp_move' && S.msel.some(o => o.id === id) ? 'move' : 'pointer';
  cv.style.cursor = cur; draw();
}

// ---- mảng thẳng / tròn: xem trước ngay (bóng mờ), tay nắm khoảng cách / tâm, ×n bấm đúp hoặc lăn; bấm chỗ trống = chấp nhận (như mảng phác thảo) ----
function mpPatInit(t) {
  const ids = mpSelIds(); S.mpat = { kind: t === 'mp_lpat' ? 'lin' : 'cir', ids }; mpSetSel(ids);
  S.topt.count = 3; if (t === 'mp_cpat') S.topt.angle = 360; else mpAutoSpacing();
}
function mpAutoSpacing() { const b = S.mpat && mpBox(S.mpat.ids); if (!b) return; const w = b.x1 - b.x0; S.topt.dx = +(w + Math.max(2, w * 0.25)).toFixed(1); S.topt.dy = 0; }
function mpPatXforms() { // [{ f, ang }] của bản sao 1…n−1 (mảng tròn xoay cả part như Onshape)
  const n = Math.max(2, Math.round(S.topt.count)), out = [];
  if (S.mpat.kind === 'lin') for (let i = 1; i < n; i++) out.push({ f: mpTr(S.topt.dx * i, S.topt.dy * i), ang: 0 });
  else { const full = Math.abs(S.topt.angle - 360) < 1e-6, st = (full ? 360 / n : S.topt.angle / Math.max(1, n - 1)) * D2R, c = { x: +S.topt.mcx || 0, y: +S.topt.mcy || 0 };
    for (let i = 1; i < n; i++) out.push({ f: mpRot(c, st * i), ang: st * i }); }
  return out;
}
function mpPatHandles() {
  const b = mpBox(S.mpat.ids); if (!b) return null; const n = Math.max(2, Math.round(S.topt.count));
  if (S.mpat.kind === 'lin') { const B = w2s({ x: b.cx, y: b.cy }), H = w2s({ x: b.cx + S.topt.dx, y: b.cy + S.topt.dy }), L = w2s({ x: b.cx + S.topt.dx * (n - 1), y: b.cy + S.topt.dy * (n - 1) }); return { B, H, lbl: { x: L.x + 22, y: L.y - 20 } }; }
  const C = w2s({ x: +S.topt.mcx || 0, y: +S.topt.mcy || 0 }); return { B: C, H: C, lbl: { x: C.x + 26, y: C.y - 22 } };
}
function mpPatDown(x, y, lid) {
  const h = S.mpat && S.mpat.ids.length && mpPatHandles();
  if (h && patNear(h.lbl, x, y, 18)) return null; // nhãn số: bấm đúp để sửa
  if (h && patNear(h.H, x, y, 12)) return { kind: 'mppathandle' };
  if (!lid && !S.mpat.ids.length) { S.boxSel = { x0: x, y0: y, x1: x, y1: y, add: true, mpOnly: true }; return { kind: 'box', add: true }; } // chưa có MP: quét khung để chọn
  if (lid) {
    const ids = S.mpat.ids, i = ids.indexOf(lid); if (i >= 0) ids.splice(i, 1); else ids.push(lid); mpSetSel(ids);
    if (S.mpat.kind === 'lin' && ids.length === 1 && i < 0) { mpAutoSpacing(); syncToolOpts(); }
    renderList(); renderProps(); updateHint(); draw(); return null;
  }
  if (S.mpat.ids.length) mpPatAccept();
  return null;
}
function mpPatDrag(x, y) {
  if (S.mpat.kind === 'lin') { const b = mpBox(S.mpat.ids); if (!b) return; const w = s2w(x, y), r = v => S.opt.snap && !S.shiftDown ? Math.round(v * 2) / 2 : +v.toFixed(2); S.topt.dx = r(w.x - b.cx); S.topt.dy = r(w.y - b.cy); }
  else { const sn = skSnap(x, y, { parts: true }); S.topt.mcx = +sn.p.x.toFixed(3); S.topt.mcy = +sn.p.y.toFixed(3); }
  mpSyncOpts(); draw();
}
function mpSyncOpts() { syncToolOpts(); for (const k of ['mcx', 'mcy', 'mth', 'mdx', 'mdy', 'mang', 'rcx', 'rcy', 'rang']) { const el = document.getElementById('to_' + k); if (el && document.activeElement !== el) el.value = S.topt[k]; } }
function mpPatEditCount() { const h = mpPatHandles(); if (!h) return; ivOpen({ s: h.lbl, value: Math.round(S.topt.count), int: true, onLive: v => { S.topt.count = v; syncToolOpts(); draw(); }, onSubmit: v => { S.topt.count = Math.max(2, Math.round(v)); syncToolOpts(); draw(); } }); }
function mpPatDbl(x, y) { const h = S.mpat && S.mpat.ids.length && mpPatHandles(); if (h && patNear(h.lbl, x, y, 18)) mpPatEditCount(); }
function mpPatWheel(ev, x, y) { if (!S.mpat || !S.mpat.ids.length) return false; const h = mpPatHandles(); if (!patNear(h && h.lbl, x, y, 18)) return false; S.topt.count = Math.max(2, Math.round(S.topt.count) + (ev.deltaY < 0 ? 1 : -1)); syncToolOpts(); draw(); return true; }
function mpPatAccept() {
  const ids = S.mpat && S.mpat.ids.slice(); if (!ids || !ids.length) { toast(T('toast_mp_none')); return; }
  mpBegin(); const pack = packLinks(ids), xs = mpPatXforms(), made = [];
  for (const x of xs) made.push(...placePack(pack, x.f, x.ang));
  skOwnerMap(); refreshMotorPhases(); S.mpat = null;
  mpSetSel([...ids, ...made.map(L => L.id)]);
  toast(T('toast_mp_pat', { n: ids.length, k: xs.length }) + (pack.dropped ? ' · ' + T('toast_mp_mates', { n: pack.dropped }) : ''), 5000);
  rebuild(); toolDone();
}
// ---- Đối xứng MP (Mirror): bản sao phản xạ qua trục, mang theo khớp, sketch, motor, lò xo, trọng lực, vật liệu ----
// trục: S.mmir = { mode: 'v' | 'h' } (đứng / ngang qua tâm nhóm) hoặc { mode: 'line', p, d } (đoạn thẳng phác thảo)
function mpMirrorAxis(ids) {
  const m = S.mmir || { mode: 'v' };
  if (m.mode === 'line') return { p: m.p, d: m.d };
  const b = ids && ids.length ? mpBox(ids) : null, c = b ? { x: b.cx, y: b.cy } : { x: 0, y: 0 };
  return m.mode === 'h' ? { p: c, d: { x: 1, y: 0 } } : { p: c, d: { x: 0, y: 1 } };
}
function mpMirrorF(ax) { // phản xạ qua đường thẳng (p, d đơn vị)
  return p => { const t = (p.x - ax.p.x) * ax.d.x + (p.y - ax.p.y) * ax.d.y, fx = ax.p.x + t * ax.d.x, fy = ax.p.y + t * ax.d.y; return { x: 2 * fx - p.x, y: 2 * fy - p.y }; };
}
function mpMirrorAccept() {
  const ids = mpNeed(1); if (!ids) return;
  mpBegin(); const ax = mpMirrorAxis(ids), pack = packLinks(ids), made = placePack(pack, mpMirrorF(ax), 0, { phi: Math.atan2(ax.d.y, ax.d.x) });
  skOwnerMap(); refreshMotorPhases(); mpSetSel([...ids, ...made.map(L => L.id)]);
  toast(T('toast_mp_mirror', { n: ids.length }) + (pack.dropped ? ' · ' + T('toast_mp_mates', { n: pack.dropped }) : ''), 5000);
  rebuild(); toolDone();
}
// bản sao xem trước: vẽ part ở tư thế đã biến đổi, mờ
function mpGhost(ids, f) {
  const P0 = S.pos, X0 = XF, P = { ...P0 };
  for (const id of ids) for (const jid of getL(id).joints) if (P0[jid]) P[jid] = f(P0[jid]);
  S.pos = P; XF = skXform(); ctx.save(); ctx.filter = 'opacity(45%)';
  try { for (const id of ids) drawLinkBody(getL(id)); } finally { ctx.restore(); S.pos = P0; XF = X0; }
}
function mpOverlay() {
  const t = S.tool; if (!isMPTool(t)) return;
  if (t === 'mp_mirror') {
    const ids = mpSelIds(), ax = mpMirrorAxis(ids), A = w2s({ x: ax.p.x - ax.d.x * 1e4, y: ax.p.y - ax.d.y * 1e4 }), B = w2s({ x: ax.p.x + ax.d.x * 1e4, y: ax.p.y + ax.d.y * 1e4 });
    ctx.save(); ctx.setLineDash([6, 4]); ctx.strokeStyle = colors.accent; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke(); ctx.restore();
    if (ids.length) mpGhost(ids, mpMirrorF(ax));
    return;
  }
  if (S.mpat && S.mpat.ids.length) {
    for (const x of mpPatXforms()) mpGhost(S.mpat.ids, x.f);
    const h = mpPatHandles(); if (!h) return;
    ctx.fillStyle = colors.accent; ctx.strokeStyle = colors.accent; ctx.lineWidth = 2;
    if (S.mpat.kind === 'lin') { ctx.beginPath(); ctx.moveTo(h.B.x, h.B.y); ctx.lineTo(h.H.x, h.H.y); ctx.stroke(); const a = Math.atan2(h.H.y - h.B.y, h.H.x - h.B.x); ctx.beginPath(); ctx.moveTo(h.H.x, h.H.y); ctx.lineTo(h.H.x - 11 * Math.cos(a) + 5 * Math.sin(a), h.H.y - 11 * Math.sin(a) - 5 * Math.cos(a)); ctx.lineTo(h.H.x - 11 * Math.cos(a) - 5 * Math.sin(a), h.H.y - 11 * Math.sin(a) + 5 * Math.cos(a)); ctx.closePath(); ctx.fill(); }
    else { ctx.beginPath(); ctx.arc(h.B.x, h.B.y, 7, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.moveTo(h.B.x - 11, h.B.y); ctx.lineTo(h.B.x + 11, h.B.y); ctx.moveTo(h.B.x, h.B.y - 11); ctx.lineTo(h.B.x, h.B.y + 11); ctx.stroke(); }
    mpTag(h.lbl, '× ' + Math.max(2, Math.round(S.topt.count)));
    return;
  }
  // hình mờ xem trước cho mọi lệnh MP: MP gốc giữ nguyên, hình mờ = kết quả nếu áp dụng
  const cross = c => { const q = w2s(c); ctx.strokeStyle = colors.accent; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(q.x - 8, q.y); ctx.lineTo(q.x + 8, q.y); ctx.moveTo(q.x, q.y - 8); ctx.lineTo(q.x, q.y + 8); ctx.stroke(); };
  const d = drag;
  if (d && d.kind === 'mpmove') {
    if (d.moved && d.f) mpGhost(d.ids, d.f);
    if (d.moved && S.cursor) mpTag({ x: S.cursor.x + 18, y: S.cursor.y - 18 }, d.rot ? d.deg + '°' : `ΔX ${d.dx} · ΔY ${d.dy}`);
    if (d.moved && d.rot) cross(d.c);
  } else if (t === 'mp_rot') {
    const ids = mpSelIds(), c = { x: +S.topt.rcx || 0, y: +S.topt.rcy || 0 }, a = (+S.topt.rang || 0) * D2R;
    if (ids.length && a) mpGhost(ids, mpRot(c, a)); cross(c);
  } else if (t === 'mp_align') {
    if (S.mpPrev && S.mpPrev.al) { const pl = mpAlignPlan(S.mpPrev.al); if (pl) for (const it of pl.items) mpGhost([it.id], it.f); }
  } else if (t === 'mp_move') {
    const ids = mpSelIds(); if (!ids.length) return;
    if (S.mpPrev === 'rot') { const b = mpBox(ids), a = (+S.topt.mang || 0) * D2R; if (b && a) mpGhost(ids, mpRot({ x: b.cx, y: b.cy }, a)); }
    else { const dx = +S.topt.mdx || 0, dy = +S.topt.mdy || 0; if (dx || dy) mpGhost(ids, mpTr(dx, dy)); }
  }
}
function mpTag(p, txt) {
  ctx.font = '600 12px ' + bodyFont(); const tw = ctx.measureText(txt).width;
  ctx.fillStyle = colors.accent; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(p.x - tw / 2 - 7, p.y - 11, tw + 14, 22, 5) : ctx.rect(p.x - tw / 2 - 7, p.y - 11, tw + 14, 22); ctx.fill();
  ctx.fillStyle = colors.panel; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, p.x, p.y);
}

// ---- thanh tùy chọn (#topts) của từng công cụ MP ----
function mpToolReset(t) {
  S.mpat = null; S.mpPrev = null; if (!isMPTool(t)) return;
  if (t === 'mp_mirror') S.mmir = null;
  if (t === 'mp_rot') { const b = mpBox(mpSelIds()); if (b) { S.topt.rcx = +b.cx.toFixed(2); S.topt.rcy = +b.cy.toFixed(2); } } // mặc định: trục đứng qua tâm nhóm
  mpSetSel(mpSelIds()); // chọn CP của part → chọn part; bỏ phần tử không phải MP
  if (t === 'mp_lpat' || t === 'mp_cpat') mpPatInit(t);
  renderList(); renderProps();
}
const mpNum = (k, label, unit, step) => `<label class="kbd" for="to_${k}">${label}</label><span class="unit" data-u="${unit}"><input type="text" class="numx" inputmode="decimal" id="to_${k}" data-k="${k}" step="${step}" value="${S.topt[k]}"></span>`;
const mpAlBtns = (n) => MP_ALIGN.map(a => `<button class="tool ic" data-mpal="${a.k}" title="${esc(T('mpa_' + a.k))}" aria-label="${esc(T('mpa_' + a.k))}" ${n < a.n ? 'disabled' : ''}>${I(a.i)}</button>`).join('');
function mpToolOptsHTML(t) {
  const btn = (id, key) => `<button class="btn" id="${id}">${T(key)}</button>`;
  if (t === 'mp_move') return mpNum('mdx', 'ΔX', 'mm', 0.5) + mpNum('mdy', 'ΔY', 'mm', 0.5) + btn('mpGoMove', 'mp_apply') + mpNum('mang', T('o_angle'), '°', 5) + btn('mpGoRot', 'mp_rotate');
  if (t === 'mp_align') return `<div class="mpal">${mpAlBtns(mpSelIds().length)}</div>` + mpNum('mth', T('o_mth'), '°', 5);
  if (t === 'mp_rot') return mpNum('rcx', T('o_mcx'), 'mm', 0.5) + mpNum('rcy', T('o_mcy'), 'mm', 0.5) + mpNum('rang', T('o_angle'), '°', 5) + btn('toApply', 'o_accept');
  if (t === 'mp_mirror') return `<button class="btn" data-mmx="v">${T('mp_mirror_v')}</button><button class="btn" data-mmx="h">${T('mp_mirror_h')}</button><span class="muted">${T('mp_mirror_line')}</span>` + btn('toApply', 'o_accept');
  if (t === 'mp_lpat') return mpNum('count', T('o_count'), '×', 1) + mpNum('dx', T('o_dx'), 'mm', 0.5) + mpNum('dy', T('o_dy'), 'mm', 0.5) + btn('toApply', 'o_accept');
  if (t === 'mp_cpat') return mpNum('count', T('o_count'), '×', 1) + mpNum('angle', T('o_angle'), '°', 5) + mpNum('mcx', T('o_mcx'), 'mm', 0.5) + mpNum('mcy', T('o_mcy'), 'mm', 0.5) + btn('toApply', 'o_accept');
  return '';
}
function mpBindToolOpts(box) {
  const g = id => box.querySelector('#' + id), hov = (el, v) => { if (!el) return; el.onmouseenter = () => { S.mpPrev = v; draw(); }; el.onmouseleave = () => { S.mpPrev = null; draw(); }; };
  if (g('mpGoMove')) g('mpGoMove').onclick = () => { mpMoveBy(+S.topt.mdx || 0, +S.topt.mdy || 0); toolDone(); };
  if (g('mpGoRot')) { g('mpGoRot').onclick = () => { mpRotateBy(+S.topt.mang || 0); toolDone(); }; hov(g('mpGoRot'), 'rot'); }
  box.querySelectorAll('[data-mpal]').forEach(b => { b.onclick = () => mpAlign(b.dataset.mpal); hov(b, { al: b.dataset.mpal }); });
  const ap = g('toApply');
  if (ap && S.mpat) ap.onclick = () => mpPatAccept();
  if (S.tool === 'mp_mirror') { if (ap) ap.onclick = () => mpMirrorAccept(); box.querySelectorAll('[data-mmx]').forEach(b => b.onclick = () => { S.mmir = { mode: b.dataset.mmx }; draw(); }); }
  if (S.tool === 'mp_rot' && ap) ap.onclick = () => mpRotAccept();
  box.querySelectorAll('input[data-k]').forEach(el => el.oninput = () => { const v = evalExpr(el.value); if (Number.isFinite(v)) { S.topt[el.dataset.k] = v; draw(); } }); // xem trước ngay khi gõ
}
// sau khi quét khung trong công cụ MP: cập nhật nhóm mảng + trạng thái nút
function mpAfterBox() {
  if (S.mpat) { const first = !S.mpat.ids.length; S.mpat.ids = mpSelIds(); if (first && S.mpat.kind === 'lin' && S.mpat.ids.length) mpAutoSpacing(); syncToolOpts(); updateHint(); }
  mpRefreshOpts();
}
// bật lại trạng thái nút căn chỉnh khi số MP chọn đổi
function mpRefreshOpts() { const box = document.getElementById('topts'), n = mpSelIds().length; box.querySelectorAll('[data-mpal]').forEach(b => { const a = MP_ALIGN.find(q => q.k === b.dataset.mpal); b.disabled = n < a.n; }); }
function mpHints() {
  const P = S.mpat, pat = k => T(P && P.ids.length ? 'h_mp_pat1' : 'h_mp_pat0', { t: T('t_mp_' + k), h: T(k === 'lpat' ? 'pat_h_lin' : 'pat_h_cir') });
  return { mp_move: T('h_mp_move'), mp_align: T('h_mp_align'), mp_lpat: pat('lpat'), mp_cpat: pat('cpat'), mp_mirror: T('h_mp_mirror'), mp_rot: T('h_mp_rot') };
}

// ---- bảng MP trong ô Thuộc tính khi chọn ≥ 2 MP (chỉ MP) bằng công cụ Chọn ----
const mpPanelActive = () => { const s = S.msel || []; return s.length >= 2 && s.every(o => o.k === 'l' && isMP(o.id)); };
function mountMPPanel(box) {
  const ids = mpSelIds(), n = ids.length, num = (k, unit, step) => `<span class="unit" data-u="${unit}"><input type="text" class="numx" inputmode="decimal" data-mpv="${k}" step="${step}" value="${S.topt[k]}"></span>`;
  box.innerHTML = `<p class="muted">${T('mp_sel', { n, l: ids.map(id => esc(getL(id).name)).join(', ') })}</p>
    <div class="alrow"><label>${T('mp_align')}</label></div><div class="mpal">${mpAlBtns(n)}</div>
    <div class="alrows">
      <div class="alrow"><label>${T('o_mth')} <span class="muted">(${T('mpa_tl')} · ${T('mpa_td')})</span></label><div class="alin">${num('mth', '°', 5)}</div></div>
      <div class="alrow"><label>${T('mp_moveby')}</label><div class="alin">${num('mdx', 'ΔX', 0.5)}${num('mdy', 'ΔY', 0.5)}</div><button class="btn" data-mpgo="move">${T('mp_apply')}</button></div>
      <div class="alrow"><label>${T('mp_rotby')}</label><div class="alin">${num('mang', '°', 5)}</div><button class="btn" data-mpgo="rot">${T('mp_apply')}</button></div>
      <div class="alrow"><label>${T('mp_pattern')}</label><div class="alin"><button class="btn" data-mpgo="lpat">${T('t_mp_lpat')}</button><button class="btn" data-mpgo="cpat">${T('t_mp_cpat')}</button></div></div>
    </div><p class="muted">${T('mp_note')}</p>`;
  box.querySelectorAll('[data-mpv]').forEach(el => el.onchange = () => { const v = evalExpr(el.value); if (Number.isFinite(v)) S.topt[el.dataset.mpv] = v; });
  box.querySelectorAll('[data-mpal]').forEach(b => b.onclick = () => mpAlign(b.dataset.mpal));
  box.querySelectorAll('[data-mpgo]').forEach(b => b.onclick = () => { const k = b.dataset.mpgo; if (k === 'move') mpMoveBy(+S.topt.mdx || 0, +S.topt.mdy || 0); else if (k === 'rot') mpRotateBy(+S.topt.mang || 0); else setTool('mp_' + k); });
}

Object.assign(I18N.vi, {
  g_mp: 'Moving Part', t_mp_move: 'Dời / xoay MP (kéo · Alt + kéo = xoay)', t_mp_align: 'Căn chỉnh MP (ngang, dọc, phương tùy chọn, cách đều)', t_mp_lpat: 'Mảng thẳng MP', t_mp_cpat: 'Mảng tròn MP',
  h_mp_move: 'Bấm chọn MP (Shift/Ctrl + bấm: thêm/bớt · quét khung: chọn nhiều) · kéo MP đã chọn để dời, Alt + kéo để xoay quanh tâm nhóm (Shift: không bắt bước) · hoặc nhập ΔX, ΔY / góc rồi bấm Áp dụng',
  h_mp_align: 'Chọn từ 2 MP (bấm / quét khung), rồi bấm kiểu căn trên thanh tùy chọn · bấm một đoạn thẳng phác thảo để lấy phương θ',
  h_mp_pat0: '{t}: bấm chọn MP cần nhân bản (hoặc quét chọn trước bằng công cụ Chọn)', h_mp_pat1: '{t}: {h} · bấm đúp / lăn chuột trên ×n để đổi số bản · bấm MP để thêm/bớt · bấm chỗ trống hoặc Chấp nhận = xong · Esc = hủy',
  mp_apply: 'Áp dụng', mp_rotate: 'Xoay', o_mth: 'Phương θ', o_mcx: 'Tâm X', o_mcy: 'Tâm Y',
  mpa_l: 'Căn trái', mpa_c: 'Căn giữa theo chiều ngang', mpa_r: 'Căn phải', mpa_t: 'Căn trên', mpa_m: 'Căn giữa theo chiều dọc', mpa_b: 'Căn dưới',
  mpa_dh: 'Phân phối đều theo chiều ngang', mpa_dv: 'Phân phối đều theo chiều dọc', mpa_tl: 'Thẳng hàng theo phương θ', mpa_td: 'Cách đều theo phương θ',
  mp_sel: '{n} MP đang chọn: {l}', mp_align: 'Căn chỉnh', mp_moveby: 'Dời (mm)', mp_rotby: 'Xoay quanh tâm nhóm', mp_pattern: 'Nhân bản',
  mp_note: 'Thẳng hàng θ: tâm các MP về đường phương θ qua MP chọn đầu tiên. Cách đều: khoảng hở giữa các MP bằng nhau, giữ hai MP ngoài cùng. Dời MP mang theo khớp, chốt, rãnh dẫn, điểm nghỉ lò xo.',
  toast_mp_none: 'Chưa chọn MP nào', toast_mp_need: 'Cần chọn ít nhất {n} MP', toast_mp_moved: 'Đã dời {n} MP (ΔX {x}, ΔY {y} mm)', toast_mp_rot: 'Đã xoay {n} MP {a}°',
  toast_mp_aligned: '{t}: {n} MP', toast_mp_pat: 'Đã nhân bản {n} MP × {k} bản sao (kèm khớp, chốt, motor, rãnh, lò xo, trọng lực, vật liệu)', toast_mp_mates: 'bỏ {n} mate nối với part ngoài nhóm',
  toast_mp_lockpos: '{l} có khớp cố định đã khóa vị trí — mở khóa trước khi dời', toast_mp_th: 'Phương θ = {a}°',
  t_mp_mirror: 'Đối xứng MP (tạo bản sao đối xứng qua trục)', h_mp_mirror: 'Chọn MP cần đối xứng · chọn trục: Đứng / Ngang qua tâm nhóm, hoặc bấm một đoạn thẳng phác thảo làm trục · Áp dụng để tạo bản sao (kèm khớp, sketch, motor, lò xo, trọng lực, vật liệu)',
  mp_mirror_v: 'Trục đứng', mp_mirror_h: 'Trục ngang', mp_mirror_line: 'hoặc bấm đoạn thẳng phác thảo làm trục', toast_mp_mirror: 'Đã tạo đối xứng {n} MP (bản sao kèm khớp, sketch, motor, lò xo, trọng lực, vật liệu)', toast_mp_mirror_axis: 'Đã chọn trục đối xứng theo đoạn thẳng',
});
Object.assign(I18N.en, {
  g_mp: 'Moving Part', t_mp_move: 'Move / rotate MP (drag · Alt + drag = rotate)', t_mp_align: 'Align MP (horizontal, vertical, custom direction, distribute)', t_mp_lpat: 'Linear pattern MP', t_mp_cpat: 'Circular pattern MP',
  h_mp_move: 'Click an MP (Shift/Ctrl + click: add/remove · box: select many) · drag selected MPs to move, Alt + drag to rotate about the group centre (Shift: no stepping) · or type ΔX, ΔY / angle and press Apply',
  h_mp_align: 'Select 2 or more MPs (click / box), then pick an alignment in the options bar · click a sketch line to take its direction θ',
  h_mp_pat0: '{t}: click the MPs to copy (or box-select them first with Select)', h_mp_pat1: '{t}: {h} · double-click / scroll on ×n to change the count · click an MP to add/remove · click empty space or Accept = done · Esc = cancel',
  mp_apply: 'Apply', mp_rotate: 'Rotate', o_mth: 'Direction θ', o_mcx: 'Centre X', o_mcy: 'Centre Y',
  mpa_l: 'Align left', mpa_c: 'Align centre (horizontal)', mpa_r: 'Align right', mpa_t: 'Align top', mpa_m: 'Align middle (vertical)', mpa_b: 'Align bottom',
  mpa_dh: 'Distribute horizontally', mpa_dv: 'Distribute vertically', mpa_tl: 'Line up along direction θ', mpa_td: 'Distribute along direction θ',
  mp_sel: '{n} MPs selected: {l}', mp_align: 'Align', mp_moveby: 'Move (mm)', mp_rotby: 'Rotate about group centre', mp_pattern: 'Pattern',
  mp_note: 'Line up θ: MP centres go onto the θ line through the first selected MP. Distribute: equal gaps between MPs, the two outer MPs stay. Moving an MP carries its joints, pins, guide and spring rest point.',
  toast_mp_none: 'No MP selected', toast_mp_need: 'Select at least {n} MPs', toast_mp_moved: 'Moved {n} MP (ΔX {x}, ΔY {y} mm)', toast_mp_rot: 'Rotated {n} MP by {a}°',
  toast_mp_aligned: '{t}: {n} MPs', toast_mp_pat: 'Patterned {n} MP × {k} copies (with joints, pins, motors, slots, springs, gravity, material)', toast_mp_mates: 'dropped {n} mates to parts outside the group',
  toast_mp_lockpos: '{l} has a fixed joint with a locked position — unlock it before moving', toast_mp_th: 'Direction θ = {a}°',
  t_mp_mirror: 'Mirror MP (mirrored copy about an axis)', h_mp_mirror: 'Select MPs to mirror · choose axis: Vertical / Horizontal through group centre, or click a sketch line as the axis · Apply to create the mirrored copy (with joints, sketch, motors, springs, gravity, material)',
  mp_mirror_v: 'Vertical axis', mp_mirror_h: 'Horizontal axis', mp_mirror_line: 'or click a sketch line as the axis', toast_mp_mirror: 'Mirrored {n} MP (copy with joints, sketch, motors, springs, gravity, material)', toast_mp_mirror_axis: 'Mirror axis set from the sketch line',
});

Object.assign(I18N.vi, {
  t_mp_rot: 'Xoay MP quanh tâm chọn (nhập tâm X/Y và góc, hoặc bấm nền để đặt tâm)',
  h_mp_rot: 'Chọn MP cần xoay · bấm nền để đặt tâm xoay (hoặc nhập Tâm X/Y) · nhập góc (°) · hình mờ = kết quả · Áp dụng để xoay',
});
Object.assign(I18N.en, {
  t_mp_rot: 'Rotate MP about a chosen centre (type centre X/Y and angle, or click empty space to set the centre)',
  h_mp_rot: 'Select MPs to rotate · click empty space to set the centre (or type Centre X/Y) · type the angle (°) · the ghost shows the result · Apply to rotate',
});
