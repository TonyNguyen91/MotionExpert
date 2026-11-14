// ===== Trạng thái & mô hình =====
const emptyModel = () => ({ theta0: 0, joints: [], links: [], motors: [], slots: [], sketch: SK.empty(), features: [], compounds: [], mates: [], measures: [], drive: { reverse: false, limit: { on: false, min: 0, max: 360 } }, bg: null });
const S = {
  model: emptyModel(), cons: [], pos: {}, theta: 0, dir: 1, playing: false, an: null,
  sel: null, hover: null, tool: 'select', draft: [], snap: null, guides: [], slotHost: null, addTo: null, cursor: null,
  view: { s: 6, ox: 0, oy: 0 }, opt: { dims: true, trace: true, snap: true, infer: true, mklim: true, mkdead: true },
  groups: { links: true, joints: true, slots: true, regions: true, sketch: true, skcons: false, measures: true },
  undo: [], redo: [], snapPrev: null, bgImg: null, bgSrc: null,
};
const getJ = id => S.model.joints.find(j => j.id === id);
const getL = id => S.model.links.find(l => l.id === id);
const getSlot = id => S.model.slots.find(s => s.id === id);
const getMeas = id => S.model.measures.find(m => m.id === id);
const getAny = sel => {
  if (!sel) return null; const sk = S.model.sketch;
  switch (sel.k) {
    case 'j': return getJ(sel.id); case 'l': return getL(sel.id); case 's': return getSlot(sel.id); case 'm': return getMeas(sel.id);
    case 'e': return sk.ents.find(e => e.id === sel.id) || null; case 'p': return sk.pts.find(p => p.id === sel.id) || null;
    case 'k': return sk.cons.find(c => c.id === sel.id) || null; case 'd': return sk.dims.find(d => d.id === sel.id) || null;
    case 'r': return S.regions.find(r => r.key === sel.id) || null;
    case 'q': return (S.model.mates || []).find(q => q.id === sel.id) || null;
  }
  return null;
};
const linksOf = jid => S.model.links.filter(L => L.joints.includes(jid));
const motorAt = jid => S.model.motors.find(m => m.joint === jid);
const cylMotor = lid => S.model.motors.find(m => m.cyl === lid);
const lk = o => o.lock || (o.lock = {});
const nameOf = (k, id) => (getAny({ k, id }) || {}).name || '?';
const jname = id => nameOf('j', id);
function uid(p) { return p + Math.random().toString(36).slice(2, 8); }
function nextName(list, prefix) { const used = new Set(list.map(o => o.name)); for (let i = 1; ; i++) if (!used.has(prefix + i)) return prefix + i; }
function newJointName() {
  const used = new Set(S.model.joints.map(j => j.name)); const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (const c of abc) if (!used.has(c)) return c;
  for (let i = 1; ; i++) for (const c of abc) if (!used.has(c + i)) return c + i;
}
function newJoint(p, extra = {}) { const j = { id: uid('j'), name: newJointName(), x: p.x, y: p.y, fixed: false, slider: null, slot: null, trace: false, lock: {}, ...extra }; S.model.joints.push(j); return j; }

function normalizeModel(m) {
  const d = emptyModel();
  for (const k of ['joints', 'links', 'motors', 'slots', 'measures', 'features', 'compounds', 'mates', 'positions']) m[k] = Array.isArray(m[k]) ? m[k] : [];
  migrateShapes(m); m.sketch = m.sketch || SK.empty(); for (const k of ['pts', 'ents', 'cons', 'dims', 'traces']) m.sketch[k] = m.sketch[k] || [];
  m.theta0 = +m.theta0 || 0;
  m.drive = m.drive || d.drive; m.drive.limit = m.drive.limit || d.drive.limit;
  m.joints.forEach(j => { j.lock = j.lock || {}; j.slider = j.slider || null; j.slot = j.slot || null; });
  m.links.forEach(L => { L.lock = L.lock || {}; L.w = L.w || 6; if (L.kind === 'cyl' && !L.cyl) L.cyl = { min: 10, max: 30 }; });
  m.slots.forEach(s => s.w = s.w || 3);
  m.bg = m.bg || null;
  return m;
}

