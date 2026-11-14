// ===== Bộ giải ràng buộc tổng quát v0.4 =====
// Mô hình: khớp + khâu (thanh/tấm/xi lanh) + rãnh (trên khâu hoặc trên nền) + motor (quay hoặc xi lanh dẫn động)

const isCyl = L => L.kind === 'cyl';
function linkPairs(link) { // các cặp khoảng cách cứng của khâu
  const J = link.joints, out = [];
  if (J.length < 2 || isCyl(link)) return J.length === 2 && isCyl(link) ? [[J[0], J[1]]] : out;
  out.push([J[0], J[1]]);
  for (let k = 2; k < J.length; k++) { out.push([J[0], J[k]]); out.push([J[1], J[k]]); }
  return out;
}
function rigidPairs(L) { return isCyl(L) ? [] : linkPairs(L); }
function designMap(model) { const m = {}; for (const j of model.joints) m[j.id] = { x: j.x, y: j.y }; return m; }
function motorRef(model, mo) {
  const L = model.links.find(l => l.id === mo.link); if (!L) return null;
  return L.joints.find(id => id !== mo.joint) || null;
}
// hệ trục cục bộ của khâu: gốc tại khớp đầu, trục u hướng tới khớp thứ hai
function frameOf(L, pos) {
  const A = pos[L.joints[0]], B = pos[L.joints[1]]; if (!A || !B) return null;
  const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1;
  return { ox: A.x, oy: A.y, ex: dx / d, ey: dy / d };
}
const toWorld = (f, p) => ({ x: f.ox + p.u * f.ex - p.v * f.ey, y: f.oy + p.u * f.ey + p.v * f.ex });
const toLocal = (f, p) => { const x = p.x - f.ox, y = p.y - f.oy; return { u: x * f.ex + y * f.ey, v: -x * f.ey + y * f.ex }; };
// ===== Motor gắn trên mate (mo.mate): tịnh tiến theo mate Trượt, xoay theo mate Xoay =====
// mate trượt: vị trí khớp đo dọc cạnh từ đầu cạnh, hành trình min…max theo biên dạng (1 − cos)/2 giống xi lanh
// mate xoay: góc tương đối θA − θB = phase + ratio·θ (quay liên tục)
function mateEdge(model, m) {
  const B = m.b && model.links.find(l => l.id === m.b);
  return B ? { f0: B.joints[0], f1: B.joints[1], sa: { u: m.ea.x, v: m.ea.y }, sb: { u: m.eb.x, v: m.eb.y } } : { f0: null, f1: null, wa: m.ea, wb: m.eb };
}
function slideU(c, P) { const [E0, E1] = edgeWorld(c, P), dx = E1.x - E0.x, dy = E1.y - E0.y, L = Math.hypot(dx, dy) || 1e-9, Q = P[c.a]; return ((Q.x - E0.x) * dx + (Q.y - E0.y) * dy) / L; }
const wrapPi = a => a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));
function mateMotorCon(model, mo) {
  const m = (model.mates || []).find(q => q.id === mo.mate); if (!m) return null;
  const LK = id => id ? model.links.find(l => l.id === id) : null, A = LK(m.a), B = LK(m.b);
  if (!A || A.joints.length < 2 || (m.b && (!B || B.joints.length < 2))) return null;
  const k = (mo.rev ? -1 : 1) * (mo.ratio ?? 1), pb = mo.pb || (m.type === 'sld' ? 'rec' : 'loop');
  if (m.type === 'sld' && m.joint && m.drv) return { t: 'ms', a: m.joint, ...mateEdge(model, m), min: m.drv.min, max: m.drv.max, k, pb, phase: mo.phase || 0, mate: m.id };
  if (m.type === 'rev') return { t: 'mr', A: [A.joints[0], A.joints[1]], B: B ? [B.joints[0], B.joints[1]] : null, k, pb, ang: (mo.ang ?? 90) * Math.PI / 180, base: mo.base || 0, phase: mo.phase || 0, mate: m.id };
  return null;
}
// ===== Motor tịnh tiến trên khớp (mo.lin = id khớp): đẩy khớp dọc rãnh vô hạn ngang/dọc (j.slider) hoặc đường phác thảo (j.path) =====
// vị trí: slider = hoành độ dọc trục rãnh tính từ mo.o; path = độ dài cung từ đầu đường (đường kín: vòng quanh chu vi c.per). Chạy như motor mate trượt ('ms')
function linMotorCon(model, mo) {
  const j = model.joints.find(q => q.id === mo.lin); if (!j || j.fixed || mo.min == null) return null;
  const c = { t: 'ms', a: j.id, min: mo.min, max: mo.max, k: (mo.rev ? -1 : 1) * (mo.ratio ?? 1), pb: mo.pb || 'rec', phase: mo.phase || 0, lin: j.id };
  if (j.path) { const g = pathGeom(model, j.path.ent); return g ? { ...c, g, per: pathClosed(g) ? pathLen(g) : 0 } : null; }
  if (j.slider) { const o = mo.o || { x: j.x, y: j.y }; return { ...c, f0: null, f1: null, wa: o, wb: { x: o.x + Math.cos(j.slider.ang), y: o.y + Math.sin(j.slider.ang) } }; }
  return null;
}
// vị trí hiện tại của khớp do motor tịnh tiến dẫn (mate trượt / rãnh vô hạn / đường phác thảo)
const msU = (c, P) => c.g ? pathS(c.g, P[c.a], P) : slideU(c, P);
// kiểu chạy: rec = đi–về êm (1 − cos)/2 · loop / single = đi đều từ đầu tới cuối rồi về đầu (single: dừng ở cuối, xem mmSingle*)
function mmS(c, theta) { const x = c.phase + c.k * theta; return c.pb === 'rec' ? (1 - Math.cos(x)) / 2 : x / (2 * Math.PI) - Math.floor(x / (2 * Math.PI)); }
// motor mate kiểu loop / single đi qua mốc quay vòng (nhảy từ cuối về đầu) trong bước ta→tb: cú nhảy là cố ý, không coi là lật nhánh
function mmWrap(cons, ta, tb) { const F = x => Math.floor(x / (2 * Math.PI)); return cons.some(c => (c.t === 'ms' || c.t === 'mr') && c.pb !== 'rec' && F(c.phase + c.k * ta) !== F(c.phase + c.k * tb)); }
function cylLen(c, theta) { const s = (1 - Math.cos(c.phase + c.ratio * theta)) / 2; return c.min + (c.max - c.min) * s; }

