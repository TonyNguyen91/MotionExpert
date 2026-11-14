// ===== CP ghép (boolean giữa các CP) · khối chuyển động (part) · mate =====
// model.compounds = [{ id, name, op: 'union'|'subtract'|'intersect', a: ref, b: ref }], ref = { ents:[...] } | { comp: id }
// model.mates = [{ id, name, type: 'rev'|'sld'|'par'|'eq'|'cnt'|'tan', a, b, joint, k, ea, eb, c, s, r, L, side, own:[jointIds] }]

// ----- CP ghép -----
function buildCompounds() {
  const base = S.regions.filter(r => r.kind !== 'c'); base.forEach(r => { r.usedBy = null; });
  const out = [];
  const resolve = ref => ref.comp ? out.find(c => c.id === ref.comp) || null : SK.matchRegion(base, ref.ents);
  for (const c of S.model.compounds || []) {
    const ra = resolve(c.a), rb = resolve(c.b); if (!ra || !rb || ra === rb) continue;
    if (!c.a.comp) c.a.ents = ra.ents.slice(); if (!c.b.comp) c.b.ents = rb.ents.slice();
    const r = { kind: 'c', id: c.id, key: 'C:' + c.id, name: c.name, op: c.op, a: ra, b: rb,
      ents: [...new Set([...ra.ents, ...rb.ents])], holeEnts: [...new Set([...ra.holeEnts, ...rb.holeEnts])],
      outer: ra.outer, holes: [], pts: [...(ra.kind === 'c' ? ra.pts : ra.outer), ...(rb.kind === 'c' ? rb.pts : rb.outer)], feature: null };
    ra.usedBy = c.name; rb.usedBy = c.name;
    r.area = compoundArea(r); out.push(r);
  }
  S.regions.push(...out);
}
function insideDesign(r, p) {
  if (r.kind !== 'c') return SK.inPoly(p.x, p.y, r.outer) && !r.holes.some(h => SK.inPoly(p.x, p.y, h));
  const a = insideDesign(r.a, p), b = insideDesign(r.b, p);
  return r.op === 'union' ? a || b : r.op === 'subtract' ? a && !b : a && b;
}
function compoundArea(r) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of r.pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  const n = 90, dx = (x1 - x0) / n, dy = (y1 - y0) / n; let k = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (insideDesign(r, { x: x0 + (i + .5) * dx, y: y0 + (j + .5) * dy })) k++;
  return k * dx * dy;
}
function invXF(own, w) { const L = getL(own), fD = S.skFrames[own]; if (!L || !fD || !XF[own]) return w; const fN = frameOf(L, S.pos); return toWorld(fD, toLocal(fN, w)); }
function insideAtWorld(r, w) { const own = regionOwner(r); return insideDesign(r, own ? invXF(own, w) : w); }
// vẽ mặt nạ của CP vào ngữ cảnh c (đã đặt phép biến đổi màn hình); dùng toán tử ghép hiện tại của c
const maskPool = [];
function drawProfMask(c, r, depth = 0) {
  if (r.kind !== 'c') { regionPath(c, r); c.fill('evenodd'); return; }
  if (!maskPool[depth]) maskPool[depth] = document.createElement('canvas').getContext('2d');
  const t = maskPool[depth]; t.canvas.width = c.canvas.width; t.canvas.height = c.canvas.height;
  t.setTransform(c.getTransform()); t.fillStyle = c.fillStyle;
  t.globalCompositeOperation = 'source-over'; drawProfMask(t, r.a, depth + 1);
  t.globalCompositeOperation = r.op === 'union' ? 'source-over' : r.op === 'subtract' ? 'destination-out' : 'destination-in';
  drawProfMask(t, r.b, depth + 1); t.globalCompositeOperation = 'source-over';
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(t.canvas, 0, 0); c.restore();
}
function profRef(r) { return r.kind === 'c' ? { comp: r.id } : { ents: r.ents.slice() }; }
function createCompound(op, keyA, keyB) {
  const ra = regionByKey(keyA), rb = regionByKey(keyB); if (!ra || !rb || ra === rb) return;
  const prev = skSnapshot(); S.model.compounds = S.model.compounds || [];
  const c = { id: uid('c'), name: nextName(S.model.compounds, 'C'), op, a: profRef(ra), b: profRef(rb) };
  S.model.compounds.push(c); S.msel = []; S.sel = { k: 'r', id: 'C:' + c.id };
  if (sketchChanged({ prev })) toast(T('toast_cp', { c: c.name }));
}
function deleteCompound(id) {
  const kill = new Set([id]); let grew = true;
  while (grew) { grew = false; for (const c of S.model.compounds) if (!kill.has(c.id) && (kill.has(c.a.comp) || kill.has(c.b.comp))) { kill.add(c.id); grew = true; } }
  S.model.compounds = S.model.compounds.filter(c => !kill.has(c.id));
  S.model.features = S.model.features.filter(f => !kill.has(f.comp));
}