// ----- tọa độ thế giới của các phần tử gắn theo khâu -----
function linkFrame(lid, pos = S.pos) { const L = getL(lid); return L && L.joints.length >= 2 ? frameOf(L, pos) : null; }
function locToWorld(lid, p, pos) { const f = linkFrame(lid, pos); return f ? toWorld(f, { u: p.x, v: p.y }) : { x: p.x, y: p.y }; }
function worldToLoc(lid, p, pos) { const f = linkFrame(lid, pos); if (!f) return { x: p.x, y: p.y }; const l = toLocal(f, p); return { x: l.u, y: l.v }; }
function slotWorld(sl, pos = S.pos) { if (!sl.link) return { a: sl.a, b: sl.b }; return { a: locToWorld(sl.link, sl.a, pos), b: locToWorld(sl.link, sl.b, pos) }; }
// đường tâm rãnh (thế giới, tư thế pos): rãnh thẳng = [a, b]; rãnh theo nét phác thảo (sl.ent) = nét lấy mẫu, đi theo khâu sở hữu nét
function slotPoly(sl, pos = S.pos) {
  if (!sl.ent) { const w = slotWorld(sl, pos); return { pts: [w.a, w.b], closed: false }; }
  const sk = S.model.sketch, e = sk.ents.find(q => q.id === sl.ent); if (!e) return { pts: [], closed: false };
  const s = SK.sample(e, SK.ptMap(sk)), L = e.owner && getL(e.owner), pts = s.pts.map(p => ({ x: p.x, y: p.y }));
  if (s.closed && pts.length > 2 && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) > 1e-9) pts.push({ ...pts[0] });
  if (!L || L.joints.length < 2) return { pts, closed: s.closed };
  const fD = frameOf(L, designMap(S.model)), fN = frameOf(L, pos); if (!fD || !fN) return { pts, closed: s.closed };
  return { pts: pts.map(p => toWorld(fN, toLocal(fD, p))), closed: s.closed };
}
// điểm gần nhất trên đường gấp khúc
function polyNear(x, y, pts) {
  let best = { d: Infinity, p: null };
  for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1], r = segDist(x, y, a, b); if (r.d < best.d) best = { d: r.d, p: { x: a.x + (b.x - a.x) * r.t, y: a.y + (b.y - a.y) * r.t } }; }
  return best;
}
const polyLen = pts => { let l = 0; for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); return l; };
const slotLen = sl => sl.ent ? polyLen(slotPoly(sl, designMap(S.model)).pts) : Math.hypot(sl.b.x - sl.a.x, sl.b.y - sl.a.y);
function refWorld(ref, pos = S.pos) {
  if (!ref) return null;
  if (ref.j) return pos[ref.j] || null;
  if (ref.sp) { const pm = SK.ptMap(S.model.sketch); if (!pm.get(ref.sp)) return null; if (pos === S.pos) { XF = skXform(); return skP(ref.sp, pm); } return pm.get(ref.sp); }
  return { x: ref.x, y: ref.y };
}
function entWorld(eid, pos = S.pos) { // đoạn thẳng phác thảo trong hệ thế giới ở tư thế pos
  const sk = S.model.sketch, e = sk.ents.find(x => x.id === eid); if (!e || e.type !== 'line') return null;
  const a = refWorld({ sp: e.a }, pos), b = refWorld({ sp: e.b }, pos); return a && b ? { a, b } : null;
}
const isAngMeas = m => m.kind === 'ang' || m.kind === 'eang';
// hình học của phép đo: { d: [P0, P1] } khoảng cách (vẽ như kích thước) hoặc { a: [điểm 1, đỉnh, điểm 2] } góc
// kind: dist (2 điểm) · elen (độ dài cạnh) · edist (2 cạnh song song) · pldist (điểm – đường thẳng chứa cạnh) · eang (góc 2 cạnh) · ang (cũ: 3 điểm)
function measGeom(m, pos = S.pos) {
  const P = (m.p || []).map(r => refWorld(r, pos)), E = (m.e || []).map(id => entWorld(id, pos)); if (P.some(p => !p) || E.some(e => !e)) return null;
  const foot = (p, e) => { const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y, t = ((p.x - e.a.x) * dx + (p.y - e.a.y) * dy) / (dx * dx + dy * dy || 1); return { x: e.a.x + t * dx, y: e.a.y + t * dy }; };
  const mid = e => ({ x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 });
  if (m.kind === 'dist') return { d: P };
  if (m.kind === 'elen') return { d: [E[0].a, E[0].b] };
  if (m.kind === 'edist') { const p = mid(E[0]); return { d: [p, foot(p, E[1])] }; }
  if (m.kind === 'pldist') return { d: [P[0], foot(P[0], E[0])] };
  if (m.kind === 'eang') { // đỉnh = giao hai đường thẳng chứa cạnh, hai cánh hướng về trung điểm từng cạnh
    const [e1, e2] = E, d1 = { x: e1.b.x - e1.a.x, y: e1.b.y - e1.a.y }, d2 = { x: e2.b.x - e2.a.x, y: e2.b.y - e2.a.y }, den = d1.x * d2.y - d1.y * d2.x;
    if (Math.abs(den) < 1e-12) return null; const t = ((e2.a.x - e1.a.x) * d2.y - (e2.a.y - e1.a.y) * d2.x) / den, X = { x: e1.a.x + t * d1.x, y: e1.a.y + t * d1.y };
    const arm = (e, t) => { const q = t == null ? null : { x: e.a.x + t * (e.b.x - e.a.x), y: e.a.y + t * (e.b.y - e.a.y) }; if (q && Math.hypot(q.x - X.x, q.y - X.y) > 1e-3) return q; // cánh hướng về điểm đã bấm trên cạnh
      return Math.hypot(e.a.x - X.x, e.a.y - X.y) > Math.hypot(e.b.x - X.x, e.b.y - X.y) ? e.a : e.b; }; // không có / trùng đỉnh → đầu xa của cạnh
    return { a: [arm(e1, (m.t || [])[0]), X, arm(e2, (m.t || [])[1])] };
  }
  return { a: P };
}
function measValue(m, pos = S.pos) {
  const g = measGeom(m, pos); if (!g) return null;
  if (g.d) return Math.hypot(g.d[1].x - g.d[0].x, g.d[1].y - g.d[0].y);
  const P = g.a, a1 = Math.atan2(P[0].y - P[1].y, P[0].x - P[1].x), a2 = Math.atan2(P[2].y - P[1].y, P[2].x - P[1].x);
  let d = Math.abs(a1 - a2) * R2D; if (d > 180) d = 360 - d; return d;
}