// ===== Khớp chạy theo đường phác thảo (j.path = { ent }) =====
// hình học trong tọa độ thiết kế; nét thuộc khâu (owner) thì đi theo khung khâu đó (own = 2 khớp khung, fD = khung lúc thiết kế)
function pathGeom(model, eid) {
  const sk = model.sketch; if (!sk) return null; const e = sk.ents.find(x => x.id === eid); if (!e) return null;
  const pm = new Map(sk.pts.map(p => [p.id, p])), P = id => pm.get(id); let g = null;
  if (e.type === 'line' && P(e.a) && P(e.b)) g = { type: 'line', a: { ...P(e.a) }, b: { ...P(e.b) } };
  else if (e.type === 'circle' && P(e.c)) g = { type: 'circle', c: { ...P(e.c) }, r: e.r };
  else if (e.type === 'arc' && P(e.c) && P(e.a) && P(e.b)) {
    const c = P(e.c), a = P(e.a), b = P(e.b), a0 = Math.atan2(a.y - c.y, a.x - c.x); let sw = Math.atan2(b.y - c.y, b.x - c.x) - a0; sw = ((sw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI); if (sw < 1e-9) sw = 2 * Math.PI;
    g = { type: 'arc', c: { ...c }, r: Math.hypot(a.x - c.x, a.y - c.y), a0, sw };
  } else if (e.type === 'spline' && typeof SK !== 'undefined') { const pts = SK.sample(e, pm, 4).pts.map(p => ({ x: p.x, y: p.y })); if (pts.length >= 2) g = { type: 'poly', pts, closed: !!e.closed }; }
  if (!g) return null;
  const L = e.owner && model.links.find(l => l.id === e.owner);
  if (L && L.joints.length >= 2) { g.own = [L.joints[0], L.joints[1]]; g.fD = frameOf(L, designMap(model)); }
  return g;
}
// điểm q (thế giới, tư thế P) → tọa độ thiết kế của đường; trả { d: khoảng cách có dấu tới đường, out: vượt đầu đường hở (mm), foot: chân vuông góc (thiết kế) }
function pathEval(g, q, P) {
  if (g.own) { const fN = frameOf({ joints: g.own }, P); if (fN) q = toWorld(g.fD, toLocal(fN, q)); }
  if (g.type === 'line') {
    const dx = g.b.x - g.a.x, dy = g.b.y - g.a.y, L = Math.hypot(dx, dy) || 1e-9, t = ((q.x - g.a.x) * dx + (q.y - g.a.y) * dy) / (L * L);
    return { d: ((q.y - g.a.y) * dx - (q.x - g.a.x) * dy) / L, out: Math.max(0, -t, t - 1) * L, foot: { x: g.a.x + Math.max(0, Math.min(1, t)) * dx, y: g.a.y + Math.max(0, Math.min(1, t)) * dy } };
  }
  if (g.type === 'circle' || g.type === 'arc') {
    const dx = q.x - g.c.x, dy = q.y - g.c.y, R = Math.hypot(dx, dy) || 1e-9; let out = 0, ang = Math.atan2(dy, dx);
    if (g.type === 'arc') { let u = ((ang - g.a0) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI); if (u > g.sw) { const over = u - g.sw, under = 2 * Math.PI - u; out = Math.min(over, under) * g.r; ang = over < under ? g.a0 + g.sw : g.a0; } }
    return { d: R - g.r, out, foot: { x: g.c.x + g.r * Math.cos(ang), y: g.c.y + g.r * Math.sin(ang) } };
  }
  // đa tuyến (spline): đoạn gần nhất, dấu theo phía bên trái/phải đoạn đó
  const pts = g.pts, n = pts.length, segs = g.closed ? n : n - 1; let best = null;
  for (let i = 0; i < segs; i++) {
    const a = pts[i], b = pts[(i + 1) % n], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1e-12, t = ((q.x - a.x) * dx + (q.y - a.y) * dy) / L2, tc = Math.max(0, Math.min(1, t));
    const fx = a.x + tc * dx, fy = a.y + tc * dy, dist = Math.hypot(q.x - fx, q.y - fy);
    if (!best || dist < best.dist - 1e-12) best = { dist, i, t, tc, dx, dy, a, foot: { x: fx, y: fy } };
  }
  const L = Math.sqrt(best.dx * best.dx + best.dy * best.dy) || 1e-9, sgn = ((q.y - best.a.y) * best.dx - (q.x - best.a.x) * best.dy) >= 0 ? 1 : -1;
  let out = 0; if (!g.closed) { if (best.i === 0 && best.t < 0) out = -best.t * L; if (best.i === segs - 1 && best.t > 1) out = (best.t - 1) * L; }
  return { d: sgn * best.dist, out, foot: best.foot };
}
// độ dài đường / đường kín / vị trí dọc đường (độ dài cung từ đầu đường, thiết kế) — dùng cho motor tịnh tiến trên khớp
const pathClosed = g => g.type === 'circle' || (g.type === 'poly' && g.closed);
function pathCum(g) {
  if (g.cum) return g.cum; const p = g.pts, n = p.length, segs = g.closed ? n : n - 1, cum = [0];
  for (let i = 0; i < segs; i++) { const a = p[i], b = p[(i + 1) % n]; cum.push(cum[i] + Math.hypot(b.x - a.x, b.y - a.y)); }
  return (g.cum = cum);
}
function pathLen(g) {
  if (g.type === 'line') return Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y);
  if (g.type === 'circle') return 2 * Math.PI * g.r;
  if (g.type === 'arc') return g.sw * g.r;
  const c = pathCum(g); return c[c.length - 1];
}
function pathS(g, q, P) {
  if (g.own) { const fN = frameOf({ joints: g.own }, P); if (fN) q = toWorld(g.fD, toLocal(fN, q)); }
  if (g.type === 'line') { const dx = g.b.x - g.a.x, dy = g.b.y - g.a.y, L = Math.hypot(dx, dy) || 1e-9; return ((q.x - g.a.x) * dx + (q.y - g.a.y) * dy) / L; }
  if (g.type === 'circle' || g.type === 'arc') {
    const a0 = g.type === 'arc' ? g.a0 : 0; let u = ((Math.atan2(q.y - g.c.y, q.x - g.c.x) - a0) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    if (g.type === 'arc' && u > g.sw + (2 * Math.PI - g.sw) / 2) u -= 2 * Math.PI; // ngoài cung, gần đầu cung hơn → âm
    return u * g.r;
  }
  const p = g.pts, n = p.length, segs = g.closed ? n : n - 1, cum = pathCum(g); let best = null;
  for (let i = 0; i < segs; i++) {
    const a = p[i], b = p[(i + 1) % n], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1e-12, t = ((q.x - a.x) * dx + (q.y - a.y) * dy) / L2, tc = Math.max(0, Math.min(1, t));
    const dist = Math.hypot(q.x - a.x - tc * dx, q.y - a.y - tc * dy);
    if (!best || dist < best.dist - 1e-12) best = { dist, i, t: (!g.closed && ((i === 0 && t < 0) || (i === segs - 1 && t > 1))) ? t : tc, L: Math.sqrt(L2) };
  }
  return cum[best.i] + best.t * best.L;
}
// điểm (thiết kế) tại vị trí s dọc đường — vẽ hành trình motor
function pathAt(g, s) {
  if (pathClosed(g)) { const L = pathLen(g); s = ((s % L) + L) % L; }
  if (g.type === 'line') { const L = pathLen(g) || 1e-9; return { x: g.a.x + (g.b.x - g.a.x) * s / L, y: g.a.y + (g.b.y - g.a.y) * s / L }; }
  if (g.type === 'circle' || g.type === 'arc') { const a = (g.type === 'arc' ? g.a0 : 0) + s / g.r; return { x: g.c.x + g.r * Math.cos(a), y: g.c.y + g.r * Math.sin(a) }; }
  const p = g.pts, n = p.length, cum = pathCum(g); let i = 0; while (i < cum.length - 2 && cum[i + 1] < s) i++;
  const a = p[i], b = p[(i + 1) % n], t = (s - cum[i]) / ((cum[i + 1] - cum[i]) || 1e-9); return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
function compile(model, opts = {}) {
  const D = designMap(model), cons = [];
  const fixed = new Set(model.joints.filter(j => j.fixed).map(j => j.id));
  for (const L of model.links) {
    if (L.kind === 'body' && L.joints.length >= 3) {
      // part ≥ 3 khớp: khớp thứ k gắn cứng theo tọa độ trong khung (j0, j1) — ràng buộc khoảng cách không phân biệt được ảnh gương,
      // mà khớp khung ẩn nằm gần đường tâm part nên tam giác (j0, j1, chốt) rất dẹt → bộ giải lật gương, chốt nhảy sang phía kia (lệch 2× chiều cao)
      const [a, b] = L.joints, fD = frameOf(L, D);
      if (!(fixed.has(a) && fixed.has(b))) cons.push({ t: 'd', a, b, L: Math.hypot(D[b].x - D[a].x, D[b].y - D[a].y), link: L.id });
      for (const k of L.joints.slice(2)) if (!(fixed.has(a) && fixed.has(b) && fixed.has(k))) cons.push({ t: 'rl', a: k, f0: a, f1: b, sa: toLocal(fD, D[k]), link: L.id });
      continue;
    }
    for (const [a, b] of rigidPairs(L)) {
      if (fixed.has(a) && fixed.has(b)) continue;
      cons.push({ t: 'd', a, b, L: Math.hypot(D[b].x - D[a].x, D[b].y - D[a].y), link: L.id });
    }
  }
  const slots = model.slots || [];
  for (const j of model.joints) {
    if (j.fixed) continue;
    if (j.path) { const g = pathGeom(model, j.path.ent); if (g) cons.push({ t: 'pc', a: j.id, g, path: j.path.ent }); continue; }
    if (j.slider) cons.push({ t: 's', a: j.id, ox: j.x, oy: j.y, ang: j.slider.ang });
    const sl = j.slot && slots.find(s => s.id === j.slot);
    if (sl && sl.ent) { const g = pathGeom(model, sl.ent); if (g && !(g.own && model.links.some(L => L.id === sl.link && L.joints.includes(j.id)))) cons.push({ t: 'pc', a: j.id, g, path: sl.ent, slot: sl.id }); }
    else if (sl && !sl.link) cons.push({ t: 's', a: j.id, ox: sl.a.x, oy: sl.a.y, ang: Math.atan2(sl.b.y - sl.a.y, sl.b.x - sl.a.x), slot: sl.id });
    else if (sl) { const L = model.links.find(l => l.id === sl.link); if (L && L.joints.length >= 2 && !L.joints.includes(j.id)) cons.push({ t: 'ls', a: j.id, f0: L.joints[0], f1: L.joints[1], sa: { u: sl.a.x, v: sl.a.y }, sb: { u: sl.b.x, v: sl.b.y }, slot: sl.id }); }
  }
  for (const mo of model.motors || []) {
    if (mo.mate || mo.lin) { const c = mo.mate ? mateMotorCon(model, mo) : linMotorCon(model, mo); if (c) cons.push(c); continue; }
    if (mo.cyl) {
      const L = model.links.find(l => l.id === mo.cyl);
      if (L && L.cyl) cons.push({ t: 'cd', a: L.joints[0], b: L.joints[1], min: L.cyl.min, max: L.cyl.max, ratio: mo.ratio ?? 1, phase: mo.phase || 0 });
      continue;
    }
    const k = motorRef(model, mo);
    if (k && fixed.has(mo.joint) && !fixed.has(k)) cons.push({ t: 'm', g: mo.joint, k, phase: mo.phase, ratio: mo.ratio ?? 1 });
  }
  if (opts.measures) for (const m of model.measures || []) {
    if (m.kind === 'dist' && m.fixed && m.p[0].j && m.p[1].j) cons.push({ t: 'd', a: m.p[0].j, b: m.p[1].j, L: m.val, measure: m.id });
  }
  cons.push(...mateCons(model));
  return cons;
}
// ===== Mate giữa các khối (có tác dụng khi chạy motor) =====
// pa: góc tương đối θA − s·θB = c · tl: tâm (khớp) cách cạnh một khoảng r · ls/s: điểm trên cạnh
function mateCons(model) {
  const out = [], LK = id => id ? model.links.find(l => l.id === id) : null, fr = L => L ? [L.joints[0], L.joints[1]] : null;
  for (const m of model.mates || []) {
    const A = LK(m.a), B = LK(m.b); if ((m.a && !A) || (m.b && !B)) continue;
    const edge = () => B ? { f0: B.joints[0], f1: B.joints[1], sa: { u: m.ea.x, v: m.ea.y }, sb: { u: m.eb.x, v: m.eb.y } } : { f0: null, f1: null, wa: m.ea, wb: m.eb };
    if ((m.type === 'sld' || m.type === 'cnt') && m.joint) {
      if (B) out.push({ t: 'ls', a: m.joint, ...edge(), mate: m.id });
      else out.push({ t: 's', a: m.joint, ox: m.ea.x, oy: m.ea.y, ang: Math.atan2(m.eb.y - m.ea.y, m.eb.x - m.ea.x), mate: m.id });
    }
    if (m.type === 'sld' || m.type === 'par') out.push({ t: 'pa', A: fr(A), B: fr(B), s: 1, c: m.c, mate: m.id });
    if (m.type === 'eq') out.push({ t: 'pa', A: fr(A), B: fr(B), s: m.s || -1, c: m.c, mate: m.id });
    if (m.type === 'tan' && m.joint) {
      if (m.k) out.push({ t: 'd', a: m.joint, b: m.k, L: m.L, mate: m.id });
      else out.push({ t: 'tl', a: m.joint, ...edge(), r: m.r, side: m.side || 1, mate: m.id });
    }
  }
  return out;
}
function mateCount(m) { return { sld: 2, cnt: 1, par: 1, eq: 1, tan: 1 }[m.type] || 0; }
function frameAng(P, f) { if (!f) return 0; const a = P[f[0]], b = P[f[1]]; return Math.atan2(b.y - a.y, b.x - a.x); }
function edgeWorld(c, P) {
  if (!c.f0) return [c.wa, c.wb];
  const f = frameOf({ joints: [c.f0, c.f1] }, P); return [toWorld(f, c.sa), toWorld(f, c.sb)];
}

function dof(model) {
  const fixed = new Set(model.joints.filter(j => j.fixed).map(j => j.id));
  const used = new Set(); model.links.forEach(L => L.joints.forEach(id => used.add(id)));
  let F = 0; for (const id of used) if (!fixed.has(id)) F++;
  let C = 0;
  for (const L of model.links) for (const [a, b] of rigidPairs(L)) if (!(fixed.has(a) && fixed.has(b))) C++;
  for (const j of model.joints) if (!j.fixed && used.has(j.id)) { if (j.path) { C++; continue; } if (j.slider) C++; if (j.slot && (model.slots || []).some(s => s.id === j.slot)) C++; }
  for (const m of model.mates || []) C += mateCount(m);
  return 2 * F - C;
}

function linsolve(A, b) {
  const n = b.length;
  for (let c = 0; c < n; c++) {
    let p = c, mx = Math.abs(A[c][c]);
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > mx) { mx = Math.abs(A[r][c]); p = r; }
    if (mx < 1e-14) return null;
    if (p !== c) { [A[p], A[c]] = [A[c], A[p]]; [b[p], b[c]] = [b[c], b[p]]; }
    for (let r = c + 1; r < n; r++) { const f = A[r][c] / A[c][c]; if (!f) continue; for (let k = c; k < n; k++) A[r][k] -= f * A[c][k]; b[r] -= f * b[c]; }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let s = b[r]; for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k]; x[r] = s / A[r][r]; }
  return x;
}

