// ===== Phác thảo trong ứng dụng: đồng bộ với khâu, giải, vẽ, công cụ =====
const SKM = () => S.model.sketch;
S.skFrames = {}; S.skPtOwner = new Map(); S.regions = []; S.featReg = {}; S.skFree = new Set(); S.skDof = 0; S.msel = []; S.skd = {}; S.cpick = []; S.csMode = false;
S.topt = { radius: 3, dist: 3, count: 4, dx: 15, dy: 0, angle: 360 };
S.opt.sketch = true; S.opt.glyph = true;
let XF = {};
const isSkTool = t => /^(sk_|cn_|ed_)/.test(t || '');
const sketchVisible = () => S.opt.sketch || isSkTool(S.tool) || S.tool === 'pathpick' || (S.sel && 'pekdr'.includes(S.sel.k));

function skOwnerMap() { const m = new Map(); for (const e of SKM().ents) if (e.owner) for (const id of SK.entPts(e)) if (!m.has(id)) m.set(id, e.owner); S.skPtOwner = m; }
function bodyDFrame(L, D) { if (!L.dframe) L.dframe = frameOf(L, D || designMap(S.model)); return L.dframe; } // khung thiết kế cố định của MP (lưu trong khâu, không theo dời)
function frameDiff(a, b) { return Math.abs(a.ox - b.ox) + Math.abs(a.oy - b.oy) + Math.abs(a.ex - b.ex) + Math.abs(a.ey - b.ey); }
function skCtx() {
  const D = designMap(S.model), frames = {};
  for (const L of S.model.links) if (L.joints.length >= 2 && L.joints.every(id => D[id])) frames[L.id] = isBody(L) ? bodyDFrame(L, D) : frameOf(L, D);
  return { ownerAng: lid => { const f = frames[lid]; return f ? Math.atan2(f.ey, f.ex) : 0; }, ownerFrame: lid => frames[lid] || null, jointPos: jid => D[jid] || null, pointOwner: pid => S.skPtOwner.get(pid) || null };
}
// khâu dời trong tư thế thiết kế → các đường thuộc khâu dời theo
function syncOwnedSketch() {
  const sk = SKM(), D = designMap(S.model); skOwnerMap(); const pm = SK.ptMap(sk);
  const done = new Set(); // điểm/ràng buộc đã đổi hệ tọa độ trong lượt này (điểm dùng chung giữa 2 nét không được đổi 2 lần)
  for (const e of sk.ents) if (e.owner && !getL(e.owner)) reownEnt(e, null, done);
  skOwnerMap();
  for (const L of S.model.links) {
    if (L.joints.length < 2 || !L.joints.every(id => D[id])) continue;
    if (isBody(L)) { S.skFrames[L.id] = bodyDFrame(L, D); continue; } // MP: phác thảo đứng yên ở khung lúc tạo, chỉ khâu MP dời theo
    const fN = frameOf(L, D), fO = S.skFrames[L.id];
    if (fO && frameDiff(fO, fN) > 1e-9) for (const [pid, own] of S.skPtOwner) if (own === L.id) { const p = pm.get(pid); if (!p) continue; const w = toWorld(fN, toLocal(fO, p)); p.x = w.x; p.y = w.y; }
    S.skFrames[L.id] = fN;
  }
}
function ptOwnerNow(sk, pid) { for (const e of sk.ents) if (e.owner && SK.entPts(e).includes(pid)) return e.owner; return null; }
function reownEnt(e, nw, done = new Set()) {
  const old = e.owner || null; if (old === nw) return;
  const D = designMap(S.model), fo = old ? (S.skFrames[old] || null) : null, L = nw && getL(nw), fn = L ? frameOf(L, D) : null;
  const ango = fo ? Math.atan2(fo.ey, fo.ex) : 0, angn = fn ? Math.atan2(fn.ey, fn.ex) : 0;
  const pts = new Set(SK.entPts(e)), sk = SKM();
  for (const c of sk.cons) {
    if (c.type === 'hv' && !done.has(c.id) && (c.e1 === e.id || (!c.e1 && (pts.has(c.p) || pts.has(c.q))))) { done.add(c.id); c.a = c.a + ango - angn; c.owner = nw; }
    if (c.type === 'fix' && pts.has(c.p) && !done.has(c.p)) { // hệ tọa độ cũ = khung của CHỦ SỞ HỮU hiện tại của điểm (điểm dùng chung có thể thuộc khâu khác)
      done.add(c.p); const po = ptOwnerNow(sk, c.p);
      if (po !== nw) { const fp = po ? (S.skFrames[po] || null) : null; const w = fp ? toWorld(fp, { u: c.x, v: c.y }) : { x: c.x, y: c.y }; if (fn) { const l = toLocal(fn, w); c.x = l.u; c.y = l.v; } else { c.x = w.x; c.y = w.y; } } }
  }
  e.owner = nw; if (nw && fn) { S.skFrames[nw] = fn; if (isBody(L)) L.dframe = fn; }
}
function solveSketch(opts = {}) {
  const sk = SKM(); skOwnerMap();
  const sys = SK.compile(sk, skCtx());
  const r = SK.solve(sys, opts.solve || {});
  if (!r.ok && opts.strict) return false;
  SK.apply(sk, sys, r.V);
  if (!opts.fast) { const s2 = SK.compile(sk, skCtx()); const a = SK.dofAnalysis(s2); S.skDof = a.dof; const free = new Set(); for (const [k, i] of s2.vidx) if (a.moving[i]) free.add(k.split('.')[0]); S.skFree = free; updateRegions(); }
  return r.ok;
}
function updateRegions() {
  const sk = SKM(); S.regions = SK.componentRegions(sk);
  S.regions.forEach((r, i) => { r.key = r.ents.join('|') + '#' + r.holeEnts.slice().sort().join('|'); r.name = 'P' + (i + 1); r.feature = null; });
  buildCompounds();
  S.featReg = {};
  for (const f of S.model.features) {
    if (f.comp) { const r = S.regions.find(x => x.kind === 'c' && x.id === f.comp && !x.feature); if (r) { S.featReg[f.id] = r; r.feature = f; } continue; }
    const r = SK.matchRegion(S.regions.filter(x => !x.feature && x.kind !== 'c'), f.ents); if (r) { S.featReg[f.id] = r; f.ents = r.ents.slice(); r.feature = f; }
  }
  let ch = false; const done = new Set();
  for (const f of S.model.features) { const r = S.featReg[f.id]; if (!r) continue; for (const id of [...r.ents, ...r.holeEnts]) { const e = sk.ents.find(x => x.id === id); if (e && !e.owner && getL(f.link)) { reownEnt(e, f.link, done); ch = true; } } }
  if (ch) skOwnerMap();
}
function regionOwner(r) { const sk = SKM(); for (const id of r.ents) { const e = sk.ents.find(x => x.id === id); if (e && e.owner) return e.owner; } return null; }
function skSnapshot() { return JSON.stringify({ sk: SKM(), f: S.model.features, c: S.model.compounds }, (k, v) => k[0] === '_' ? undefined : v); }
function skRestore(s) { const o = JSON.parse(s); S.model.sketch = o.sk; S.model.features = o.f; S.model.compounds = o.c || []; skOwnerMap(); }
function sketchChanged(opts = {}) {
  if (opts.prev) { if (!solveSketch({ strict: true })) { skRestore(opts.prev); solveSketch(); toast(T('toast_sk_fail')); renderAll(); return false; } }
  else solveSketch();
  pruneMeasures(); pushUndo(); markDirty(); renderAll(); return true;
}
// ép về tư thế thiết kế trước khi sửa phác thảo
function skBegin() {
  if (S.playing) togglePlay();
  const D = designMap(S.model);
  const moved = Math.abs(S.theta - S.model.theta0) > 1e-9 || S.model.joints.some(j => S.pos[j.id] && Math.hypot(S.pos[j.id].x - D[j.id].x, S.pos[j.id].y - D[j.id].y) > 1e-9);
  if (moved) { commitPose(); rebuild(); }
}
// skipBody = true: vị trí phác thảo (đứng yên) — bỏ qua dời của MP; mặc định: hình khâu/MP theo tư thế hiện tại
function skXform(skipBody = false) {
  const m = {}, P = S.pos;
  for (const L of S.model.links) {
    if (skipBody && isBody(L)) continue;
    const fD = S.skFrames[L.id]; if (!fD || L.joints.length < 2 || !L.joints.every(id => P[id])) continue;
    const fN = frameOf(L, P); if (frameDiff(fD, fN) < 1e-9) continue;
    m[L.id] = p => toWorld(fN, toLocal(fD, p));
  }
  return m;
}
function skP(pid, pm) { const p = pm.get(pid); if (!p) return null; const o = S.skPtOwner.get(pid); return o && XF[o] ? XF[o](p) : p; }
function sampleNow(e, pm) { const tp = new Map(); for (const id of SK.entPts(e)) tp.set(id, skP(id, pm)); return SK.sample(e, tp).pts; }
const entDefined = e => SK.entPts(e).every(id => !S.skFree.has(id)) && !(e.type === 'circle' && S.skFree.has(e.id));

