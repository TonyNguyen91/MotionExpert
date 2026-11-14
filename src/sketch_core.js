// ===== Phác thảo (sketch) kiểu Onshape: thực thể, ràng buộc, bộ giải, biên dạng kín =====
// sk = { pts:[{id,x,y}], ents:[...], cons:[...], dims:[...] }
// ent: line{a,b} · circle{c,r} · arc{c,a,b} (ngược kim từ a tới b) · spline{pts[],closed} · point{p}; cờ cs = dựng hình, owner = id khâu
const SK = {};
SK.newId = p => p + Math.random().toString(36).slice(2, 8);
SK.empty = () => ({ pts: [], ents: [], cons: [], dims: [] });
SK.ptMap = sk => { const m = new Map(); for (const p of sk.pts) m.set(p.id, p); return m; };
SK.entPts = e => e.type === 'line' ? [e.a, e.b] : e.type === 'circle' ? [e.c] : e.type === 'arc' ? [e.c, e.a, e.b] : e.type === 'spline' ? e.pts.slice() : e.type === 'point' ? [e.p] : [];
SK.angNorm = a => { a %= TAU; return a < 0 ? a + TAU : a; };
SK.wrap = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };

// ----- spline Catmull-Rom (đi qua các điểm) -----
// spline Catmull-Rom đều (như splineSample) → điểm điều khiển B-spline bậc 3 chính xác: mỗi đoạn p1→p2 là Bézier
// p1, p1 + (p2 − p0)/6, p2 − (p3 − p1)/6, p2 (nút trong lặp 3 lần) — dùng xuất SPLINE sang DXF / Onshape
SK.splineBezier = (P0, closed) => {
  const P = P0.filter((p, i) => !i || Math.hypot(p.x - P0[i - 1].x, p.y - P0[i - 1].y) > 1e-9); if (closed && P.length > 2 && Math.hypot(P[0].x - P[P.length - 1].x, P[0].y - P[P.length - 1].y) < 1e-9) P.pop();
  const n = P.length; if (n < 2) return P.slice();
  const get = i => closed ? P[(i + n) % n] : P[Math.max(0, Math.min(n - 1, i))], segs = closed ? n : n - 1, out = [{ ...get(0) }];
  for (let i = 0; i < segs; i++) { const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    out.push({ x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 }, { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 }, { ...p2 }); }
  return out;
};
SK.splineSample = (P, closed, per = 16) => {
  const n = P.length; if (n < 2) return P.slice();
  const out = [], get = i => closed ? P[(i + n) % n] : P[Math.max(0, Math.min(n - 1, i))];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  out.push(closed ? { ...P[0] } : { ...P[n - 1] });
  return out;
};
// lấy mẫu một thực thể thành đường gấp khúc (tọa độ thiết kế)
SK.sample = (e, pm, fine = 1) => {
  const P = id => pm.get(id);
  if (e.type === 'line') return { pts: [P(e.a), P(e.b)], closed: false };
  if (e.type === 'circle') { const c = P(e.c), n = Math.round(96 * fine), o = []; for (let i = 0; i <= n; i++) { const a = i / n * TAU; o.push({ x: c.x + e.r * Math.cos(a), y: c.y + e.r * Math.sin(a) }); } return { pts: o, closed: true }; }
  if (e.type === 'arc') {
    const c = P(e.c), a = P(e.a), b = P(e.b), r = Math.hypot(a.x - c.x, a.y - c.y);
    const a0 = Math.atan2(a.y - c.y, a.x - c.x); let sw = SK.angNorm(Math.atan2(b.y - c.y, b.x - c.x) - a0); if (sw < 1e-9) sw = TAU;
    const n = Math.max(6, Math.ceil(sw / (TAU / 96) * fine)), o = [];
    for (let i = 0; i <= n; i++) { const t = a0 + sw * i / n; o.push({ x: c.x + r * Math.cos(t), y: c.y + r * Math.sin(t) }); }
    o[0] = { ...a }; o[n] = { ...b }; return { pts: o, closed: false };
  }
  if (e.type === 'spline') { const pts = e.pts.map(P); return { pts: SK.splineSample(pts, e.closed, Math.round(16 * fine)), closed: !!e.closed }; }
  return { pts: [], closed: false };
};