// phần dư của khớp trong rãnh trên khâu (tính số)
function lsResidual(c, P) {
  const f = frameOf({ joints: [c.f0, c.f1] }, P);
  const A = toWorld(f, c.sa), B = toWorld(f, c.sb);
  const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1;
  return ((P[c.a].x - A.x) * dy - (P[c.a].y - A.y) * dx) / d;
}

function solveLM(cons, start, opts) {
  const vars = opts.vars, n = vars.length * 2, idx = {};
  vars.forEach((id, i) => idx[id] = i * 2);
  const P = {}; for (const k in start) P[k] = { x: start[k].x, y: start[k].y };
  if (!n) return { pos: P, ok: true, hard: 0 };
  const hw = opts.hardW ?? 1, theta = opts.theta ?? 0, useMotors = opts.motors !== false, soft = opts.soft || [];
  function build() {
    const rows = []; let hard = 0;
    const row = (r, w, g) => rows.push({ r: r * w, g: g.map(([i, v]) => [i, v * w]) });
    for (const c of cons) {
      if (c.t === 'd' && c.L < 1e-6) {
        const A = P[c.a], B = P[c.b]; hard = Math.max(hard, Math.abs(B.x - A.x), Math.abs(B.y - A.y));
        const gx = [], gy = []; if (c.a in idx) { gx.push([idx[c.a], -1]); gy.push([idx[c.a] + 1, -1]); } if (c.b in idx) { gx.push([idx[c.b], 1]); gy.push([idx[c.b] + 1, 1]); }
        if (gx.length) { row(B.x - A.x, hw, gx); row(B.y - A.y, hw, gy); }
      } else if (c.t === 'd' || (c.t === 'cd' && useMotors)) {
        const A = P[c.a], B = P[c.b]; const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1e-9;
        const r = d - (c.t === 'd' ? c.L : cylLen(c, theta)); hard = Math.max(hard, Math.abs(r));
        const g = [], ux = dx / d, uy = dy / d;
        if (c.a in idx) g.push([idx[c.a], -ux], [idx[c.a] + 1, -uy]);
        if (c.b in idx) g.push([idx[c.b], ux], [idx[c.b] + 1, uy]);
        if (g.length) row(r, hw, g);
      } else if (c.t === 's') {
        const A = P[c.a], ux = Math.cos(c.ang), uy = Math.sin(c.ang);
        const r = (A.x - c.ox) * uy - (A.y - c.oy) * ux; hard = Math.max(hard, Math.abs(r));
        if (c.a in idx) row(r, hw, [[idx[c.a], uy], [idx[c.a] + 1, -ux]]);
      } else if (c.t === 'rl') { // khớp gắn cứng trong khung (f0, f1) của part: 2 phần dư x, y (đạo hàm số)
        const fn = () => { const w = toWorld(frameOf({ joints: [c.f0, c.f1] }, P), c.sa); return [P[c.a].x - w.x, P[c.a].y - w.y]; }, r = fn(), h = 1e-6;
        hard = Math.max(hard, Math.abs(r[0]), Math.abs(r[1]));
        const gx = [], gy = [];
        for (const id of [c.a, c.f0, c.f1]) if (id in idx) for (const ax of ['x', 'y']) { const o = P[id][ax]; P[id][ax] = o + h; const r1 = fn(); P[id][ax] = o; const col = idx[id] + (ax === 'y' ? 1 : 0); gx.push([col, (r1[0] - r[0]) / h]); gy.push([col, (r1[1] - r[1]) / h]); }
        if (gx.length) { row(r[0], hw, gx); row(r[1], hw, gy); }
      } else if (c.t === 'ls') {
        const r = lsResidual(c, P); hard = Math.max(hard, Math.abs(r));
        const g = [], h = 1e-6;
        for (const id of [c.a, c.f0, c.f1]) if (id in idx) for (const ax of ['x', 'y']) {
          const o = P[id][ax]; P[id][ax] = o + h; const r1 = lsResidual(c, P); P[id][ax] = o;
          g.push([idx[id] + (ax === 'y' ? 1 : 0), (r1 - r) / h]);
        }
        if (g.length) row(r, hw, g);
      } else if (c.t === 'pa' || c.t === 'tl') {
        const fn = c.t === 'pa'
          ? (() => Math.sin(frameAng(P, c.A) - c.s * frameAng(P, c.B) - c.c))
          : (() => { const [E0, E1] = edgeWorld(c, P), dx = E1.x - E0.x, dy = E1.y - E0.y, Q = P[c.a]; return c.side * ((Q.x - E0.x) * dy - (Q.y - E0.y) * dx) / (Math.hypot(dx, dy) || 1e-9) - c.r; });
        const r = fn(); hard = Math.max(hard, Math.abs(r));
        const ids = c.t === 'pa' ? [...(c.A || []), ...(c.B || [])] : [c.a, c.f0, c.f1].filter(Boolean);
        const g = [], h = 1e-6;
        for (const id of new Set(ids)) if (id in idx) for (const ax of ['x', 'y']) { const o = P[id][ax]; P[id][ax] = o + h; const r1 = fn(); P[id][ax] = o; g.push([idx[id] + (ax === 'y' ? 1 : 0), (r1 - r) / h]); }
        if (g.length) row(r, hw, g);
      } else if (c.t === 'pc') { // khớp nằm trên đường phác thảo: khoảng cách có dấu = 0 (đạo hàm số; nét thuộc khâu thì theo cả khung khâu)
        const fn = () => pathEval(c.g, P[c.a], P).d, r = fn(); hard = Math.max(hard, Math.abs(r));
        const g = [], h = 1e-6;
        for (const id of [c.a, ...(c.g.own || [])]) if (id in idx) for (const ax of ['x', 'y']) { const o = P[id][ax]; P[id][ax] = o + h; const r1 = fn(); P[id][ax] = o; g.push([idx[id] + (ax === 'y' ? 1 : 0), (r1 - r) / h]); }
        if (g.length) row(r, hw, g);
      } else if (c.t === 'ct') { // tiếp xúc một chiều: c.rows(P, null, true) → { act, r, g } (r > 0 = lấn vào nhau, g = gradient giải tích)
        const o = c.rows(P, null, true); if (!o.r.length) continue;
        let mx = 0; for (const v of o.r) mx = Math.max(mx, v); hard = Math.max(hard, mx - 0.1); // cho phép lấn ≤ 0.1 mm ≈ ½ ô lưới SDF
        o.r.forEach((r, i) => { const g = []; for (const [id, ax, v] of o.g[i]) if (id in idx && v) g.push([idx[id] + ax, v]); if (g.length) row(r, hw, g); });
      } else if ((c.t === 'ms' || c.t === 'mr') && useMotors) { // motor trên mate trượt / xoay
        const s = mmS(c, theta), tg = c.t === 'ms' ? c.min + (c.max - c.min) * s : c.pb === 'loop' ? c.phase + c.k * theta : c.base + c.ang * s;
        const fn = c.t === 'ms' ? (c.per ? () => { const r = msU(c, P) - tg; return r - c.per * Math.round(r / c.per); } : () => msU(c, P) - tg) : () => wrapPi(frameAng(P, c.A) - frameAng(P, c.B) - tg);
        const r = fn(); hard = Math.max(hard, Math.abs(r));
        const ids = c.t === 'ms' ? [c.a, c.f0, c.f1, ...((c.g && c.g.own) || [])].filter(Boolean) : [...c.A, ...(c.B || [])], g = [], h = 1e-6;
        for (const id of new Set(ids)) if (id in idx) for (const ax of ['x', 'y']) { const o = P[id][ax]; P[id][ax] = o + h; const r1 = fn(); P[id][ax] = o; g.push([idx[id] + (ax === 'y' ? 1 : 0), (r1 - r) / h]); }
        if (g.length) row(r, hw, g);
      } else if (c.t === 'm' && useMotors) {
        const G = P[c.g], K = P[c.k], a = c.phase + c.ratio * theta, s = Math.sin(a), co = Math.cos(a);
        const r = (K.x - G.x) * s - (K.y - G.y) * co; hard = Math.max(hard, Math.abs(r));
        const g = [];
        if (c.k in idx) g.push([idx[c.k], s], [idx[c.k] + 1, -co]);
        if (c.g in idx) g.push([idx[c.g], -s], [idx[c.g] + 1, co]);
        if (g.length) row(r, hw, g);
      }
    }
    for (const s of soft) {
      if (s.fr) { // điểm gắn trong hệ khâu (vd. trọng tâm part) kéo về độ cao s.y
        const fy = () => toWorld(frameOf({ joints: s.fr }, P), s.loc).y, r = fy() - s.y, g = [], h = 1e-6;
        for (const id of s.fr) if (id in idx) for (const ax of ['x', 'y']) { const o = P[id][ax]; P[id][ax] = o + h; const r1 = fy() - s.y; P[id][ax] = o; g.push([idx[id] + (ax === 'y' ? 1 : 0), (r1 - r) / h]); }
        if (g.length) row(r, s.w, g);
      } else if (s.id in idx) { const p = P[s.id]; row(p.x - s.x, s.w, [[idx[s.id], 1]]); row(p.y - s.y, s.w, [[idx[s.id] + 1, 1]]); }
    }
    return { rows, hard };
  }
  if (opts.jacOnly) return build().rows; // chỉ lấy Jacobian ràng buộc (rà soát bậc tự do, freedof.js)
  const cost = rows => rows.reduce((s, r) => s + r.r * r.r, 0);
  let lam = 1e-6, cur = build(), c0 = cost(cur.rows);
  for (let it = 0; it < (opts.maxIter || 60); it++) {
    if (cur.hard < 1e-9 && !soft.length) break;
    const JtJ = Array.from({ length: n }, () => new Array(n).fill(0)), Jtr = new Array(n).fill(0);
    for (const { r, g } of cur.rows) for (const [i, vi] of g) { Jtr[i] += vi * r; for (const [k, vk] of g) JtJ[i][k] += vi * vk; }
    let improved = false;
    for (let tries = 0; tries < 8; tries++) {
      const A = JtJ.map((rw, i) => rw.map((v, k) => i === k ? v + lam * (v + 1e-9) + 1e-12 : v));
      const dx = linsolve(A, Jtr.map(v => -v));
      if (!dx) { lam *= 10; continue; }
      const save = vars.map(id => ({ x: P[id].x, y: P[id].y }));
      vars.forEach((id, i) => { P[id].x += dx[2 * i]; P[id].y += dx[2 * i + 1]; });
      const nb = build(), nc = cost(nb.rows);
      if (nc <= c0) { cur = nb; const rel = c0 - nc; lam = Math.max(1e-12, lam / 5); improved = true; if (rel < 1e-18 || (cur.hard < 1e-9 && rel < 1e-12) || (cur.hard < (opts.tol ?? 1e-5) * .1 && rel < 1e-4 * c0) || (opts.relStop && rel < opts.relStop * c0)) it = 1e9; c0 = nc; break; }
      vars.forEach((id, i) => { P[id].x = save[i].x; P[id].y = save[i].y; });
      lam *= 8;
    }
    if (!improved) break;
  }
  let ok = cur.hard < (opts.tol ?? 1e-5);
  if (ok && useMotors) for (const c of cons) if (c.t === 'm') {
    const a = c.phase + c.ratio * theta;
    if ((P[c.k].x - P[c.g].x) * Math.cos(a) + (P[c.k].y - P[c.g].y) * Math.sin(a) < 0) ok = false;
  }
  return { pos: P, ok, hard: cur.hard };
}