// ----- vẽ -----
function skPathEnt(c, e, pm) {
  if (e.type === 'line') { const a = w2s(skP(e.a, pm)), b = w2s(skP(e.b, pm)); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); }
  else if (e.type === 'circle') { const cc = w2s(skP(e.c, pm)); c.moveTo(cc.x + e.r * S.view.s, cc.y); c.arc(cc.x, cc.y, e.r * S.view.s, 0, TAU); }
  else if (e.type === 'arc') { const C = skP(e.c, pm), A = skP(e.a, pm), B = skP(e.b, pm), r = Math.hypot(A.x - C.x, A.y - C.y); const a0 = Math.atan2(A.y - C.y, A.x - C.x), a1 = Math.atan2(B.y - C.y, B.x - C.x), cc = w2s(C), sa = w2s(A); c.moveTo(sa.x, sa.y); c.arc(cc.x, cc.y, r * S.view.s, -a0, -a1, true); }
  else if (e.type === 'spline') { sampleNow(e, pm).map(w2s).forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); }
}
function regionPath(c, r) {
  const own = regionOwner(r), f = own && XF[own]; const tp = p => w2s(f ? f(p) : p);
  c.beginPath(); for (const poly of [r.outer, ...r.holes]) { poly.forEach((p, i) => { const q = tp(p); i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y); }); c.closePath(); }
}
function regionScreenPts(r) { const own = regionOwner(r), f = own && XF[own]; return (r.kind === 'c' ? r.pts : r.outer).map(p => w2s(f ? f(p) : p)); }
// áp boolean các biên dạng lên lớp thân khâu (gọi trong drawLinkBody)
function applyFeatures(c, L) {
  for (const f of S.model.features) {
    if (f.link !== L.id) continue; const r = S.featReg[f.id]; if (!r) continue;
    c.globalCompositeOperation = f.op === 'subtract' ? 'destination-out' : f.op === 'intersect' ? 'destination-in' : 'source-over';
    drawProfMask(c, r); c.globalCompositeOperation = 'source-over';
  }
}
function featureBBoxPts(L) { const out = []; for (const f of S.model.features) if (f.link === L.id && f.op === 'union' && S.featReg[f.id]) out.push(...regionScreenPts(S.featReg[f.id])); return out; }
const GLYPH = { coinc: '•', onc: '◦', conc: '◎', par: '∥', tan: '⌒', perp: '⊥', eq: '=', mid: 'M', sym: '⇄', fix: '⚲', atj: 'J' };
function glyphText(c) { if (c.type === 'hv' && c.hv) return c.hv === 'h' ? 'H' : 'V'; if (c.type === 'hv') { const a = SK.angNorm(c.a) % Math.PI; return Math.abs(a) < 1e-6 || Math.abs(a - Math.PI) < 1e-6 ? 'H' : Math.abs(a - Math.PI / 2) < 1e-6 ? 'V' : '∠'; } return GLYPH[c.type] || '?'; }
function entAnchor(e, pm) {
  if (e.type === 'line') { const a = skP(e.a, pm), b = skP(e.b, pm); return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
  if (e.type === 'circle') { const c = skP(e.c, pm); return { x: c.x + e.r * .707, y: c.y + e.r * .707 }; }
  const s = sampleNow(e, pm); return s[Math.floor(s.length / 2)] || s[0];
}
function drawSketch() {
  const sk = SKM(); XF = skXform(true); S.glyphRects = [];
  if (!sk.ents.length && !sk.dims.length) return;
  const pm = SK.ptMap(sk), show = sketchVisible();
  // vùng kín: tô nhạt (biên dạng chưa gán), tô đậm khi trỏ/chọn
  for (const r of S.regions) {
    const hl = isSel('r', r.key) || isHov('r', r.key);
    if (!hl && (r.feature || r.usedBy || !show)) continue;
    ctx.fillStyle = hl ? colors.accent : colors.sketch; ctx.globalAlpha = hl ? .2 : r.kind === 'c' ? .12 : .07; drawProfMask(ctx, r); ctx.globalAlpha = 1;
  }
  if (!show) return;
  const skFree = colors['sk-free'] || '#2f6fd6';
  const AB = absorbMap();
  for (const e of sk.ents) {
    if (e.type === 'point') continue;
    const hl = isSel('e', e.id) || isHov('e', e.id) || S.cpick.some(p => p.k === 'e' && p.id === e.id);
    const ab = AB.get(e.id);
    if (ab && !hl) { // hình gốc đã gộp: chỉ vẽ phần nằm trên biên CP mới
      if (absorbedShown(ab)) { ctx.beginPath(); skPathEnt(ctx, e, pm); ctx.strokeStyle = colors['ink-2']; ctx.globalAlpha = .45; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; }
      ctx.beginPath(); for (const sg of absorbSegsScreen(e, ab)) sg.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y));
      ctx.strokeStyle = entDefined(e) ? colors.ink : skFree; ctx.lineWidth = 1.6; ctx.stroke(); continue;
    }
    ctx.beginPath(); skPathEnt(ctx, e, pm);
    ctx.strokeStyle = hl ? colors.accent : e.cs ? colors['ink-2'] : entDefined(e) ? colors.ink : skFree;
    ctx.lineWidth = hl ? 2.6 : e.cs ? 1 : 1.6; ctx.setLineDash(e.cs ? [6, 4] : []); ctx.stroke(); ctx.setLineDash([]);
  }
  // điểm
  const centers = new Set(sk.ents.filter(e => e.type === 'circle' || e.type === 'arc').map(e => e.c));
  const hidPts = absorbedOnlyPts(sk, AB);
  for (const id of SK.usedPts(sk)) {
    if (hidPts.has(id) && !isSel('p', id) && !isHov('p', id)) continue;
    const p = skP(id, pm); if (!p) continue; const q = w2s(p);
    const hl = isSel('p', id) || isHov('p', id) || S.cpick.some(k => k.k === 'p' && k.id === id);
    ctx.fillStyle = hl ? colors.accent : S.skFree.has(id) ? skFree : colors.ink; ctx.strokeStyle = ctx.fillStyle;
    if (centers.has(id)) { ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(q.x - 4, q.y); ctx.lineTo(q.x + 4, q.y); ctx.moveTo(q.x, q.y - 4); ctx.lineTo(q.x, q.y + 4); ctx.stroke(); }
    else ctx.fillRect(q.x - (hl ? 3.5 : 2.5), q.y - (hl ? 3.5 : 2.5), hl ? 7 : 5, hl ? 7 : 5);
  }
  for (const d of sk.dims) drawSkDim(d, pm);
  if (S.opt.glyph) drawGlyphs(sk, pm);
  drawGizmo();
}
function drawGlyphs(sk, pm) {
  const em = new Map(sk.ents.map(e => [e.id, e])), count = new Map();
  ctx.font = '600 11px ' + bodyFont(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const put = (c, P, key, perp) => {
    if (!P) return; const k = count.get(key) || 0; count.set(key, k + 1);
    const q = w2s(P), x = q.x + 9 + k * 18 + (perp ? perp.x : 0), y = q.y - 16 + (perp ? perp.y : 0);
    const hl = isSel('k', c.id) || isHov('k', c.id);
    ctx.fillStyle = hl ? colors.accent : colors.panel; ctx.strokeStyle = hl ? colors.accent : colors.line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - 8, y - 8, 16, 16, 3) : ctx.rect(x - 8, y - 8, 16, 16); ctx.fill(); ctx.stroke();
    ctx.fillStyle = hl ? colors.panel : colors['ink-2']; ctx.fillText(glyphText(c), x, y + .5);
    S.glyphRects.push({ x: x - 8, y: y - 8, w: 16, h: 16, id: c.id });
  };
  for (const c of sk.cons) {
    if (c.type === 'coinc') continue; // điểm dùng chung không cần ký hiệu
    const e1 = c.e1 && em.get(c.e1), e2 = c.e2 && em.get(c.e2);
    if (['onc', 'mid', 'fix', 'atj'].includes(c.type)) put(c, skP(c.p, pm), c.p);
    else if (c.type === 'sym') { const a = skP(c.p, pm), b = skP(c.q, pm); if (a && b) put(c, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, c.id); }
    else if (c.type === 'hv' && !c.e1) { const a = skP(c.p, pm), b = skP(c.q, pm); if (a && b) put(c, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, c.id); }
    else { if (e1) put(c, entAnchor(e1, pm), e1.id); if (e2) put(c, entAnchor(e2, pm), e2.id); }
  }
}
function drawSkDim(d, pm) {
  const sk = SKM(), em = new Map(sk.ents.map(e => [e.id, e])), e1 = d.e1 && em.get(d.e1), e2 = d.e2 && em.get(d.e2);
  const hl = isSel('d', d.id) || isHov('d', d.id), col = hl ? colors.accent : colors.ink;
  if (d.driven) Object.assign(d, dimCurrent(d)); // tham chiếu: luôn đo lại
  const dcol = d.driven ? colors.muted || '#8a8f98' : col;
  ctx.strokeStyle = dcol; ctx.fillStyle = dcol; ctx.lineWidth = 1; ctx.font = '500 11.5px ' + monoFont();
  const txt0 = d.type === 'rad' ? 'R' + d.v.toFixed(2) : d.type === 'dia' ? 'Ø' + d.v.toFixed(2) : d.type === 'ang' ? d.v.toFixed(1) + '°' : d.v.toFixed(2), txt = d.driven ? '(' + txt0 + ')' : txt0;
  const linear = (A, B) => {
    const a = w2s(A), b = w2s(B), L = Math.hypot(b.x - a.x, b.y - a.y) || 1, nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L, o = (d.off ?? 8) * S.view.s;
    const a2 = { x: a.x + nx * o, y: a.y + ny * o }, b2 = { x: b.x + nx * o, y: b.y + ny * o };
    ctx.globalAlpha = .5; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a2.x + nx * 3, a2.y + ny * 3); ctx.moveTo(b.x, b.y); ctx.lineTo(b2.x + nx * 3, b2.y + ny * 3); ctx.stroke(); ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.moveTo(a2.x, a2.y); ctx.lineTo(b2.x, b2.y); ctx.stroke();
    const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
    for (const [p, s] of [[a2, 1], [b2, -1]]) { ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + s * ux * 7 + nx * 2.5, p.y + s * uy * 7 + ny * 2.5); ctx.lineTo(p.x + s * ux * 7 - nx * 2.5, p.y + s * uy * 7 - ny * 2.5); ctx.closePath(); ctx.fill(); }
    label((a2.x + b2.x) / 2 + nx * 9, (a2.y + b2.y) / 2 + ny * 9);
  };
  const label = (x, y) => { const tw = ctx.measureText(txt).width; ctx.fillStyle = colors.sheet; ctx.fillRect(x - tw / 2 - 3, y - 8, tw + 6, 16); ctx.fillStyle = dcol; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, x, y); d._lbl = { x, y }; };
  if (d.type === 'dist') { const A = skP(d.p, pm), B = skP(d.q, pm); if (A && B) linear(A, B); }
  else if (d.type === 'dx' || d.type === 'dy') { // ngang / dọc: đường kích thước song song trục, cách trung điểm d.off
    const A = skP(d.p, pm), B = skP(d.q, pm); if (!A || !B) return; const hz = d.type === 'dx', o = d.off ?? 8;
    const A2 = hz ? { x: A.x, y: (A.y + B.y) / 2 + o } : { x: (A.x + B.x) / 2 + o, y: A.y }, B2 = hz ? { x: B.x, y: (A.y + B.y) / 2 + o } : { x: (A.x + B.x) / 2 + o, y: B.y };
    const a = w2s(A), b = w2s(B), a2 = w2s(A2), b2 = w2s(B2); ctx.globalAlpha = .5; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a2.x, a2.y); ctx.moveTo(b.x, b.y); ctx.lineTo(b2.x, b2.y); ctx.stroke(); ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.moveTo(a2.x, a2.y); ctx.lineTo(b2.x, b2.y); ctx.stroke();
    const L = Math.hypot(b2.x - a2.x, b2.y - a2.y) || 1, ux = (b2.x - a2.x) / L, uy = (b2.y - a2.y) / L;
    for (const [p, s] of [[a2, 1], [b2, -1]]) { ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + s * ux * 7 - uy * 2.5, p.y + s * uy * 7 + ux * 2.5); ctx.lineTo(p.x + s * ux * 7 + uy * 2.5, p.y + s * uy * 7 - ux * 2.5); ctx.closePath(); ctx.fill(); }
    label((a2.x + b2.x) / 2 + (hz ? 0 : 14) * Math.sign(o || 1), (a2.y + b2.y) / 2 - (hz ? 10 : 0) * Math.sign(o || 1));
  }
  else if (d.type === 'dia' && e1) { // đường kính: đường qua tâm, nhãn Ø
    const C = skP(e1.c, pm), r = e1.type === 'circle' ? e1.r : Math.hypot(skP(e1.a, pm).x - C.x, skP(e1.a, pm).y - C.y), ang = d.ang ?? Math.PI / 4;
    const P = w2s({ x: C.x + r * Math.cos(ang), y: C.y + r * Math.sin(ang) }), Q = w2s({ x: C.x - r * Math.cos(ang), y: C.y - r * Math.sin(ang) });
    ctx.beginPath(); ctx.moveTo(Q.x, Q.y); ctx.lineTo(P.x, P.y); ctx.stroke(); const L = Math.hypot(P.x - Q.x, P.y - Q.y) || 1, ux = (P.x - Q.x) / L, uy = (P.y - Q.y) / L;
    for (const [p, s] of [[P, 1], [Q, -1]]) { ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - s * ux * 7 - uy * 2.5, p.y - s * uy * 7 + ux * 2.5); ctx.lineTo(p.x - s * ux * 7 + uy * 2.5, p.y - s * uy * 7 - ux * 2.5); ctx.closePath(); ctx.fill(); }
    label(P.x + ux * 24, P.y + uy * 14);
  }
  else if (d.type === 'len' && e1) linear(skP(e1.a, pm), skP(e1.b, pm));
  else if (d.type === 'pl' && e1) { const P = skP(d.p, pm), a = skP(e1.a, pm), b = skP(e1.b, pm); if (!P) return; const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1, t = ((P.x - a.x) * dx + (P.y - a.y) * dy) / l2; linear(P, { x: a.x + t * dx, y: a.y + t * dy }); }
  else if (d.type === 'rad' && e1) {
    const C = skP(e1.c, pm), r = e1.type === 'circle' ? e1.r : Math.hypot(skP(e1.a, pm).x - C.x, skP(e1.a, pm).y - C.y), ang = d.ang ?? Math.PI / 4;
    const c = w2s(C), P = w2s({ x: C.x + r * Math.cos(ang), y: C.y + r * Math.sin(ang) });
    ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(P.x, P.y); ctx.stroke();
    const ux = (P.x - c.x) / (Math.hypot(P.x - c.x, P.y - c.y) || 1), uy = (P.y - c.y) / (Math.hypot(P.x - c.x, P.y - c.y) || 1);
    ctx.beginPath(); ctx.moveTo(P.x, P.y); ctx.lineTo(P.x - ux * 7 - uy * 2.5, P.y - uy * 7 + ux * 2.5); ctx.lineTo(P.x - ux * 7 + uy * 2.5, P.y - uy * 7 - ux * 2.5); ctx.closePath(); ctx.fill();
    label(P.x + ux * 22, P.y + uy * 14);
  } else if (d.type === 'ang' && e1 && e2) {
    const a1 = skP(e1.a, pm), b1 = skP(e1.b, pm), a2 = skP(e2.a, pm), b2 = skP(e2.b, pm), h = SK.segInt(a1, b1, a2, b2); if (!h) return;
    const c = w2s(h), d1 = Math.atan2(-(b1.y - a1.y), b1.x - a1.x), d2 = Math.atan2(-(b2.y - a2.y), b2.x - a2.x), R = 34;
    let da = d2 - d1; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
    ctx.beginPath(); ctx.arc(c.x, c.y, R, d1, d1 + da, da < 0); ctx.stroke();
    label(c.x + Math.cos(d1 + da / 2) * (R + 16), c.y + Math.sin(d1 + da / 2) * (R + 16));
  }
}