// ===== Biên dịch ràng buộc thành phần dư =====
// ctx: { ownerAng(lid), ownerFrame(lid), jointPos(jid), pointOwner(pid) }
SK.compile = (sk, ctx) => {
  const vars = [], vidx = new Map();
  const addVar = (key, val) => { if (!vidx.has(key)) { vidx.set(key, vars.length); vars.push(val); } return vidx.get(key); };
  const pm = SK.ptMap(sk);
  const used = new Set(); sk.ents.forEach(e => SK.entPts(e).forEach(id => used.add(id)));
  sk.cons.forEach(c => ['p', 'q'].forEach(k => c[k] && used.add(c[k])));
  for (const id of used) { const p = pm.get(id); if (p) { addVar(id + '.x', p.x); addVar(id + '.y', p.y); } }
  for (const e of sk.ents) if (e.type === 'circle') addVar(e.id + '.r', e.r);
  const ix = id => vidx.get(id + '.x'), iy = id => vidx.get(id + '.y');
  const em = new Map(sk.ents.map(e => [e.id, e]));
  const res = [];
  const R = (vi, f, tag) => res.push({ vi, f, tag });
  const pv = (V, id) => ({ x: V[ix(id)], y: V[iy(id)] });
  const radV = (e) => e.type === 'circle' ? [vidx.get(e.id + '.r')] : [ix(e.c), iy(e.c), ix(e.a), iy(e.a)];
  const rad = (V, e) => e.type === 'circle' ? V[vidx.get(e.id + '.r')] : Math.hypot(V[ix(e.a)] - V[ix(e.c)], V[iy(e.a)] - V[iy(e.c)]);
  const lv = e => [ix(e.a), iy(e.a), ix(e.b), iy(e.b)];
  const dir = (V, e) => ({ x: V[ix(e.b)] - V[ix(e.a)], y: V[iy(e.b)] - V[iy(e.a)] });
  const pvs = id => [ix(id), iy(id)];
  // ràng buộc nội tại của cung: bán kính hai đầu bằng nhau
  for (const e of sk.ents) if (e.type === 'arc') R([...pvs(e.c), ...pvs(e.a), ...pvs(e.b)], V => Math.hypot(V[ix(e.b)] - V[ix(e.c)], V[iy(e.b)] - V[iy(e.c)]) - Math.hypot(V[ix(e.a)] - V[ix(e.c)], V[iy(e.a)] - V[iy(e.c)]), 'arc:' + e.id);
  const onCurve = (p, e) => {
    if (e.type === 'line') R([...pvs(p), ...lv(e)], V => { const a = pv(V, e.a), b = pv(V, e.b), P = pv(V, p), dx = b.x - a.x, dy = b.y - a.y; return ((P.x - a.x) * dy - (P.y - a.y) * dx) / (Math.hypot(dx, dy) || 1e-9); });
    else if (e.type === 'circle' || e.type === 'arc') R([...pvs(p), ...pvs(e.c), ...radV(e)], V => { const P = pv(V, p), c = pv(V, e.c); return Math.hypot(P.x - c.x, P.y - c.y) - rad(V, e); });
    else if (e.type === 'spline') R([...pvs(p), ...e.pts.flatMap(pvs)], V => { const P = pv(V, p), s = SK.splineSample(e.pts.map(id => pv(V, id)), e.closed, 12); let best = Infinity; for (let i = 0; i < s.length - 1; i++) best = Math.min(best, SK.segDist(P, s[i], s[i + 1])); return best; });
  };
  for (const c of sk.cons) {
    const e1 = c.e1 && em.get(c.e1), e2 = c.e2 && em.get(c.e2);
    switch (c.type) {
      case 'coinc': R([...pvs(c.p), ...pvs(c.q)], V => V[ix(c.p)] - V[ix(c.q)]); R([...pvs(c.p), ...pvs(c.q)], V => V[iy(c.p)] - V[iy(c.q)]); break;
      case 'onc': if (e1) onCurve(c.p, e1); break;
      case 'hv': {
        const get = c.e1 ? (V => dir(V, e1)) : (V => ({ x: V[ix(c.q)] - V[ix(c.p)], y: V[iy(c.q)] - V[iy(c.p)] }));
        const vi = c.e1 ? lv(e1) : [...pvs(c.p), ...pvs(c.q)];
        if (c.e1 && !e1) break;
        R(vi, V => { const d = get(V), a = c.a + (c.owner ? ctx.ownerAng(c.owner) : 0); return (d.x * Math.sin(a) - d.y * Math.cos(a)) / (Math.hypot(d.x, d.y) || 1e-9); });
        break;
      }
      case 'par': case 'perp': if (e1 && e2) R([...lv(e1), ...lv(e2)], V => { const a = dir(V, e1), b = dir(V, e2), n = (Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y)) || 1e-9; return c.type === 'par' ? (a.x * b.y - a.y * b.x) / n : (a.x * b.x + a.y * b.y) / n; }); break;
      case 'tan': {
        if (!e1 || !e2) break;
        const L = e1.type === 'line' ? e1 : e2.type === 'line' ? e2 : null, C1 = L ? (L === e1 ? e2 : e1) : e1, C2 = L ? null : e2;
        const shared = (x, y) => { const A = x.type === 'line' || x.type === 'arc' ? [x.a, x.b] : [], B = y.type === 'line' || y.type === 'arc' ? [y.a, y.b] : []; return A.find(id => B.includes(id)); };
        const T = L ? shared(L, C1) : shared(C1, C2);
        // tiếp xúc tại điểm chung: dùng điều kiện vuông góc/thẳng hàng (không suy biến)
        if (T && L) { R([...lv(L), ...pvs(C1.c)], V => { const a = pv(V, L.a), b = pv(V, L.b), cc = pv(V, C1.c), t = pv(V, T), dx = b.x - a.x, dy = b.y - a.y, rx = cc.x - t.x, ry = cc.y - t.y; return (rx * dx + ry * dy) / ((Math.hypot(dx, dy) * Math.hypot(rx, ry)) || 1e-9); }); break; }
        if (T && !L) { R([...pvs(C1.c), ...pvs(C2.c), ...pvs(T)], V => { const a = pv(V, C1.c), b = pv(V, C2.c), t = pv(V, T), ax = a.x - t.x, ay = a.y - t.y, bx = b.x - t.x, by = b.y - t.y; return (ax * by - ay * bx) / ((Math.hypot(ax, ay) * Math.hypot(bx, by)) || 1e-9); }); break; }
        if (L) R([...lv(L), ...pvs(C1.c), ...radV(C1)], V => { const a = pv(V, L.a), b = pv(V, L.b), cc = pv(V, C1.c), dx = b.x - a.x, dy = b.y - a.y; const sd = ((cc.x - a.x) * dy - (cc.y - a.y) * dx) / (Math.hypot(dx, dy) || 1e-9); return sd * (c.s || 1) - rad(V, C1); });
        else R([...pvs(C1.c), ...radV(C1), ...pvs(C2.c), ...radV(C2)], V => { const a = pv(V, C1.c), b = pv(V, C2.c); return Math.hypot(b.x - a.x, b.y - a.y) - Math.abs(rad(V, C1) + (c.s || 1) * rad(V, C2)); });
        break;
      }
      case 'eq': if (e1 && e2) {
        if (e1.type === 'line' && e2.type === 'line') R([...lv(e1), ...lv(e2)], V => { const a = dir(V, e1), b = dir(V, e2); return Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y); });
        else R([...pvs(e1.c), ...radV(e1), ...pvs(e2.c), ...radV(e2)], V => rad(V, e1) - rad(V, e2));
      } break;
      case 'conc': if (e1 && e2) { R([...pvs(e1.c), ...pvs(e2.c)], V => V[ix(e1.c)] - V[ix(e2.c)]); R([...pvs(e1.c), ...pvs(e2.c)], V => V[iy(e1.c)] - V[iy(e2.c)]); } break;
      case 'mid': if (e1) { R([...pvs(c.p), ...lv(e1)], V => V[ix(c.p)] - (V[ix(e1.a)] + V[ix(e1.b)]) / 2); R([...pvs(c.p), ...lv(e1)], V => V[iy(c.p)] - (V[iy(e1.a)] + V[iy(e1.b)]) / 2); } break;
      case 'sym': if (e1) {
        const vi = [...pvs(c.p), ...pvs(c.q), ...lv(e1)];
        R(vi, V => { const a = pv(V, e1.a), b = pv(V, e1.b), m = { x: (V[ix(c.p)] + V[ix(c.q)]) / 2, y: (V[iy(c.p)] + V[iy(c.q)]) / 2 }, dx = b.x - a.x, dy = b.y - a.y; return ((m.x - a.x) * dy - (m.y - a.y) * dx) / (Math.hypot(dx, dy) || 1e-9); });
        R(vi, V => { const a = pv(V, e1.a), b = pv(V, e1.b), dx = b.x - a.x, dy = b.y - a.y; return ((V[ix(c.q)] - V[ix(c.p)]) * dx + (V[iy(c.q)] - V[iy(c.p)]) * dy) / (Math.hypot(dx, dy) || 1e-9); });
      } break;
      case 'fix': {
        const own = ctx.pointOwner(c.p), f = own ? ctx.ownerFrame(own) : null;
        const tgt = () => f ? { x: f.ox + c.x * f.ex - c.y * f.ey, y: f.oy + c.x * f.ey + c.y * f.ex } : { x: c.x, y: c.y };
        R(pvs(c.p), V => V[ix(c.p)] - tgt().x); R(pvs(c.p), V => V[iy(c.p)] - tgt().y); break;
      }
      case 'atj': { const jp = () => ctx.jointPos(c.j); R(pvs(c.p), V => { const J = jp(); return J ? V[ix(c.p)] - J.x : 0; }); R(pvs(c.p), V => { const J = jp(); return J ? V[iy(c.p)] - J.y : 0; }); break; }
    }
  }
  for (const d of sk.dims) {
    if (d.driven) continue; // kích thước tham chiếu (driven): chỉ hiển thị
    const e1 = d.e1 && em.get(d.e1), e2 = d.e2 && em.get(d.e2);
    if (d.type === 'dx') R([...pvs(d.p), ...pvs(d.q)], V => (V[ix(d.q)] - V[ix(d.p)]) * (d.s || 1) - d.v, 'dim:' + d.id);
    else if (d.type === 'dy') R([...pvs(d.p), ...pvs(d.q)], V => (V[iy(d.q)] - V[iy(d.p)]) * (d.s || 1) - d.v, 'dim:' + d.id);
    else if (d.type === 'dia' && e1) R([...pvs(e1.c), ...radV(e1)], V => 2 * rad(V, e1) - d.v, 'dim:' + d.id);
    else if (d.type === 'dist') R([...pvs(d.p), ...pvs(d.q)], V => Math.hypot(V[ix(d.q)] - V[ix(d.p)], V[iy(d.q)] - V[iy(d.p)]) - d.v, 'dim:' + d.id);
    else if (d.type === 'len' && e1) R(lv(e1), V => { const a = dir(V, e1); return Math.hypot(a.x, a.y) - d.v; }, 'dim:' + d.id);
    else if (d.type === 'rad' && e1) R([...pvs(e1.c), ...radV(e1)], V => rad(V, e1) - d.v, 'dim:' + d.id);
    else if (d.type === 'pl' && e1) R([...pvs(d.p), ...lv(e1)], V => { const a = pv(V, e1.a), b = pv(V, e1.b), P = pv(V, d.p), dx = b.x - a.x, dy = b.y - a.y; return Math.abs(((P.x - a.x) * dy - (P.y - a.y) * dx) / (Math.hypot(dx, dy) || 1e-9)) - d.v; }, 'dim:' + d.id);
    else if (d.type === 'ang' && e1 && e2) R([...lv(e1), ...lv(e2)], V => { const a = dir(V, e1), b = dir(V, e2); const phi = Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y); return SK.wrap(phi - (d.sign || 1) * d.v * D2R) * 10; }, 'dim:' + d.id);
  }
  return { vars, vidx, res, pm, ix, iy };
};
SK.segDist = (P, a, b) => { const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1e-12; let t = ((P.x - a.x) * dx + (P.y - a.y) * dy) / l2; t = Math.max(0, Math.min(1, t)); return Math.hypot(a.x + t * dx - P.x, a.y + t * dy - P.y); };