// ----- khối chuyển động (part) từ CP -----
// giữ nguyên hình lúc chuyển: cố định tại chỗ mọi điểm của CP và các điểm nối ra ngoài (sẽ bị dropPartCrossCons bỏ),
// cất các ràng buộc nối đó vào L.xcons; L.pins = id các cố định đã thêm (gỡ khi part về CP)
function freezeForPart(L, ents) {
  const sk = SKM(), pm = SK.ptMap(sk), x = partCrossSet(), pts = new Set();
  ents.forEach(e => SK.entPts(e).forEach(p => pts.add(p)));
  for (const c of x) { for (const k of ['p', 'q']) if (c[k] != null) pts.add(c[k]); for (const k of ['e1', 'e2']) { const e = c[k] != null && sk.ents.find(q => q.id === c[k]); if (e) SK.entPts(e).forEach(p => pts.add(p)); } }
  L.xcons = { cons: sk.cons.filter(c => x.has(c)), dims: sk.dims.filter(d => x.has(d)) };
  const hasFix = new Set(sk.cons.filter(c => c.type === 'fix').map(c => c.p));
  L.pins = (L.pins || []).filter(id => sk.cons.some(c => c.id === id));
  for (const p of pts) {
    const w = pm.get(p); if (!w || hasFix.has(p)) continue;
    const o = ptOwnerNow(sk, p), fr = o ? S.skFrames[o] : null, l = fr ? toLocal(fr, w) : { u: w.x, v: w.y };
    const id = SK.newId('k'); sk.cons.push({ id, type: 'fix', p, x: l.u, y: l.v }); L.pins.push(id); hasFix.add(p);
  }
}
// gỡ cố định đã thêm và khôi phục ràng buộc đã cất khi part bị xóa (về CP)
function unfreezePart(L) {
  const sk = SKM(), pins = new Set(L.pins || []);
  sk.cons = sk.cons.filter(c => !pins.has(c.id)); L.pins = [];
  // gộp lại điểm đã tách (điểm dùng chung với CP khác): mọi tham chiếu về điểm gốc
  for (const { p, np } of L.splits || []) {
    const rn = o => { for (const k of Object.keys(o)) { if (k === 'id') continue; const v = o[k]; if (v === np) o[k] = p; else if (Array.isArray(v)) o[k] = v.map(x => x === np ? p : x); } };
    sk.ents.forEach(rn); sk.cons.forEach(rn); (sk.dims || []).forEach(rn); sk.pts = sk.pts.filter(q => q.id !== np);
  }
  L.splits = null;
  const pm = SK.ptMap(sk), ok = c => ['p', 'q'].every(k => c[k] == null || pm.has(c[k])) && ['e1', 'e2'].every(k => c[k] == null || sk.ents.some(e => e.id === c[k]));
  const back = (arr, c) => { if (arr.includes(c) || !ok(c)) return; if (c.type === 'hv') { const e = c.e1 && sk.ents.find(q => q.id === c.e1); c.owner = e ? e.owner || null : ptOwnerNow(sk, c.p) || null; } arr.push(c); };
  for (const c of (L.xcons || {}).cons || []) back(sk.cons, c);
  for (const d of (L.xcons || {}).dims || []) back(sk.dims, d);
  L.xcons = null;
}
function createPart(rkey) {
  skBegin(); const r = regionByKey(rkey); if (!r) return;
  const sk = SKM(), ents = [...new Set([...r.ents, ...r.holeEnts])].map(id => sk.ents.find(e => e.id === id)).filter(Boolean);
  const bad = ents.find(e => e.owner); if (bad) { toast(T('toast_feat_conflict', { l: nameOf('l', bad.owner) })); return; }
  // nét dựng (cs) nối với CP và chưa thuộc khâu nào → vào cùng khâu, để đi theo khi dời part
  { const pset = new Set(); ents.forEach(e => SK.entPts(e).forEach(p => pset.add(p))); let grow = true;
    while (grow) { grow = false; for (const e of sk.ents) if (e.cs && !e.owner && !ents.includes(e) && SK.entPts(e).some(p => pset.has(p))) { ents.push(e); SK.entPts(e).forEach(p => pset.add(p)); grow = true; } } }
  // điểm dùng chung với hình ngoài (CP khác) → tách: khâu giữ điểm riêng, để dời MP không kéo theo CP còn lại
  const inSet = new Set(ents.map(e => e.id)), bodyPts = new Set(ents.flatMap(e => SK.entPts(e)));
  const outPts = new Set(); for (const e of sk.ents) if (!inSet.has(e.id)) SK.entPts(e).forEach(p => outPts.add(p));
  const splitMap = new Map(); for (const p of bodyPts) if (outPts.has(p)) { const q = SK.ptMap(sk).get(p); if (q) splitMap.set(p, SK.addPt(sk, q.x, q.y)); }
  if (splitMap.size) {
    const rn = v => splitMap.has(v) ? splitMap.get(v) : v;
    const bodySide = c => c.type !== 'fix' && [c.e1, c.e2].every(e => e == null || inSet.has(e)) && [c.p, c.q].every(p => p == null || bodyPts.has(p));
    for (const c of [...sk.cons, ...(sk.dims || [])]) if (bodySide(c)) for (const k of ['p', 'q']) if (c[k] != null) c[k] = rn(c[k]);
    for (const e of ents) { for (const k of ['a', 'b', 'c', 'p']) if (e[k] != null) e[k] = rn(e[k]); if (Array.isArray(e.pts)) e.pts = e.pts.map(rn); }
  }
  const splits = [...splitMap].map(([p, np]) => ({ p, np }));
  // khung khâu = đúng hệ thế giới (gốc 0,0, trục X) → hình giữ nguyên tọa độ khi chuyển; các CP dùng chung điểm không bị lệch khung
  const h1 = newJoint({ x: 0, y: 0 }, { hidden: true }), h2 = newJoint({ x: 10, y: 0 }, { hidden: true });
  const L = { id: uid('l'), name: nextName(S.model.links.filter(l => l.kind === 'body'), 'K'), kind: 'body', joints: [h1.id, h2.id], lock: { len: 1 }, w: 6, splits };
  S.model.links.push(L);
  const f = r.kind === 'c' ? { id: uid('f'), comp: r.id, link: L.id, op: 'union' } : { id: uid('f'), ents: r.ents.slice(), link: L.id, op: 'union' };
  S.model.features.push(f); const done = new Set(); ents.forEach(e => reownEnt(e, L.id, done));
  freezeForPart(L, ents);
  S.sel = { k: 'l', id: L.id }; S.msel = [];
  toast(T('toast_part', { l: L.name })); rebuild();
}
const isBody = L => L && L.kind === 'body';
// ----- part khóa: part tạo từ CP không dời / sửa hình được nữa (tránh xung đột); muốn sửa → xóa part, CP trở lại tự do -----
const bodyOf = lid => { const L = lid && getL(lid); return isBody(L) ? L : null; };
function lockedItem(h) {
  if (!h) return false; const sk = SKM();
  switch (h.k) {
    case 'l': return !!bodyOf(h.id);
    case 'j': return S.model.links.some(L => isBody(L) && L.joints.includes(h.id));
    case 'r': { const r = regionByKey(h.id); return !!(r && r.feature && bodyOf(r.feature.link)); }
    case 'e': { const e = sk.ents.find(x => x.id === h.id); return !!(e && bodyOf(e.owner)); }
    case 'p': return !!bodyOf(S.skPtOwner.get(h.id));
    case 'd': case 'k': { const c = (h.k === 'd' ? sk.dims : sk.cons).find(x => x.id === h.id); return !!c && (['p', 'q'].some(k => c[k] && lockedItem({ k: 'p', id: c[k] })) || ['e1', 'e2'].some(k => c[k] && lockedItem({ k: 'e', id: c[k] }))); }
  }
  return false;
}
function lockToast() { toast(T('toast_part_locked'), 6000); }
function guardLocked(h) { if (lockedItem(h)) { lockToast(); return true; } return false; }
function deletePart(lid) { const L = bodyOf(lid); if (!L) return; if (S.playing) togglePlay(); const n = L.name; unfreezePart(L); deleteLink(lid); toast(T('toast_part_deleted', { l: n })); }
// ----- part trượt vô hạn trên nền (ngang 0° / dọc 90°): đặt cả 2 khớp khung của part lên rãnh vô hạn cùng phương
// → khoảng cách 2 khớp cố định nên part chỉ tịnh tiến theo phương đó, không xoay -----
const partSlideOn = (L, deg) => L.joints.slice(0, 2).every(id => { const j = getJ(id); return j && j.slider && Math.abs(j.slider.ang * R2D - deg) < 1e-6; });
const partPinned = L => L.joints.some(id => (getJ(id) || {}).fixed);
function setPartSlide(lid, deg) {
  const L = getL(lid); if (!isBody(L)) return; if (S.playing) togglePlay(); commitPose();
  if (partPinned(L)) { toast(T('toast_slide_pinned')); return; }
  const on = !partSlideOn(L, deg);
  for (const id of L.joints.slice(0, 2)) { const j = getJ(id); j.slider = on ? { ang: deg * D2R } : null; j.slot = null; }
  toast(T(on ? 'toast_slide_on' : 'toast_slide_off', { l: L.name, d: T(deg ? 'sl_dir_v' : 'sl_dir_h') })); rebuild();
}
function addOnLinkItems(L) {
  const go = (tool, slot) => () => { if (S.playing) togglePlay(); if (slot) { setTool('slot'); S.slotHost = L.id; updateHint(); } else { S.addTo = L.id; setTool(tool); } };
  return [{ label: T(isBody(L) ? 'm_addhole_p' : 'm_addhole'), act: go('addhole') }, { label: T('m_addpt'), act: go('addpt') }, { label: T('m_addslot'), act: go('slot', true) }];
}
function partSlideItems(L) {
  return [{ label: T('m_part_slh'), check: partSlideOn(L, 0), disabled: partPinned(L), act: () => setPartSlide(L.id, 0) },
    { label: T('m_part_slv'), check: partSlideOn(L, 90), disabled: partPinned(L), act: () => setPartSlide(L.id, 90) }];
}
// ----- trọng lực / lò xo hồi vị từ thanh công cụ -----
function selectedParts() { // khâu part đang chọn, kể cả khi chọn CP của part
  const ids = [...(S.msel || []), S.sel].map(o => o && (o.k === 'l' ? o.id : o.k === 'r' ? (((regionByKey(o.id) || {}).feature) || {}).link : null)).filter(Boolean); return [...new Set(ids)].filter(id => isBody(getL(id))); }