// ----- chọn trúng -----
function entScreenDist(e, x, y, pm) {
  if (e.type === 'point') { const q = w2s(skP(e.p, pm)); return Math.hypot(q.x - x, q.y - y); }
  if (e.type === 'circle') { const c = w2s(skP(e.c, pm)); return Math.abs(Math.hypot(c.x - x, c.y - y) - e.r * S.view.s); }
  const s = sampleNow(e, pm).map(w2s); let m = Infinity; for (let i = 0; i < s.length - 1; i++) m = Math.min(m, segDist(x, y, s[i], s[i + 1]).d); return m;
}
function hitSketch(x, y, kinds = 'pked') {
  const sk = SKM(); if (!sketchVisible() || (!sk.ents.length && !sk.dims.length)) return null;
  XF = skXform(true); const pm = SK.ptMap(sk);
  const AB = absorbMap(), hidPts = absorbedOnlyPts(sk, AB);
  if (kinds.includes('p')) { let best = null, bd = 8; for (const id of SK.usedPts(sk)) { if (hidPts.has(id)) continue; const p = skP(id, pm); if (!p) continue; const q = w2s(p), d = Math.hypot(q.x - x, q.y - y); if (d < bd) { bd = d; best = { k: 'p', id }; } } if (best) return best; }
  if (kinds.includes('k')) for (const g of S.glyphRects || []) if (x >= g.x && x <= g.x + g.w && y >= g.y && y <= g.y + g.h) return { k: 'k', id: g.id };
  if (kinds.includes('d')) for (const d of sk.dims) if (d._lbl && Math.hypot(d._lbl.x - x, d._lbl.y - y) < 18) return { k: 'd', id: d.id };
  if (kinds.includes('e')) { let be = null, bde = 6; for (const e of sk.ents) { const ab = AB.get(e.id); const d = ab && !absorbedShown(ab) ? segsDist(absorbSegsScreen(e, ab), x, y) : entScreenDist(e, x, y, pm); if (d < bde) { bde = d; be = { k: 'e', id: e.id }; } } return be; }
  return null;
}
function absorbedOnlyPts(sk, AB) {
  const out = new Set(); if (!AB.hidPts) return out;
  for (const [id, r] of AB.hidPts) if (!isSel('r', r.key) && !isHov('r', r.key)) out.add(id);
  return out;
}
function segsDist(segs, x, y) {
  let bd = Infinity;
  for (const sg of segs) for (let i = 0; i < sg.length - 1; i++) { const a = sg[i], b = sg[i + 1], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2)); bd = Math.min(bd, Math.hypot(a.x + t * dx - x, a.y + t * dy - y)); }
  return bd;
}
function hitRegion(x, y, onlyFree) {
  XF = skXform(true); const w = s2w(x, y);
  // ưu tiên CP ghép (chưa bị dùng), rồi vùng nhỏ nhất
  const cand = S.regions.filter(r => (!onlyFree || !r.feature) && !r.usedBy).slice().sort((a, b) => (a.kind === 'c' ? 0 : 1) - (b.kind === 'c' ? 0 : 1) || a.area - b.area);
  for (const r of cand) if (insideAtWorld(r, w)) return { k: 'r', id: r.key };
  return null;
}

// ----- bắt điểm khi phác thảo (luôn bật) -----
function projectOnEnt(e, w, pm) {
  if (e.type === 'line') { const a = skP(e.a, pm), b = skP(e.b, pm), dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1, t = ((w.x - a.x) * dx + (w.y - a.y) * dy) / l2; if (t < 0 || t > 1) return null; return { x: a.x + t * dx, y: a.y + t * dy }; }
  if (e.type === 'circle') { const c = skP(e.c, pm), d = Math.hypot(w.x - c.x, w.y - c.y) || 1; return { x: c.x + (w.x - c.x) * e.r / d, y: c.y + (w.y - c.y) * e.r / d }; }
  const s = sampleNow(e, pm); let best = null, bd = Infinity;
  for (let i = 0; i < s.length - 1; i++) { const a = s[i], b = s[i + 1], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((w.x - a.x) * dx + (w.y - a.y) * dy) / l2)), P = { x: a.x + t * dx, y: a.y + t * dy }, d = Math.hypot(P.x - w.x, P.y - w.y); if (d < bd) { bd = d; best = P; } }
  return best;
}
const isRealSnap = t => t === 'sp' || t === 'j' || t === 'mid' || t === 'on' || t === 'x'; // bắt vào đối tượng (tạo ràng buộc), khác lưới / tự do
function skSnap(x, y, ex = {}) {
  S.guides = []; const sk = SKM(); XF = skXform(true); const pm = SK.ptMap(sk), w = s2w(x, y);
  if (S.shiftDown) return { t: 'free', p: { x: w.x, y: w.y }, label: null }; // giữ Shift: tắt bắt điểm và suy luận (như Onshape)
  let best = null, bd = 10; const hidP = absorbedOnlyPts(sk, absorbMap());
  const offPart = () => false; // hình part vẫn bắt điểm được (skResolve chỉ lấy vị trí, không nối dính)
  for (const id of SK.usedPts(sk)) { if ((ex.pt && ex.pt.has(id)) || hidP.has(id) || offPart(id)) continue; const p = skP(id, pm); if (!p) continue; const q = w2s(p), d = Math.hypot(q.x - x, q.y - y); if (d < bd) { bd = d; best = { t: 'sp', id, p: { ...p }, label: ex.closeId === id ? T('sn_close') : T('sn_pt') }; } }
  if (best) return best;
  const jid = hitJoint(x, y); if (jid) return { t: 'j', id: jid, p: { ...S.pos[jid] }, label: T('sn_joint', { n: jname(jid) }) };
  const xs = skSnapX(x, y, sk, pm, ex); if (xs) return xs; // giao điểm của hai nét (đoạn thẳng, cung, tròn, spline)
  for (const e of sk.ents) if (e.type === 'line' && !(ex.ent && ex.ent.has(e.id))) { const a = skP(e.a, pm), b = skP(e.b, pm), m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, q = w2s(m); if (Math.hypot(q.x - x, q.y - y) < 8) return { t: 'mid', e: e.id, p: m, label: T('sn_mid') }; }
  let be = null, bde = 7;
  for (const e of sk.ents) { if (e.type === 'point' || (ex.ent && ex.ent.has(e.id))) continue; const pr = projectOnEnt(e, w, pm); if (!pr) continue; const q = w2s(pr), d = Math.hypot(q.x - x, q.y - y); if (d < bde) { bde = d; be = { t: 'on', e: e.id, p: pr, label: T('sn_on') }; } }
  if (be) return be;
  const p = S.opt.snap ? { x: Math.round(w.x), y: Math.round(w.y) } : { ...w };
  const cands = []; for (const id of SK.usedPts(sk)) if (!(ex.pt && ex.pt.has(id))) cands.push(skP(id, pm)); for (const j of S.model.joints) if (S.pos[j.id]) cands.push(S.pos[j.id]);
  let bx = 6, by = 6, gx = null, gy = null;
  for (const c of cands) { if (!c) continue; const q = w2s(c); if (Math.abs(q.x - x) < bx) { bx = Math.abs(q.x - x); gx = c; } if (Math.abs(q.y - y) < by) { by = Math.abs(q.y - y); gy = c; } }
  if (gx) { p.x = gx.x; S.guides.push({ axis: 'x', p: gx }); } if (gy) { p.y = gy.y; S.guides.push({ axis: 'y', p: gy }); }
  let label = null;
  if (ex.from) { const dx = p.x - ex.from.x, dy = p.y - ex.from.y, a = Math.abs(Math.atan2(dy, dx) * R2D); if (Math.hypot(dx, dy) > 1 && (a < 4 || a > 176)) { p.y = ex.from.y; label = T('sn_h'); } else if (Math.hypot(dx, dy) > 1 && Math.abs(a - 90) < 4) { p.x = ex.from.x; label = T('sn_v'); } }
  return { t: 'grid', p, label };
}
// bắt giao điểm: các nét gần con trỏ (≤ 12 px), giao từng cặp đoạn lấy mẫu; bỏ giao trùng đầu mút (đã có bắt điểm); trong 10 px
function skSnapX(x, y, sk, pm, ex) {
  const near = [];
  for (const e of sk.ents) {
    if (e.type === 'point' || (ex.ent && ex.ent.has(e.id))) continue;
    if (entScreenDist(e, x, y, pm) > 12) continue;
    const s = sampleNow(e, pm).map(w2s); if (e.type === 'circle' && s.length) s.push(s[0]); near.push({ e, s, ends: SK.entPts(e).filter(id => id !== e.c).map(id => w2s(skP(id, pm))) });
  }
  let best = null;
  for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++) {
    const A = near[i], B = near[j];
    for (let a = 0; a < A.s.length - 1; a++) for (let b = 0; b < B.s.length - 1; b++) {
      const p = A.s[a], q = A.s[a + 1], r = B.s[b], t = B.s[b + 1], d1x = q.x - p.x, d1y = q.y - p.y, d2x = t.x - r.x, d2y = t.y - r.y, den = d1x * d2y - d1y * d2x; if (Math.abs(den) < 1e-9) continue;
      const u = ((r.x - p.x) * d2y - (r.y - p.y) * d2x) / den, v = ((r.x - p.x) * d1y - (r.y - p.y) * d1x) / den; if (u < 0 || u > 1 || v < 0 || v > 1) continue;
      const X = { x: p.x + u * d1x, y: p.y + u * d1y }, d = Math.hypot(X.x - x, X.y - y); if (d > 10) continue;
      if ([...A.ends, ...B.ends].some(q2 => Math.hypot(q2.x - X.x, q2.y - X.y) < 2)) continue; // giao tại đầu mút: để bắt điểm xử lý
      if (!best || d < best.d) best = { d, X, e1: A.e.id, e2: B.e.id };
    }
  }
  if (!best) return null;
  const em = new Map(sk.ents.map(e => [e.id, e])), p = refineX(em.get(best.e1), em.get(best.e2), s2w(best.X.x, best.X.y), pm);
  return { t: 'x', e: best.e1, e2: best.e2, p, label: T('sn_x') };
}
// giao điểm chính xác gần điểm gần đúng w: giải tích cho đoạn thẳng / cung / tròn, chiếu luân phiên khi có spline
function refineX(A, B, w, pm) {
  const geo = e => { if (e.type === 'line') { const a = skP(e.a, pm), b = skP(e.b, pm); return { k: 'l', a, d: { x: b.x - a.x, y: b.y - a.y } }; }
    if (e.type === 'circle' || e.type === 'arc') { const c = skP(e.c, pm), r = e.type === 'circle' ? e.r : Math.hypot(skP(e.a, pm).x - c.x, skP(e.a, pm).y - c.y); return { k: 'c', c, r }; } return null; };
  const g1 = geo(A), g2 = geo(B), pick = L => L.length ? L.reduce((m, q) => Math.hypot(q.x - w.x, q.y - w.y) < Math.hypot(m.x - w.x, m.y - w.y) ? q : m) : w;
  const lc = (l, c) => { const fx = l.a.x - c.c.x, fy = l.a.y - c.c.y, aa = l.d.x * l.d.x + l.d.y * l.d.y, bb = 2 * (fx * l.d.x + fy * l.d.y), cc = fx * fx + fy * fy - c.r * c.r, D = bb * bb - 4 * aa * cc; if (D < 0 || aa < 1e-12) return []; return [-1, 1].map(sg => { const t = (-bb + sg * Math.sqrt(D)) / (2 * aa); return { x: l.a.x + t * l.d.x, y: l.a.y + t * l.d.y }; }); };
  if (g1 && g2) {
    if (g1.k === 'l' && g2.k === 'l') { const den = g1.d.x * g2.d.y - g1.d.y * g2.d.x; if (Math.abs(den) > 1e-12) { const t = ((g2.a.x - g1.a.x) * g2.d.y - (g2.a.y - g1.a.y) * g2.d.x) / den; return { x: g1.a.x + t * g1.d.x, y: g1.a.y + t * g1.d.y }; } return w; }
    if (g1.k === 'l') return pick(lc(g1, g2)); if (g2.k === 'l') return pick(lc(g2, g1));
    const dx = g2.c.x - g1.c.x, dy = g2.c.y - g1.c.y, d = Math.hypot(dx, dy); if (d < 1e-12 || d > g1.r + g2.r || d < Math.abs(g1.r - g2.r)) return w;
    const a = (g1.r * g1.r - g2.r * g2.r + d * d) / (2 * d), h = Math.sqrt(Math.max(0, g1.r * g1.r - a * a)), mx = g1.c.x + a * dx / d, my = g1.c.y + a * dy / d;
    return pick([{ x: mx - h * dy / d, y: my + h * dx / d }, { x: mx + h * dy / d, y: my - h * dx / d }]);
  }
  let q = w; for (let i = 0; i < 60; i++) { const p1 = projectOnEnt(A, q, pm) || q, p2 = projectOnEnt(B, p1, pm) || p1; if (Math.hypot(p2.x - q.x, p2.y - q.y) < 1e-7) { q = p2; break; } q = p2; } // có spline
  return q;
}
function skResolve(sn) {
  const sk = SKM(), onPart = e => !!bodyOf((sk.ents.find(q => q.id === e) || {}).owner);
  // hình part (khóa, vật rắn): chỉ lấy vị trí bắt được — không dùng chung điểm, không thêm ràng buộc (tránh xung đột, dropPartCrossCons)
  if (sn.t === 'sp' && !bodyOf(S.skPtOwner.get(sn.id))) return sn.id;
  const id = SK.addPt(sk, sn.p.x, sn.p.y);
  if (sn.t === 'sp' || ((sn.t === 'mid' || sn.t === 'on') && onPart(sn.e))) return id;
  if (sn.t === 'x') { for (const e of [sn.e, sn.e2]) if (!onPart(e)) sk.cons.push({ id: SK.newId('k'), type: 'onc', p: id, e1: e }); return id; }
  if (sn.t === 'j') sk.cons.push({ id: SK.newId('k'), type: 'atj', p: id, j: sn.id });
  else if (sn.t === 'mid') sk.cons.push({ id: SK.newId('k'), type: 'mid', p: id, e1: sn.e });
  else if (sn.t === 'on') sk.cons.push({ id: SK.newId('k'), type: 'onc', p: id, e1: sn.e });
  return id;
}
function addEnt(o) { const e = { id: SK.newId('e'), cs: S.csMode, owner: null, ...o }; SKM().ents.push(e); return e; }
function autoHV(e) {
  if (S.shiftDown) return;
  const pm = SK.ptMap(SKM()), a = pm.get(e.a), b = pm.get(e.b), ang = Math.abs(Math.atan2(b.y - a.y, b.x - a.x) * R2D);
  if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-6) return;
  if (ang < 4 || ang > 176) SKM().cons.push({ id: SK.newId('k'), type: 'hv', hv: 'h', e1: e.id, a: 0, owner: null });
  else if (Math.abs(ang - 90) < 4) SKM().cons.push({ id: SK.newId('k'), type: 'hv', hv: 'v', e1: e.id, a: Math.PI / 2, owner: null });
}
function circum(p1, p2, p3) {
  const ax = p1.x, ay = p1.y, bx = p2.x, by = p2.y, cx = p3.x, cy = p3.y, d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by)); if (Math.abs(d) < 1e-9) return null;
  const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d, uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
  return { x: ux, y: uy, r: Math.hypot(ax - ux, ay - uy) };
}