// ----- hoàn tác -----
function snapStr() { const m = S.model; return JSON.stringify({ ...m, bg: m.bg ? { ...m.bg, src: null } : null }, (k, v) => k[0] === '_' ? undefined : v); }
function pushUndo() { if (S.snapPrev != null) { S.undo.push(S.snapPrev); if (S.undo.length > 80) S.undo.shift(); } S.snapPrev = snapStr(); S.redo = []; updateUndoBtns(); }
function restoreSnap(str) {
  const m = normalizeModel(JSON.parse(str)); if (m.bg) m.bg.src = S.bgSrc;
  S.model = m; S.snapPrev = str; S.skFrames = {}; rebuild({ noUndo: true }); syncBgPanel();
}
function undo() { if (!S.undo.length) return; if (S.playing) togglePlay(); S.redo.push(S.snapPrev); restoreSnap(S.undo.pop()); toast(T('toast_undo')); updateUndoBtns(); }
function redo() { if (!S.redo.length) return; if (S.playing) togglePlay(); S.undo.push(S.snapPrev); restoreSnap(S.redo.pop()); toast(T('toast_redo')); updateUndoBtns(); }
function updateUndoBtns() { document.getElementById('undo').disabled = !S.undo.length; document.getElementById('redo').disabled = !S.redo.length; }