function movingVars(model) {
  const used = new Set(); model.links.forEach(L => L.joints.forEach(id => used.add(id)));
  return model.joints.filter(j => !j.fixed && used.has(j.id)).map(j => j.id);
}

// Giới hạn vật lý: đầu rãnh, hành trình xi lanh. Trả về mô tả vi phạm hoặc null
function violation(model, pos) {
  const tol = 0.05;
  for (const j of model.joints) {
    if (!j.slot || j.fixed) continue;
    const sl = (model.slots || []).find(s => s.id === j.slot); if (!sl) continue;
    if (sl.ent) { const g = pathGeom(model, sl.ent); if (g && g.type !== 'circle' && !g.closed && pos[j.id] && pathEval(g, pos[j.id], pos).out > tol) return { kind: 'slot', id: sl.id, joint: j.id }; continue; } // đầu rãnh cong
    let A, B;
    if (!sl.link) { A = sl.a; B = sl.b; }
    else { const L = model.links.find(l => l.id === sl.link); if (!L) continue; const f = frameOf(L, pos); if (!f) continue; A = toWorld(f, { u: sl.a.x, v: sl.a.y }); B = toWorld(f, { u: sl.b.x, v: sl.b.y }); }
    const dx = B.x - A.x, dy = B.y - A.y, l2 = dx * dx + dy * dy || 1;
    const t = ((pos[j.id].x - A.x) * dx + (pos[j.id].y - A.y) * dy) / l2, len = Math.sqrt(l2);
    if (t * len < -tol || (t - 1) * len > tol) return { kind: 'slot', id: sl.id, joint: j.id };
  }
  for (const j of model.joints) { // khớp chạy theo đường hở: vượt đầu đường = chạm điểm chặn
    if (!j.path || j.fixed || !pos[j.id]) continue; const g = pathGeom(model, j.path.ent); if (!g || g.type === 'circle' || g.closed) continue;
    if (pathEval(g, pos[j.id], pos).out > tol) return { kind: 'path', joint: j.id };
  }
  for (const m of model.mates || []) if (m.type === 'cnt' && m.joint && pos[m.joint]) {
    const B = m.b && model.links.find(l => l.id === m.b); let A0 = m.ea, B0 = m.eb;
    if (B) { const f = frameOf(B, pos); if (!f) continue; A0 = toWorld(f, { u: m.ea.x, v: m.ea.y }); B0 = toWorld(f, { u: m.eb.x, v: m.eb.y }); }
    const dx = B0.x - A0.x, dy = B0.y - A0.y, l2 = dx * dx + dy * dy || 1, t = ((pos[m.joint].x - A0.x) * dx + (pos[m.joint].y - A0.y) * dy) / l2, len = Math.sqrt(l2);
    if (t * len < -tol || (t - 1) * len > tol) return { kind: 'mate', id: m.id };
  }
  for (const L of model.links) if (isCyl(L) && L.cyl) {
    const A = pos[L.joints[0]], B = pos[L.joints[1]]; if (!A || !B) continue;
    const d = Math.hypot(B.x - A.x, B.y - A.y);
    if (d < L.cyl.min - tol || d > L.cyl.max + tol) return { kind: 'cyl', id: L.id };
  }
  return null;
}