SK.linsolve = (A, b) => {
  const n = b.length;
  for (let c = 0; c < n; c++) {
    let p = c, mx = Math.abs(A[c][c]);
    for (let r = c + 1; r < n; r++) { const v = Math.abs(A[r][c]); if (v > mx) { mx = v; p = r; } }
    if (mx < 1e-14) return null;
    if (p !== c) { const t = A[p]; A[p] = A[c]; A[c] = t; const tb = b[p]; b[p] = b[c]; b[c] = tb; }
    const Ac = A[c], acc = Ac[c];
    for (let r = c + 1; r < n; r++) { const Ar = A[r], f = Ar[c] / acc; if (!f) continue; for (let k = c; k < n; k++) Ar[k] -= f * Ac[k]; b[r] -= f * b[c]; }
  }
  const x = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) { let s = b[r]; const Ar = A[r]; for (let k = r + 1; k < n; k++) s -= Ar[k] * x[k]; x[r] = s / Ar[r]; }
  return x;
};
// Gradient số học thưa
SK.grad = (r, V, f0) => { const g = []; for (const i of r.vi) { if (i == null) continue; const o = V[i], h = 1e-6 * Math.max(1, Math.abs(o)); V[i] = o + h; const f1 = r.f(V); V[i] = o; g.push([i, (f1 - f0) / h]); } return g; };