// ----- công cụ phác thảo -----
function skToolDown(x, y) {
  const t = S.tool, sk = SKM();
  if (t.startsWith('cn_')) return consPick(x, y);
  if (t.startsWith('ed_')) return editPick(x, y);
  const sn = S.snap || skSnap(x, y, { from: S.skd.lastP });
  const prev = skSnapshot();
  if (skToolDown2(t, sn, prev)) return;
  if (t === 'sk_line') {
    if (!S.skd.last) { S.skd = { existing: new Set(SK.usedPts(sk)), last: skResolve(sn), lastP: { ...sn.p } }; draw(); return; }
    const a = S.skd.last, b = skResolve(sn); if (b === a) return;
    const e = addEnt({ type: 'line', a, b }); autoHV(e);
    const closed = sn.t === 'sp' && S.skd.existing.has(b);
    S.skd.last = b; S.skd.lastP = { ...sn.p }; S.skd.lastEnt = e.id;
    if (closed) S.skd = {};
    sketchChanged({ prev }); updateHint(); return;
  }
  if (t === 'sk_point') { const id = skResolve(sn); addEnt({ type: 'point', p: id }); sketchChanged({ prev }); return; }
  S.skd.clicks = S.skd.clicks || [];
  if (t === 'sk_spline') { const lc = S.skd.clicks[S.skd.clicks.length - 1]; if (lc && Math.hypot(lc.p.x - sn.p.x, lc.p.y - sn.p.y) < 1e-6) return; }
  S.skd.clicks.push(sn); S.skd.lastP = { ...sn.p };
  const C = S.skd.clicks;
  if (t === 'sk_crect' && C.length === 2) { // chữ nhật tâm: bấm tâm rồi bấm góc; hai đường chéo dựng hình, tâm là trung điểm của cả hai
    const c = C[0].p, b = C[1].p; if (Math.abs(c.x - b.x) < 1e-6 || Math.abs(c.y - b.y) < 1e-6) { S.skd = {}; return; }
    const pc = skResolve(C[0]), p3 = skResolve(C[1]), p1 = SK.addPt(sk, 2 * c.x - b.x, 2 * c.y - b.y), p2 = SK.addPt(sk, b.x, 2 * c.y - b.y), p4 = SK.addPt(sk, 2 * c.x - b.x, b.y);
    const ls = [[p1, p2, 0], [p2, p3, Math.PI / 2], [p3, p4, 0], [p4, p1, Math.PI / 2]].map(([u, v, ang]) => { const e = addEnt({ type: 'line', a: u, b: v }); sk.cons.push({ id: SK.newId('k'), type: 'hv', hv: ang ? 'v' : 'h', e1: e.id, a: ang, owner: null }); return e; });
    for (const [u, v] of [[p1, p3], [p2, p4]]) { const e = addEnt({ type: 'line', a: u, b: v, cs: true }); sk.cons.push({ id: SK.newId('k'), type: 'mid', p: pc, e1: e.id }); }
    S.skd = {}; sketchChanged({ prev }); return;
  }
  if (t === 'sk_rect' && C.length === 2) {
    const a = C[0].p, b = C[1].p; if (Math.abs(a.x - b.x) < 1e-6 || Math.abs(a.y - b.y) < 1e-6) { S.skd = {}; return; }
    const p1 = skResolve(C[0]), p3 = skResolve(C[1]), p2 = SK.addPt(sk, b.x, a.y), p4 = SK.addPt(sk, a.x, b.y);
    const ls = [[p1, p2, 0], [p2, p3, Math.PI / 2], [p3, p4, 0], [p4, p1, Math.PI / 2]].map(([u, v, ang]) => { const e = addEnt({ type: 'line', a: u, b: v }); sk.cons.push({ id: SK.newId('k'), type: 'hv', hv: ang ? 'v' : 'h', e1: e.id, a: ang, owner: null }); return e; });
    S.skd = {}; sketchChanged({ prev }); return;
  }
  if (t === 'sk_circle' && C.length === 2) {
    const c = skResolve(C[0]), r = Math.hypot(C[1].p.x - C[0].p.x, C[1].p.y - C[0].p.y); if (r < 1e-3) { S.skd = {}; return; }
    const e = addEnt({ type: 'circle', c, r });
    if (isRealSnap(C[1].t)) { const pid = skResolve(C[1]); sk.cons.push({ id: SK.newId('k'), type: 'onc', p: pid, e1: e.id }); }
    S.skd = {}; sketchChanged({ prev }); return;
  }
  if ((t === 'sk_circle3' || t === 'sk_arc') && C.length === 3) {
    const cc = circum(C[0].p, C[1].p, C[2].p); if (!cc) { S.skd = {}; toast(T('h_cons_bad', { t: '' })); draw(); return; }
    const c = SK.addPt(sk, cc.x, cc.y);
    let made;
    if (t === 'sk_circle3') {
      const e = made = addEnt({ type: 'circle', c, r: cc.r });
      for (const s of C) if (isRealSnap(s.t)) sk.cons.push({ id: SK.newId('k'), type: 'onc', p: skResolve(s), e1: e.id });
    } else {
      const p1 = skResolve(C[0]), p2 = skResolve(C[1]);
      const ang = p => SK.angNorm(Math.atan2(p.y - cc.y, p.x - cc.x));
      const a0 = ang(C[0].p), sw = SK.angNorm(ang(C[1].p) - a0), t3 = SK.angNorm(ang(C[2].p) - a0);
      const e = made = addEnt(t3 <= sw ? { type: 'arc', c, a: p1, b: p2 } : { type: 'arc', c, a: p2, b: p1 });
      if (isRealSnap(C[2].t)) sk.cons.push({ id: SK.newId('k'), type: 'onc', p: skResolve(C[2]), e1: e.id });
    }
    S.skd = {}; sketchChanged({ prev }); return;
  }
  if (t === 'sk_spline') {
    const first = C[0];
    if (C.length >= 4 && sn.t === 'sp' && first.t === 'sp' && sn.id === first.id) { C.pop(); finishSpline(true, prev); return; }
    if (C.length >= 4 && Math.hypot(sn.p.x - first.p.x, sn.p.y - first.p.y) < 1e-6) { C.pop(); finishSpline(true, prev); return; }
  }
  draw(); updateHint();
}
function finishSpline(closed, prev) {
  const C = S.skd.clicks || []; if (C.length < 2) { S.skd = {}; draw(); return; }
  prev = prev || skSnapshot();
  const ids = C.filter((c, i) => !i || Math.hypot(c.p.x - C[i - 1].p.x, c.p.y - C[i - 1].p.y) > 1e-6).map(skResolve); if (ids.length < 2) { S.skd = {}; draw(); return; }
  addEnt({ type: 'spline', pts: ids, closed: !!closed && ids.length >= 3 });
  S.skd = {}; sketchChanged({ prev });
}
function skFinish() { // Enter / bấm đúp / chuột phải
  if (S.tool === 'sk_spline') { finishSpline(false); return; }
  if (S.tool === 'sk_line') { S.skd = {}; SK.pruneRefs(SKM()); draw(); updateHint(); return; } // kết thúc chuỗi đoạn thẳng, công cụ vẫn bật (như Onshape)
  if (S.tool === 'cn_dim' && S.cpick.length) { const spec = S.cursor && dimSpec(S.cpick, S.cursor.w); if (spec) placeDim(spec); S.cpick = []; draw(); }
}