function togglePartPhys(ids, key) {
  const on = !ids.every(id => getL(id)[key]); // bật nếu có part chưa bật, tắt nếu tất cả đã bật
  for (const id of ids) setPartPhys(id, key, on);
  toast(T(on ? 'toast_phys_on' : 'toast_phys_off', { t: T(key === 'grav' ? 'f_grav' : 'f_spr'), l: ids.map(id => getL(id).name).join(', ') }));
}
function physPick(x, y) {
  const lid = bodyAt(x, y); if (!lid || !isBody(getL(lid))) { toast(T('h_phys_none')); return; }
  S.sel = { k: 'l', id: lid }; togglePartPhys([lid], S.tool === 'ph_grav' ? 'grav' : 'spr'); setTool('select');
}
function partPick(x, y) { // công cụ K: bấm CP tự do → part; bấm part (hoặc CP của part) → trả về CP
  const r = hitRegion(x, y), reg = r && regionByKey(r.id);
  if (reg && reg.feature && bodyOf(reg.feature.link)) { partToCP(reg.feature.link); setTool('select'); return; }
  const b = bodyAt(x, y); if (b && bodyOf(b)) { partToCP(b); setTool('select'); return; }
  const h = hitRegion(x, y, true); if (!h) { toast(T('h_mkpart_none')); return; }
  createPart(h.id); setTool('select');
}
// part → CP: xóa part, chọn lại CP vừa được trả tự do (khóa vùng không đổi: danh sách nét / C:id của CP ghép)
function partToCP(lid) {
  const r = S.regions.find(q => q.feature && q.feature.link === lid), key = r && r.key;
  deletePart(lid); const back = key && regionByKey(key); if (back) { S.sel = { k: 'r', id: back.key }; S.msel = [S.sel]; renderAll(); }
}
// phím K / nút tạo part với lựa chọn hiện tại: part ⇄ CP; trả true nếu đã xử lý
function togglePartSel() {
  const s = S.sel; if (!s) return false;
  if (s.k === 'l' && bodyOf(s.id)) { partToCP(s.id); return true; }
  if (s.k === 'r') { const r = regionByKey(s.id); if (!r) return false; if (r.feature && bodyOf(r.feature.link)) { partToCP(r.feature.link); return true; } if (!r.feature && !r.usedBy) { createPart(r.key); return true; } }
  return false;
}