// Giải: soft = [{i, v, w}] (giữ chỗ / kéo tới)
SK.solve = (sys, opts = {}) => {
  const V = Float64Array.from(sys.vars), n = V.length, res = sys.res;
  if (!n) return { V, ok: true, err: 0 };
  const stay = opts.stay ?? 1e-3, soft = opts.soft || [];
  const softAll = []; for (let i = 0; i < n; i++) softAll.push({ i, v: sys.vars[i], w: stay });
  for (const s of soft) { const t = softAll.find(o => o.i === s.i); if (t) { t.v = s.v; t.w = s.w; t.drag = true; } }
  let lam = 1e-3, err = 0;
  const evalAll = () => { let c = 0, hard = 0; const f = res.map(r => { const v = r.f(V); hard = Math.max(hard, Math.abs(v)); c += v * v; return v; }); for (const s of softAll) { const d = (V[s.i] - s.v) * s.w; c += d * d; } return { f, c, hard }; };
  let cur = evalAll();
  for (let it = 0; it < (opts.maxIter || 50); it++) {
    if (cur.hard < 1e-9 && !soft.length && it > 0) break;
    const A = Array.from({ length: n }, () => new Float64Array(n)), g = new Float64Array(n);
    res.forEach((r, k) => { const gr = SK.grad(r, V, cur.f[k]); for (const [i, vi] of gr) { g[i] += vi * cur.f[k]; for (const [j, vj] of gr) A[i][j] += vi * vj; } });
    for (const s of softAll) { const w2 = s.w * s.w; A[s.i][s.i] += w2; g[s.i] += w2 * (V[s.i] - s.v); }
    let improved = false;
    for (let tries = 0; tries < 6; tries++) {
      const M = A.map((row, i) => { const r = Float64Array.from(row); r[i] += lam * (1 + row[i]); return r; });
      const dx = SK.linsolve(M, Array.from(g, v => -v)); if (!dx) { lam *= 10; continue; }
      const save = Float64Array.from(V); for (let i = 0; i < n; i++) V[i] += dx[i];
      const nx = evalAll();
      if (nx.c <= cur.c) {
        const rel = cur.c - nx.c; lam = Math.max(1e-12, lam / 4); improved = true;
        // điểm neo "giữ chỗ" dời theo nghiệm hiện tại (phương pháp proximal) để ràng buộc cứng hội tụ chính xác
        for (const s of softAll) if (!s.drag) s.v = V[s.i];
        cur = evalAll(); if (rel < 1e-16) it = 1e9; break;
      }
      V.set(save); lam *= 8;
    }
    if (!improved) break;
  }
  if (soft.length && !opts.polished) { // đánh bóng: bỏ điểm kéo, chỉ giữ ràng buộc
    const sys2 = { ...sys, vars: Array.from(V) }; return SK.solve(sys2, { ...opts, soft: [], polished: true });
  }
  return { V, ok: cur.hard < (opts.tol ?? 1e-5), err: cur.hard };
};
SK.apply = (sk, sys, V) => {
  for (const p of sk.pts) { const i = sys.vidx.get(p.id + '.x'); if (i != null) { p.x = V[i]; p.y = V[sys.vidx.get(p.id + '.y')]; } }
  for (const e of sk.ents) if (e.type === 'circle') { const i = sys.vidx.get(e.id + '.r'); if (i != null) e.r = Math.abs(V[i]); }
};

