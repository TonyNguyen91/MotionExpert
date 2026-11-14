// ===== Vẽ quỹ đạo cho điểm của phác thảo (đầu, cuối, giữa, tâm...) =====
// sk.traces = [{ id, kind: 'p' (điểm phác thảo: đầu/cuối/tâm) | 'mid' (trung điểm đoạn / giữa cung), ref }]
S.skTraces = [];
function skTraceList() { const sk = SKM(); sk.traces = sk.traces || []; return sk.traces; }
function hasSkTrace(kind, ref) { return skTraceList().some(t => t.kind === kind && t.ref === ref); }
// tọa độ thiết kế của điểm cần vẽ quỹ đạo
function skTraceBase(t, pm) {
  const sk = SKM();
  if (t.kind === 'p') { const p = pm.get(t.ref); return p ? { p, owner: S.skPtOwner.get(t.ref) || null } : null; }
  const e = sk.ents.find(x => x.id === t.ref); if (!e) return null;
  if (e.type === 'line') { const a = pm.get(e.a), b = pm.get(e.b); return { p: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, owner: e.owner || null }; }
  if (e.type === 'arc') { const I = SK.arcInfo(e, pm), m = I.a0 + I.sw / 2; return { p: { x: I.c.x + I.r * Math.cos(m), y: I.c.y + I.r * Math.sin(m) }, owner: e.owner || null }; }
  if (e.type === 'spline') { const s = SK.sample(e, pm).pts; return { p: s[Math.floor(s.length / 2)], owner: e.owner || null }; }
  return null;
}
function skTraceName(t) {
  const sk = SKM();
  if (t.kind === 'mid') { const e = sk.ents.find(x => x.id === t.ref); return e ? T(e.type === 'arc' ? 'tr_arcmid' : 'tr_mid') + ' ' + entLabel(e) : '?'; }
  const users = sk.ents.filter(e => SK.entPts(e).includes(t.ref));
  for (const e of users) {
    if ((e.type === 'circle' || e.type === 'arc') && e.c === t.ref) return T('tr_center') + ' ' + entLabel(e);
    if (e.a === t.ref) return T('tr_start') + ' ' + entLabel(e);
    if (e.b === t.ref) return T('tr_end') + ' ' + entLabel(e);
  }
  return T('k_pt');
}
// tính quỹ đạo từ các khung hình quét của phân tích
function computeSkTraces() {
  S.skTraces = [];
  const list = skTraceList(); if (!list.length || !S.an || !S.an.sweep || !S.an.sweep.length) return;
  skOwnerMap(); const pm = SK.ptMap(SKM());
  for (const t of list) {
    const b = skTraceBase(t, pm); if (!b) continue;
    const L = b.owner && getL(b.owner), fD = L && S.skFrames[L.id];
    const pts = S.an.sweep.map(f => { if (!fD) return { ...b.p }; const fN = frameOf(L, f.pos); return toWorld(fN, toLocal(fD, b.p)); });
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    S.skTraces.push({ t, pts, closed: S.an.full, w: x1 - x0, h: y1 - y0, base: b });
  }
}
function drawSkTraces() {
  if (!S.opt.trace) return;
  for (const tr of S.skTraces) {
    if (tr.pts.length < 2) continue;
    ctx.strokeStyle = colors.trace; ctx.lineWidth = 1.6; ctx.globalAlpha = .85; ctx.setLineDash([]); ctx.beginPath();
    tr.pts.forEach((p, i) => { const q = w2s(p); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }); if (tr.closed) ctx.closePath(); ctx.stroke(); ctx.globalAlpha = 1;
  }
}
// chấm cam tại điểm đang được vẽ quỹ đạo (vị trí hiện tại)
function drawSkTraceMarkers() {
  const list = skTraceList(); if (!list.length) return;
  XF = skXform(true); const pm = SK.ptMap(SKM());
  for (const t of list) {
    const b = skTraceBase(t, pm); if (!b) continue;
    const f = b.owner && XF[b.owner], q = w2s(f ? f(b.p) : b.p);
    ctx.fillStyle = colors.trace; ctx.strokeStyle = colors.sheet; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(q.x, q.y, 4, 0, TAU); ctx.fill(); ctx.stroke();
  }
}
// đổi khâu mà đường phác thảo đi theo
function setEntOwner(eids, lid) {
  skBegin(); const sk = SKM(), prev = skSnapshot();
  const done = new Set(); for (const e of sk.ents) if (eids.includes(e.id)) reownEnt(e, lid || null, done);
  sketchChanged({ prev });
}
// bật/tắt quỹ đạo; nếu điểm chưa đi theo khâu nào thì gắn vào khâu nằm dưới nó
function toggleSkTrace(kind, ref) {
  skBegin(); const sk = SKM(), list = skTraceList(), prev = skSnapshot();
  const i = list.findIndex(t => t.kind === kind && t.ref === ref);
  if (i >= 0) { list.splice(i, 1); sketchChanged({ prev }); return; }
  list.push({ id: SK.newId('t'), kind, ref });
  skOwnerMap(); const pm = SK.ptMap(sk), b = skTraceBase({ kind, ref }, pm);
  if (b && !b.owner) {
    const q = w2s(b.p), lid = hitLink(q.x, q.y);
    const ents = kind === 'p' ? sk.ents.filter(e => SK.entPts(e).includes(ref)) : sk.ents.filter(e => e.id === ref);
    if (lid) { const done = new Set(); ents.forEach(e => reownEnt(e, lid, done)); toast(T('toast_tr_own', { l: nameOf('l', lid) })); }
    else toast(T('toast_tr_static'));
  }
  sketchChanged({ prev });
}
function skTraceMenu(e) {
  const it = [], add = (label, kind, ref) => it.push({ label, check: hasSkTrace(kind, ref), act: () => toggleSkTrace(kind, ref) });
  it.push({ sub: T('tr_menu') });
  if (e.type === 'line') { add(T('tr_start'), 'p', e.a); add(T('tr_end'), 'p', e.b); add(T('tr_mid'), 'mid', e.id); }
  else if (e.type === 'circle') add(T('tr_center'), 'p', e.c);
  else if (e.type === 'arc') { add(T('tr_start'), 'p', e.a); add(T('tr_end'), 'p', e.b); add(T('tr_arcmid'), 'mid', e.id); add(T('tr_center'), 'p', e.c); }
  else if (e.type === 'spline') { add(T('tr_start'), 'p', e.pts[0]); add(T('tr_end'), 'p', e.pts[e.pts.length - 1]); add(T('tr_mid'), 'mid', e.id); }
  else if (e.type === 'point') add(T('m_trace'), 'p', e.p);
  it.push({ sub: T('m_follow') });
  it.push({ label: T('f_ground'), check: !e.owner, act: () => setEntOwner([e.id], null) });
  for (const L of S.model.links.filter(L => L.kind !== 'cyl')) it.push({ label: esc(L.name), check: e.owner === L.id, act: () => setEntOwner([e.id], L.id) });
  return it;
}