// ----- công cụ mate -----
const MATE_TYPES = ['fix', 'rev', 'sld', 'par', 'eq', 'cnt', 'tan'];
S.mpick = [];
function bodyAt(x, y, exclude) { XF = skXform(); const id = hitLink(x, y, exclude ? new Set([exclude]) : null); const L = id && getL(id); return L && L.kind !== 'cyl' ? id : null; }
function linkAng(lid, P) { const L = getL(lid); if (!L) return 0; const a = P[L.joints[0]], b = P[L.joints[1]]; return Math.atan2(b.y - a.y, b.x - a.x); }
function edgeLocal(e, lid) { // tọa độ cạnh thiết kế trong hệ khâu (hoặc thế giới nếu nền)
  const pm = SK.ptMap(SKM()), a = pm.get(e.a), b = pm.get(e.b);
  if (!lid) return { ea: { x: a.x, y: a.y }, eb: { x: b.x, y: b.y } };
  const D = designMap(S.model), f = frameOf(getL(lid), D), la = toLocal(f, a), lb = toLocal(f, b);
  return { ea: { x: la.u, y: la.v }, eb: { x: lb.u, y: lb.v } };
}
function mateNeed(type, n) { return T('mn_' + type + (n ? '2' : '1')); }
function matePick(x, y) {
  const t = S.tool.slice(3), n = S.mpick.length, w = s2w(x, y), sk = SKM();
  const entAt = kinds => { const h = hitSketch(x, y, 'e'); if (!h) return null; const e = sk.ents.find(q => q.id === h.id); return e && kinds.includes(e.type) ? e : null; };
  let pick = null;
  if (t === 'fix') {
    const sn = skSnap(x, y, { parts: true });
    if (sn.t === 'j') { const j = getJ(sn.id); if (j.fixed) { toast(T('mt_fix_already')); return; } const L = linksOf(sn.id)[0]; createMate('fix', [{ mode: 'pt', joint: sn.id, body: L ? L.id : null, p: sn.p }, { body: null }]); return; }
    const b = bodyAt(x, y);
    const pb = sn.t === 'sp' ? S.skPtOwner.get(sn.id) || b : null;
    if (pb && getL(pb)) { createMate('fix', [{ mode: 'pt', body: pb, p: sn.p }, { body: null }]); return; }
    const e = entAt(['line', 'arc', 'circle', 'spline']);
    if (e && e.owner) { createMate('fix', [{ mode: 'line', body: e.owner, ent: e.id }, { body: null }]); return; } // ghi lại cạnh: ngàm cho tính biến dạng (fea.js)
    if (b) { createMate('fix', [{ mode: 'body', body: b }, { body: null }]); return; }
    toast(T('mt_needbody')); return;
  }
  if (t === 'rev' && n === 0) { const sn = skSnap(x, y, { parts: true }); const a = bodyAt(x, y); if (!a) { toast(T('mt_needbody')); return; } pick = { body: a, p: sn.p, joint: sn.t === 'j' ? sn.id : null }; }
  else if (t === 'rev' && n === 1) pick = { body: bodyAt(x, y, S.mpick[0].body) };
  else if ((t === 'sld' || t === 'cnt') && n === 0) { const sn = skSnap(x, y, { parts: true }); const a = bodyAt(x, y); if (!a) { toast(T('mt_needbody')); return; } pick = { body: a, p: sn.p }; }
  else if ((t === 'sld' || t === 'cnt') && n === 1) { const e = entAt(['line']); if (!e) { toast(T('mt_neededge')); return; } if (e.owner === S.mpick[0].body) { toast(T('mt_same')); return; } pick = { e, body: e.owner || null }; }
  else if (t === 'par') { const e = entAt(['line']); if (!e || (n === 0 && !e.owner)) { toast(T('mt_neededge')); return; } if (n === 1 && e.owner === S.mpick[0].body) { toast(T('mt_same')); return; } pick = { e, body: e.owner || null }; }
  else if (t === 'eq') { const b = bodyAt(x, y, n ? S.mpick[0].body : null); if (!b) { toast(T('mt_needbody')); return; } pick = { body: b }; }
  else if (t === 'tan' && n === 0) { const e = entAt(['circle', 'arc']); if (!e || !e.owner) { toast(T('mt_needcirc')); return; } pick = { e, body: e.owner }; }
  else if (t === 'tan' && n === 1) { const e = entAt(['line', 'circle', 'arc']); if (!e) { toast(T('mt_neededge')); return; } if (e.owner === S.mpick[0].body) { toast(T('mt_same')); return; } pick = { e, body: e.owner || null }; }
  S.mpick.push(pick);
  if (S.mpick.length === 2) { const P = S.mpick; S.mpick = []; createMate(t, P); }
  updateHint(); draw();
}
function createMate(type, P) {
  if (S.playing) togglePlay(); commitPose();
  const snapModel = JSON.stringify({ j: S.model.joints, l: S.model.links, m: S.model.mates });
  const m = { id: uid('q'), name: nextName(S.model.mates, 'M'), type, a: P[0].body, b: P[1].body, own: [] };
  const D = designMap(S.model), pm = SK.ptMap(SKM());
  const addJ = (lid, p, extra) => { const j = newJoint(p, extra); getL(lid).joints.push(j.id); m.own.push(j.id); return j.id; };
  if (type === 'fix') {
    m.mode = P[0].mode; m.setFix = []; if (P[0].ent) m.ent = P[0].ent;
    if (m.mode === 'pt') {
      if (P[0].joint) { m.joint = P[0].joint; getJ(m.joint).fixed = true; m.setFix.push(m.joint); }
      else { const j = newJoint(P[0].p, { fixed: true }); getL(m.a).joints.push(j.id); m.own.push(j.id); m.joint = j.id; }
    } else {
      const L = getL(m.a); if (L.joints.slice(0, 2).every(id => getJ(id).fixed)) { toast(T('mt_fix_already')); return; }
      for (const id of L.joints.slice(0, 2)) if (!getJ(id).fixed) { getJ(id).fixed = true; m.setFix.push(id); }
    }
  } else if (type === 'rev') {
    let jid = P[0].joint && getJ(P[0].joint) ? P[0].joint : null;
    if (!jid) { jid = newJoint(P[0].p).id; m.own.push(jid); }
    const A = getL(m.a); if (!A.joints.includes(jid)) A.joints.push(jid);
    if (m.b) { const B = getL(m.b); if (!B.joints.includes(jid)) B.joints.push(jid); } else getJ(jid).fixed = true;
    m.joint = jid;
  } else if (type === 'sld' || type === 'cnt') {
    m.joint = addJ(m.a, P[0].p); Object.assign(m, edgeLocal(P[1].e, m.b));
    if (type === 'sld') m.c = linkAng(m.a, D) - (m.b ? linkAng(m.b, D) : 0);
  } else if (type === 'par') {
    const ang = e => { const a = pm.get(e.a), b = pm.get(e.b); return Math.atan2(b.y - a.y, b.x - a.x); };
    const tA = linkAng(m.a, D), tB = m.b ? linkAng(m.b, D) : 0, eA = ang(P[0].e) - tA, eB = ang(P[1].e) - tB;
    let c = eB - eA; const cur = tA - tB; c += Math.round((cur - c) / Math.PI) * Math.PI; m.c = c;
  } else if (type === 'eq') { m.s = -1; m.c = linkAng(m.a, D) + linkAng(m.b, D); }
  else if (type === 'tan') {
    const e1 = P[0].e, c1 = pm.get(e1.c), r1 = e1.type === 'circle' ? e1.r : Math.hypot(pm.get(e1.a).x - c1.x, pm.get(e1.a).y - c1.y);
    m.joint = addJ(m.a, c1);
    const e2 = P[1].e;
    if (e2.type === 'line') {
      Object.assign(m, edgeLocal(e2, m.b)); m.r = r1;
      const a = pm.get(e2.a), b = pm.get(e2.b), dx = b.x - a.x, dy = b.y - a.y; m.side = ((c1.x - a.x) * dy - (c1.y - a.y) * dx) >= 0 ? 1 : -1;
    } else {
      const c2 = pm.get(e2.c), r2 = e2.type === 'circle' ? e2.r : Math.hypot(pm.get(e2.a).x - c2.x, pm.get(e2.a).y - c2.y);
      m.k = m.b ? addJ(m.b, c2) : (() => { const j = newJoint(c2, { fixed: true }); m.own.push(j.id); return j.id; })();
      if (!m.b) { /* tâm cố định trên nền: khớp cố định không cần thuộc khâu nào nhưng phải được dùng */ getL(m.a).joints.includes(m.k) || 0; }
      const d = Math.hypot(c2.x - c1.x, c2.y - c1.y); m.L = Math.abs(d - (r1 + r2)) <= Math.abs(d - Math.abs(r1 - r2)) ? r1 + r2 : Math.abs(r1 - r2);
    }
  }
  S.model.mates.push(m);
  // lắp lại để thỏa mate mới
  const ok = reassemble(compile(S.model, { measures: true }));
  if (!ok) { const o = JSON.parse(snapModel); S.model.joints = o.j; S.model.links = o.l; S.model.mates = o.m; toast(T('mt_fail')); rebuild({ noUndo: true }); return; }
  refreshMotorPhases(); S.sel = { k: 'q', id: m.id }; toast(T('mt_ok', { t: T('mt_' + type) })); rebuild(); setTool('select');
}
function deleteMate(id) {
  commitPose(); const m = S.model.mates.find(q => q.id === id); if (!m) return;
  S.model.mates = S.model.mates.filter(q => q !== m);
  for (const id of m.setFix || []) { const j = getJ(id); if (j && !S.model.mates.some(q => q.setFix && q.setFix.includes(id))) { j.fixed = false; S.model.motors = S.model.motors.filter(mo => mo.joint !== id); } }
  if (m.type === 'rev') { if (m.own.includes(m.joint)) { S.model.links.forEach(L => L.joints = L.joints.filter(j => j !== m.joint)); S.model.joints = S.model.joints.filter(j => j.id !== m.joint); } else if (m.b) { const B = getL(m.b); if (B) B.joints = B.joints.filter(j => j !== m.joint); } }
  else for (const jid of m.own || []) { S.model.links.forEach(L => L.joints = L.joints.filter(j => j !== jid)); S.model.joints = S.model.joints.filter(j => j.id !== jid); }
  if (S.sel && S.sel.k === 'q') S.sel = null; rebuild();
}
function setEqDir(id, s) { commitPose(); const m = S.model.mates.find(q => q.id === id); if (!m) return; const D = designMap(S.model); m.s = s; m.c = linkAng(m.a, D) - s * linkAng(m.b, D); rebuild(); }
function mateLabel(m) { return T('mt_' + m.type) + (m.type === 'fix' ? ' · ' + T('mt_fix_' + (m.mode || 'body')) : ''); }
function mateBodies(m) { if (m.type === 'fix') return (m.a ? esc(nameOf('l', m.a)) : esc(jname(m.joint))) + ' → ' + T('f_ground'); return `${esc(nameOf('l', m.a))} ↔ ${m.b ? esc(nameOf('l', m.b)) : T('f_ground')}`; }
function mateMenuItems(h) {
  const m = S.model.mates.find(q => q.id === h.id); if (!m) return [];
  const it = [{ head: esc(m.name) + ' · ' + mateLabel(m) }, { label: T('m_edit'), act: () => openPopover(h) }, { sep: 1 }];
  if (m.type === 'eq') it.push({ label: T('mt_eq_opp'), check: (m.s || -1) === -1, act: () => setEqDir(m.id, -1) }, { label: T('mt_eq_same'), check: m.s === 1, act: () => setEqDir(m.id, 1) }, { sep: 1 });
  if (m.type === 'sld' || m.type === 'rev') it.push({ label: T(m.type === 'sld' ? 'm_mmotor_lin' : 'm_mmotor_rot'), check: !!mateMotor(m.id), act: () => toggleMateMotor(m.id) }, { sep: 1 });
  it.push({ label: T('mt_del'), danger: 1, act: () => deleteMate(m.id) });
  return it;
}
function mateFormRows(sel, num, select, info) {
  const m = S.model.mates.find(q => q.id === sel.id); if (!m) return '';
  info(T('f_type'), mateLabel(m)); info(T('mt_bodies'), mateBodies(m));
  if (m.type === 'eq') select(T('mt_dir'), [['-1', T('mt_eq_opp')], ['1', T('mt_eq_same')]], String(m.s || -1), v => setEqDir(m.id, +v));
  if (m.type === 'tan') info(T('f_rad'), (m.r ?? m.L).toFixed(2) + ' mm');
  const mo = mateMotor(m.id); let ex = '';
  if (m.type === 'sld' || m.type === 'rev') ex = `<label class="toggle"><input type="checkbox" class="fmmotor" ${mo ? 'checked' : ''}><span>${T(m.type === 'sld' ? 'm_mmotor_lin' : 'm_mmotor_rot')}</span></label>`;
  if (mo) {
    const pb = mo.pb || (m.type === 'sld' ? 'rec' : 'loop'), rpm = +document.getElementById('rpm').value || 20, cyc = 60 / (rpm * Math.abs(mo.ratio ?? 1));
    select(T('f_pb'), [['single', T('pb_single')], ['rec', T('pb_rec')], ['loop', T('pb_loop')]], pb, v => setMotorOpt(mo.id, 'pb', v));
    if (m.type === 'sld') {
      info(T('f_edge_len'), mateEdgeLen(m).toFixed(2) + ' mm');
      num(T('f_stroke_min'), m.drv.min, 'mm', v => setMateStroke(m.id, 'min', v), { step: 1 });
      num(T('f_stroke_len'), +(m.drv.max - m.drv.min).toFixed(3), 'mm', v => setMateStroke(m.id, 'len', v), { step: 1 });
      info(T('f_stroke_max'), m.drv.max.toFixed(2) + ' mm');
    } else if (pb !== 'loop') num(T('f_mm_ang'), mo.ang ?? 90, '°', v => setMotorOpt(mo.id, 'ang', v), { step: 15 });
    num(T('f_ratio'), mo.ratio ?? 1, '×', v => setRatio(mo.id, v), { step: 0.5 });
    const dist = m.type === 'sld' ? (m.drv.max - m.drv.min) * (pb === 'rec' ? 2 : 1) : pb === 'loop' ? 360 : (mo.ang ?? 90) * (pb === 'rec' ? 2 : 1);
    info(T('f_cycle'), T(pb === 'single' ? 'mm_cycle1' : 'mm_cycle', { t: cyc.toFixed(2), v: (dist / cyc).toFixed(1), u: m.type === 'sld' ? 'mm/s' : '°/s' }));
  }
  if (mo) ex += `<label class="toggle"><input type="checkbox" class="fmmrev" ${mo.rev ? 'checked' : ''}><span>${T('f_mm_rev')}</span></label>`;
  setTimeout(() => { document.querySelectorAll('.fmmotor').forEach(cb => cb.onchange = () => toggleMateMotor(m.id)); document.querySelectorAll('.fmmrev').forEach(cb => cb.onchange = () => setMotorOpt(mo.id, 'rev', cb.checked)); });
  return `${ex}<p class="muted">${T('mt_note_' + m.type)}${mo ? ' ' + T(m.type === 'sld' ? 'mt_note_mlin' : 'mt_note_mrot') : ''}</p>`;
}
function mateListGroup(group) {
  group('mates', T('grp_mates'), (S.model.mates || []).map(m => rowHTML('q', m.id, `<span class="sw" style="background:var(--accent);border-radius:50%;width:10px;height:10px"></span>`, esc(m.name) + ' · ' + mateLabel(m), mateBodies(m), '')), T('e_mates'));
}
// vẽ ký hiệu mate trên bản vẽ
function drawMates() {
  for (const m of S.model.mates || []) {
    const hl = isSel('q', m.id) || isHov('q', m.id);
    let P = null; if (m.joint && S.pos[m.joint]) P = S.pos[m.joint];
    else if (m.type === 'fix' && m.ent && (P = drawFixEdge(m, hl))) { /* nhãn đặt giữa cạnh ngàm */ }
    else if (m.type === 'fix') { const A = getL(m.a); const ps = A ? A.joints.map(id => S.pos[id]).filter(Boolean) : []; if (ps.length) P = { x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length }; }
    else { const A = getL(m.a), B = m.b && getL(m.b); const c = L => { const ps = L.joints.map(id => S.pos[id]).filter(Boolean); return { x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length }; }; if (A && B) { const a = c(A), b = c(B); P = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; ctx.strokeStyle = colors.accent; ctx.globalAlpha = hl ? .9 : .35; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.2; const qa = w2s(a), qb = w2s(b); ctx.beginPath(); ctx.moveTo(qa.x, qa.y); ctx.lineTo(qb.x, qb.y); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; } }
    if (!P) continue; const q = w2s(P);
    const sym = { fix: '⊗', rev: '⟳', sld: '⇆', par: '∥', eq: '⚙', cnt: '⊥', tan: '◠' }[m.type];
    ctx.font = '700 11px ' + bodyFont(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const x = q.x - 18, y = q.y + 18, mot = !!mateMotor(m.id); ctx.fillStyle = hl || mot ? colors.accent : colors.panel; ctx.strokeStyle = colors.accent; ctx.lineWidth = mot ? 2.4 : 1.3;
    if (mot) { ctx.beginPath(); ctx.arc(x, y, 13, -2.4, 1.6); ctx.stroke(); ctx.lineWidth = 1.3; } // vòng cung báo đang dẫn động
    ctx.beginPath(); ctx.arc(x, y, 9, 0, TAU); ctx.fill(); ctx.stroke(); ctx.fillStyle = hl || mot ? colors.panel : colors.accent; ctx.fillText(sym, x, y + .5);
    m._lbl = { x, y };
  }
  // điểm đã chọn khi đang tạo mate
  for (const p of S.mpick) if (p && p.p) { const q = w2s(p.p); ctx.strokeStyle = colors.accent; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(q.x, q.y, 7, 0, TAU); ctx.stroke(); }
}
// mate cố định theo cạnh: tô đậm cạnh + gạch nền phía ngoài part (ký hiệu ngàm), trả điểm giữa cạnh (thế giới)
function drawFixEdge(m, hl) {
  const sk = SKM(), e = sk.ents.find(q => q.id === m.ent); if (!e) return null; XF = skXform(true);
  const pts = sampleNow(e, SK.ptMap(sk)); if (pts.length < 2) return null;
  const A = getL(m.a), c = A && linkCenter(A), sp = pts.map(w2s);
  ctx.save(); ctx.strokeStyle = colors.accent; ctx.lineCap = 'round'; ctx.lineWidth = hl ? 5 : 3.5; ctx.beginPath(); sp.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.stroke();
  ctx.lineWidth = 1.4; let acc = 0;
  for (let i = 0; i < sp.length - 1; i++) {
    const a = sp[i], b = sp[i + 1], L = Math.hypot(b.x - a.x, b.y - a.y); if (L < 1e-6) continue;
    let nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L; if (c) { const cs = w2s(c); if ((cs.x - a.x) * nx + (cs.y - a.y) * ny > 0) { nx = -nx; ny = -ny; } } // gạch về phía ngoài part
    for (let t = (8 - acc % 8) % 8; t <= L; t += 8) { const x = a.x + (b.x - a.x) * t / L, y = a.y + (b.y - a.y) * t / L; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + nx * 7 - ny * 5, y + ny * 7 + nx * 5); ctx.stroke(); }
    acc += L;
  }
  ctx.restore();
  return pts[pts.length >> 1];
}
function hitMate(x, y) { for (const m of S.model.mates || []) if (m._lbl && Math.hypot(m._lbl.x - x, m._lbl.y - y) < 11) return m.id; return null; }