// Bậc tự do: hạng ma trận Jacobi, không gian rỗng → điểm nào đã xác định đủ
SK.dofAnalysis = (sys) => {
  const n = sys.vars.length, V = Float64Array.from(sys.vars);
  const rows = sys.res.map(r => { const f0 = r.f(V), row = new Float64Array(n); for (const [i, v] of SK.grad(r, V, f0)) row[i] += v; return row; });
  const m = rows.length, piv = [], A = rows.map(r => Float64Array.from(r));
  let r = 0;
  for (let c = 0; c < n && r < m; c++) {
    let p = r, mx = Math.abs(A[r][c]); for (let k = r + 1; k < m; k++) if (Math.abs(A[k][c]) > mx) { mx = Math.abs(A[k][c]); p = k; }
    if (mx < 1e-7) continue;
    [A[p], A[r]] = [A[r], A[p]];
    const inv = 1 / A[r][c]; for (let k = c; k < n; k++) A[r][k] *= inv;
    for (let k = 0; k < m; k++) if (k !== r) { const f = A[k][c]; if (Math.abs(f) > 1e-14) for (let q = c; q < n; q++) A[k][q] -= f * A[r][q]; }
    piv.push(c); r++;
  }
  const pivSet = new Set(piv), free = []; for (let c = 0; c < n; c++) if (!pivSet.has(c)) free.push(c);
  const moving = new Uint8Array(n);
  for (const fc of free) { moving[fc] = 1; for (let k = 0; k < piv.length; k++) if (Math.abs(A[k][fc]) > 1e-7) moving[piv[k]] = 1; }
  return { dof: free.length, rank: piv.length, moving };
};