function stepTo(model, cons, pos, th0, th1, maxStep = 1 * D2R) {
  const vars = movingVars(model);
  const n = Math.max(1, Math.ceil(Math.abs(th1 - th0) / maxStep));
  let P = pos; const span = sizeOf(pos), contact = cons.some(c => c.t === 'ct');
  // một bước con; có tiếp xúc (ràng buộc một chiều) thì LM dễ dừng sớm → chia đôi bước, tối đa 4 lần
  const sub = (Q, ta, tb, depth) => {
    const soft = vars.map(id => ({ id, x: Q[id].x, y: Q[id].y, w: 1e-4 }));
    // trọng lực / lò xo chỉ là “mong muốn”: nếu kéo part vào thế không giải được (vd. góc nhọn tì vào chỗ bo), thử lại với lực ¼ rồi bỏ lực ở bước con này
    for (const k of [1, 0.25, 0]) {
      const ph = k ? physSoft(model, Q, k) : [];
      if (!ph.length && k !== 1 && k !== 0) continue;
      // pha 1 (có lực mềm) chỉ cần gần đúng: dừng khi chi phí giảm < 0.1%/vòng — nếu không LM luôn chạy hết maxIter vì lực mềm làm căng ràng buộc cứng
      let r = solveLM(cons, Q, { vars, theta: tb, soft: soft.concat(ph), tol: 1e-4, ...(ph.length ? { relStop: 1e-3, maxIter: 25 } : {}) });
      // có lực mềm: chúng làm căng ràng buộc cứng một chút → giải lại chỉ với ràng buộc cứng quanh kết quả
      if (ph.length && r.hard < 0.5) for (let n = 0; n < 3 && (n === 0 || (!r.ok && r.hard < 0.01)); n++) r = solveLM(cons, r.pos, { vars, theta: tb, soft: vars.map(id => ({ id, x: r.pos[id].x, y: r.pos[id].y, w: 1e-4 })), tol: 1e-4 });
      // gần hội tụ nhưng LM chững lại (vd. góc nhọn trượt qua mũi nêm): đánh bóng thêm với neo mềm yếu hơn trước khi coi là hỏng
      if (!r.ok && r.hard < 5e-3) { const r2 = solveLM(cons, r.pos, { vars, theta: tb, soft: vars.map(id => ({ id, x: r.pos[id].x, y: r.pos[id].y, w: 1e-6 })), tol: 1e-4, maxIter: 120 }); if (r2.ok) r = r2; }
      const good = r.ok && (mmWrap(cons, ta, tb) || !vars.some(id => Math.hypot(r.pos[id].x - Q[id].x, r.pos[id].y - Q[id].y) > span * 0.25)) && !violation(model, r.pos);
      if (good) return typeof frictionJam === 'function' && frictionJam(model, Q, r.pos, tb) ? null : r.pos; // tự hãm do ma sát = kẹt thật
      if (!ph.length) break; // không có lực mềm mà vẫn hỏng → hỏng thật, chia nhỏ bước
    }
    if (contact && depth >= 4 && typeof contactNudges === 'function') { // bước con nhỏ nhất vẫn hỏng: LM có thể đứng ở cực tiểu cục bộ (góc tì lên mặt sát mũi nêm, gradient ≈ 0)
      for (const X of contactNudges(model, Q)) { // → khởi động lại từ tư thế part tiếp xúc được đẩy nhẹ (xoay quanh chốt / trượt theo rãnh)
        const r = solveLM(cons, X, { vars, theta: tb, soft: vars.map(id => ({ id, x: X[id].x, y: X[id].y, w: 1e-4 })), tol: 1e-4 });
        if (r.ok && !vars.some(id => Math.hypot(r.pos[id].x - Q[id].x, r.pos[id].y - Q[id].y) > span * 0.25) && !violation(model, r.pos)) return frictionJam(model, Q, r.pos, tb) ? null : r.pos;
      }
    }
    if (!contact || depth >= 4) return null;
    if (typeof S !== 'undefined' && S.jamInfo && S.jamInfo.th === tb * R2D) return null; // đã kẹt do ma sát → không chia nhỏ
    const tm = (ta + tb) / 2, M = sub(Q, ta, tm, depth + 1);
    return M && sub(M, tm, tb, depth + 1);
  };
  for (let i = 1; i <= n; i++) {
    P = sub(P, th0 + (th1 - th0) * (i - 1) / n, th0 + (th1 - th0) * i / n, 0);
    if (!P) return null;
  }
  return P;
}
// ===== Trọng lực & lò xo hồi vị cho part (gần tĩnh: mỗi bước con kéo part một đoạn ≤ PHYS_STEP về phía cân bằng) =====
// L.grav: trọng tâm L._cm (hệ cục bộ) bị kéo xuống (−y) · L.spr: 2 khớp khung kéo về L.rest; có cả trọng lực thì võng m·g/k
const PHYS_STEP = 0.75, PHYS_W = 0.02; // độ căng do lực mềm được stepTo khử bằng lần giải thứ hai
function physSoft(model, P, k = 1) { // k: hệ số thu nhỏ bước kéo
  if (model.phys === false) return [];
  const out = [];
  for (const L of model.links) {
    if (L.kind !== 'body' || !(L.grav || L.spr) || L.joints.length < 2) continue;
    const fr = [L.joints[0], L.joints[1]];
    if (L.spr && L.rest) {
      const sag = L.grav ? (L.mass ?? 20) * 0.00981 / Math.max(1e-3, L.k ?? 0.5) : 0;
      fr.forEach((id, i) => {
        const p = P[id], dx = L.rest[i].x - p.x, dy = L.rest[i].y - sag - p.y, d = Math.hypot(dx, dy), s = d > PHYS_STEP * k ? PHYS_STEP * k / d : 1;
        out.push({ id, x: p.x + dx * s, y: p.y + dy * s, w: PHYS_W });
      });
    } else if (L.grav) {
      const loc = L._cm || { u: 0, v: 0 }, w = toWorld(frameOf({ joints: fr }, P), loc);
      out.push({ fr, loc, y: w.y - PHYS_STEP * k, w: PHYS_W });
    }
  }
  return out;
}
const hasPhysParts = model => model.phys !== false && model.links.some(L => L.kind === 'body' && (L.grav || L.spr));
function sizeOf(pos) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const k in pos) { const p = pos[k]; x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  return Math.max(10, x1 - x0, y1 - y0);
}

