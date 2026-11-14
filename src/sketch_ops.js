// ===== Công cụ chỉnh sửa sketch: trim, extend, split, fillet, offset, mirror, pattern =====
SK.addPt = (sk, x, y) => { const p = { id: SK.newId('p'), x, y }; sk.pts.push(p); return p.id; };
SK.usedPts = sk => { const u = new Set(); sk.ents.forEach(e => SK.entPts(e).forEach(id => u.add(id))); return u; };
SK.pruneRefs = sk => {
  const ents = new Set(sk.ents.map(e => e.id));
  const used = SK.usedPts(sk);
  sk.pts = sk.pts.filter(p => used.has(p.id));
  const pts = new Set(sk.pts.map(p => p.id));
  const okRef = o => (!o.e1 || ents.has(o.e1)) && (!o.e2 || ents.has(o.e2)) && (!o.p || pts.has(o.p)) && (!o.q || pts.has(o.q));
  sk.cons = sk.cons.filter(okRef); sk.dims = sk.dims.filter(okRef);
  sk.traces = (sk.traces || []).filter(t => t.kind === 'p' ? pts.has(t.ref) : ents.has(t.ref));
};
SK.removeEnts = (sk, ids) => { const s = new Set(ids); sk.ents = sk.ents.filter(e => !s.has(e.id)); SK.pruneRefs(sk); };
SK.removePts = (sk, ids) => { const s = new Set(ids); sk.ents = sk.ents.filter(e => { if (e.type === 'spline') { e.pts = e.pts.filter(p => !s.has(p)); return e.pts.length >= 2; } return !SK.entPts(e).some(p => s.has(p)); }); SK.pruneRefs(sk); };