// ===== Biên dạng kín (closed profile) =====
SK.polyArea = P => { let a = 0; for (let i = 0, j = P.length - 1; i < P.length; j = i++) a += (P[j].x * P[i].y - P[i].x * P[j].y); return a / 2; };
SK.inPoly = (x, y, P) => { let c = false; for (let i = 0, k = P.length - 1; i < P.length; k = i++) { const a = P[i], b = P[k]; if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) c = !c; } return c; };
SK.segInt = (a, b, c, d) => {
  const r = { x: b.x - a.x, y: b.y - a.y }, s = { x: d.x - c.x, y: d.y - c.y }, den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den, u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den;
  return { t, u, x: a.x + t * r.x, y: a.y + t * r.y };
};
SK.regions = (sk) => {
  const pm = SK.ptMap(sk), polys = [];
  for (const e of sk.ents) { if (e.cs || e.type === 'point') continue; const s = SK.sample(e, pm); if (s.pts.length >= 2) polys.push({ ent: e.id, pts: s.pts, closed: s.closed, cuts: [] }); }
  // giao điểm giữa các đường
  const bb = p => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const q of p.pts) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); } return { x0, y0, x1, y1 }; };
  polys.forEach(p => p.bb = bb(p));
  const E = 1e-9;
  for (let i = 0; i < polys.length; i++) for (let j = i + 1; j < polys.length; j++) {
    const A = polys[i], B = polys[j];
    if (A.bb.x1 < B.bb.x0 - 1e-6 || B.bb.x1 < A.bb.x0 - 1e-6 || A.bb.y1 < B.bb.y0 - 1e-6 || B.bb.y1 < A.bb.y0 - 1e-6) continue;
    for (let s = 0; s < A.pts.length - 1; s++) for (let k = 0; k < B.pts.length - 1; k++) {
      const h = SK.segInt(A.pts[s], A.pts[s + 1], B.pts[k], B.pts[k + 1]);
      if (!h || h.t < -E || h.t > 1 + E || h.u < -E || h.u > 1 + E) continue;
      A.cuts.push(s + Math.max(0, Math.min(1, h.t))); B.cuts.push(k + Math.max(0, Math.min(1, h.u)));
    }
  }
  // tách thành các cạnh giữa các nút
  const key = p => Math.round(p.x * 1e4) + ':' + Math.round(p.y * 1e4);
  const nodes = new Map(), edges = [], loops = [];
  const node = p => { const k = key(p); if (!nodes.has(k)) nodes.set(k, { k, x: p.x, y: p.y, out: [] }); return nodes.get(k); };
  const at = (P, t) => { const i = Math.min(P.length - 2, Math.floor(t)), f = t - i; return { x: P[i].x + (P[i + 1].x - P[i].x) * f, y: P[i].y + (P[i + 1].y - P[i].y) * f }; };
  for (const p of polys) {
    const last = p.pts.length - 1;
    let cuts = [...new Set(p.cuts.map(c => Math.round(c * 1e7) / 1e7))].sort((a, b) => a - b);
    if (p.closed) {
      cuts = [...new Set(cuts.map(c => (c >= last - 1e-7 || c <= 1e-7) ? 0 : c))].sort((a, b) => a - b);
      if (!cuts.length) { loops.push({ ent: p.ent, pts: p.pts.slice(0, -1) }); continue; }
      // xoay để bắt đầu tại vết cắt đầu tiên
      const c0 = cuts[0]; const seq = [...cuts.slice(1).map(c => c), c0 + last];
      let prev = c0;
      for (const c of seq) { edges.push({ ent: p.ent, pts: sub(p.pts, prev, c, last, true) }); prev = c; }
      continue;
    }
    const all = [0, ...cuts.filter(c => c > 1e-7 && c < last - 1e-7), last];
    for (let i = 0; i < all.length - 1; i++) if (all[i + 1] - all[i] > 1e-7) edges.push({ ent: p.ent, pts: sub(p.pts, all[i], all[i + 1], last, false) });
  }
  function sub(P, t0, t1, last, wrap) {
    const o = [at2(P, t0, last)];
    for (let i = Math.floor(t0) + 1; i < t1; i++) o.push({ ...P[i % last] });
    o.push(at2(P, t1, last)); return o;
  }
  function at2(P, t, last) { const tt = t > last ? t - last : t; return at(P, Math.min(tt, last)); }
  // nửa cạnh
  const hes = [];
  for (const e of edges) {
    if (e.pts.length < 2) continue;
    const a = node(e.pts[0]), b = node(e.pts[e.pts.length - 1]);
    if (a === b && e.pts.length <= 2) continue;
    const ang = (P, i) => Math.atan2(P[i + 1].y - P[i].y, P[i + 1].x - P[i].x);
    const h1 = { from: a, to: b, pts: e.pts, ent: e.ent }, h2 = { from: b, to: a, pts: e.pts.slice().reverse(), ent: e.ent };
    h1.twin = h2; h2.twin = h1; h1.ang = ang(h1.pts, 0); h2.ang = ang(h2.pts, 0);
    a.out.push(h1); b.out.push(h2); hes.push(h1, h2);
  }
  for (const n of nodes.values()) n.out.sort((p, q) => p.ang - q.ang);
  const faces = [];
  for (const h of hes) {
    if (h.used) continue;
    const poly = [], ents = new Set(), nodesIn = new Set(); let cur = h, guard = 0;
    while (cur && !cur.used && guard++ < 10000) {
      cur.used = true; ents.add(cur.ent); nodesIn.add(cur.from.k);
      for (let i = 0; i < cur.pts.length - 1; i++) poly.push(cur.pts[i]);
      const v = cur.to, outs = v.out, i = outs.indexOf(cur.twin);
      cur = outs[(i - 1 + outs.length) % outs.length];
    }
    if (cur === h) { const A = SK.polyArea(poly); if (A > 1e-6) faces.push({ outer: poly, ents, nodes: nodesIn, area: A }); }
  }
  for (const l of loops) { let P = l.pts; if (SK.polyArea(P) < 0) P = P.slice().reverse(); faces.push({ outer: P, ents: new Set([l.ent]), nodes: new Set(['loop:' + l.ent]), area: SK.polyArea(P), loop: true }); }
  // thành phần liên thông (để xác định lỗ)
  const parent = new Map(); const find = k => { while (parent.get(k) !== k) k = parent.get(k); return k; };
  const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) parent.set(a, b); };
  for (const f of faces) for (const k of f.nodes) if (!parent.has(k)) parent.set(k, k);
  for (const h of hes) { if (!parent.has(h.from.k)) parent.set(h.from.k, h.from.k); if (!parent.has(h.to.k)) parent.set(h.to.k, h.to.k); uni(h.from.k, h.to.k); }
  faces.forEach(f => f.comp = find([...f.nodes][0]));
  // vòng ngoài của mỗi thành phần (để kiểm tra chứa): mặt lớn nhất
  for (const f of faces) {
    let best = null;
    for (const g of faces) if (g !== f && g.comp !== f.comp && g.area > f.area && SK.inPoly(f.outer[0].x, f.outer[0].y, g.outer)) { if (!best || g.area < best.area) best = g; }
    f.parentFace = best;
  }
  const regions = faces.map((f, i) => ({ id: 'P' + (i + 1), outer: f.outer, holes: [], area: f.area, ents: [...f.ents].sort(), holeEnts: [] }));
  faces.forEach((f, i) => { if (f.parentFace) { const pi = faces.indexOf(f.parentFace); regions[pi].holes.push(f.outer); regions[pi].holeEnts.push(...f.ents); regions[pi].area -= f.area; } });
  regions.sort((a, b) => b.area - a.area); regions.forEach((r, i) => r.id = 'P' + (i + 1));
  return regions;
};
SK.componentRegions = (sk) => {
  const ents = sk.ents.filter(e => !e.cs && e.type !== 'point'); if (!ents.length) return [];
  const parent = new Map(ents.map(e => [e.id, e.id])); const find = k => { while (parent.get(k) !== k) k = parent.get(k); return k; };
  const uni = (a, b) => { if (!parent.has(a) || !parent.has(b)) return; a = find(a); b = find(b); if (a !== b) parent.set(a, b); };
  const byPt = new Map(); for (const e of ents) for (const id of SK.entPts(e)) { if (e.type !== 'line' && e.type !== 'spline' && id === e.c) continue; if (!byPt.has(id)) byPt.set(id, []); byPt.get(id).push(e.id); }
  for (const list of byPt.values()) for (let i = 1; i < list.length; i++) uni(list[0], list[i]);
  // đầu mút TRÙNG VỊ TRÍ nhưng khác điểm (vd. nét lật / dán riêng từng cái) vẫn nối nhau — nếu không đường bao bị coi là hở, mất vùng kín
  const pmap = SK.ptMap(sk), byPos = new Map();
  for (const [id, list] of byPt) { const q = pmap.get(id); if (!q) continue; const k = Math.round(q.x * 1e4) + ':' + Math.round(q.y * 1e4); if (byPos.has(k)) uni(byPos.get(k), list[0]); else byPos.set(k, list[0]); }
  for (const c of sk.cons) {
    if ((c.type === 'onc' || c.type === 'mid') && c.e1) for (const e of byPt.get(c.p) || []) uni(e, c.e1);
    if (c.type === 'coinc') { const a = byPt.get(c.p) || [], b = byPt.get(c.q) || []; if (a[0] && b[0]) uni(a[0], b[0]); }
  }
  const groups = new Map(); for (const e of ents) { const r = find(e.id); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(e); }
  const out = [];
  for (const g of groups.values()) out.push(...SK.regions({ pts: sk.pts, ents: g, cons: [], dims: [] }));
  out.sort((a, b) => b.area - a.area); out.forEach((r, i) => r.id = 'P' + (i + 1));
  return out;
};
SK.matchRegion = (regions, ents) => {
  const s = new Set(ents); let best = null, bs = 0;
  let bestC = null, bc = 0, bcj = 0;
  for (const r of regions) { let inter = 0; for (const e of r.ents) if (s.has(e)) inter++; const j = inter / (r.ents.length + s.size - inter); if (j > bs) { bs = j; best = r; }
    const c = s.size ? inter / s.size : 0; if (c > bc || (c === bc && j > bcj)) { bc = c; bcj = j; bestC = r; } }
  if (bs >= 0.5) return best;
  // vùng đã được sửa thêm nét (vd. vòng tròn bị cắt rồi nối thêm cạnh): vùng nào còn chứa phần lớn nét cũ thì vẫn là vùng đó
  return bc >= 0.5 ? bestC : null;
};

if (typeof module !== 'undefined') module.exports = SK;