// ----- tư thế thiết kế -----
const isRunnable = () => S.model.motors.length && S.model.links.length;
function commitPose() {
  for (const j of S.model.joints) if (S.pos[j.id]) { j.x = S.pos[j.id].x; j.y = S.pos[j.id].y; }
  S.model.theta0 = S.theta;
}
function refreshMotorPhases() {
  for (const mo of S.model.motors) {
    const r = mo.ratio ?? 1;
    if (mo.mate || mo.lin) { // pha từ tư thế thiết kế
      if (mo.lin) linMotorRetarget(mo);
      const c = (mo.mate ? mateMotorCon : linMotorCon)(S.model, { ...mo, phase: 0 }); if (!c) continue; const D = designMap(S.model);
      const rel = c.t === 'mr' ? frameAng(D, c.A) - frameAng(D, c.B) : 0;
      if (c.t === 'mr' && c.pb === 'loop') { mo.phase = rel - c.k * S.model.theta0; continue; }
      if (c.t === 'mr' && mo.base == null) mo.base = rel;
      const s = Math.max(0, Math.min(1, c.t === 'mr' ? ((rel - (mo.base || 0)) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) / (c.ang || 1) : (linWrap(c, msU(c, D)) - c.min) / ((c.max - c.min) || 1)));
      mo.phase = (c.pb === 'rec' ? (mo.phaseSign || 1) * Math.acos(1 - 2 * s) : 2 * Math.PI * Math.min(s, 1 - 1e-6)) - c.k * S.model.theta0;
      continue;
    }
    if (mo.cyl) {
      const L = getL(mo.cyl); if (!L) continue; const A = getJ(L.joints[0]), B = getJ(L.joints[1]);
      const len = Math.hypot(B.x - A.x, B.y - A.y), s = Math.max(0, Math.min(1, (len - L.cyl.min) / ((L.cyl.max - L.cyl.min) || 1)));
      const sign = mo.phaseSign || 1;
      mo.phase = sign * Math.acos(1 - 2 * s) - r * S.model.theta0;
      continue;
    }
    const k = motorRef(S.model, mo); const G = getJ(mo.joint), K = k && getJ(k);
    if (G && K) mo.phase = Math.atan2(K.y - G.y, K.x - G.x) - r * S.model.theta0;
  }
}
// bỏ phép đo mất điểm / cạnh tham chiếu (gọi cả khi sửa phác thảo, vì sketchChanged không qua rebuild)
function pruneMeasures() {
  const m = S.model, skp = new Set(m.sketch.pts.map(p => p.id)), ske = new Set(m.sketch.ents.map(e => e.id)); m.measures.forEach(me => { me.p = me.p || []; });
  m.measures = m.measures.filter(me => me.p.every(r => (r.j ? getJ(r.j) : r.sp ? skp.has(r.sp) : !r.g)) && (me.e || []).every(id => ske.has(id)));
}
// part là vật rắn (vị trí do khớp / mate quyết định): bỏ ràng buộc & kích thước phác thảo nối hình của part với hình ngoài part hoặc part khác
// (vd. tâm tròn bắt dính lên đường dẫn trước khi tạo part → bộ giải phác thảo kéo tâm trượt khỏi lỗ chốt)
function cleanSplines() {
  const sk = S.model.sketch, pm = SK.ptMap(sk), same = (a, b) => { const p = pm.get(a), q = pm.get(b); return a === b || (p && q && Math.hypot(p.x - q.x, p.y - q.y) < 1e-6); };
  for (const e of sk.ents) if (e.type === 'spline' && e.pts) {
    const pts = e.pts.filter((id, i) => !i || !same(id, e.pts[i - 1])); if (e.closed && pts.length > 2 && same(pts[0], pts[pts.length - 1])) pts.pop();
    if (pts.length !== e.pts.length) e.pts = pts;
  }
  sk.ents = sk.ents.filter(e => e.type !== 'spline' || e.pts.length >= 2);
}
// ràng buộc/kích thước nối hình của part với hình ngoài hoặc part khác (dropPartCrossCons sẽ bỏ các mục này)
function partCrossSet() {
  const sk = S.model.sketch, body = id => { const L = id && S.model.links.find(l => l.id === id); return L && L.kind === 'body' ? id : null; };
  const eo = new Map(), po = new Map();
  for (const e of sk.ents) { const b = body(e.owner); eo.set(e.id, b); for (const id of SK.entPts(e)) if (!po.has(id) || b) po.set(id, b); }
  const jo = id => { const L = S.model.links.find(l => l.kind === 'body' && l.joints.includes(id)); return L ? L.id : null; };
  const cross = c => { const o = new Set(); for (const k of ['p', 'q']) if (c[k] != null) o.add(po.get(c[k]) || null); for (const k of ['e1', 'e2']) if (c[k] != null) o.add(eo.get(c[k]) || null); if (c.j != null) o.add(jo(c.j)); return o.size > 1 && [...o].some(Boolean); };
  return new Set([...sk.cons, ...sk.dims].filter(cross));
}
function dropPartCrossCons() {
  const sk = S.model.sketch, x = partCrossSet();
  const n0 = sk.cons.length + sk.dims.length; sk.cons = sk.cons.filter(c => !x.has(c)); sk.dims = sk.dims.filter(d => !x.has(d));
  return n0 - sk.cons.length - sk.dims.length;
}
function cleanup() {
  const m = S.model;
  // hình gắn vào khâu đã mất → về nền (tọa độ thiết kế)
  const D = designMap(m);
  m.links = m.links.filter(L => L.joints.length >= 2 && L.joints.every(getJ) && !(L.kind === 'cyl' && L.joints.length !== 2));
  m.links.forEach(L => L.joints = [...new Set(L.joints)]);
  m.links = m.links.filter(L => L.joints.length >= 2);
  const used = new Set(); m.links.forEach(L => L.joints.forEach(id => used.add(id)));
  m.mates = (m.mates || []).filter(q => getL(q.a) && (!q.b || getL(q.b)) && (!q.joint || getJ(q.joint)) && (!q.k || getJ(q.k)));
  for (const q of m.mates) { if (q.joint) used.add(q.joint); if (q.k) used.add(q.k); }
  m.joints = m.joints.filter(j => used.has(j.id));
  m.slots = m.slots.filter(s => s.ent ? m.sketch.ents.some(e => e.id === s.ent) : !s.link || getL(s.link));
  for (const s of m.slots) if (s.ent) { const e = m.sketch.ents.find(q => q.id === s.ent); s.link = e.owner && getL(e.owner) ? e.owner : null; } // rãnh theo nét: khâu chủ = khâu sở hữu nét
  for (const j of m.joints) {
    if (j.slot && (!getSlot(j.slot) || j.fixed || (getSlot(j.slot).link && getL(getSlot(j.slot).link).joints.includes(j.id)))) j.slot = null;
  }
  m.motors = m.motors.filter(mo => mo.lin ? linMotorValid(m, mo) : mo.mate ? (m.mates || []).some(q => q.id === mo.mate && (q.type === 'rev' || (q.type === 'sld' && q.drv))) : mo.cyl ? (getL(mo.cyl) && getL(mo.cyl).kind === 'cyl') : (getJ(mo.joint) && getL(mo.link) && getL(mo.link).joints.includes(mo.joint) && getJ(mo.joint).fixed && getL(mo.link).kind !== 'cyl'));
  pruneMeasures(); dropPartCrossCons(); cleanSplines();
  m.sketch.cons = m.sketch.cons.filter(c => c.type !== 'atj' || getJ(c.j));
  { const ids = new Set(m.sketch.ents.map(e => e.id)); for (const j of m.joints) if (j.path && (!ids.has(j.path.ent) || j.fixed)) delete j.path; } // nét đường dẫn đã xóa → bỏ ràng buộc
  m.features = m.features.filter(f => getL(f.link));
  for (const me of m.measures) if (me.fixed && !(me.kind === 'dist' && me.p[0].j && me.p[1].j)) me.fixed = false;
  if (S.sel && !getAny(S.sel)) S.sel = null;
}
function rebuild(opts = {}) {
  cleanup();
  S.cons = compile(S.model);
  S.pos = designMap(S.model); S.theta = S.model.theta0;
  syncOwnedSketch(); solveSketch();
  S.cons.push(...contactCons());
  physPrep(); physSettle();
  S.jamLog = []; S.jamInfo = null;
  S.an = analyzeMech(S.model, S.cons, S.pos, S.theta);
  S.an.jams = S.jamLog; S.jamLog = null;
  clampLimit();
  if (!opts.noUndo) { pushUndo(); }
  if (!opts.quiet) markDirty();
  renderAll();
}
function changed() { pushUndo(); markDirty(); renderAll(); }