// tham số trên thực thể
SK.arcInfo = (e, pm) => { const c = pm.get(e.c), a = pm.get(e.a), b = pm.get(e.b); const r = Math.hypot(a.x - c.x, a.y - c.y), a0 = Math.atan2(a.y - c.y, a.x - c.x); let sw = SK.angNorm(Math.atan2(b.y - c.y, b.x - c.x) - a0); if (sw < 1e-9) sw = TAU; return { c, r, a0, sw }; };
SK.param = (e, pm, P) => {
  if (e.type === 'line') { const a = pm.get(e.a), b = pm.get(e.b), dx = b.x - a.x, dy = b.y - a.y; return ((P.x - a.x) * dx + (P.y - a.y) * dy) / (dx * dx + dy * dy || 1e-12); }
  if (e.type === 'arc') { const I = SK.arcInfo(e, pm); return SK.angNorm(Math.atan2(P.y - I.c.y, P.x - I.c.x) - I.a0); }
  if (e.type === 'circle') { const c = pm.get(e.c); return SK.angNorm(Math.atan2(P.y - c.y, P.x - c.x)); }
  return 0;
};
SK.at = (e, pm, t) => {
  if (e.type === 'line') { const a = pm.get(e.a), b = pm.get(e.b); return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; }
  if (e.type === 'arc') { const I = SK.arcInfo(e, pm); return { x: I.c.x + I.r * Math.cos(I.a0 + t), y: I.c.y + I.r * Math.sin(I.a0 + t) }; }
  if (e.type === 'circle') { const c = pm.get(e.c); return { x: c.x + e.r * Math.cos(t), y: c.y + e.r * Math.sin(t) }; }
};
// giao điểm của thực thể e với các thực thể khác: [{t, P, ent, pid?}]
SK.hits = (sk, e, extend = false) => {
  const pm = SK.ptMap(sk), out = [];
  let me;
  if (e.type === 'line' && extend) { const a = pm.get(e.a), b = pm.get(e.b), dx = b.x - a.x, dy = b.y - a.y; me = [{ x: a.x - dx * 1000, y: a.y - dy * 1000 }, { x: b.x + dx * 1000, y: b.y + dy * 1000 }]; }
  else if ((e.type === 'arc') && extend) { const c = pm.get(e.c); me = SK.sample({ type: 'circle', c: e.c, r: SK.arcInfo(e, pm).r }, pm, 3).pts; }
  else me = SK.sample(e, pm, 3).pts;
  for (const f of sk.ents) {
    if (f.id === e.id || f.type === 'point') continue;
    const fp = SK.sample(f, pm, 2).pts;
    for (let i = 0; i < me.length - 1; i++) for (let k = 0; k < fp.length - 1; k++) {
      const h = SK.segInt(me[i], me[i + 1], fp[k], fp[k + 1]);
      if (!h || h.t < -1e-9 || h.t > 1 + 1e-9 || h.u < -1e-9 || h.u > 1 + 1e-9) continue;
      const P = { x: h.x, y: h.y };
      // trùng điểm đầu mút có sẵn?
      let pid = null; for (const id of SK.entPts(f)) { const q = pm.get(id); if (q && Math.hypot(q.x - P.x, q.y - P.y) < 1e-4 && (f.type !== 'arc' && f.type !== 'circle' || id !== f.c)) pid = id; }
      out.push({ t: SK.param(e, pm, P), P, ent: f.id, pid });
    }
  }
  // đầu mút của nét khác nằm ĐÚNG trên đường e (tính giải tích): giao điểm đa giác lấy mẫu lệch vài phần nghìn mm
  // nên có thể bỏ sót hoặc không trùng đầu mút → dùng lại chính điểm đầu mút để các nét nối nhau (biên dạng kín khép được)
  for (const f of sk.ents) {
    if (f.id === e.id || f.type === 'point' || f.type === 'circle') continue;
    for (const id of [f.a, f.b].filter(Boolean)) {
      const q = pm.get(id); if (!q || SK.entPts(e).includes(id)) continue;
      if (SK.distToEnt(e, pm, q) > 0.01) continue;
      const t = SK.param(e, pm, q);
      for (let i = out.length - 1; i >= 0; i--) if (Math.hypot(out[i].P.x - q.x, out[i].P.y - q.y) < 0.05) out.splice(i, 1); // bỏ giao điểm xấp xỉ trùng chỗ
      out.push({ t, P: { x: q.x, y: q.y }, ent: f.id, pid: id });
    }
  }
  // khử trùng lặp (ưu tiên giao điểm là đầu mút có sẵn)
  out.sort((a, b) => a.t - b.t || (b.pid ? 1 : 0) - (a.pid ? 1 : 0));
  return out.filter((h, i) => i === 0 || Math.abs(h.t - out[i - 1].t) > 1e-6);
};
// khoảng cách giải tích từ điểm q tới nét e (đoạn thẳng, cung, đường tròn; spline: đa tuyến lấy mẫu)
SK.distToEnt = (e, pm, q) => {
  if (e.type === 'line') { const a = pm.get(e.a), b = pm.get(e.b), dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1e-12, t = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / L2)); return Math.hypot(a.x + t * dx - q.x, a.y + t * dy - q.y); }
  if (e.type === 'circle') { const c = pm.get(e.c); return Math.abs(Math.hypot(q.x - c.x, q.y - c.y) - e.r); }
  if (e.type === 'arc') {
    const I = SK.arcInfo(e, pm), u = SK.angNorm(Math.atan2(q.y - I.c.y, q.x - I.c.x) - I.a0);
    if (u <= I.sw + 1e-9) return Math.abs(Math.hypot(q.x - I.c.x, q.y - I.c.y) - I.r);
    const A = pm.get(e.a), B = pm.get(e.b); return Math.min(Math.hypot(q.x - A.x, q.y - A.y), Math.hypot(q.x - B.x, q.y - B.y));
  }
  const pts = SK.sample(e, pm, 3).pts; let d = Infinity;
  for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1e-12, t = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / L2)); d = Math.min(d, Math.hypot(a.x + t * dx - q.x, a.y + t * dy - q.y)); }
  return d;
};
// điểm tại giao: dùng điểm có sẵn hoặc tạo điểm mới nằm trên đường kia
SK.ptAtHit = (sk, h) => { if (h.pid) return h.pid; const id = SK.addPt(sk, h.P.x, h.P.y); sk.cons.push({ id: SK.newId('k'), type: 'onc', p: id, e1: h.ent }); return id; };
const KEEP_ON_PIECES = new Set(['hv', 'par', 'perp']);
SK.cloneConsTo = (sk, fromId, toId) => { for (const c of sk.cons.slice()) if (KEEP_ON_PIECES.has(c.type) && (c.e1 === fromId || c.e2 === fromId)) sk.cons.push({ ...c, id: SK.newId('k'), e1: c.e1 === fromId ? toId : c.e1, e2: c.e2 === fromId ? toId : c.e2 }); };
SK.dropDims = (sk, eid) => { sk.dims = sk.dims.filter(d => !((d.type === 'len') && d.e1 === eid)); sk.cons = sk.cons.filter(c => !(['eq', 'mid'].includes(c.type) && (c.e1 === eid || c.e2 === eid))); };