// ----- ràng buộc -----
const CONS_TOOLS = ['coinc', 'conc', 'par', 'tan', 'horiz', 'vert', 'perp', 'eq', 'mid', 'sym', 'fix', 'dim'];
function consPick(x, y) {
  const type = S.tool.slice(3);
  if (type === 'dim') return dimPick(x, y);
  const h = hitSketch(x, y, 'pe');
  if (!h || guardLocked(h)) return;
  if (!S.cpick.some(p => p.k === h.k && p.id === h.id)) S.cpick.push(h);
  const r = type === 'dim' ? tryDim(S.cpick) : tryCons(type, S.cpick);
  if (r === 'bad') { toast(T('h_cons_bad', { t: T('t_cn_' + type) })); S.cpick = []; }
  if (r === 'done') S.cpick = []; // công cụ vẫn bật để áp tiếp (Esc để thoát)
  draw(); updateHint();
}
function applyConsToSelection(type) {
  const picks = S.msel.filter(p => p.k === 'p' || p.k === 'e');
  if (!picks.length) return false;
  if (picks.some(lockedItem)) { lockToast(); return true; }
  const r = type === 'dim' ? tryDim(picks) : tryCons(type, picks);
  if (r === 'done') { S.msel = []; return true; }
  return false;
}
function tryCons(type, picks) {
  const sk = SKM(), em = new Map(sk.ents.map(e => [e.id, e])), pm = SK.ptMap(sk);
  const E = picks.filter(p => p.k === 'e').map(p => em.get(p.id)).filter(Boolean), P = picks.filter(p => p.k === 'p').map(p => p.id);
  const lines = E.filter(e => e.type === 'line'), circs = E.filter(e => e.type === 'circle' || e.type === 'arc');
  const add = list => { const prev = skSnapshot(); for (const c of list) sk.cons.push({ id: SK.newId('k'), ...c }); if (sketchChanged({ prev })) toast(T('h_cons_ok', { t: T('t_cn_' + type) })); return 'done'; };
  const n = picks.length;
  if (n > 2) { // nhiều đối tượng chọn sẵn: ràng buộc từng cái với cái đầu tiên
    if (type === 'coinc' && P.length === n) return add(P.slice(1).map(q => ({ type: 'coinc', p: P[0], q })));
    if ((type === 'eq' || type === 'par') && lines.length === n) return add(lines.slice(1).map(l => ({ type, e1: lines[0].id, e2: l.id })));
    if (type === 'eq' && circs.length === n) return add(circs.slice(1).map(c => ({ type: 'eq', e1: circs[0].id, e2: c.id })));
    if (type === 'conc' && circs.length === n) return add(circs.slice(1).map(c => ({ type: 'conc', e1: circs[0].id, e2: c.id })));
  }
  switch (type) {
    case 'coinc': if (P.length === 2) return add([{ type: 'coinc', p: P[0], q: P[1] }]); if (P.length === 1 && E.length === 1) return add([{ type: 'onc', p: P[0], e1: E[0].id }]); return n < 2 ? 'more' : 'bad';
    case 'conc': if (circs.length === 2) return add([{ type: 'conc', e1: circs[0].id, e2: circs[1].id }]); return n < 2 && (circs.length === n) ? 'more' : 'bad';
    case 'par': case 'perp': if (lines.length === 2) return add([{ type, e1: lines[0].id, e2: lines[1].id }]); return n < 2 && lines.length === n ? 'more' : 'bad';
    case 'eq': if (lines.length === 2) return add([{ type: 'eq', e1: lines[0].id, e2: lines[1].id }]); if (circs.length === 2) return add([{ type: 'eq', e1: circs[0].id, e2: circs[1].id }]); return n < 2 && !P.length ? 'more' : 'bad';
    case 'tan': {
      if (E.length < 2) return n < 2 && !P.length ? 'more' : 'bad';
      const [a, b] = E; if (a.type === 'line' && b.type === 'line') return 'bad';
      let s = 1;
      if (a.type === 'line' || b.type === 'line') { const L = a.type === 'line' ? a : b, C = L === a ? b : a, p1 = pm.get(L.a), p2 = pm.get(L.b), c = pm.get(C.c), dx = p2.x - p1.x, dy = p2.y - p1.y; s = ((c.x - p1.x) * dy - (c.y - p1.y) * dx) >= 0 ? 1 : -1; }
      else { const r1 = a.type === 'circle' ? a.r : Math.hypot(pm.get(a.a).x - pm.get(a.c).x, pm.get(a.a).y - pm.get(a.c).y), r2 = b.type === 'circle' ? b.r : Math.hypot(pm.get(b.a).x - pm.get(b.c).x, pm.get(b.a).y - pm.get(b.c).y), d = Math.hypot(pm.get(a.c).x - pm.get(b.c).x, pm.get(a.c).y - pm.get(b.c).y); s = Math.abs(d - (r1 + r2)) <= Math.abs(d - Math.abs(r1 - r2)) ? 1 : -1; }
      return add([{ type: 'tan', e1: a.id, e2: b.id, s }]);
    }
    case 'horiz': case 'vert': {
      const a = type === 'horiz' ? 0 : Math.PI / 2;
      if (lines.length && lines.length === E.length && !P.length) return add(lines.map(l => ({ type: 'hv', hv: type === 'horiz' ? 'h' : 'v', e1: l.id, a: a - (l.owner ? skCtx().ownerAng(l.owner) : 0), owner: l.owner || null })));
      if (P.length === 2 && !E.length) { const own = S.skPtOwner.get(P[0]) || null; return add([{ type: 'hv', hv: type === 'horiz' ? 'h' : 'v', p: P[0], q: P[1], a: a - (own ? skCtx().ownerAng(own) : 0), owner: own }]); }
      return P.length === 1 && !E.length ? 'more' : 'bad';
    }
    case 'mid': if (P.length === 1 && lines.length === 1) return add([{ type: 'mid', p: P[0], e1: lines[0].id }]); return n < 2 ? 'more' : 'bad';
    case 'sym': if (P.length === 2 && lines.length === 1) return add([{ type: 'sym', p: P[0], q: P[1], e1: lines[0].id }]); return n < 3 ? 'more' : 'bad';
    case 'fix': {
      const pts = new Set(P); E.forEach(e => SK.entPts(e).forEach(id => pts.add(id)));
      const ctxs = skCtx();
      return add([...pts].filter(id => !sk.cons.some(c => c.type === 'fix' && c.p === id)).map(id => { const p = pm.get(id), own = S.skPtOwner.get(id), f = own && ctxs.ownerFrame(own); if (f) { const l = toLocal(f, p); return { type: 'fix', p: id, x: l.u, y: l.v }; } return { type: 'fix', p: id, x: p.x, y: p.y }; }));
    }
  }
  return 'bad';
}
function tryDim(picks) {
  const sk = SKM(), em = new Map(sk.ents.map(e => [e.id, e]));
  const [a, b] = picks; const ea = a && a.k === 'e' && em.get(a.id), eb = b && b.k === 'e' && em.get(b.id);
  if (picks.length === 1) {
    if (ea && (ea.type === 'circle' || ea.type === 'arc')) { makeDim({ type: 'rad', e1: ea.id }); return 'done'; }
    if (a.k === 'p' || (ea && ea.type === 'line')) return 'more';
    return 'bad';
  }
  if (a.k === 'p' && b.k === 'p') { makeDim({ type: 'dist', p: a.id, q: b.id }); return 'done'; }
  if (a.k === 'p' && eb && eb.type === 'line') { makeDim({ type: 'pl', p: a.id, e1: eb.id }); return 'done'; }
  if (b.k === 'p' && ea && ea.type === 'line') { makeDim({ type: 'pl', p: b.id, e1: ea.id }); return 'done'; }
  if (ea && eb && ea.type === 'line' && eb.type === 'line') {
    const pm = SK.ptMap(sk), d1 = { x: pm.get(ea.b).x - pm.get(ea.a).x, y: pm.get(ea.b).y - pm.get(ea.a).y }, d2 = { x: pm.get(eb.b).x - pm.get(eb.a).x, y: pm.get(eb.b).y - pm.get(eb.a).y };
    const cr = d1.x * d2.y - d1.y * d2.x;
    if (Math.abs(cr) / (Math.hypot(d1.x, d1.y) * Math.hypot(d2.x, d2.y)) < 1e-3) makeDim({ type: 'pl', p: eb.a, e1: ea.id });
    else makeDim({ type: 'ang', e1: ea.id, e2: eb.id });
    return 'done';
  }
  return 'bad';
}
function dimCurrent(d) {
  const sk = SKM(), pm = SK.ptMap(sk), em = new Map(sk.ents.map(e => [e.id, e])), e1 = d.e1 && em.get(d.e1), e2 = d.e2 && em.get(d.e2);
  if (d.type === 'dist') { const p = pm.get(d.p), q = pm.get(d.q); return { v: Math.hypot(q.x - p.x, q.y - p.y) }; }
  if (d.type === 'dx' || d.type === 'dy') { const p = pm.get(d.p), q = pm.get(d.q), k = d.type === 'dx' ? 'x' : 'y'; return { v: Math.abs(q[k] - p[k]), s: q[k] >= p[k] ? 1 : -1 }; }
  if (d.type === 'dia') return { v: 2 * (e1.type === 'circle' ? e1.r : Math.hypot(pm.get(e1.a).x - pm.get(e1.c).x, pm.get(e1.a).y - pm.get(e1.c).y)) };
  if (d.type === 'len') { const a = pm.get(e1.a), b = pm.get(e1.b); return { v: Math.hypot(b.x - a.x, b.y - a.y) }; }
  if (d.type === 'rad') return { v: e1.type === 'circle' ? e1.r : Math.hypot(pm.get(e1.a).x - pm.get(e1.c).x, pm.get(e1.a).y - pm.get(e1.c).y) };
  if (d.type === 'pl') { const P = pm.get(d.p), a = pm.get(e1.a), b = pm.get(e1.b), dx = b.x - a.x, dy = b.y - a.y; return { v: Math.abs(((P.x - a.x) * dy - (P.y - a.y) * dx) / (Math.hypot(dx, dy) || 1)) }; }
  if (d.type === 'ang') { const a = { x: pm.get(e1.b).x - pm.get(e1.a).x, y: pm.get(e1.b).y - pm.get(e1.a).y }, b = { x: pm.get(e2.b).x - pm.get(e2.a).x, y: pm.get(e2.b).y - pm.get(e2.a).y }; const phi = Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y); return { v: Math.abs(phi) * R2D, sign: phi >= 0 ? 1 : -1 }; }
  return { v: 0 };
}
function makeDim(o) {
  const sk = SKM(), prev = skSnapshot(); const d = { id: SK.newId('d'), off: 8, ...o }; Object.assign(d, dimCurrent(d));
  sk.dims.push(d);
  if (!sketchChanged({ prev })) return;
  S.sel = { k: 'd', id: d.id }; S.msel = [S.sel]; renderAll(); openPopover(S.sel);
  setTimeout(() => { const el = document.querySelector('#popBody input[type=number]'); if (el) { el.focus(); el.select(); } }, 30);
}
function setDimVal(did, v) {
  if (guardLocked({ k: 'd', id: did })) return;
  const sk = SKM(), d = sk.dims.find(x => x.id === did); if (!d || !(v > 0) && d.type !== 'ang') return;
  const prev = skSnapshot(); skBegin(); d.v = v; if (sketchChanged({ prev })) toast(T('toast_dim_set'));
}
// đặt nhanh chiều dài / bán kính từ ô nhập
function setEntSize(eid, v) {
  if (guardLocked({ k: 'e', id: eid })) return;
  const sk = SKM(), e = sk.ents.find(x => x.id === eid); if (!e || !(v > 0)) return;
  if (e.type === 'circle' && sk.dims.some(x => x.type === 'dia' && x.e1 === eid && !x.driven)) { dimEnt(eid, 'dia', 2 * v); return; } // tròn đã có kích thước đường kính
  const type = e.type === 'line' ? 'len' : 'rad'; let d = sk.dims.find(x => x.type === type && x.e1 === eid);
  const prev = skSnapshot(); skBegin();
  if (!d) { d = { id: SK.newId('d'), type, e1: eid, off: 8, v }; sk.dims.push(d); } else d.v = v;
  sketchChanged({ prev });
}