// ----- lắp lại với ràng buộc cho trước -----
function baseCons() { return compile(S.model, { measures: true }); }
function reassemble(cons) {
  const start = designMap(S.model), vars = movingVars(S.model);
  const soft = vars.map(id => ({ id, x: start[id].x, y: start[id].y, w: 1e-3 }));
  const r = solveLM(cons, start, { vars, theta: S.model.theta0, soft, tol: 1e-4, maxIter: 200 });
  if (!r.ok) return false;
  for (const id of vars) { const j = getJ(id); j.x = r.pos[id].x; j.y = r.pos[id].y; }
  return true;
}
function withBackup(fn) {
  const bj = S.model.joints.map(j => ({ id: j.id, x: j.x, y: j.y }));
  const ok = fn();
  if (!ok) { bj.forEach(o => { const j = getJ(o.id); if (j) { j.x = o.x; j.y = o.y; } }); toast(T('toast_cant')); renderAll(); }
  return ok;
}
// kéo khớp tự do: khâu khóa & kích thước cố định giữ cứng, rãnh giữ chốt
function dragSolveMulti(targets, start) {
  const vars = movingVars(S.model).slice();
  const cons = compile(S.model, { measures: true }).filter(c =>
    (c.t === 'd' && (c.measure || c.mate || lk(getL(c.link)).len || (getL(c.link) || {}).kind === 'body')) || c.t === 'rl' || c.t === 's' || c.t === 'ls' || c.t === 'pa' || c.t === 'tl');
  const soft = []; for (const id in targets) soft.push({ id, x: targets[id].x, y: targets[id].y, w: 1 });
  for (const id of vars) if (!targets[id]) soft.push({ id, x: start[id].x, y: start[id].y, w: 0.02 });
  return solveLM(cons, start, { vars, hardW: 100, soft, motors: false, maxIter: 80 }).pos;
}
function dragSolve(jid, target, start) {
  const j = getJ(jid), vars = movingVars(S.model).slice();
  if (j.fixed) vars.push(jid);
  const cons = compile(S.model, { measures: true }).filter(c =>
    (c.t === 'd' && (c.measure || c.mate || lk(getL(c.link)).len)) || c.t === 'rl' || c.t === 's' || c.t === 'ls' || c.t === 'pa' || c.t === 'tl');
  const soft = [{ id: jid, x: target.x, y: target.y, w: 1 }];
  for (const id of vars) if (id !== jid) soft.push({ id, x: start[id].x, y: start[id].y, w: 0.02 });
  return solveLM(cons, start, { vars, hardW: 100, soft, motors: false, maxIter: 80 }).pos;
}