function analyzeMech(model, cons, pos, theta) {
  const out = { dof: dof(model), motors: (model.motors || []).length, full: false, range: null, traces: {}, minTA: null, minTAJoint: null, sweep: [] };
  const tracers = model.joints.filter(j => j.trace).map(j => j.id);
  if (!out.motors || !model.links.length) return out;
  const st = 2 * D2R, fwd = [], back = [], ms = hasPhysParts(model) ? 2 * D2R : undefined; // vật lý: bước con 2° (stepTo tự chia nhỏ khi cần)
  let P = pos, th = theta;
  const fstep = (Q, a, b) => stepTo(model, cons, Q, a, b, ms) || (typeof stepForced === 'function' ? stepForced(model, cons, Q, a, b, ms) : null); // motor lực vô hạn: ép xuyên part có vật liệu
  for (let i = 0; i < 180; i++) { const r = fstep(P, th, th + st); if (!r) break; P = r; th += st; fwd.push({ th, pos: P }); }
  out.full = fwd.length === 180;
  if (!out.full) {
    P = pos; th = theta;
    for (let i = 0; i < 180; i++) { const r = fstep(P, th, th - st); if (!r) break; P = r; th -= st; back.push({ th, pos: P }); }
    out.range = [(theta - back.length * st) * R2D, (theta + fwd.length * st) * R2D];
  }
  const frames = [...back.reverse(), { th: theta, pos }, ...fwd];
  out.sweep = frames;
  for (const id of tracers) {
    const pts = frames.map(f => f.pos[id]);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    out.traces[id] = { pts, closed: out.full, w: x1 - x0, h: y1 - y0 };
  }
  const fixed = new Set(model.joints.filter(j => j.fixed).map(j => j.id));
  for (const j of model.joints) {
    if (fixed.has(j.id)) continue;
    const ls = model.links.filter(L => L.joints.includes(j.id) && !isCyl(L));
    if (ls.length !== 2) continue;
    if (ls.some(L => (model.motors || []).some(m => m.link === L.id))) continue;
    const other = L => L.joints.find(x => x !== j.id && !model.joints.find(q => q.id === x).trace) || L.joints.find(x => x !== j.id);
    const o1 = other(ls[0]), o2 = other(ls[1]);
    for (const f of frames) {
      const P0 = f.pos[j.id], A = f.pos[o1], B = f.pos[o2];
      const ax = A.x - P0.x, ay = A.y - P0.y, bx = B.x - P0.x, by = B.y - P0.y;
      let mu = Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / ((Math.hypot(ax, ay) * Math.hypot(bx, by)) || 1)))) * R2D;
      mu = Math.min(mu, 180 - mu);
      if (out.minTA == null || mu < out.minTA) { out.minTA = mu; out.minTAJoint = j.id; }
    }
  }
  return out;
}

