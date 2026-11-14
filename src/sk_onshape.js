// ===== Thao tác phác thảo kiểu Onshape =====
// ô nhập giá trị ngay trên bản vẽ (sau khi vẽ / đặt kích thước / bo góc / offset), biểu thức trong ô số, lăn chuột / phím mũi tên tăng giảm,
// cung tiếp tuyến (+ Shift+A trong công cụ Đoạn thẳng), cung tâm, đặt kích thước theo hướng kéo, offset / bo góc / mảng tương tác

// ---- biểu thức trong ô số: + − * / ^ ( ), sqrt, abs, pi, đơn vị mm cm m in deg rad (như ô số của Onshape) ----
function evalExpr(s) {
  if (typeof s === 'number') return s;
  let t = String(s == null ? '' : s).trim().toLowerCase().replace(/,/g, '.'); if (!t) return NaN;
  const U = { mm: 1, cm: 10, m: 1000, in: 25.4, deg: 1, rad: 180 / Math.PI };
  t = t.replace(/(\d|\))\s*(mm|cm|m|in|deg|rad)\b/g, (q, a, u) => `${a}*${U[u]}`);
  if (!/^[0-9+\-*/^().\sa-z]*$/.test(t)) return NaN;
  t = t.replace(/\^/g, '**').replace(/\b(sqrt|abs|pi)\b/g, w => w === 'pi' ? 'Math.PI' : 'Math.' + w);
  if (/[a-z]/i.test(t.replace(/Math\.(sqrt|abs|PI)/g, ''))) return NaN;
  try { const v = Function('"use strict";return (' + t + ')')(); return typeof v === 'number' && isFinite(v) ? v : NaN; } catch (e) { return NaN; }
}
const fmtNum = (v, int) => int ? String(Math.round(v)) : String(+(+v).toFixed(4));