// ----- hình gốc đã gộp vào CP ghép: chỉ còn hiện phần biên của CP mới -----
function absorbMap() {
  if (S._absorbFor === S.regions && S._absorb) return S._absorb;
  const map = new Map(), sk = SKM(), pm = SK.ptMap(sk), em = new Map(sk.ents.map(e => [e.id, e]));
  for (const r of S.regions) {
    if (r.kind !== 'c' || r.usedBy) continue;
    for (const id of new Set([...r.ents, ...r.holeEnts])) {
      const e = em.get(id); if (!e || e.cs || e.type === 'point') continue;
      const pts = SK.sample(e, pm).pts, segs = []; let cur = null;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1], len = Math.hypot(b.x - a.x, b.y - a.y); if (len < 1e-9) continue;
        const nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len, n = Math.max(1, Math.ceil(len / .5)), eps = .04;
        for (let k = 0; k < n; k++) {
          const p = { x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n }, q = { x: a.x + (b.x - a.x) * (k + 1) / n, y: a.y + (b.y - a.y) * (k + 1) / n }, mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
          const on = insideDesign(r, { x: mx + nx * eps, y: my + ny * eps }) !== insideDesign(r, { x: mx - nx * eps, y: my - ny * eps });
          if (on) { if (cur) cur.push(q); else { cur = [p, q]; segs.push(cur); } } else cur = null;
        }
      }
      map.set(id, { r, segs });
    }
  }
  // điểm chỉ thuộc hình đã gộp và nằm trong/ngoài (không trên biên) CP mới thì ẩn
  const keep = new Set(), cand = new Map();
  for (const e of sk.ents) { const ab = map.get(e.id); for (const id of SK.entPts(e)) { if (ab) { if (!cand.has(id)) cand.set(id, ab.r); } else keep.add(id); } }
  const pts = new Map(), E = .05;
  for (const [id, r] of cand) { if (keep.has(id)) continue; const p = pm.get(id); if (!p) continue;
    const v = [[E, 0], [-E, 0], [0, E], [0, -E], [E, E], [-E, -E], [E, -E], [-E, E]].map(([dx, dy]) => insideDesign(r, { x: p.x + dx, y: p.y + dy }));
    if (v.every(b => b === v[0])) pts.set(id, r); }
  map.hidPts = pts;
  S._absorb = map; S._absorbFor = S.regions; return map;
}
function absorbedShown(info) { return isSel('r', info.r.key) || isHov('r', info.r.key); }
function absorbSegsScreen(e, info) { const f = e.owner && XF[e.owner]; return info.segs.map(sg => sg.map(p => w2s(f ? f(p) : p))); }
function ungroupCompound(id) { const prev = skSnapshot(); deleteCompound(id); S.sel = null; S.msel = []; sketchChanged({ prev }); }