// ----- công cụ chỉnh sửa -----
function cornerPointNear(x, y) {
  const sk = SKM(), pm = SK.ptMap(sk); let best = null, bd = 16;
  for (const id of SK.usedPts(sk)) { const n = sk.ents.filter(e => e.type === 'line' && (e.a === id || e.b === id)).length; if (n !== 2) continue; const q = w2s(skP(id, pm)), d = Math.hypot(q.x - x, q.y - y); if (d < bd) { bd = d; best = id; } }
  return best;
}
function chainOf(eid) {
  const sk = SKM(), set = new Set([eid]); let grew = true;
  while (grew) { grew = false; for (const e of sk.ents) { if (set.has(e.id) || e.cs || !['line', 'arc'].includes(e.type)) continue; const pts = [e.a, e.b]; if ([...set].some(id => { const f = sk.ents.find(x => x.id === id); return f && ['line', 'arc'].includes(f.type) && (pts.includes(f.a) || pts.includes(f.b)); })) { set.add(e.id); grew = true; } } }
  return [...set];
}
function editPick(x, y) {
  const t = S.tool, sk = SKM(), w = s2w(x, y), prev = skSnapshot();
  if (t === 'ed_fillet') return filletPick(x, y);
  if (t === 'ed_offset') return offsetPick(x, y);
  if (t === 'ed_mirror') return mirrorPick(x, y);
  const h = hitSketch(x, y, 'e'); if (!h || guardLocked(h)) return;
  if (t === 'ed_trim') { if (!SK.trim(sk, h.id, w)) { toast(T('toast_trim_bad')); return; } sketchChanged({ prev }); return; }
  if (t === 'ed_extend') { if (!SK.extend(sk, h.id, w)) { toast(T('toast_extend_bad')); return; } sketchChanged({ prev }); return; }
  if (t === 'ed_split') { if (!SK.split(sk, h.id, w)) { toast(T('toast_trim_bad')); return; } sketchChanged({ prev }); return; }
}
// đối xứng gương: bấm đường thẳng làm trục trước (giữ trong S.cpick, được tô sáng), rồi bấm từng đối tượng cần lật — nét hoặc vùng kín (CP);
// mỗi lần bấm là một bước hoàn tác, công cụ vẫn giữ trục để bấm tiếp. Esc: chọn lại trục, Esc lần nữa: thoát
function mirrorPick(x, y) {
  const sk = SKM(), axis = S.cpick[0] && sk.ents.find(e => e.id === S.cpick[0].id);
  if (!axis) {
    const h = hitSketch(x, y, 'e'), e = h && sk.ents.find(q => q.id === h.id);
    if (!e || e.type !== 'line') { toast(T('toast_mirror_axis')); return; }
    S.cpick = [h];
    const pre = S.msel.filter(p => p.k === 'e' && p.id !== h.id).map(p => p.id); // đã chọn sẵn đối tượng trước khi bật lệnh → lật luôn
    if (pre.length) mirrorEnts(pre, h.id);
    updateHint(); draw(); return;
  }
  const h = hitSketch(x, y, 'e'); let ids = null;
  if (h && h.id !== axis.id) ids = [h.id];
  else if (!h) { const r = hitRegion(x, y), reg = r && regionByKey(r.id); if (reg) ids = [...new Set([...reg.ents, ...(reg.holeEnts || [])])].filter(id => id !== axis.id); }
  if (!ids || !ids.length) return;
  if (ids.some(id => lockedItem({ k: 'e', id }))) { lockToast(); return; }
  mirrorEnts(ids, axis.id);
}
function mirrorEnts(ids, axisId) {
  const sk = SKM(), prev = skSnapshot(), before = new Set(sk.pts.map(p => p.id)), made = SK.mirror(sk, ids, axisId);
  if (!made || !made.length) { toast(T('h_cons_bad', { t: T('t_e_mirror') })); return; }
  // lật từng nét một: đầu mút nét mới trùng chỗ đầu mút nét đã có → gộp thành một điểm (giữ đường bao liền, vùng kín đúng)
  const pm = SK.ptMap(sk), used = SK.usedPts(sk), old = [...used].filter(id => before.has(id)).map(id => ({ id, p: pm.get(id) }));
  for (const id of [...used].filter(id => !before.has(id))) { const q = pm.get(id), hit = q && old.find(o => o.p && Math.hypot(o.p.x - q.x, o.p.y - q.y) < 1e-6); if (hit) skMergePts(id, hit.id); }
  S.msel = []; S.sel = null; sketchChanged({ prev }); toast(T('toast_mirrored', { n: made.length }));
}
function applyPattern() {
  const ids = S.msel.filter(p => p.k === 'e').map(p => p.id); if (!ids.length) { toast(T('toast_select_first')); return; }
  const sk = SKM(), prev = skSnapshot(), o = S.topt; let made;
  if (S.tool === 'ed_lpat') made = SK.linPattern(sk, ids, Math.max(2, Math.round(o.count)), +o.dx, +o.dy);
  else { const cp = S.msel.find(p => p.k === 'p'), c = cp ? SK.ptMap(sk).get(cp.id) : { x: 0, y: 0 }; made = SK.circPattern(sk, ids, c.x, c.y, Math.max(2, Math.round(o.count)), +o.angle); }
  if (sketchChanged({ prev })) { toast(T('toast_pattern', { n: made.length })); toolDone(); }
}
function renderToolOpts() {
  const box = document.getElementById('topts'), t = S.tool; let h = '';
  const f = (k, label, unit, step = 0.5) => `<label class="kbd" for="to_${k}">${label}</label><span class="unit" data-u="${unit}"><input type="number" id="to_${k}" data-k="${k}" step="${step}" value="${S.topt[k]}"></span>`;
  if (t === 'ed_fillet') h = f('radius', T('o_radius'), 'mm');
  else if (t === 'ed_offset') h = f('dist', T('o_dist'), 'mm');
  else if (t === 'ed_lpat') h = f('count', T('o_count'), '×', 1) + f('dx', T('o_dx'), 'mm') + f('dy', T('o_dy'), 'mm') + `<button class="btn" id="toApply">${T('o_accept')}</button>`;
  else if (t === 'ed_cpat') h = f('count', T('o_count'), '×', 1) + f('angle', T('o_angle'), '°', 5) + `<button class="btn" id="toApply">${T('o_accept')}</button>`;
  else if (isMPTool(t)) h = mpToolOptsHTML(t);
  box.hidden = !h; box.innerHTML = h;
  const ci = box.querySelector('#to_count'); if (ci) { ci.dataset.int = '1'; ci.min = 2; ci.value = Math.round(S.topt.count); }
  box.querySelectorAll('input').forEach(el => el.onchange = () => { const v = evalExpr(el.value); if (isFinite(v)) S.topt[el.dataset.k] = el.dataset.int ? Math.max(2, Math.round(v)) : v; draw(); });
  const ap = box.querySelector('#toApply'); if (ap) ap.onclick = () => S.pat && patAccept();
  if (isMPTool(t)) mpBindToolOpts(box);
}