// ---- tăng / giảm ô số bằng lăn chuột hoặc ↑ ↓ (Onshape: 0.1 · Ctrl 0.01 · Shift 1.0; ô số nguyên như số bản sao: 1) ----
function numStep(el, dir, ev) {
  const int = el.dataset.int === '1', step = int ? 1 : ev.shiftKey ? 1 : ev.ctrlKey ? 0.01 : 0.1;
  let v = evalExpr(el.value); if (!isFinite(v)) v = 0;
  v = +(Math.round((v + dir * step) / step) * step).toFixed(4); if (int) v = Math.max(+(el.min || 2), Math.round(v));
  el.value = fmtNum(v, int);
  if (IV && IV.el === el) { IV.dirty = true; if (IV.o.onLive) IV.o.onLive(v); return; }
  el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
}
const numEl = t => t && t.closest && t.closest('input[type=number], input.numx');
document.addEventListener('wheel', ev => { const el = numEl(ev.target); if (!el || el.readOnly || el.disabled) return; ev.preventDefault(); ev.stopPropagation(); numStep(el, ev.deltaY < 0 ? 1 : -1, ev); }, { passive: false, capture: true });
document.addEventListener('keydown', ev => { if (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown') return; const el = numEl(ev.target); if (!el || el.readOnly || el.disabled) return; ev.preventDefault(); numStep(el, ev.key === 'ArrowUp' ? 1 : -1, ev); }, true);
// Shift giữ = tắt bắt điểm / suy luận ràng buộc khi vẽ (như Onshape)
S.shiftDown = false;
addEventListener('keydown', ev => { if (ev.key === 'Shift') S.shiftDown = true; }, true);
addEventListener('keyup', ev => { if (ev.key === 'Shift') S.shiftDown = false; }, true);
cv.addEventListener('pointermove', ev => { S.shiftDown = ev.shiftKey; }, true);
addEventListener('blur', () => { S.shiftDown = false; });

// ---- ô nhập giá trị tại chỗ (IV) ----
let IV = null;
function ivOpen(o) { // o: { w: điểm thế giới | s: điểm màn hình, value, int, onSubmit(v), onLive(v), onCancel(), escPass }
  ivClose(false);
  const el = document.createElement('input'); el.type = 'text'; el.className = 'ivbox numx'; el.style.cssText = 'width:80px;min-width:0;max-width:80px;margin:0'; // quy tắc chung cho input làm ô giãn rộng el.spellcheck = false; el.autocomplete = 'off';
  el.setAttribute('inputmode', 'decimal'); if (o.int) { el.dataset.int = '1'; el.min = o.min ?? 2; }
  el.value = fmtNum(o.value, o.int); stage.appendChild(el); IV = { el, o, dirty: false }; ivPlace();
  // focus ở tick sau: ô thường mở ngay trong pointerdown, mà bước mặc định của mousedown trên canvas sẽ lấy lại focus
  // preventScroll: không thì trình duyệt cuộn khung bản vẽ để “đưa ô vào tầm nhìn” → canvas trượt đi, ô nhìn như lệch xa chỗ thao tác
  setTimeout(() => { if (!IV || IV.el !== el) return; el.focus({ preventScroll: true }); el.select(); stage.scrollLeft = 0; stage.scrollTop = 0; el.addEventListener('blur', () => setTimeout(() => { if (IV && IV.el === el) ivClose(false); }, 0)); }, 0);
  el.addEventListener('keydown', ev => {
    ev.stopPropagation(); // đang gõ số: không để phím tắt công cụ chạy
    if (ev.key === 'Enter' || ev.key === 'Tab') {
      ev.preventDefault(); const v = evalExpr(el.value); if (!isFinite(v)) { el.classList.add('bad'); return; }
      const cb = ev.key === 'Tab' && o.onTab ? o.onTab : o.onSubmit; IV = null; el.remove(); cb && cb(v); draw();
    } else if (ev.key === 'Escape') { ev.preventDefault(); ivClose(false); if (o.escPass) escAction(); }
  });
  el.addEventListener('input', () => { el.classList.remove('bad'); IV && (IV.dirty = true); });
}
function ivClose(ok) { if (!IV) return; const { el, o } = IV; IV = null; el.remove(); if (!ok && o.onCancel) o.onCancel(); }
function ivPlace() {
  if (!IV) return; if (stage.scrollLeft || stage.scrollTop) { stage.scrollLeft = 0; stage.scrollTop = 0; } const o = IV.o, s = o.s || (o.w && w2s(o.w)); if (!s) return;
  const cr = cv.getBoundingClientRect(), sr = stage.getBoundingClientRect();
  const w = IV.el.offsetWidth || 80, h = IV.el.offsetHeight || 26; // căn TÂM ô đúng vào điểm thao tác
  IV.el.style.left = Math.round(cr.left - sr.left + s.x - w / 2) + 'px'; IV.el.style.top = Math.round(cr.top - sr.top + s.y - h / 2) + 'px';
}
function ivSetLive(v) { if (IV && !IV.dirty) { IV.el.value = fmtNum(v, IV.o.int); if (document.activeElement === IV.el) IV.el.select(); } } // giữ vùng chọn: gõ số là thay hẳn, không nối thêm

// điểm giữa của nét (chỗ đặt ô nhập ngay tại nét, vd. cung vừa bo)
function entMidW(e, pm) {
  if (e.type === 'line') { const a = pm.get(e.a), b = pm.get(e.b); return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
  if (e.type === 'circle') { const c = pm.get(e.c); return { x: c.x + e.r * 0.7071, y: c.y + e.r * 0.7071 }; }
  const s = SK.sample(e, pm).pts; return s[Math.floor(s.length / 2)];
}
// ---- đặt / cập nhật kích thước của một nét (dùng cho ô kích thước trong form) ----
function dimEnt(eid, type, v) {
  if (!(v > 0)) return; const sk = SKM(), prev = skSnapshot();
  let d = sk.dims.find(x => x.type === type && x.e1 === eid && !x.driven);
  if (!d) { d = { id: SK.newId('d'), type, e1: eid, off: 8, v }; sk.dims.push(d); } else d.v = v;
  if (sketchChanged({ prev }) && S.tool === 'sk_line' && S.skd.last) { const p = SK.ptMap(SKM()).get(S.skd.last); if (p) S.skd.lastP = { x: p.x, y: p.y }; draw(); }
}

// ---- cung tiếp tuyến ----
function tanDirAt(pid, e, pm) { // hướng tiếp tuyến đi RA khỏi nét e tại đầu mút pid
  const p = pm.get(pid);
  if (e.type === 'line') { const o = pm.get(e.a === pid ? e.b : e.a), l = Math.hypot(p.x - o.x, p.y - o.y) || 1; return { x: (p.x - o.x) / l, y: (p.y - o.y) / l }; }
  const c = pm.get(e.c), rx = p.x - c.x, ry = p.y - c.y, l = Math.hypot(rx, ry) || 1; // cung đi ngược chiều kim đồng hồ từ a tới b
  return pid === e.b ? { x: -ry / l, y: rx / l } : { x: ry / l, y: -rx / l };
}
function tanArcGeom(P, t, Q) { // cung từ P tiếp xúc t, qua Q: tâm trên pháp tuyến tại P và trung trực PQ
  const n = { x: -t.y, y: t.x }, dx = Q.x - P.x, dy = Q.y - P.y, dn = dx * n.x + dy * n.y; if (Math.abs(dn) < 1e-6 || Math.hypot(dx, dy) < 1e-6) return null;
  const s = (dx * dx + dy * dy) / (2 * dn); return { c: { x: P.x + n.x * s, y: P.y + n.y * s }, ccw: s > 0, r: Math.abs(s) };
}
function endEntAt(pid) { const sk = SKM(); return sk.ents.find(e => (e.type === 'line' || e.type === 'arc') && (e.a === pid || e.b === pid)) || null; }
function makeTanArc(pid, eid, qsn) {
  const sk = SKM(), pm = SK.ptMap(sk), E = sk.ents.find(x => x.id === eid); if (!E) return null;
  const g = tanArcGeom(pm.get(pid), tanDirAt(pid, E, pm), qsn.p); if (!g) return null;
  const q = skResolve(qsn), c = SK.addPt(sk, g.c.x, g.c.y), arc = addEnt(g.ccw ? { type: 'arc', c, a: pid, b: q } : { type: 'arc', c, a: q, b: pid });
  let s = 1;
  if (E.type === 'line') { const p1 = pm.get(E.a), p2 = pm.get(E.b), dx = p2.x - p1.x, dy = p2.y - p1.y; s = ((g.c.x - p1.x) * dy - (g.c.y - p1.y) * dx) >= 0 ? 1 : -1; }
  else { const c1 = pm.get(E.c), r1 = Math.hypot(pm.get(E.a).x - c1.x, pm.get(E.a).y - c1.y), d = Math.hypot(c1.x - g.c.x, c1.y - g.c.y); s = Math.abs(d - (r1 + g.r)) <= Math.abs(d - Math.abs(r1 - g.r)) ? 1 : -1; }
  sk.cons.push({ id: SK.newId('k'), type: 'tan', e1: eid, e2: arc.id, s });
  return { arc, end: q };
}
// ---- xem trước thêm cho công cụ phác thảo (gọi trong skOverlay) ----
function skOverlay2() {
  const t = S.tool, sn = S.snap, cur = sn ? sn.p : null, sk = SKM(), pm = SK.ptMap(sk);
  const arcPath = (c, r, a0, a1, ccw) => { const q = w2s(c); ctx.beginPath(); ctx.arc(q.x, q.y, r * S.view.s, -a0, -a1, ccw); ctx.stroke(); }; // trục y màn hình lật
  ctx.strokeStyle = colors.accent; ctx.lineWidth = 1.6; ctx.setLineDash([6, 4]);
  const tarc = (pid, eid) => { const E = sk.ents.find(x => x.id === eid); if (!E || !cur) return; const P = pm.get(pid), g = tanArcGeom(P, tanDirAt(pid, E, pm), cur); if (!g) return;
    arcPath(g.c, g.r, Math.atan2(P.y - g.c.y, P.x - g.c.x), Math.atan2(cur.y - g.c.y, cur.x - g.c.x), g.ccw); };
  if (t === 'sk_line' && S.skd.tarc && S.skd.last && S.skd.lastEnt) tarc(S.skd.last, S.skd.lastEnt);
  if (t === 'sk_tarc' && S.skd.tStart) tarc(S.skd.tStart, S.skd.tEnt);
  if (t === 'sk_carc' && S.skd.clicks && cur) {
    const C = S.skd.clicks.map(c => c.p);
    if (C.length === 1) { const a = w2s(C[0]), b = w2s(cur); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    if (C.length === 2) { const r = Math.hypot(C[1].x - C[0].x, C[1].y - C[0].y), a0 = Math.atan2(C[1].y - C[0].y, C[1].x - C[0].x); arcPath(C[0], r, a0, a0 + (S.skd.sweep || 0), (S.skd.sweep || 0) > 0); }
  }
  ctx.setLineDash([]);
  if (t === 'cn_dim') dimPreview();
  if (t === 'ed_offset' && S.offs) offsetPreview();
  if ((t === 'ed_lpat' || t === 'ed_cpat') && S.pat) patPreview();
}
// theo dõi góc quét của cung tâm (cho phép > 180°, chiều theo hướng rê chuột)
function skTrack() {
  if (S.tool !== 'sk_carc' || !S.skd.clicks || S.skd.clicks.length !== 2 || !S.snap) return;
  const c = S.skd.clicks[0].p, a = Math.atan2(S.snap.p.y - c.y, S.snap.p.x - c.x);
  if (S.skd.prevAng == null) { const s = S.skd.clicks[1].p; S.skd.prevAng = Math.atan2(s.y - c.y, s.x - c.x); S.skd.sweep = 0; }
  let d = a - S.skd.prevAng; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
  S.skd.sweep = Math.max(-TAU + 1e-3, Math.min(TAU - 1e-3, (S.skd.sweep || 0) + d)); S.skd.prevAng = a;
}
// cung tiếp tuyến / cung tâm khi bấm (trả true nếu đã xử lý)
function skToolDown2(t, sn, prev) {
  const sk = SKM();
  if (t === 'sk_line' && S.skd.tarc && S.skd.last && S.skd.lastEnt) {
    const r = makeTanArc(S.skd.last, S.skd.lastEnt, sn); if (!r) return true;
    S.skd.last = r.end; S.skd.lastEnt = r.arc.id; S.skd.lastP = { ...sn.p }; S.skd.tarc = false; // xong cung → quay lại vẽ đoạn thẳng (như Onshape)
    sketchChanged({ prev }); updateHint(); return true;
  }
  if (t === 'sk_tarc') {
    if (!S.skd.tStart) { const E = sn.t === 'sp' && endEntAt(sn.id); if (!E) { toast(T('toast_tarc_start')); return true; } S.skd = { tStart: sn.id, tEnt: E.id, lastP: { ...sn.p } }; updateHint(); draw(); return true; }
    const r = makeTanArc(S.skd.tStart, S.skd.tEnt, sn); if (!r) return true;
    S.skd = {}; sketchChanged({ prev }); updateHint(); return true;
  }
  if (t === 'sk_carc') {
    S.skd.clicks = S.skd.clicks || []; S.skd.clicks.push(sn); S.skd.lastP = { ...sn.p }; const C = S.skd.clicks;
    if (C.length === 2) { S.skd.prevAng = null; skTrack(); }
    if (C.length === 3) {
      const c0 = C[0].p, r = Math.hypot(C[1].p.x - c0.x, C[1].p.y - c0.y), sw = S.skd.sweep || 0; if (r < 1e-3 || Math.abs(sw) < 1e-3) { S.skd = {}; draw(); return true; }
      const a0 = Math.atan2(C[1].p.y - c0.y, C[1].p.x - c0.x), a1 = a0 + sw, c = skResolve(C[0]), p1 = skResolve(C[1]), p2 = SK.addPt(sk, c0.x + r * Math.cos(a1), c0.y + r * Math.sin(a1));
      const e = addEnt(sw > 0 ? { type: 'arc', c, a: p1, b: p2 } : { type: 'arc', c, a: p2, b: p1 });
      S.skd = {}; sketchChanged({ prev }); updateHint(); return true;
    }
    draw(); updateHint(); return true;
  }
  return false;
}

// ---- Kích thước kiểu Onshape: chọn đối tượng → kích thước bám theo chuột → bấm để đặt → gõ giá trị ----
// hai điểm: kéo lên/xuống (ra ngoài khoảng y của hai điểm) → khoảng cách ngang, kéo sang trái/phải → khoảng cách dọc, kéo chéo → khoảng cách thẳng
function dimSpec(picks, w) {
  const sk = SKM(), em = new Map(sk.ents.map(e => [e.id, e])), pm = SK.ptMap(sk), [a, b] = picks;
  if (!a) return null; const ea = a.k === 'e' && em.get(a.id), eb = b && b.k === 'e' && em.get(b.id);
  const offOf = (A, B) => { const dx = B.x - A.x, dy = B.y - A.y, l = Math.hypot(dx, dy) || 1; return ((w.x - A.x) * -dy + (w.y - A.y) * dx) / l; };
  if (picks.length === 1) {
    if (ea && ea.type === 'line') return { type: 'len', e1: ea.id, off: offOf(pm.get(ea.a), pm.get(ea.b)) };
    if (ea && (ea.type === 'circle' || ea.type === 'arc')) { const c = pm.get(ea.c); return { type: ea.type === 'circle' ? 'dia' : 'rad', e1: ea.id, ang: Math.atan2(w.y - c.y, w.x - c.x) }; }
    return null;
  }
  if (a.k === 'p' && b.k === 'p') {
    const A = pm.get(a.id), B = pm.get(b.id), x0 = Math.min(A.x, B.x), x1 = Math.max(A.x, B.x), y0 = Math.min(A.y, B.y), y1 = Math.max(A.y, B.y);
    const outY = w.y > y1 || w.y < y0, outX = w.x > x1 || w.x < x0;
    if (outY && !outX && x1 - x0 > 1e-6) return { type: 'dx', p: a.id, q: b.id, s: B.x >= A.x ? 1 : -1, off: w.y - (A.y + B.y) / 2 };
    if (outX && !outY && y1 - y0 > 1e-6) return { type: 'dy', p: a.id, q: b.id, s: B.y >= A.y ? 1 : -1, off: w.x - (A.x + B.x) / 2 };
    return { type: 'dist', p: a.id, q: b.id, off: offOf(A, B) };
  }
  const pl = (pid, L) => { const P = pm.get(pid), A = pm.get(L.a), B = pm.get(L.b), dx = B.x - A.x, dy = B.y - A.y, t = ((P.x - A.x) * dx + (P.y - A.y) * dy) / (dx * dx + dy * dy || 1); return { type: 'pl', p: pid, e1: L.id, off: offOf(P, { x: A.x + t * dx, y: A.y + t * dy }) }; };
  if (a.k === 'p' && eb && eb.type === 'line') return pl(a.id, eb);
  if (b.k === 'p' && ea && ea.type === 'line') return pl(b.id, ea);
  if (ea && eb && ea.type === 'line' && eb.type === 'line') {
    const d1 = { x: pm.get(ea.b).x - pm.get(ea.a).x, y: pm.get(ea.b).y - pm.get(ea.a).y }, d2 = { x: pm.get(eb.b).x - pm.get(eb.a).x, y: pm.get(eb.b).y - pm.get(eb.a).y };
    if (Math.abs(d1.x * d2.y - d1.y * d2.x) / (Math.hypot(d1.x, d1.y) * Math.hypot(d2.x, d2.y) || 1) < 1e-3) return pl(eb.a, ea); // hai đường song song: khoảng cách
    return { type: 'ang', e1: ea.id, e2: eb.id };
  }
  return null;
}
function dimPick(x, y) {
  const h = hitSketch(x, y, 'pe'), w = s2w(x, y), spec = dimSpec(S.cpick, w);
  if (h && guardLocked(h)) return;
  if (!h || S.cpick.some(p => p.k === h.k && p.id === h.id)) { if (spec) placeDim(spec); else S.cpick = []; draw(); updateHint(); return; }
  if (S.cpick.length >= 2) S.cpick = [];
  S.cpick.push(h); if (S.cpick.length === 2 && !dimSpec(S.cpick, w)) S.cpick = [h]; // cặp không đo được → bắt đầu lại từ đối tượng vừa bấm
  draw(); updateHint();
}
function dimPreview() {
  if (!S.cpick.length || !S.cursor) return; const spec = dimSpec(S.cpick, S.cursor.w); if (!spec) return;
  XF = skXform(true); const d = { id: '_prev', ...spec }; Object.assign(d, dimCurrent(d)); ctx.globalAlpha = .75; drawSkDim(d, SK.ptMap(SKM())); ctx.globalAlpha = 1;
}
// đặt kích thước: dư ràng buộc (không giảm bậc tự do) hoặc mâu thuẫn → tự thành kích thước tham chiếu (driven), như Onshape
function placeDim(spec) {
  const sk = SKM(), prev = skSnapshot(), dof0 = S.skDof, d = { id: SK.newId('d'), off: 8, ...spec }; Object.assign(d, dimCurrent(d));
  sk.dims.push(d);
  if (!solveSketch({ strict: true }) || S.skDof >= dof0) { skRestore(prev); d.driven = true; SKM().dims.push(d); solveSketch(); toast(T('toast_dim_driven')); }
  pruneMeasures(); pushUndo(); markDirty(); S.cpick = []; S.sel = { k: 'd', id: d.id }; S.msel = []; renderAll();
  if (!d.driven) dimEditInline(d.id);
}
// sửa giá trị kích thước ngay tại nhãn (bấm đúp nhãn, hoặc ngay sau khi đặt); lăn chuột / ↑↓ cập nhật trực tiếp
function dimEditInline(did, opt = {}) {
  if (guardLocked({ k: 'd', id: did })) return;
  const d0 = SKM().dims.find(x => x.id === did); if (!d0 || d0.driven) return; draw();
  const prev = skSnapshot(); let live = false;
  const set = v => { const d = SKM().dims.find(x => x.id === did); if (!d || (!(v > 0) && d.type !== 'ang')) return false; d.v = v; return true; };
  ivOpen({ s: opt.w ? null : d0._lbl, w: opt.w, value: d0.v,
    onLive: v => { if (set(v)) { live = true; solveSketch(); draw(); } },
    onSubmit: v => { if (!set(v)) { if (live) { skRestore(prev); solveSketch(); renderAll(); } return; } if (sketchChanged({ prev })) { toast(T('toast_dim_set')); if (opt.onSet) opt.onSet(v); } },
    onCancel: () => { if (live) { skRestore(prev); solveSketch(); renderAll(); } } });
}
function setDimDriven(did, on) {
  const sk = SKM(), d = sk.dims.find(x => x.id === did); if (!d) return; const prev = skSnapshot();
  if (on) d.driven = true; else { delete d.driven; Object.assign(d, dimCurrent(d)); }
  sketchChanged({ prev });
}

// ---- Bo góc: bấm góc (hoặc hai đoạn thẳng chung đỉnh) → ô bán kính; các góc bấm tiếp trong cùng lượt bằng nhau (ràng buộc bằng) ----
function filletPick(x, y) {
  const sk = SKM(); let pid = cornerPointNear(x, y);
  if (!pid) {
    const h = hitSketch(x, y, 'e'), e = h && sk.ents.find(q => q.id === h.id); if (!e || e.type !== 'line') return;
    if (guardLocked({ k: 'e', id: e.id })) return;
    if (!S.fil2) { S.fil2 = e.id; S.cpick = [{ k: 'e', id: e.id }]; draw(); updateHint(); return; }
    const f = sk.ents.find(q => q.id === S.fil2); S.fil2 = null; S.cpick = [];
    pid = f && [f.a, f.b].find(p => p === e.a || p === e.b); if (!pid) { toast(T('toast_fillet_bad')); draw(); return; }
  }
  if (guardLocked({ k: 'p', id: pid })) return;
  const prev = skSnapshot(), same = S.fillet && sk.ents.some(e => e.id === S.fillet.first), r = same ? S.fillet.r : +S.topt.radius;
  const arcId = SK.fillet(sk, pid, r); if (!arcId) { toast(T('toast_fillet_bad')); return; }
  if (same) { sk.dims = sk.dims.filter(d => !(d.type === 'rad' && d.e1 === arcId)); sk.cons.push({ id: SK.newId('k'), type: 'eq', e1: S.fillet.first, e2: arcId }); }
  else S.fillet = { first: arcId, r };
  if (!sketchChanged({ prev })) return;
  const d = SKM().dims.find(q => q.type === 'rad' && q.e1 === S.fillet.first);
  const arc = SKM().ents.find(e => e.id === arcId); // ô bán kính đặt ngay tại cung vừa bo
  if (d) dimEditInline(d.id, { w: arc && entMidW(arc, SK.ptMap(SKM())), onSet: v => { if (S.fillet) S.fillet.r = v; S.topt.radius = v; } });
}

// ---- Offset: bấm nét (cả chuỗi nối liền) → kéo chuột đặt khoảng cách / gõ số + Enter (số âm = đổi phía); bấm thêm nét để offset cùng lúc ----
function offsetSigned(w) {
  const o = S.offs, sk = SKM(), pm = SK.ptMap(sk), e = sk.ents.find(x => x.id === o.base); if (!e) return 0;
  if (e.type === 'line') { const a = pm.get(e.a), b = pm.get(e.b), l = Math.hypot(b.x - a.x, b.y - a.y) || 1; return ((w.x - a.x) * -(b.y - a.y) + (w.y - a.y) * (b.x - a.x)) / l; }
  const c = pm.get(e.c), r = e.type === 'circle' ? e.r : Math.hypot(pm.get(e.a).x - c.x, pm.get(e.a).y - c.y); return Math.hypot(w.x - c.x, w.y - c.y) - r;
}
function offsetPick(x, y) {
  const h = hitSketch(x, y, 'e'), sk = SKM(), e = h && sk.ents.find(q => q.id === h.id), ok = e && ['line', 'arc', 'circle'].includes(e.type);
  if (ok && guardLocked(h)) return;
  if (!S.offs) {
    if (!ok) return; const ids = e.type === 'circle' ? [e.id] : chainOf(e.id);
    S.offs = { base: e.id, ids, d: S.topt.dist }; S.cpick = ids.map(id => ({ k: 'e', id }));
    S.offs.d = offsetSigned(s2w(x, y)) || S.topt.dist;
    ivOpen({ w: s2w(x, y), value: Math.abs(S.offs.d), onSubmit: v => offsetCommit((Math.sign(S.offs ? S.offs.d : 1) || 1) * v), onCancel: () => {} });
    updateHint(); draw(); return;
  }
  if (ok && !S.offs.ids.includes(e.id)) { for (const id of (e.type === 'circle' ? [e.id] : chainOf(e.id))) if (!S.offs.ids.includes(id)) S.offs.ids.push(id); S.cpick = S.offs.ids.map(id => ({ k: 'e', id })); draw(); return; }
  offsetCommit(S.offs.d);
}
function offsetMove(w) { if (!S.offs) return; S.offs.d = offsetSigned(w); ivSetLive(Math.abs(S.offs.d)); }
function offsetCommit(d) {
  const o = S.offs; S.offs = null; S.cpick = []; ivClose(true); if (!o || Math.abs(d) < 1e-6) { draw(); return; }
  const sk = SKM(), prev = skSnapshot(), nBefore = sk.cons.length, made = SK.offset(sk, o.ids, d); if (!made.length) { draw(); return; }
  // kích thước khoảng cách offset (điểm đầu nét mới → nét gốc) để sửa lại được, như Onshape
  const par = sk.cons.slice(nBefore).find(c => c.type === 'par'), nl = par && sk.ents.find(e => e.id === par.e2);
  if (nl) sk.dims.push({ id: SK.newId('d'), type: 'pl', p: nl.a, e1: par.e1, off: 6, v: Math.abs(d) });
  S.topt.dist = Math.abs(d); sketchChanged({ prev });
}
function offsetPreview() {
  const o = S.offs, cl = JSON.parse(JSON.stringify(SKM())), made = SK.offset(cl, o.ids, o.d), pm = SK.ptMap(cl);
  ctx.strokeStyle = colors.accent; ctx.lineWidth = 1.6; ctx.setLineDash([6, 4]);
  for (const id of made) { const e = cl.ents.find(q => q.id === id), s = SK.sample(e, pm).pts.map(w2s); ctx.beginPath(); s.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke(); }
  ctx.setLineDash([]);
}

// ---- Mảng thẳng / tròn kiểu Onshape: chọn nét rồi bật lệnh → mảng xem trước ngay; kéo tay nắm đổi khoảng cách & hướng (mảng thẳng)
// hoặc dời tâm (mảng tròn); bấm đúp / lăn chuột trên số bản sao để đổi; bấm chỗ trống = chấp nhận; Esc = hủy ----
function patInit(t) {
  const ids = S.msel.filter(p => p.k === 'e' && !lockedItem(p)).map(p => p.id); if (S.msel.some(lockedItem)) lockToast(); S.pat = { kind: t === 'ed_lpat' ? 'lin' : 'cir', ids, cx: 0, cy: 0 };
  S.topt.count = 3; if (t === 'ed_cpat') S.topt.angle = 360; else patAutoSpacing();
  S.cpick = ids.map(id => ({ k: 'e', id })); S.msel = []; renderToolOpts();
}
function patBox(ids) {
  const sk = SKM(), pm = SK.ptMap(sk); let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const e of sk.ents) if (ids.includes(e.id)) for (const p of SK.sample(e, pm).pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  return x0 <= x1 ? { x0, x1, y0, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 } : null;
}
function patAutoSpacing() { const b = S.pat && patBox(S.pat.ids); if (!b) return; const w = b.x1 - b.x0; S.topt.dx = +(w + Math.max(2, w * 0.25)).toFixed(1); S.topt.dy = 0; }
function patXforms() { // các phép biến đổi của bản sao 1…n−1
  const n = Math.max(2, Math.round(S.topt.count)), out = [];
  if (S.pat.kind === 'lin') for (let i = 1; i < n; i++) out.push(p => ({ x: p.x + S.topt.dx * i, y: p.y + S.topt.dy * i }));
  else { const full = Math.abs(S.topt.angle - 360) < 1e-6, st = (full ? 360 / n : S.topt.angle / Math.max(1, n - 1)) * D2R, cx = S.pat.cx, cy = S.pat.cy;
    for (let i = 1; i < n; i++) { const co = Math.cos(st * i), si = Math.sin(st * i); out.push(p => ({ x: cx + (p.x - cx) * co - (p.y - cy) * si, y: cy + (p.x - cx) * si + (p.y - cy) * co })); } }
  return out;
}
function patHandles() { // vị trí màn hình: tay nắm (khoảng cách / tâm) và nhãn số bản sao
  const b = patBox(S.pat.ids); if (!b) return null; const n = Math.max(2, Math.round(S.topt.count));
  if (S.pat.kind === 'lin') { const B = w2s({ x: b.cx, y: b.cy }), H = w2s({ x: b.cx + S.topt.dx, y: b.cy + S.topt.dy }), Lw = { x: b.cx + S.topt.dx * (n - 1), y: b.cy + S.topt.dy * (n - 1) }, L = w2s(Lw); return { B, H, lbl: { x: L.x + 22, y: L.y - 20 } }; }
  const C = w2s({ x: S.pat.cx, y: S.pat.cy }); return { B: C, H: C, lbl: { x: C.x + 26, y: C.y - 22 } };
}
function patPreview() {
  const sk = SKM(), pm = SK.ptMap(sk), ents = sk.ents.filter(e => S.pat.ids.includes(e.id));
  ctx.strokeStyle = colors.accent; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
  for (const f of patXforms()) for (const e of ents) { const s = SK.sample(e, pm).pts.map(p => w2s(f(p))); ctx.beginPath(); s.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); if (e.type === 'circle') ctx.closePath(); ctx.stroke(); }
  ctx.setLineDash([]); const h = patHandles(); if (!h) return;
  ctx.fillStyle = colors.accent; ctx.strokeStyle = colors.accent; ctx.lineWidth = 2;
  if (S.pat.kind === 'lin') { ctx.beginPath(); ctx.moveTo(h.B.x, h.B.y); ctx.lineTo(h.H.x, h.H.y); ctx.stroke(); const a = Math.atan2(h.H.y - h.B.y, h.H.x - h.B.x); ctx.beginPath(); ctx.moveTo(h.H.x, h.H.y); ctx.lineTo(h.H.x - 11 * Math.cos(a) + 5 * Math.sin(a), h.H.y - 11 * Math.sin(a) - 5 * Math.cos(a)); ctx.lineTo(h.H.x - 11 * Math.cos(a) - 5 * Math.sin(a), h.H.y - 11 * Math.sin(a) + 5 * Math.cos(a)); ctx.closePath(); ctx.fill(); }
  else { ctx.beginPath(); ctx.arc(h.B.x, h.B.y, 7, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.moveTo(h.B.x - 11, h.B.y); ctx.lineTo(h.B.x + 11, h.B.y); ctx.moveTo(h.B.x, h.B.y - 11); ctx.lineTo(h.B.x, h.B.y + 11); ctx.stroke(); }
  const txt = '× ' + Math.max(2, Math.round(S.topt.count)); ctx.font = '600 12px ' + bodyFont(); const tw = ctx.measureText(txt).width;
  ctx.fillStyle = colors.accent; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(h.lbl.x - tw / 2 - 7, h.lbl.y - 11, tw + 14, 22, 5) : ctx.rect(h.lbl.x - tw / 2 - 7, h.lbl.y - 11, tw + 14, 22); ctx.fill();
  ctx.fillStyle = colors.panel; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, h.lbl.x, h.lbl.y);
}
const patNear = (p, x, y, r) => p && Math.hypot(p.x - x, p.y - y) < r;
function patDown(x, y) {
  const h = S.pat.ids.length && patHandles();
  if (h && patNear(h.lbl, x, y, 18)) return null; // nhãn số: bấm đúp để sửa
  if (h && patNear(h.H, x, y, 12)) return { kind: 'pathandle' };
  const e = hitSketch(x, y, 'e');
  if (e && guardLocked(e)) return null;
  if (e) { const i = S.pat.ids.indexOf(e.id); if (i >= 0) S.pat.ids.splice(i, 1); else S.pat.ids.push(e.id); S.cpick = S.pat.ids.map(id => ({ k: 'e', id })); if (S.pat.kind === 'lin' && S.pat.ids.length === 1 && i < 0) { patAutoSpacing(); renderToolOpts(); } draw(); updateHint(); return null; }
  if (S.pat.ids.length) patAccept();
  return null;
}
function patDrag(x, y) {
  if (S.pat.kind === 'lin') { const b = patBox(S.pat.ids); if (!b) return; const w = s2w(x, y), r = v => S.opt.snap && !S.shiftDown ? Math.round(v * 2) / 2 : +v.toFixed(2); S.topt.dx = r(w.x - b.cx); S.topt.dy = r(w.y - b.cy); }
  else { const sn = skSnap(x, y); S.pat.cx = sn.p.x; S.pat.cy = sn.p.y; }
  syncToolOpts(); draw();
}
function patEditCount() { const h = patHandles(); if (!h) return; ivOpen({ s: h.lbl, value: Math.round(S.topt.count), int: true, onLive: v => { S.topt.count = v; syncToolOpts(); draw(); }, onSubmit: v => { S.topt.count = Math.max(2, Math.round(v)); syncToolOpts(); draw(); } }); }
function patWheel(ev, x, y) { if (!S.pat || !S.pat.ids.length) return false; const h = patHandles(); if (!patNear(h && h.lbl, x, y, 18)) return false; S.topt.count = Math.max(2, Math.round(S.topt.count) + (ev.deltaY < 0 ? 1 : -1)); syncToolOpts(); draw(); return true; }
function patAccept() {
  const ids = S.pat.ids.slice(); if (!ids.length) { toast(T('toast_select_first')); return; }
  const sk = SKM(), prev = skSnapshot(), n = Math.max(2, Math.round(S.topt.count));
  const made = S.pat.kind === 'lin' ? SK.linPattern(sk, ids, n, +S.topt.dx, +S.topt.dy) : SK.circPattern(sk, ids, S.pat.cx, S.pat.cy, n, +S.topt.angle);
  S.pat = null; S.cpick = []; if (sketchChanged({ prev })) toast(T('toast_pattern', { n: made.length })); toolDone();
}
function syncToolOpts() { for (const k of ['count', 'dx', 'dy', 'angle']) { const el = document.getElementById('to_' + k); if (el && document.activeElement !== el) el.value = k === 'count' ? Math.round(S.topt[k]) : S.topt[k]; } }

// ---- trạng thái riêng của từng công cụ: xóa khi đổi công cụ ----
function skToolReset(t) {
  ivClose(false); S.offs = null; S.fillet = null; S.fil2 = null; S.pat = null;
  if (t === 'ed_lpat' || t === 'ed_cpat') patInit(t);
}
// Esc: hủy thao tác đang dở trước (ô nhập, offset, bo góc 2 cạnh, mảng), rồi mới tới hủy chuỗi / thoát công cụ
function escAction() {
  if (!ctxEl.hidden) { closeMenu(); return; } if (!popEl.hidden) { closePopover(); return; }
  if (S.offs) { S.offs = null; S.cpick = []; ivClose(false); updateHint(); draw(); return; }
  if (S.fil2) { S.fil2 = null; S.cpick = []; updateHint(); draw(); return; }
  if (S.pat) { S.pat = null; setTool('select'); return; }
  if (S.skd.last || S.skd.tStart || (S.skd.clicks && S.skd.clicks.length)) { if (S.tool === 'sk_line') SK.pruneRefs(S.model.sketch); S.skd = {}; updateHint(); draw(); return; }
  if (S.cpick.length) { S.cpick = []; if (S.tool === 'mdist') S.draft = []; updateHint(); draw(); return; }
  if (S.mpick.length) { S.mpick = []; updateHint(); draw(); return; }
  if (S.draft.length) { S.draft = []; updateHint(); draw(); return; }
  setTool('select');
}

Object.assign(I18N.vi, {
  t_starc: 'Cung tiếp tuyến', t_scarc: 'Cung tâm',
  h_sline: '<b>Đoạn thẳng:</b> bấm liên tiếp để nối chuỗi, hoặc giữ – kéo – thả cho một đoạn · Shift+A: đoạn kế tiếp là cung tiếp tuyến · giữ Shift: tắt bắt điểm · Esc kết thúc chuỗi, Esc lần nữa thoát',
  h_sline_tarc: '<b>Cung tiếp tuyến:</b> bấm điểm cuối cung (tiếp xúc với đoạn trước) · Shift+A quay lại đoạn thẳng',
  h_starc: '<b>Cung tiếp tuyến:</b> bấm đầu mút của một đoạn thẳng / cung, rồi bấm điểm cuối cung',
  h_scarc: '<b>Cung tâm:</b> bấm tâm, bấm điểm đầu, rê chuột theo chiều muốn quét rồi bấm điểm cuối',
  h_srect: '<b>Chữ nhật góc:</b> bấm hai góc đối (hoặc giữ – kéo – thả)',
  h_screct: '<b>Chữ nhật tâm:</b> bấm tâm rồi bấm một góc (hoặc giữ – kéo – thả)',
  h_scircle: '<b>Tròn tâm:</b> bấm tâm rồi bấm điểm trên đường tròn (hoặc giữ – kéo – thả)',
  h_scircle3: '<b>Tròn 3 điểm:</b> bấm ba điểm trên đường tròn',
  h_sarc: '<b>Cung 3 điểm:</b> bấm điểm đầu, điểm cuối, rồi một điểm trên cung',
  h_dim0: '<b>Kích thước:</b> bấm đối tượng (đoạn thẳng, tròn → đường kính, cung → bán kính, hai điểm, điểm + đường, hai đường) → kích thước bám theo chuột → bấm để đặt → gõ giá trị + Enter',
  h_dim2: '<b>Kích thước:</b> bấm để đặt kích thước (hai điểm: kéo lên/xuống = ngang, sang trái/phải = dọc, chéo = thẳng), hoặc bấm thêm một đối tượng',
  h_cons_more: '<b>{t}:</b> chọn {n} · công cụ vẫn bật để áp tiếp · Esc để thoát',
  h_e_fillet: '<b>Bo góc:</b> bấm vào góc (hoặc lần lượt hai đoạn thẳng chung đỉnh) → gõ bán kính + Enter · các góc bấm tiếp có cùng bán kính · Esc thoát',
  h_e_fillet2: '<b>Bo góc:</b> bấm đoạn thẳng thứ hai',
  h_e_offset: '<b>Offset:</b> bấm một nét (cả chuỗi nối liền được chọn) → rê chuột đặt khoảng cách, bấm để xong, hoặc gõ số + Enter (số âm = đổi phía)',
  h_e_offset2: '<b>Offset:</b> rê chuột chọn khoảng cách và phía · bấm chỗ trống để xong · gõ số + Enter · bấm thêm nét để offset cùng lúc · Esc hủy',
  h_e_trim: '<b>Cắt tỉa:</b> bấm vào đoạn cần bỏ, hoặc giữ chuột trái kéo lê qua các đoạn · công cụ vẫn bật · Esc thoát',
  h_e_extend: '<b>Kéo dài:</b> bấm gần đầu nét cần kéo dài tới nét chặn gần nhất · Esc thoát',
  h_e_split: '<b>Chia đôi:</b> bấm vào nét tại chỗ muốn chia · Esc thoát',
  h_e_pat0: '<b>{t}:</b> bấm các nét cần nhân bản (hoặc chọn sẵn rồi bật lệnh)',
  h_e_pat1: '<b>{t}:</b> kéo tay nắm để đổi {h} · bấm đúp / lăn chuột trên ô “×n” để đổi số bản · bấm nét để thêm/bớt · bấm chỗ trống để chấp nhận · Esc hủy',
  pat_h_lin: 'khoảng cách và hướng', pat_h_cir: 'tâm mảng (mặc định gốc tọa độ)',
  toast_tarc_start: 'Bấm đúng đầu mút của một đoạn thẳng hoặc cung để bắt đầu cung tiếp tuyến',
  toast_dim_driven: 'Kích thước này làm dư ràng buộc → đã đặt thành kích thước tham chiếu (driven, chữ xám)',
  f_driven: 'Kích thước tham chiếu (driven, không điều khiển hình)', dt_dx: 'Khoảng cách ngang', dt_dy: 'Khoảng cách dọc', dt_dia: 'Đường kính',
  o_accept: 'Chấp nhận',
  t_addhole: 'Lỗ chốt (khớp) trên part / khâu', h_addhole0: '<b>Lỗ chốt:</b> bấm lên part hoặc khâu tại vị trí lỗ (bắt tâm tròn, đầu mút, trung điểm, giao điểm…)',
  t_mk_part: 'Part ⇄ CP (tạo part từ CP / trả part về CP)', h_mkpart: '<b>Part ⇄ CP:</b> bấm CP tự do để tạo part chuyển động · bấm part để trả về CP (chọn sẵn rồi nhấn K cũng được)',
  toast_path_pinned: 'Part đang bị ghim ở 2 chốt cố định: không dời được để chốt nằm trên đường.', toast_path_reach: 'Chốt không thể chạm tới đường khi part xoay quanh chốt cố định (đường nằm ngoài tầm với).',
  toast_part_locked: 'Part đã khóa: không dời hay sửa hình được (tránh xung đột). Muốn sửa: xóa part (Delete, hoặc chuột phải → Xóa part) để CP trở lại tự do, sửa xong tạo part lại (K).',
  toast_part_deleted: 'Đã xóa part {l} — CP trở lại tự do để sửa. Sửa xong bấm K để tạo part lại.',
  m_delpart: 'Xóa part (trả về CP để sửa)', body_locked: 'Part đã khóa vị trí và hình dạng; muốn sửa thì xóa part để trả về CP.',
});
Object.assign(I18N.en, {
  t_starc: 'Tangent arc', t_scarc: 'Center point arc',
  h_sline: '<b>Line:</b> click to chain segments, or press–drag–release for one segment · Shift+A: next segment is a tangent arc · hold Shift: no snapping · Esc ends the chain, Esc again exits',
  h_sline_tarc: '<b>Tangent arc:</b> click the arc end point (tangent to the previous segment) · Shift+A back to line',
  h_starc: '<b>Tangent arc:</b> click the end point of a line / arc, then click the arc end',
  h_scarc: '<b>Center point arc:</b> click the centre, click the start, move the mouse the way you want to sweep, then click the end',
  h_srect: '<b>Corner rectangle:</b> click two opposite corners (or press–drag–release)',
  h_screct: '<b>Center-point rectangle:</b> click the centre, then a corner (or press–drag–release)',
  h_scircle: '<b>Center-point circle:</b> click the centre, then a point on the circle (or press–drag–release)',
  h_scircle3: '<b>3-point circle:</b> click three points on the circle',
  h_sarc: '<b>3-point arc:</b> click the start, the end, then a point on the arc',
  h_dim0: '<b>Dimension:</b> click items (line, circle → diameter, arc → radius, two points, point + line, two lines) → the dimension follows the mouse → click to place → type the value + Enter',
  h_dim2: '<b>Dimension:</b> click to place it (two points: drag up/down = horizontal, left/right = vertical, diagonal = aligned), or click one more item',
  h_cons_more: '<b>{t}:</b> pick {n} · the tool stays on for more · Esc to exit',
  h_e_fillet: '<b>Fillet:</b> click a corner (or two lines sharing a vertex) → type the radius + Enter · further corners get the same radius · Esc exits',
  h_e_fillet2: '<b>Fillet:</b> click the second line',
  h_e_offset: '<b>Offset:</b> click a curve (its connected chain is picked) → move the mouse to set the distance, click to finish, or type + Enter (negative = other side)',
  h_e_offset2: '<b>Offset:</b> move the mouse for distance and side · click empty space to finish · type + Enter · click more curves to offset together · Esc cancels',
  h_e_trim: '<b>Trim:</b> click the piece to remove, or hold the left button and drag across pieces · the tool stays on · Esc exits',
  h_e_extend: '<b>Extend:</b> click near the end to extend it to the nearest bounding curve · Esc exits',
  h_e_split: '<b>Split:</b> click a curve where it should split · Esc exits',
  h_e_pat0: '<b>{t}:</b> click the curves to pattern (or preselect them, then pick the tool)',
  h_e_pat1: '<b>{t}:</b> drag the handle to change the {h} · double-click / scroll on “×n” to change the count · click curves to add/remove · click empty space to accept · Esc cancels',
  pat_h_lin: 'spacing and direction', pat_h_cir: 'pattern centre (origin by default)',
  toast_tarc_start: 'Click exactly on the end point of a line or arc to start a tangent arc',
  toast_dim_driven: 'This dimension over-defines the sketch → made a driven (reference) dimension, shown grey',
  f_driven: 'Driven (reference) dimension', dt_dx: 'Horizontal distance', dt_dy: 'Vertical distance', dt_dia: 'Diameter',
  o_accept: 'Accept',
  t_addhole: 'Pin hole (joint) on part / link', h_addhole0: '<b>Pin hole:</b> click a part or link where the hole goes (snaps to circle centres, end points, midpoints, intersections…)',
  t_mk_part: 'Part ⇄ CP (make part from CP / turn part back into CP)', h_mkpart: '<b>Part ⇄ CP:</b> click a free CP to make a moving part · click a part to turn it back into a CP (or select it and press K)',
  toast_path_pinned: 'The part is pinned at 2 fixed joints: it cannot be moved to put this joint on the path.', toast_path_reach: 'The joint cannot reach the path while the part turns about its fixed pin (the path is out of reach).',
  toast_part_locked: 'The part is locked: it cannot be moved or reshaped (avoids conflicts). To edit it, delete the part (Delete, or right-click → Delete part) so its CP is free again, then make the part again (K).',
  toast_part_deleted: 'Part {l} deleted — its CP is free to edit. Press K to make the part again when done.',
  m_delpart: 'Delete part (back to CP for editing)', body_locked: 'The part is locked in place and shape; delete it to get the CP back for editing.',
});