// ----- Motor trực tiếp trên mate: tịnh tiến (mate Trượt) / xoay (mate Xoay) -----
const mateMotor = mid => S.model.motors.find(mo => mo.mate === mid);
function mateEdgeLen(m) { return Math.hypot(m.eb.x - m.ea.x, m.eb.y - m.ea.y); }
function toggleMateMotor(mid) {
  const m = S.model.mates.find(q => q.id === mid); if (!m || (m.type !== 'sld' && m.type !== 'rev')) return;
  if (S.playing) togglePlay(); commitPose();
  if (mateMotor(mid)) { S.model.motors = S.model.motors.filter(mo => mo.mate !== mid); toast(T('toast_mmotor_off', { m: m.name })); rebuild(); return; }
  if (m.type === 'sld' && !m.drv) { // hành trình mặc định: từ vị trí hiện tại 20 mm về phía còn chỗ trên cạnh
    const c = { a: m.joint, ...mateEdge(S.model, m) }, u = slideU(c, designMap(S.model)), Lc = mateEdgeLen(m), st = Math.min(20, Math.max(Lc, 1));
    m.drv = u + st <= Lc + 1e-6 ? { min: +u.toFixed(2), max: +(u + st).toFixed(2) } : { min: +(u - st).toFixed(2), max: +u.toFixed(2) };
  }
  S.model.motors.push({ id: uid('M'), mate: mid, ratio: 1, phase: 0, phaseSign: 1 }); refreshMotorPhases();
  toast(T(m.type === 'sld' ? 'toast_mmotor_lin' : 'toast_mmotor_rot', { m: m.name })); S.sel = { k: 'q', id: mid }; rebuild();
}
function setMateStroke(mid, key, v) {
  const m = S.model.mates.find(q => q.id === mid); if (!m || !m.drv || !isFinite(v)) return; commitPose();
  if (key === 'len') { if (!(v > 0)) return; m.drv.max = m.drv.min + v; } // độ dài hành trình: giữ điểm đầu
  else if (key === 'min') { const L = m.drv.max - m.drv.min; m.drv.min = v; m.drv.max = v + L; } // dời điểm đầu: giữ độ dài
  else m.drv[key] = v;
  if (m.drv.max < m.drv.min) [m.drv.min, m.drv.max] = [m.drv.max, m.drv.min];
  refreshMotorPhases(); rebuild();
}
// tùy chọn motor trên mate: pb (single / rec / loop), rev (đảo chiều riêng), ang (góc quay của motor xoay, độ)
function setMotorOpt(moId, key, v) {
  const mo = S.model.motors.find(q => q.id === moId); if (!mo) return; if (S.playing) togglePlay(); commitPose();
  if (key === 'ang') { if (!(v > 0)) return; mo.ang = v; } else mo[key] = v;
  if (key === 'pb' || key === 'ang') delete mo.base; // motor xoay: góc gốc = tư thế hiện tại
  refreshMotorPhases(); rebuild();
}
// kiểu chạy "một lần": dừng phát khi motor đi hết một hành trình (x = phase + k·θ chạm mốc 2π kế tiếp theo chiều đang chạy)
function mmSingleInit() {
  S.mmRun = S.cons.filter(c => (c.t === 'ms' || c.t === 'mr') && c.pb === 'single' && c.k).map(c => ({ c, xs: c.phase + c.k * S.theta, acc: 0, B: null }));
}
function mmSingleClamp(dth) { // trả { d, fin }: bước θ được phép
  let d = dth, fin = false; const E = 1e-6, TP = 2 * Math.PI;
  for (const r of S.mmRun || []) {
    if (!dth) break;
    if (r.B == null) { // mốc dừng theo chiều chạy lúc bắt đầu
      if (r.c.k * dth > 0) { r.B = TP * (Math.floor(r.xs / TP) + 1); if (r.B - r.xs < 1e-4) r.B += TP; r.B -= E; }
      else { r.B = TP * (Math.ceil(r.xs / TP) - 1); if (r.xs - r.B < 1e-4) r.B -= TP; r.B += E; }
    }
    const rem = (r.B - r.xs) / r.c.k - r.acc;
    if (Math.sign(rem) === Math.sign(d) && Math.abs(d) >= Math.abs(rem)) { d = rem; fin = true; }
  }
  return { d, fin };
}
function mmSingleAdvance(dth) { for (const r of S.mmRun || []) r.acc += dth; }