// ===== Thao tác chỉnh sửa =====
function toggleFixed(jid) {
  commitPose(); const j = getJ(jid); j.fixed = !j.fixed;
  if (j.fixed) { j.slider = null; j.slot = null; } else { S.model.motors = S.model.motors.filter(m => m.joint !== jid); delete lk(j).pos; }
  rebuild();
}
function setMotor(jid, lid) {
  commitPose(); const j = getJ(jid);
  const had = S.model.motors.find(m => m.joint === jid && m.link === lid);
  S.model.motors = S.model.motors.filter(m => m.joint !== jid);
  if (!had) {
    j.fixed = true; j.slider = null; j.slot = null;
    S.model.motors.push({ id: uid('M'), joint: jid, link: lid, ratio: 1, phase: 0 }); refreshMotorPhases();
    toast(T('toast_motor_set', { j: j.name, l: getL(lid).name }));
  }
  rebuild();
}
function toggleCylMotor(lid) {
  commitPose();
  if (cylMotor(lid)) S.model.motors = S.model.motors.filter(m => m.cyl !== lid);
  else { S.model.motors.push({ id: uid('M'), cyl: lid, ratio: 1, phase: 0, phaseSign: 1 }); refreshMotorPhases(); toast(T('toast_cylmotor', { l: getL(lid).name })); }
  rebuild();
}
function setSlider(jid, angDeg) {
  commitPose(); const j = getJ(jid);
  if (j.slider && Math.abs(j.slider.ang * R2D - angDeg) < 1e-6) j.slider = null;
  else { j.slider = { ang: angDeg * D2R }; j.slot = null; delete j.path; if (j.fixed) { j.fixed = false; S.model.motors = S.model.motors.filter(m => m.joint !== jid); } }
  refreshMotorPhases(); rebuild();
}
function attachSlot(jid, sid, toastIt) {
  commitPose(); const j = getJ(jid);
  if (!sid) { j.slot = null; rebuild(); return; }
  const sl = getSlot(sid), old = { x: j.x, y: j.y };
  if (sl.ent) { // rãnh theo nét phác thảo: đặt khớp lên chân vuông góc của đường (lỗ chốt của part → dời cả part như chạy theo đường)
    const g = pathGeom(S.model, sl.ent); if (!g) return;
    const ev = pathEval(g, { x: j.x, y: j.y }, designMap(S.model)), body = S.model.links.find(L => L.kind === 'body' && L.joints.includes(jid));
    if (body) { if (!pathMoveBody(body, j, sl.ent, ev.foot)) return; } else { j.x = ev.foot.x; j.y = ev.foot.y; }
    delete j.path;
  } else { // chiếu khớp lên đường tâm rãnh
    const w = slotWorld(sl, designMap(S.model)), dx = w.b.x - w.a.x, dy = w.b.y - w.a.y, l2 = dx * dx + dy * dy || 1;
    let t = ((j.x - w.a.x) * dx + (j.y - w.a.y) * dy) / l2; t = Math.max(0, Math.min(1, t));
    j.x = w.a.x + t * dx; j.y = w.a.y + t * dy;
  }
  j.slot = sid; j.slider = null; j.fixed = false;
  S.model.motors = S.model.motors.filter(m => m.joint !== jid);
  // lắp lại để các khâu nối vào khớp vẫn đúng chiều dài
  const cons = compile(S.model, { measures: true }).map(c => c);
  const D0 = designMap(S.model); D0[jid] = old;
  for (const c of cons) if (c.t === 'd' && (c.a === jid || c.b === jid)) c.L = Math.hypot(D0[c.b].x - D0[c.a].x, D0[c.b].y - D0[c.a].y);
  reassemble(cons);
  if (toastIt) toast(T('toast_slotted', { j: j.name, s: sl.name }));
  rebuild();
}
function toggleTrace(jid) { commitPose(); const j = getJ(jid); j.trace = !j.trace; rebuild(); }
function toggleLockPos(jid) { const j = getJ(jid); if (lk(j).pos) delete j.lock.pos; else j.lock.pos = 1; changed(); }
function toggleLockLen(lid) { const L = getL(lid); if (lk(L).len) delete L.lock.len; else L.lock.len = 1; changed(); }
function flippable(jid) {
  const j = getJ(jid); if (!j || j.fixed || j.slot || j.slider) return null;
  const ls = linksOf(jid); if (ls.length !== 2 || ls.some(L => L.joints.length !== 2 || L.kind === 'cyl')) return null;
  const a = ls[0].joints.find(x => x !== jid), b = ls[1].joints.find(x => x !== jid);
  return a !== b ? [a, b] : null;
}
function flipJoint(jid) {
  const ab = flippable(jid); if (!ab) { toast(T('toast_cantflip')); return; }
  commitPose(); const cons = baseCons();
  const j = getJ(jid), A = getJ(ab[0]), B = getJ(ab[1]);
  const dx = B.x - A.x, dy = B.y - A.y, d2 = dx * dx + dy * dy || 1, t = ((j.x - A.x) * dx + (j.y - A.y) * dy) / d2;
  withBackup(() => { j.x = 2 * (A.x + t * dx) - j.x; j.y = 2 * (A.y + t * dy) - j.y; return reassemble(cons); }) && rebuild();
}
function splitJoint(jid) {
  commitPose(); const j = getJ(jid); const ls = linksOf(jid); if (ls.length < 2) return;
  for (const L of ls.slice(1)) { const nj = newJoint(j, { name: newJointName() }); L.joints = L.joints.map(x => x === jid ? nj.id : x); }
  toast(T('toast_split')); rebuild();
}
function mergeJoints(src, dst) {
  const J = getJ(src), K = getJ(dst);
  S.model.links.forEach(L => { L.joints = L.joints.map(x => x === src ? dst : x); L.joints = [...new Set(L.joints)]; });
  S.model.motors.forEach(m => { if (m.joint === src && !motorAt(dst)) m.joint = dst; });
  K.fixed = K.fixed || J.fixed; K.trace = K.trace || J.trace; if (!K.slot) K.slot = J.slot; if (!K.slider) K.slider = J.slider;
  if (J.lock && J.lock.pos) lk(K).pos = 1;
  S.model.measures.forEach(m => m.p.forEach(r => { if (r.j === src) r.j = dst; }));
  S.model.joints = S.model.joints.filter(x => x.id !== src);
  if (S.sel && S.sel.k === 'j' && S.sel.id === src) S.sel = { k: 'j', id: dst };
}
function deleteJoint(jid) {
  commitPose();
  S.model.links.forEach(L => L.joints = L.joints.filter(x => x !== jid));
  S.model.motors = S.model.motors.filter(m => m.joint !== jid);
  S.model.joints = S.model.joints.filter(j => j.id !== jid); S.sel = null; rebuild();
}
function deleteLink(lid) {
  commitPose();
  S.model.links = S.model.links.filter(L => L.id !== lid);
  S.model.motors = S.model.motors.filter(m => m.link !== lid && m.cyl !== lid); S.sel = null; rebuild();
}
function deleteSlot(sid) { commitPose(); S.model.slots = S.model.slots.filter(s => s.id !== sid); S.model.joints.forEach(j => { if (j.slot === sid) j.slot = null; }); S.sel = null; rebuild(); }
function deleteMeas(mid) { commitPose(); S.model.measures = S.model.measures.filter(s => s.id !== mid); S.sel = null; rebuild(); }
function deleteSel() {
  if (!S.sel) return; closePopover();
  if ('pekdr'.includes(S.sel.k)) { deleteSkSel(S.sel); return; }
  if (S.sel.k === 'q') { deleteMate(S.sel.id); return; }
  if (S.sel.k === 'l' && bodyOf(S.sel.id)) { deletePart(S.sel.id); return; } // xóa part → CP trở lại tự do
  if (S.sel.k === 'j' && lockedItem(S.sel)) { lockToast(); return; }
  ({ j: deleteJoint, l: deleteLink, s: deleteSlot, m: deleteMeas })[S.sel.k](S.sel.id);
}