// ----- kéo điểm / đường phác thảo -----
function skDragStart(h, w) {
  skBegin();
  if (h.k === 'p') return { kind: 'skpt', id: h.id, moved: false, prev: skSnapshot() };
  if (h.k === 'e') { const e = SKM().ents.find(x => x.id === h.id); return { kind: 'skent', id: h.id, pts: SK.entPts(e), start: w, orig: SK.entPts(e).map(id => ({ ...SK.ptMap(SKM()).get(id) })), moved: false, prev: skSnapshot() }; }
  if (h.k === 'd') return { kind: 'skdim', id: h.id, moved: false };
  return null;
}
function skDragMove(x, y) {
  const sk = SKM(), w = s2w(x, y);
  if (drag.kind === 'skdim') { const d = sk.dims.find(o => o.id === drag.id); if (!d) return; const pm = SK.ptMap(sk), em = new Map(sk.ents.map(e => [e.id, e]));
    if (d.type === 'rad' || d.type === 'dia') { const e = em.get(d.e1), c = pm.get(e.c); d.ang = Math.atan2(w.y - c.y, w.x - c.x); }
    else if (d.type === 'dx' || d.type === 'dy') { const A = pm.get(d.p), B = pm.get(d.q); d.off = d.type === 'dx' ? w.y - (A.y + B.y) / 2 : w.x - (A.x + B.x) / 2; }
    else { let A, B; if (d.type === 'dist') { A = pm.get(d.p); B = pm.get(d.q); } else if (d.type === 'len') { A = pm.get(em.get(d.e1).a); B = pm.get(em.get(d.e1).b); } else return; const dx = B.x - A.x, dy = B.y - A.y, l = Math.hypot(dx, dy) || 1; d.off = ((w.x - A.x) * -dy + (w.y - A.y) * dx) / l; }
    drag.moved = true; draw(); return; }
  const sys = SK.compile(sk, skCtx()); const soft = [];
  if (drag.kind === 'skpt') {
    S.snap = skSnap(x, y, { pt: new Set([drag.id]), ent: new Set(sk.ents.filter(e => SK.entPts(e).includes(drag.id)).map(e => e.id)) });
    const p = S.snap.p; soft.push({ i: sys.vidx.get(drag.id + '.x'), v: p.x, w: .5 }, { i: sys.vidx.get(drag.id + '.y'), v: p.y, w: .5 });
  } else { const dx = w.x - drag.start.x, dy = w.y - drag.start.y; drag.pts.forEach((id, k) => soft.push({ i: sys.vidx.get(id + '.x'), v: drag.orig[k].x + dx, w: .5 }, { i: sys.vidx.get(id + '.y'), v: drag.orig[k].y + dy, w: .5 })); }
  const r = SK.solve(sys, { soft: soft.filter(s => s.i != null), maxIter: 25 }); SK.apply(sk, sys, r.V); drag.moved = true;
  draw(); renderProps(true);
}
function skDragEnd(d) {
  const sk = SKM(), sn = S.snap; S.snap = null; S.guides = [];
  if (d.kind === 'skdim') { if (d.moved) changed(); return; }
  if (!d.moved) { draw(); return; }
  if (d.kind === 'skpt' && sn) {
    if (sn.t === 'sp' && sn.id !== d.id) skMergePts(d.id, sn.id);
    else if (sn.t === 'on') sk.cons.push({ id: SK.newId('k'), type: 'onc', p: d.id, e1: sn.e });
    else if (sn.t === 'mid') sk.cons.push({ id: SK.newId('k'), type: 'mid', p: d.id, e1: sn.e });
    else if (sn.t === 'j') sk.cons.push({ id: SK.newId('k'), type: 'atj', p: d.id, j: sn.id });
  }
  sketchChanged({ prev: d.prev });
}
function skMergePts(src, dst) {
  const sk = SKM();
  for (const e of sk.ents) { for (const k of ['a', 'b', 'c', 'p']) if (e[k] === src) e[k] = dst; if (e.pts) e.pts = e.pts.map(id => id === src ? dst : id); }
  for (const c of [...sk.cons, ...sk.dims]) { if (c.p === src) c.p = dst; if (c.q === src) c.q = dst; }
  sk.ents = sk.ents.filter(e => !(e.type === 'line' && e.a === e.b));
  sk.cons = sk.cons.filter(c => !(c.type === 'coinc' && c.p === c.q) && !(c.p && c.q && c.p === c.q));
  SK.pruneRefs(sk);
}
function skSplitPoint(pid) {
  const sk = SKM(), pm = SK.ptMap(sk), p = pm.get(pid), users = sk.ents.filter(e => SK.entPts(e).includes(pid)); if (users.length < 2) return;
  const prev = skSnapshot();
  for (const e of users.slice(1)) { const nid = SK.addPt(sk, p.x, p.y); for (const k of ['a', 'b', 'c', 'p']) if (e[k] === pid) e[k] = nid; if (e.pts) e.pts = e.pts.map(id => id === pid ? nid : id); }
  sketchChanged({ prev });
}
function toggleCs(ids) { if (ids.some(id => lockedItem({ k: 'e', id }))) { lockToast(); ids = ids.filter(id => !lockedItem({ k: 'e', id })); if (!ids.length) return; } const sk = SKM(), prev = skSnapshot(); for (const e of sk.ents) if (ids.includes(e.id)) e.cs = !e.cs; sketchChanged({ prev }); }
function deleteSkSel(sel) {
  const items0 = S.msel.length ? S.msel : [sel];
  // CP của part: xóa = xóa part (CP trở lại tự do để sửa); hình / ràng buộc của part: không xóa được
  const pr = items0.find(it => it.k === 'r' && lockedItem(it)); if (pr) { deletePart(regionByKey(pr.id).feature.link); return; }
  if (items0.some(lockedItem)) { lockToast(); return; }
  const sk = SKM(), prev = skSnapshot();
  const items = items0;
  for (const it of items) {
    if (it.k === 'e') SK.removeEnts(sk, [it.id]);
    else if (it.k === 'p') SK.removePts(sk, [it.id]);
    else if (it.k === 'k') sk.cons = sk.cons.filter(c => c.id !== it.id);
    else if (it.k === 'd') sk.dims = sk.dims.filter(d => d.id !== it.id);
    else if (it.k === 'r') { // xóa cả CP: feature / CP ghép + toàn bộ nét biên (cùng tập nét mà kéo-dời CP di chuyển)
      const r = S.regions.find(x => x.key === it.id); if (!r) continue;
      if (r.feature) S.model.features = S.model.features.filter(f => f !== r.feature);
      if (r.kind === 'c') deleteCompound(r.id);
      if (r.ents) SK.removeEnts(sk, [...regionEntIds(r)]);
    }
  }
  S.sel = null; S.msel = []; closePopover(); sketchChanged({ prev });
}
function setFeature(rkey, lid, op) {
  if (guardLocked({ k: 'r', id: rkey })) return;
  const r = S.regions.find(x => x.key === rkey); if (!r) return;
  skBegin();
  const r2 = S.regions.find(x => x.key === rkey) || r;
  const sk = SKM(), ents = [...new Set([...r2.ents, ...r2.holeEnts])].map(id => sk.ents.find(e => e.id === id)).filter(Boolean);
  if (lid) { const bad = ents.find(e => e.owner && e.owner !== lid); if (bad) { toast(T('toast_feat_conflict', { l: nameOf('l', bad.owner) })); return; } }
  let f = r2.feature;
  if (!lid) {
    if (f) S.model.features = S.model.features.filter(x => x !== f);
    const still = new Set(); for (const g of S.model.features) { const rg = S.featReg[g.id]; if (rg && rg !== r2) [...rg.ents, ...rg.holeEnts].forEach(id => still.add(id)); }
    const done = new Set(); ents.forEach(e => { if (!still.has(e.id)) reownEnt(e, null, done); });
  } else {
    if (!f) { f = r2.kind === 'c' ? { id: uid('f'), comp: r2.id, link: lid, op } : { id: uid('f'), ents: r2.ents.slice(), link: lid, op }; S.model.features.push(f); } else { f.link = lid; f.op = op; }
    const done = new Set(); ents.forEach(e => reownEnt(e, lid, done));
    toast(T('toast_feat', { op: T('op_' + op).toLowerCase(), l: nameOf('l', lid) }));
  }
  sketchChanged();
}

// ----- menu, biểu mẫu, danh sách -----
function entLabel(e) { const sk = SKM(); const same = sk.ents.filter(x => x.type === e.type); return T('et_' + e.type) + ' ' + (same.indexOf(e) + 1); }
function consLabel(c) { if (c.type === 'hv' && c.hv) return c.hv === 'h' ? T('ct_hv_h') : T('ct_hv_v'); if (c.type === 'hv') { const g = glyphText(c); return g === 'H' ? T('ct_hv_h') : g === 'V' ? T('ct_hv_v') : T('ct_hv'); } return T('ct_' + c.type); }
function consRefText(c) {
  const sk = SKM(), em = new Map(sk.ents.map(e => [e.id, e])), parts = [];
  for (const k of ['e1', 'e2']) if (c[k] && em.get(c[k])) parts.push(entLabel(em.get(c[k])));
  if (c.j) parts.push(T('sn_joint', { n: jname(c.j) }));
  return parts.join(' · ');
}
function skMenuItems(h) {
  const it = [], sk = SKM();
  if (h.k === 'e') {
    const e = sk.ents.find(x => x.id === h.id); if (!e) return it;
    const ids = S.msel.filter(p => p.k === 'e').map(p => p.id); const targets = ids.includes(e.id) ? ids : [e.id];
    it.push({ head: esc(entLabel(e)) }, { label: T('m_edit'), act: () => openPopover(h) }, { sep: 1 }, { label: T('m_cs'), check: !!e.cs, act: () => toggleCs(targets) });
    if (e.type === 'line') { it.push({ label: T('m_h'), act: () => { S.msel = targets.map(id => ({ k: 'e', id })); applyConsToSelection('horiz'); } }, { label: T('m_v'), act: () => { S.msel = targets.map(id => ({ k: 'e', id })); applyConsToSelection('vert'); } }); }
    it.push({ label: T('t_c_fix'), act: () => { S.msel = targets.map(id => ({ k: 'e', id })); applyConsToSelection('fix'); } });
    it.push(...skTraceMenu(e));
    const reg = S.regions.find(r => r.ents.includes(e.id) || r.holeEnts.includes(e.id));
    if (reg && !lockedItem({ k: 'r', id: reg.key })) { it.push({ sub: T('k_reg', { n: reg.name }) }, { label: T('m_rot90'), act: () => xfCommit(reg.key, { type: 'rot', a: Math.PI / 2 }) }, { label: T('m_flipx'), act: () => xfCommit(reg.key, { type: 'mirror', axis: 'v' }) }, { label: T('m_flipy'), act: () => xfCommit(reg.key, { type: 'mirror', axis: 'h' }) }); }
    it.push({ sep: 1 }, { label: T('m_del'), danger: 1, act: () => { S.sel = h; deleteSkSel(h); } });
  } else if (h.k === 'p') {
    const fixed = sk.cons.find(c => c.type === 'fix' && c.p === h.id), users = sk.ents.filter(e => SK.entPts(e).includes(h.id)).length;
    it.push({ head: T('k_pt') }, { label: T('m_edit'), act: () => openPopover(h) }, { sep: 1 });
    it.push({ label: T('m_fixpt'), check: !!fixed, act: () => { if (fixed) { const prev = skSnapshot(); sk.cons = sk.cons.filter(c => c !== fixed); sketchChanged({ prev }); } else { S.msel = [h]; applyConsToSelection('fix'); } } });
    it.push({ label: T('m_trace'), check: hasSkTrace('p', h.id), act: () => toggleSkTrace('p', h.id) });
    it.push({ label: T('m_splitpt'), disabled: users < 2, act: () => skSplitPoint(h.id) });
    it.push({ sep: 1 }, { label: T('m_del'), danger: 1, act: () => { S.sel = h; S.msel = [h]; deleteSkSel(h); } });
  } else if (h.k === 'k') {
    const c = sk.cons.find(x => x.id === h.id); if (!c) return it;
    it.push({ head: esc(consLabel(c)) }, { label: T('m_del'), danger: 1, act: () => { S.msel = [h]; deleteSkSel(h); } });
  } else if (h.k === 'd') {
    it.push({ head: T('k_dim') }, { label: T('m_editdim'), act: () => openPopover(h) }, { sep: 1 }, { label: T('m_del'), danger: 1, act: () => { S.msel = [h]; deleteSkSel(h); } });
  } else if (h.k === 'r') {
    const r = S.regions.find(x => x.key === h.id); if (!r) return it; const f = r.feature, links = S.model.links.filter(L => L.kind !== 'cyl');
    it.push({ head: T('k_reg', { n: r.name }) }, { label: T('m_edit'), act: () => openPopover(h) }, { sep: 1 });
    const others = S.msel.filter(o => o.k === 'r' && o.id !== r.key);
    if (others.length) { const o = regionByKey(others[0].id); if (o) { it.push({ sub: T('cp_bool', { a: o.name, b: r.name }) }); for (const op of ['union', 'subtract', 'intersect']) it.push({ label: T('cp_' + op), act: () => createCompound(op, o.key, r.key) }); it.push({ sep: 1 }); } }
    else it.push({ label: T('cp_hint'), disabled: true });
    if (!f) it.push({ label: T('m_part'), act: () => createPart(r.key) }, { sep: 1 });
    else if (isBody(getL(f.link))) { it.push({ sub: T('k_link', { n: esc(getL(f.link).name) }) }, ...addOnLinkItems(getL(f.link)), ...partSlideItems(getL(f.link)), { sep: 1 }, { label: T('m_delpart'), danger: 1, act: () => deletePart(f.link) }); return it; } // CP của part: khóa, chỉ còn xóa part
    if (r.kind === 'c' && !f) it.push({ label: T('cp_ungroup', { a: r.a.name, b: r.b.name }), act: () => ungroupCompound(r.id) }, { sep: 1 });
    it.push({ label: T('m_rot90'), act: () => xfCommit(r.key, { type: 'rot', a: Math.PI / 2 }) }, { label: T('m_rotm90'), act: () => xfCommit(r.key, { type: 'rot', a: -Math.PI / 2 }) });
    it.push({ label: T('m_flipx'), act: () => xfCommit(r.key, { type: 'mirror', axis: 'v' }) }, { label: T('m_flipy'), act: () => xfCommit(r.key, { type: 'mirror', axis: 'h' }) });
    for (const op of ['union', 'subtract', 'intersect']) { it.push({ sub: T('m_' + op) }); for (const L of links) it.push({ label: esc(L.name), check: f && f.link === L.id && f.op === op, act: () => setFeature(r.key, L.id, op) }); }
    if (f) it.push({ sep: 1 }, { label: T('m_nofeat'), act: () => setFeature(r.key, null) });
  }
  return it;
}
function skFormRows(sel, num, select, info, chk) {
  const sk = SKM(); let extra = '';
  if (sel.k === 'e') {
    const e = sk.ents.find(x => x.id === sel.id), pm = SK.ptMap(sk);
    info(T('f_type'), esc(entLabel(e)));
    if (e.type === 'line') { const a = pm.get(e.a), b = pm.get(e.b); num(T('f_len2'), Math.hypot(b.x - a.x, b.y - a.y), 'mm', v => setEntSize(e.id, v)); extra += `<p class="muted">${T('f_lennote')}</p>`; }
    if (e.type === 'circle' || e.type === 'arc') { const r = e.type === 'circle' ? e.r : Math.hypot(pm.get(e.a).x - pm.get(e.c).x, pm.get(e.a).y - pm.get(e.c).y); num(T('f_rad'), r, 'mm', v => setEntSize(e.id, v)); }
    if (e.type === 'spline') info(T('f_nv'), T('et_pts', { n: e.pts.length }));
    info(T('f_owner'), e.owner ? esc(nameOf('l', e.owner)) : T('f_ground'));
    chk(T('f_cs'), !!e.cs, () => toggleCs([e.id]));
  } else if (sel.k === 'p') {
    const p = SK.ptMap(sk).get(sel.id); XF = skXform(true); const q = skP(sel.id, SK.ptMap(sk)) || p;
    num(T('f_x'), q.x, 'mm', v => movePtTo(sel.id, v, null), { live: 'skx' }); num(T('f_y'), q.y, 'mm', v => movePtTo(sel.id, null, v), { live: 'sky' });
    chk(T('f_fixpt'), sk.cons.some(c => c.type === 'fix' && c.p === sel.id), () => { const f = sk.cons.find(c => c.type === 'fix' && c.p === sel.id); if (f) { const prev = skSnapshot(); sk.cons = sk.cons.filter(c => c !== f); sketchChanged({ prev }); } else { S.msel = [sel]; applyConsToSelection('fix'); } });
  } else if (sel.k === 'k') {
    const c = sk.cons.find(x => x.id === sel.id); info(T('f_type'), esc(consLabel(c))); const ref = consRefText(c); if (ref) info(T('c_links') || '', esc(ref));
  } else if (sel.k === 'd') {
    const d = sk.dims.find(x => x.id === sel.id); info(T('f_type'), T('dt_' + d.type));
    num(T('f_val2'), d.v, d.type === 'ang' ? '°' : 'mm', v => setDimVal(d.id, v), { step: d.type === 'ang' ? 1 : 0.1, ro: !!d.driven || lockedItem(sel) }); extra += `<label class="toggle"><input type="checkbox" class="fdriven" ${d.driven ? 'checked' : ''}><span>${T('f_driven')}</span></label><p class="muted">${T('f_dimnote')}</p>`;
  } else if (sel.k === 'r') {
    const r = S.regions.find(x => x.key === sel.id); info(T('f_type'), T('k_reg', { n: r.name })); info(T('f_area'), r.area.toFixed(1) + ' mm²');
    if (lockedItem(sel)) extra += `<p class="muted">${T('body_locked')}</p><div class="btnrow"><button class="btn danger fdelpart" data-part="${r.feature.link}">${T('m_delpart')}</button></div>`; // CP của part: khóa
    else {
    const f = r.feature, opts = [['', T('f_none2')]]; for (const L of S.model.links.filter(L => L.kind !== 'cyl')) for (const op of ['union', 'subtract', 'intersect']) opts.push([op + ':' + L.id, L.name + ' · ' + T('op_' + op)]);
    select(T('f_bool'), opts, f ? f.op + ':' + f.link : '', v => { if (!v) setFeature(r.key, null); else { const [op, lid] = v.split(':'); setFeature(r.key, lid, op); } });
    num(T('f_dx'), 0, 'mm', v => v && xfCommit(r.key, { type: 'move', dx: v, dy: 0 }), { step: 1 });
    num(T('f_dy'), 0, 'mm', v => v && xfCommit(r.key, { type: 'move', dx: 0, dy: v }), { step: 1 });
    num(T('f_rot'), 0, '°', v => v && xfCommit(r.key, { type: 'rot', a: v * D2R }), { step: 5, dec: 1 });
    num(T('f_scale'), 1, '×', v => v > 0 && v !== 1 && xfCommit(r.key, { type: 'scale', k: v }), { step: 0.1 });
    extra += `<div class="btnrow"><button class="btn" data-xf="v">${T('m_flipx')}</button><button class="btn" data-xf="h">${T('m_flipy')}</button></div><p class="muted">${T('f_xf_note')}</p>`;
    }
  }
  return extra;
}
function movePtTo(pid, x, y) {
  if (guardLocked({ k: 'p', id: pid })) return;
  skBegin(); const sk = SKM(), p = SK.ptMap(sk).get(pid), prev = skSnapshot(); const tx = x ?? p.x, ty = y ?? p.y;
  const sys = SK.compile(sk, skCtx()); const r = SK.solve(sys, { soft: [{ i: sys.vidx.get(pid + '.x'), v: tx, w: 1 }, { i: sys.vidx.get(pid + '.y'), v: ty, w: 1 }].filter(s => s.i != null) }); SK.apply(sk, sys, r.V);
  sketchChanged({ prev });
}
function skListGroups(group) {
  const sk = SKM();
  group('regions', T('grp_regions'), S.regions.filter(r => !r.usedBy).map(r => {
    const f = r.feature, sub = (r.kind === 'c' ? `${esc(r.a.name)} ${r.op === 'union' ? '∪' : r.op === 'subtract' ? '−' : '∩'} ${esc(r.b.name)} · ` : '') + `${r.area.toFixed(1)} mm² · ` + (r.usedBy ? T('cp_used', { c: esc(r.usedBy) }) : f && getL(f.link) ? (getL(f.link).kind === 'body' ? T('cp_part', { l: esc(nameOf('l', f.link)) }) : T('reg_op_' + f.op, { l: esc(nameOf('l', f.link)) })) : T('reg_free'));
    return rowHTML('r', r.key, `<span class="sw" style="background:${f && getL(f.link) ? linkColorVar(getL(f.link)) : 'transparent'};border:1.5px solid var(--sketch)"></span>`, r.name, sub, f ? `<span class="tag">${f.op === 'union' ? '∪' : f.op === 'subtract' ? '−' : '∩'}</span>` : '');
  }), T('e_regions'));
  group('sketch', T('grp_sketch'), sk.ents.map(e => {
    const pm = SK.ptMap(sk); let dim = '';
    if (e.type === 'line') dim = Math.hypot(pm.get(e.b).x - pm.get(e.a).x, pm.get(e.b).y - pm.get(e.a).y).toFixed(1);
    else if (e.type === 'circle') dim = 'R' + e.r.toFixed(1); else if (e.type === 'arc') dim = 'R' + Math.hypot(pm.get(e.a).x - pm.get(e.c).x, pm.get(e.a).y - pm.get(e.c).y).toFixed(1);
    else if (e.type === 'spline') dim = T('et_pts', { n: e.pts.length });
    const trc = skTraceList().some(t => t.ref === e.id || SK.entPts(e).includes(t.ref));
    const tags = (trc ? `<span class="tag">${T('tg_trace')}</span>` : '') + (e.cs ? `<span class="tag">${T('et_cs')}</span>` : '') + (e.owner ? `<span class="tag">${esc(nameOf('l', e.owner))}</span>` : '');
    return rowHTML('e', e.id, `<span class="sw shape" style="${entDefined(e) ? '' : 'border-color:var(--sk-free)'}"></span>`, esc(entLabel(e)), dim, tags);
  }), T('e_sketch'));
  group('skcons', T('grp_skcons'), [...sk.cons.filter(c => c.type !== 'coinc').map(c => rowHTML('k', c.id, `<span class="sw" style="background:var(--hover);border-radius:3px;text-align:center;font-size:9px;line-height:12px">${esc(glyphText(c))}</span>`, esc(consLabel(c)), esc(consRefText(c)), '')),
    ...sk.dims.map(d => rowHTML('d', d.id, '<span class="sw meas"></span>', T('dt_' + d.type), (d.type === 'rad' ? 'R' : d.type === 'dia' ? 'Ø' : '') + d.v.toFixed(2) + (d.type === 'ang' ? '°' : '') + (d.driven ? ' ⓡ' : ''), ''))], T('e_skcons'));
}