// ----- Hành trình motor mate: báo khi không đi hết hành trình khai báo -----
// mô tả từng motor tịnh tiến: vị trí hiện tại so với hành trình khai báo
const mmName = c => c.lin ? jname(c.lin) : ((S.model.mates.find(q => q.id === c.mate) || {}).name || '');
function mmStrokeText(P) {
  return (S.cons || []).filter(c => c.t === 'ms').map(c => T('mm_at', { m: mmName(c), u: (c.lin ? linWrap(c, msU(c, P)) : slideU(c, P)).toFixed(1), a: +c.min.toFixed(2), b: +c.max.toFixed(2) })).join(' · ');
}
const hasMateMotor = () => (S.cons || []).some(c => c.t === 'ms' || c.t === 'mr');
// giới hạn vùng chạy (góc motor chính) có cho motor tịnh tiến đi hết hành trình không → cảnh báo khi bấm chạy
function mmLimitCheck() {
  const lim = S.model.drive.limit; if (!lim.on) return null;
  // kiểu "một lần": từ vị trí hiện tại phải tới mốc cuối hành trình trước biên giới hạn theo chiều chạy
  for (const r of S.mmRun || []) {
    if (r.c.t !== 'ms') continue; const TP = 2 * Math.PI, fwd = r.c.k * S.dir > 0;
    let B = fwd ? TP * (Math.floor(r.xs / TP) + 1) : TP * (Math.ceil(r.xs / TP) - 1); if (Math.abs(B - r.xs) < 1e-4) B += fwd ? TP : -TP;
    const cur = thetaDeg(), need = cur + (B - r.xs) / r.c.k * R2D, edge = S.dir > 0 ? lim.max : lim.min;
    if (S.dir > 0 ? need > edge + 1e-6 : need < edge - 1e-6) {
      const sEdge = mmS(r.c, S.theta + (edge - cur) * D2R), s0 = mmS(r.c, S.theta);
      return T('mm_lim', { m: mmName(r.c), a: (r.c.min + (r.c.max - r.c.min) * s0).toFixed(1), b: (r.c.min + (r.c.max - r.c.min) * sEdge).toFixed(1), A: r.c.min, B: r.c.max, l0: lim.min, l1: lim.max });
    }
  }
  for (const c of (S.cons || []).filter(c => c.t === 'ms' && c.pb !== 'single')) {
    let lo = 1, hi = 0; for (let i = 0; i <= 360; i++) { const s = mmS(c, (lim.min + (lim.max - lim.min) * i / 360) * D2R); lo = Math.min(lo, s); hi = Math.max(hi, s); }
    if (lo > 0.005 || hi < 0.995) { return T('mm_lim', { m: mmName(c), a: (c.min + (c.max - c.min) * lo).toFixed(1), b: (c.min + (c.max - c.min) * hi).toFixed(1), A: c.min, B: c.max, l0: lim.min, l1: lim.max }); }
  }
  return null;
}
// motor mate bị chặn (bộ giải không đẩy tiếp được): dừng tại chỗ, khoanh điểm chạm
function mmBlocked(P) {
  if (S.playing) togglePlay();
  let ac = activeContacts(P), g = ac.length ? contactGeoms(ac[0][0], ac[0][1], P)[0] : null;
  if (!g) { // chưa lấn: chọn cặp có khoảng hở nhỏ nhất (danh sách va chạm/tiếp xúc hiện tại)
    const drv = new Set(S.model.motors.filter(mo => mo.mate).map(mo => (S.model.mates.find(q => q.id === mo.mate) || {}).a));
    for (const mo of S.model.motors) if (mo.lin) for (const L of linksOf(mo.lin)) drv.add(L.id);
    const cn = collNow(), o = cn && cn.list && (cn.list.find(q => drv.has(q.a) || drv.has(q.b)) || cn.list[0]);
    if (o) { const dA = drv.has(o.a), A = getL(dA ? o.a : o.b), B = getL(dA ? o.b : o.a), q = o.pts && o.pts[0]; if (A && B) g = { K: B, B: A, C: q ? { x: q.x, y: q.y } : null }; }
  }
  S.jamShow = g && g.C ? { pos: S.pos, C: g.C } : null; afterMove();
  toast(T('toast_mm_block', { t: thetaDeg().toFixed(1), s: mmStrokeText(S.pos), w: g ? T('mm_hit', { b: g.B.name, k: g.K.name }) : '' }), 9000);
}