function setLinkLen(lid, a, b, val) {
  if (!(val > 0)) return; commitPose(); const cons = baseCons();
  const ja = getJ(a), jb = getJ(b);
  withBackup(() => {
    if (ja.fixed && jb.fixed) { const d = Math.hypot(jb.x - ja.x, jb.y - ja.y) || 1; jb.x = ja.x + (jb.x - ja.x) * val / d; jb.y = ja.y + (jb.y - ja.y) * val / d; return reassemble(cons); }
    for (const c of cons) if (c.t === 'd' && !c.measure && ((c.a === a && c.b === b) || (c.a === b && c.b === a))) c.L = val;
    return reassemble(cons);
  }) && (refreshMotorPhases(), rebuild());
}
function setJointXY(jid, x, y) {
  if (guardLocked({ k: 'j', id: jid })) return;
  commitPose(); const j = getJ(jid);
  if (j.fixed) {
    if (lk(j).pos) { toast(T('toast_locked')); return; }
    const cons = baseCons();
    withBackup(() => { j.x = x; j.y = y; return reassemble(cons); }) && (refreshMotorPhases(), rebuild());
  } else {
    const r = dragSolve(jid, { x, y }, designMap(S.model));
    for (const id in r) { const q = getJ(id); if (q) { q.x = r[id].x; q.y = r[id].y; } }
    refreshMotorPhases(); rebuild();
  }
}
function setRatio(mid, v) { const mo = S.model.motors.find(m => m.id === mid); if (!mo || !v) return; commitPose(); mo.ratio = v; refreshMotorPhases(); rebuild(); }
function setDriveLink(jid, lid) { const mo = motorAt(jid); if (!mo) return; commitPose(); mo.link = lid; refreshMotorPhases(); rebuild(); }
function setSlotAngle(jid, deg) { const j = getJ(jid); if (!j.slider) return; commitPose(); j.slider.ang = deg * D2R; refreshMotorPhases(); rebuild(); }
function setLinkWidth(lid, w) { const L = getL(lid); if (!(w > 0)) return; L.w = w; changed(); }
function setCylStroke(lid, min, max) {
  const L = getL(lid); commitPose(); const A = getJ(L.joints[0]), B = getJ(L.joints[1]); const cur = Math.hypot(B.x - A.x, B.y - A.y);
  if (!(min > 0) || !(max > min)) { toast(T('toast_cant')); renderAll(); return; }
  L.cyl = { min: Math.min(min, cur), max: Math.max(max, cur) }; refreshMotorPhases(); rebuild();
}
function setSlotW(sid, w) { const s = getSlot(sid); if (!(w > 0)) return; s.w = w; changed(); }
function setSlotLen(sid, len) {
  const s = getSlot(sid); if (!(len > 0)) return; commitPose();
  const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, d = Math.hypot(dx, dy) || 1;
  s.b = { x: s.a.x + dx / d * len, y: s.a.y + dy / d * len }; rebuild();
}
function rename(sel, name) { const o = getAny(sel); if (o && name.trim()) { o.name = name.trim().slice(0, 12); changed(); } }

// ----- kích thước đo -----
function toggleMeasFixed(mid) {
  const m = getMeas(mid); if (!(m.kind === 'dist' && m.p[0].j && m.p[1].j)) return;
  commitPose(); m.fixed = !m.fixed; if (m.fixed) m.val = measValue(m, designMap(S.model)); rebuild();
}
function setMeasVal(mid, v) {
  const m = getMeas(mid); if (!(v > 0)) return; commitPose();
  if (!m.fixed) { m.fixed = true; }
  const cons = baseCons(); const old = m.val; m.val = v;
  for (const c of cons) if (c.measure === mid) c.L = v;
  if (!cons.some(c => c.measure === mid)) cons.push({ t: 'd', a: m.p[0].j, b: m.p[1].j, L: v, measure: mid });
  if (!withBackup(() => reassemble(cons))) { m.val = old; return; }
  refreshMotorPhases(); rebuild();
}