SK.trim = (sk, eid, click) => {
  const e = sk.ents.find(x => x.id === eid); if (!e) return false;
  const pm = SK.ptMap(sk);
  if (e.type === 'spline' || e.type === 'point') { SK.removeEnts(sk, [eid]); return true; }
  const hits = SK.hits(sk, e), tc = SK.param(e, pm, click);
  if (e.type === 'line' || e.type === 'arc') {
    const end = e.type === 'line' ? 1 : SK.arcInfo(e, pm).sw;
    const inner = hits.filter(h => h.t > 1e-6 * end && h.t < end - 1e-6 * end);
    const lo = [...inner].reverse().find(h => h.t < tc), hi = inner.find(h => h.t > tc);
    if (!lo && !hi) { SK.removeEnts(sk, [eid]); return true; }
    SK.dropDims(sk, eid);
    if (!lo) { e.a = SK.ptAtHit(sk, hi); }
    else if (!hi) { e.b = SK.ptAtHit(sk, lo); }
    else { const nb = e.b; const pl = SK.ptAtHit(sk, lo), ph = SK.ptAtHit(sk, hi); e.b = pl; const n = { ...e, id: SK.newId('e'), a: ph, b: nb }; sk.ents.push(n); SK.cloneConsTo(sk, e.id, n.id); }
    SK.pruneRefs(sk); return true;
  }
  if (e.type === 'circle') {
    if (hits.length < 2) { SK.removeEnts(sk, [eid]); return true; }
    let lo = null, hi = null;
    for (const h of hits) { const d = SK.angNorm(h.t - tc); if (!hi || d < SK.angNorm(hi.t - tc)) hi = h; const d2 = SK.angNorm(tc - h.t); if (!lo || d2 < SK.angNorm(tc - lo.t)) lo = h; }
    // phần còn lại: cung từ hi ngược kim tới lo
    e.type = 'arc'; e.a = SK.ptAtHit(sk, hi); e.b = SK.ptAtHit(sk, lo); delete e.r; SK.pruneRefs(sk); return true;
  }
  return false;
};
SK.extend = (sk, eid, click) => {
  const e = sk.ents.find(x => x.id === eid); if (!e || (e.type !== 'line' && e.type !== 'arc')) return false;
  const pm = SK.ptMap(sk), tc = SK.param(e, pm, click);
  const hits = SK.hits(sk, e, true);
  const used = new Map(); for (const f of sk.ents) for (const id of SK.entPts(f)) used.set(id, (used.get(id) || 0) + 1);
  if (e.type === 'line') {
    const atB = tc > 0.5; const cand = atB ? hits.filter(h => h.t > 1 + 1e-6) : hits.filter(h => h.t < -1e-6).reverse();
    if (!cand.length) return false; const h = cand[0];
    const key = atB ? 'b' : 'a';
    if ((used.get(e[key]) || 0) > 1) e[key] = SK.addPt(sk, h.P.x, h.P.y); else { const p = pm.get(e[key]); p.x = h.P.x; p.y = h.P.y; }
    if (h.pid) e[key] = h.pid; else sk.cons.push({ id: SK.newId('k'), type: 'onc', p: e[key], e1: h.ent });
    SK.dropDims(sk, eid); SK.pruneRefs(sk); return true;
  }
  const I = SK.arcInfo(e, pm), pa = pm.get(e.a), pb = pm.get(e.b), atB = Math.hypot(click.x - pb.x, click.y - pb.y) < Math.hypot(click.x - pa.x, click.y - pa.y);
  const cand = atB ? hits.filter(h => h.t > I.sw + 1e-6).sort((a, b) => a.t - b.t) : hits.filter(h => h.t < TAU - 1e-6 && h.t > I.sw).sort((a, b) => b.t - a.t);
  if (!cand.length) return false; const h = cand[0], key = atB ? 'b' : 'a';
  if ((used.get(e[key]) || 0) > 1) e[key] = SK.addPt(sk, h.P.x, h.P.y); else { const p = pm.get(e[key]); p.x = h.P.x; p.y = h.P.y; }
  sk.cons.push({ id: SK.newId('k'), type: 'onc', p: e[key], e1: h.ent }); SK.pruneRefs(sk); return true;
};
SK.split = (sk, eid, click) => {
  const e = sk.ents.find(x => x.id === eid); if (!e || (e.type !== 'line' && e.type !== 'arc')) return false;
  const pm = SK.ptMap(sk); let t = SK.param(e, pm, click);
  if (e.type === 'line') t = Math.max(0.02, Math.min(0.98, t));
  const P = SK.at(e, pm, t), id = SK.addPt(sk, P.x, P.y), nb = e.b;
  SK.dropDims(sk, eid); e.b = id; const n = { ...e, id: SK.newId('e'), a: id, b: nb }; sk.ents.push(n); SK.cloneConsTo(sk, e.id, n.id); return id;
};
SK.fillet = (sk, pid, r) => {
  const pm = SK.ptMap(sk), lines = sk.ents.filter(e => e.type === 'line' && (e.a === pid || e.b === pid));
  if (lines.length !== 2 || !(r > 0)) return null;
  const P = pm.get(pid), other = L => pm.get(L.a === pid ? L.b : L.a);
  const A = other(lines[0]), B = other(lines[1]);
  const la = Math.hypot(A.x - P.x, A.y - P.y), lb = Math.hypot(B.x - P.x, B.y - P.y);
  const u1 = { x: (A.x - P.x) / la, y: (A.y - P.y) / la }, u2 = { x: (B.x - P.x) / lb, y: (B.y - P.y) / lb };
  const cosT = u1.x * u2.x + u1.y * u2.y, th = Math.acos(Math.max(-1, Math.min(1, cosT))) / 2;
  if (th < 1e-3 || th > Math.PI / 2 - 1e-3) return null;
  const t = r / Math.tan(th); if (t >= la - 1e-6 || t >= lb - 1e-6) return null;
  const bis = { x: u1.x + u2.x, y: u1.y + u2.y }, bl = Math.hypot(bis.x, bis.y), dC = r / Math.sin(th);
  const T1 = SK.addPt(sk, P.x + u1.x * t, P.y + u1.y * t), T2 = SK.addPt(sk, P.x + u2.x * t, P.y + u2.y * t), C = SK.addPt(sk, P.x + bis.x / bl * dC, P.y + bis.y / bl * dC);
  for (const [L, T] of [[lines[0], T1], [lines[1], T2]]) { if (L.a === pid) L.a = T; else L.b = T; }
  const pm2 = SK.ptMap(sk), c = pm2.get(C), p1 = pm2.get(T1), p2 = pm2.get(T2);
  const cr = (p1.x - c.x) * (p2.y - c.y) - (p1.y - c.y) * (p2.x - c.x);
  const arc = { id: SK.newId('e'), type: 'arc', c: C, a: cr > 0 ? T1 : T2, b: cr > 0 ? T2 : T1, owner: lines[0].owner || null };
  sk.ents.push(arc);
  for (const L of lines) { const a = pm2.get(L.a), b = pm2.get(L.b), dx = b.x - a.x, dy = b.y - a.y, sd = ((c.x - a.x) * dy - (c.y - a.y) * dx) / Math.hypot(dx, dy); sk.cons.push({ id: SK.newId('k'), type: 'tan', e1: L.id, e2: arc.id, s: sd >= 0 ? 1 : -1 }); }
  sk.dims.push({ id: SK.newId('d'), type: 'rad', e1: arc.id, v: r });
  // điểm góc cũ: xóa nếu không còn dùng
  sk.cons = sk.cons.filter(k => !((k.p === pid || k.q === pid) && k.type !== 'fix' && k.type !== 'atj'));
  sk.dims = sk.dims.filter(d => d.p !== pid && d.q !== pid);
  SK.pruneRefs(sk); return arc.id;
};
SK.offset = (sk, eids, d) => {
  const pm = SK.ptMap(sk), sel = sk.ents.filter(e => eids.includes(e.id) && ['line', 'arc', 'circle'].includes(e.type));
  const off = new Map(); // entity -> offset geometry
  for (const e of sel) {
    if (e.type === 'line') { const a = pm.get(e.a), b = pm.get(e.b), l = Math.hypot(b.x - a.x, b.y - a.y) || 1, n = { x: -(b.y - a.y) / l, y: (b.x - a.x) / l }; off.set(e.id, { a: { x: a.x + n.x * d, y: a.y + n.y * d }, b: { x: b.x + n.x * d, y: b.y + n.y * d } }); }
    else if (e.type === 'arc') { const I = SK.arcInfo(e, pm), r2 = I.r + d; if (r2 <= 0) continue; const a = pm.get(e.a), b = pm.get(e.b); const rp = p => ({ x: I.c.x + (p.x - I.c.x) * r2 / I.r, y: I.c.y + (p.y - I.c.y) * r2 / I.r }); off.set(e.id, { a: rp(a), b: rp(b) }); }
  }
  // các đỉnh nối giữa hai đường thẳng: lấy giao điểm hai đường lệch
  const ptNew = new Map(), endOf = new Map();
  for (const e of sel) if (off.has(e.id)) for (const k of ['a', 'b']) { const id = e[k]; if (!endOf.has(id)) endOf.set(id, []); endOf.get(id).push({ e, k }); }
  for (const [id, list] of endOf) {
    let P;
    if (list.length >= 2 && list[0].e.type === 'line' && list[1].e.type === 'line') {
      const g1 = off.get(list[0].e.id), g2 = off.get(list[1].e.id), h = SK.segInt(g1.a, g1.b, g2.a, g2.b);
      P = h ? { x: h.x, y: h.y } : off.get(list[0].e.id)[list[0].k];
    } else P = { x: list.reduce((s, o) => s + off.get(o.e.id)[o.k].x, 0) / list.length, y: list.reduce((s, o) => s + off.get(o.e.id)[o.k].y, 0) / list.length };
    ptNew.set(id, SK.addPt(sk, P.x, P.y));
  }
  const made = [];
  for (const e of sel) {
    if (e.type === 'circle') { if (e.r + d <= 0) continue; const n = { id: SK.newId('e'), type: 'circle', c: e.c, r: e.r + d, owner: e.owner || null }; sk.ents.push(n); made.push(n.id); continue; }
    if (!off.has(e.id)) continue;
    const n = { ...e, id: SK.newId('e'), a: ptNew.get(e.a), b: ptNew.get(e.b), cs: false };
    sk.ents.push(n); made.push(n.id);
    if (e.type === 'line') sk.cons.push({ id: SK.newId('k'), type: 'par', e1: e.id, e2: n.id });
    if (e.type === 'arc') sk.cons.push({ id: SK.newId('k'), type: 'conc', e1: e.id, e2: n.id });
  }
  return made;
};
SK.copyEnts = (sk, eids, map, reverse) => {
  const pm = SK.ptMap(sk), pmap = new Map(), made = [];
  const np = id => { if (!pmap.has(id)) { const p = pm.get(id), q = map(p); pmap.set(id, q.same ? id : SK.addPt(sk, q.x, q.y)); } return pmap.get(id); };
  for (const e of sk.ents.filter(x => eids.includes(x.id))) {
    const n = { ...e, id: SK.newId('e') };
    if (e.type === 'line') { n.a = np(e.a); n.b = np(e.b); }
    else if (e.type === 'circle') n.c = np(e.c);
    else if (e.type === 'arc') { n.c = np(e.c); n.a = np(reverse ? e.b : e.a); n.b = np(reverse ? e.a : e.b); }
    else if (e.type === 'spline') n.pts = e.pts.map(np);
    else if (e.type === 'point') n.p = np(e.p);
    sk.ents.push(n); made.push(n.id);
  }
  return { made, pmap };
};
SK.mirror = (sk, eids, axisId) => {
  const pm = SK.ptMap(sk), ax = sk.ents.find(e => e.id === axisId); if (!ax || ax.type !== 'line') return null;
  const a = pm.get(ax.a), b = pm.get(ax.b), dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
  const refl = p => { const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, fx = a.x + t * dx, fy = a.y + t * dy; const q = { x: 2 * fx - p.x, y: 2 * fy - p.y }; if (Math.hypot(q.x - p.x, q.y - p.y) < 1e-6) q.same = true; return q; };
  const { made, pmap } = SK.copyEnts(sk, eids.filter(id => id !== axisId), refl, true);
  for (const [o, n] of pmap) if (o !== n) sk.cons.push({ id: SK.newId('k'), type: 'sym', p: o, q: n, e1: axisId });
  return made;
};
SK.linPattern = (sk, eids, n, dx, dy) => { const made = []; for (let i = 1; i < n; i++) made.push(...SK.copyEnts(sk, eids, p => ({ x: p.x + dx * i, y: p.y + dy * i })).made); return made; };
SK.circPattern = (sk, eids, cx, cy, n, total) => {
  const made = [], full = Math.abs(total - 360) < 1e-6, step = (full ? 360 / n : total / Math.max(1, n - 1)) * D2R;
  for (let i = 1; i < n; i++) { const a = step * i, co = Math.cos(a), si = Math.sin(a); made.push(...SK.copyEnts(sk, eids, p => ({ x: cx + (p.x - cx) * co - (p.y - cy) * si, y: cy + (p.x - cx) * si + (p.y - cy) * co })).made); }
  return made;
};