// ----- chuyển hình cũ (v0.4) sang phác thảo -----
function migrateShapes(m) {
  m.sketch = m.sketch || SK.empty(); m.features = m.features || [];
  if (!Array.isArray(m.shapes) || !m.shapes.length) { delete m.shapes; return m; }
  const D = {}; for (const j of m.joints) D[j.id] = { x: j.x, y: j.y };
  const sk = m.sketch;
  for (const sh of m.shapes) {
    const L = sh.link && m.links.find(l => l.id === sh.link), f = L && L.joints.length >= 2 ? frameOf(L, D) : null;
    const tw = p => f ? toWorld(f, { u: p.x, v: p.y }) : { x: p.x, y: p.y };
    const ids = [];
    if (sh.type === 'circle') { const c = tw(sh.c); const cid = SK.addPt(sk, c.x, c.y); const e = { id: SK.newId('e'), type: 'circle', c: cid, r: sh.r, owner: L ? L.id : null }; sk.ents.push(e); ids.push(e.id); }
    else {
      const pts = sh.pts.map(tw).map(p => SK.addPt(sk, p.x, p.y)), n = pts.length, closed = sh.type !== 'line';
      for (let i = 0; i < (closed ? n : n - 1); i++) { const e = { id: SK.newId('e'), type: 'line', a: pts[i], b: pts[(i + 1) % n], owner: L && closed ? L.id : null }; sk.ents.push(e); ids.push(e.id); }
    }
    if (L && sh.type !== 'line') m.features.push({ id: uid('f'), link: L.id, op: sh.op === 'cut' ? 'subtract' : 'union', ents: ids.slice().sort() });
  }
  delete m.shapes; return m;
}

// ----- Trim kéo lê (giống Onshape): giữ chuột trái và kéo, đoạn nét nào vệt kéo cắt ngang thì bị cắt bỏ -----
function trimStrokeStart(x, y) { return { kind: 'trimstroke', pts: [s2w(x, y)], scr: [[x, y]], prev: skSnapshot(), cuts: 0, moved: false, x0: x, y0: y, last: [x, y] }; }
// giao điểm của đoạn vệt (p→q) với các nét phác thảo; trả giao điểm gần p nhất
function trimStrokeHit(p, q, skip) {
  const sk = SKM(), pm = SK.ptMap(sk); let best = null;
  for (const e of sk.ents) {
    if (e.type === 'point' || bodyOf(e.owner)) continue; // trim kéo lê bỏ qua hình của part
    const pts = SK.sample(e, pm).pts; if (e.type === 'circle' && pts.length) pts.push(pts[0]);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], rx = q.x - p.x, ry = q.y - p.y, sx = b.x - a.x, sy = b.y - a.y, den = rx * sy - ry * sx; if (Math.abs(den) < 1e-12) continue;
      const t = ((a.x - p.x) * sy - (a.y - p.y) * sx) / den, u = ((a.x - p.x) * ry - (a.y - p.y) * rx) / den;
      if (t < 0 || t > 1 || u < 0 || u > 1) continue;
      const w = { x: p.x + t * rx, y: p.y + t * ry };
      if (skip.some(s => s.id === e.id && Math.hypot(s.w.x - w.x, s.w.y - w.y) < 0.3)) continue;
      if (!best || t < best.t) best = { t, id: e.id, w };
    }
  }
  return best;
}
function trimStrokeMove(d, x, y) {
  if (!d.moved && Math.hypot(x - d.x0, y - d.y0) < 4) return; d.moved = true;
  const p = d.pts[d.pts.length - 1], q = s2w(x, y), sk = SKM(), skip = [];
  for (let k = 0; k < 24; k++) { // một đoạn vệt có thể cắt qua nhiều nét
    const h = trimStrokeHit(p, q, skip); if (!h) break;
    skip.push(h);
    if (SK.trim(sk, h.id, h.w)) { d.cuts++; skOwnerMap(); }
  }
  d.pts.push(q); d.scr.push([x, y]); d.last = [x, y]; S.trimStroke = d.scr; draw();
}
function trimStrokeEnd(d) {
  S.trimStroke = null;
  if (!d.moved) { editPick(d.x0, d.y0); return; } // bấm không kéo: cắt một đoạn như cũ
  if (d.cuts) { sketchChanged({ prev: d.prev }); toast(T('toast_trim_n', { n: d.cuts })); } else draw();
}
function drawTrimStroke() {
  const s = S.trimStroke; if (!s || s.length < 2) return;
  ctx.strokeStyle = colors.warn; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.globalAlpha = .9;
  ctx.beginPath(); s.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); ctx.globalAlpha = 1;
}