function convertLegacy(om) {
  const pos = solveAll(om, 0); if (!pos) throw new Error('legacy model does not assemble');
  const joints = om.joints.map(j => ({
    id: j.id, name: j.name, x: pos[j.id].x, y: pos[j.id].y, fixed: j.type === 'ground',
    slider: j.type === 'slider' ? { ang: j.ang } : null, trace: !!j.trace,
    lock: j.type === 'ground' && j.lock && j.lock.pos ? { pos: 1 } : {},
  }));
  const links = [], motors = [];
  const add = (js, locked) => { const L = { id: 'L' + (links.length + 1), name: 'L' + (links.length + 1), joints: js, lock: locked ? { len: 1 } : {}, w: 6 }; links.push(L); return L; };
  for (const j of om.joints) {
    const lk = j.lock || {};
    if (j.type === 'crank') {
      const L = add([j.p[0], j.id], lk.r); const G = pos[j.p[0]], K = pos[j.id];
      motors.push({ id: 'M' + (motors.length + 1), joint: j.p[0], link: L.id, ratio: j.ratio || 1, phase: Math.atan2(K.y - G.y, K.x - G.x) });
    } else if (j.type === 'dyad') { add([j.p[0], j.id], lk.l1); add([j.p[1], j.id], lk.l2); }
    else if (j.type === 'slider') add([j.p[0], j.id], lk.l);
    else if (j.type === 'point') {
      const L = links.find(l => l.joints.includes(j.p[0]) && l.joints.includes(j.p[1]));
      if (L) L.joints.push(j.id); else add([j.p[0], j.p[1], j.id], lk.uv);
    }
  }
  return { theta0: 0, joints, links, motors, slots: [], shapes: [], measures: [] };
}

if (typeof module !== 'undefined') module.exports = { physSoft, compile, dof, solveLM, stepTo, analyzeMech, convertLegacy, designMap, linkPairs, movingVars, frameOf, toWorld, toLocal, violation };
