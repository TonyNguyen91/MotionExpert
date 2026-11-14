// ===== Quét chọn kiểu CAD + sao chép / dán khâu và part =====
// Kéo chuột trái trên chỗ trống: trái → phải = khung "cửa sổ" (phần tử phải nằm trọn trong khung),
// phải → trái = khung "chạm" (chỉ cần chạm khung). Shift / Ctrl: cộng thêm vào lựa chọn đang có.
const boxCrossing = d => d.x1 < d.x0;
// điểm biên (thế giới) của một khâu ở tư thế P: biên dạng va chạm (thanh / tấm / part); xi lanh = đoạn nối 2 khớp
function linkWorldOutline(L, P = S.pos) {
  if (L.kind === 'cyl') { const a = P[L.joints[0]], b = P[L.joints[1]]; if (!a || !b) return []; const out = []; for (let i = 0; i <= 12; i++) out.push({ x: a.x + (b.x - a.x) * i / 12, y: a.y + (b.y - a.y) * i / 12 }); return out; }
  const sh = collData().shapes[L.id], fD = frameOf(L, designMap(S.model)), fN = frameOf(L, P);
  if (!sh || !fD || !fN) return L.joints.map(id => P[id]).filter(Boolean);
  // samp: tọa độ cục bộ (khung thiết kế) → thế giới (khung P)
  const out = [], s = sh.samp, step = Math.max(1, Math.floor(s.length / 2 / 400));
  for (let i = 0; i < s.length; i += 2 * step) out.push(toWorld(fN, { u: s[i], v: s[i + 1] }));
  return out;
}
const linkScreenOutline = L => linkWorldOutline(L).map(w2s);
// đoạn thẳng màn hình cắt hình chữ nhật? (Liang–Barsky)
function segHitsRect(a, b, x0, y0, x1, y1) {
  let t0 = 0, t1 = 1; const dx = b.x - a.x, dy = b.y - a.y;
  for (const [p, q] of [[-dx, a.x - x0], [dx, x1 - a.x], [-dy, a.y - y0], [dy, y1 - a.y]]) {
    if (Math.abs(p) < 1e-12) { if (q < 0) return false; continue; }
    const r = q / p; if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return true;
}
function boxSelectEnd(d) {
  S.boxSel = null;
  const x0 = Math.min(d.x0, d.x1), x1 = Math.max(d.x0, d.x1), y0 = Math.min(d.y0, d.y1), y1 = Math.max(d.y0, d.y1), cross = boxCrossing(d);
  if (x1 - x0 < 4 && y1 - y0 < 4) { if (!d.add) { S.sel = null; S.msel = []; } renderList(); renderProps(); draw(); return; } // bấm (không kéo) trên chỗ trống = bỏ chọn
  const inR = p => p && p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;
  const take = pts => pts.length && (cross ? pts.some(inR) : pts.every(inR));
  const add = [], mps = [];
  for (const L of S.model.links) {
    if (d.mpOnly && !isBody(L)) continue;
    const pts = linkScreenOutline(L); let hit = take(pts);
    if (!hit && cross) hit = hitLink((x0 + x1) / 2, (y0 + y1) / 2, new Set(S.model.links.filter(q => q !== L).map(q => q.id))) === L.id; // khung nằm gọn trong khâu
    if (hit) (isBody(L) ? mps : add).push({ k: 'l', id: L.id });
  }
  if (!d.mpOnly) for (const j of S.model.joints) if (!j.hidden && S.pos[j.id] && inR(w2s(S.pos[j.id]))) add.push({ k: 'j', id: j.id });
  // ưu tiên MP (part): khung chạm / chứa MP thì chỉ chọn MP; không có MP → khâu / khớp; không có nữa → nét phác thảo
  let mech = mps.length > 0 || add.length > 0 || !!d.mpOnly, items = mps.length ? mps : add;
  if (!mech && sketchVisible()) {
    const sk = SKM(), pm = SK.ptMap(sk);
    items = [];
    for (const e of sk.ents) {
      const pts = sampleNow(e, pm).map(w2s); if (!pts.length) continue;
      let hit = cross ? pts.some(inR) : pts.every(inR);
      if (!hit && cross) for (let i = 0; i < pts.length - 1 && !hit; i++) hit = segHitsRect(pts[i], pts[i + 1], x0, y0, x1, y1);
      if (hit) items.push({ k: 'e', id: e.id });
    }
  }
  const keep = d.add ? (S.msel || []).filter(o => isMechSel(o) === mech) : [];
  for (const o of items) if (!keep.some(q => q.k === o.k && q.id === o.id)) keep.push(o);
  S.msel = keep; S.sel = keep[0] || null;
  if (keep.length) toast(T(cross ? 'toast_box_cross' : 'toast_box_win', { n: keep.length }));
  if (isMPTool(S.tool)) mpAfterBox();
  renderList(); renderProps(); draw();
}
function drawBoxSel() {
  const d = S.boxSel; if (!d) return;
  const cross = boxCrossing(d), col = cross ? colors.ok : colors.accent;
  const x = Math.min(d.x0, d.x1), y = Math.min(d.y0, d.y1), w = Math.abs(d.x1 - d.x0), h = Math.abs(d.y1 - d.y0);
  ctx.fillStyle = col; ctx.globalAlpha = .08; ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1;
  ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.setLineDash(cross ? [5, 4] : []); ctx.strokeRect(x + .5, y + .5, w, h); ctx.setLineDash([]);
}

// ----- Sao chép / dán (Ctrl+C / Ctrl+V): khâu (thanh, tấm, xi lanh) và part kèm biên dạng phác thảo, lỗ, rãnh, motor, mate trong nhóm -----
// Bản sao không nối với phần còn lại (khớp dùng chung được nhân đôi thành khớp riêng); mate nối ra ngoài nhóm không được chép.
// packLinks / placePack dùng chung cho Ctrl+C/V và mảng MP (mpart.js).
let CLIP = null, pasteN = 0;
const jclone = o => JSON.parse(JSON.stringify(o));
function packLinks(ids) {
  const P = S.pos, M = S.model, sk = SKM(), pm = SK.ptMap(sk), set = new Set(ids);
  const links = ids.map(id => jclone(getL(id)));
  // mate trong nhóm (hoặc nối với nền); mate nối tới part / khâu ngoài nhóm bị bỏ
  const near = (M.mates || []).filter(q => set.has(q.a) || (q.b && set.has(q.b)));
  const mates = near.filter(q => set.has(q.a) && (!q.b || set.has(q.b))).map(jclone);
  const jids = new Set(links.flatMap(L => L.joints));
  for (const q of mates) for (const id of [q.joint, q.k, ...(q.own || [])]) if (id && getJ(id)) jids.add(id);
  // phác thảo thuộc các khâu: điểm đưa về tư thế hiện tại
  const ents = sk.ents.filter(e => set.has(e.owner)).map(jclone), entIds = new Set(ents.map(e => e.id));
  const joints = [...jids].map(id => { const j = jclone(getJ(id)); j.x = P[id].x; j.y = P[id].y; if (j.path && !entIds.has(j.path.ent)) delete j.path; if (j.slot && !M.slots.some(s => s.id === j.slot && set.has(s.link))) j.slot = null; return j; });
  const ptIds = new Set(ents.flatMap(e => SK.entPts(e)));
  const pts = [...ptIds].map(id => {
    const p = pm.get(id); if (!p) return null; const own = S.skPtOwner.get(id), L = own && getL(own), fO = L && S.skFrames[L.id], fN = L && frameOf(L, P);
    const w = fO && fN ? toWorld(fN, toLocal(fO, p)) : p; return { ...jclone(p), x: w.x, y: w.y };
  }).filter(Boolean);
  const skIds = new Set([...sk.ents.map(e => e.id), ...sk.pts.map(p => p.id)]), mine = new Set([...ents.map(e => e.id), ...ptIds]);
  const local = o => Object.entries(o).every(([k, v]) => k === 'id' || k === 'owner' || typeof v !== 'string' || !skIds.has(v) || mine.has(v));
  const cons = sk.cons.filter(c => Object.values(c).some(v => mine.has(v)) && local(c)).map(c => ({ ...c }));
  const dims = (sk.dims || []).filter(c => Object.values(c).some(v => mine.has(v)) && local(c)).map(c => ({ ...c }));
  const features = M.features.filter(f => set.has(f.link)).map(jclone);
  // tổ hợp boolean mà feature dùng (kể cả lồng nhau)
  const comps = [], seen = new Set(), addComp = id => { const c = M.compounds.find(q => q.id === id); if (!c || seen.has(id)) return; seen.add(id); comps.push(jclone(c)); JSON.stringify(c).replace(/"([^"]+)"/g, (_, x) => { if (x !== id && M.compounds.some(q => q.id === x)) addComp(x); return _; }); };
  features.forEach(f => f.comp && addComp(f.comp));
  const slots = M.slots.filter(s => set.has(s.link)).map(jclone), mids = new Set(mates.map(q => q.id));
  const motors = M.motors.filter(mo => (mo.link && set.has(mo.link) && jids.has(mo.joint)) || (mo.cyl && set.has(mo.cyl)) || (mo.lin && jids.has(mo.lin)) || (mo.mate && mids.has(mo.mate))).map(jclone);
  const n = joints.filter(j => !j.hidden).length ? joints.filter(j => !j.hidden) : joints;
  const c = { x: n.reduce((s, j) => s + j.x, 0) / n.length, y: n.reduce((s, j) => s + j.y, 0) / n.length };
  return { links, joints, ents, pts, cons, dims, features, comps, slots, motors, mates, c, dropped: near.length - mates.length };
}
// đặt một bản sao của gói: f = phép biến đổi cứng (thế giới → thế giới), ang = góc xoay của f (rad); trả về các khâu mới
// mir = { phi } khi f là phản xạ qua trục có góc phi: đảo chiều cung/spline, góc khớp trượt, góc ràng buộc hv/ang, mate nền
function placePack(pack, f, ang = 0, mir = null) {
  if (mir) { pack.cons = pack.cons.filter(c => c.type !== 'fix'); pack.links.forEach(L => { L.pins = []; }); } // cố định sẽ đặt lại theo tư thế đối xứng
  pack.links.forEach(L => { L.splits = null; L.xcons = null; }); // bản sao không dùng chung điểm với khâu gốc
  // đổi mọi id trong gói sang id mới (thay theo từng giá trị chuỗi; id mẫu có thể rất ngắn như 'A', 'L1'); bỏ qua các trường mô tả
  const map = new Map(), fresh = id => (/^[a-z]/.test(id) ? id[0] : 'x') + Math.random().toString(36).slice(2, 8);
  for (const k of ['links', 'joints', 'ents', 'pts', 'cons', 'dims', 'features', 'comps', 'slots', 'motors', 'mates']) for (const o of pack[k] || []) if (o.id) map.set(o.id, fresh(o.id));
  const SKIP = new Set(['name', 'type', 'kind', 'op', 'mode', 'pb', 'label', 'm']);
  const remap = (o, key) => typeof o === 'string' ? (SKIP.has(key) || !map.has(o) ? o : map.get(o)) : Array.isArray(o) ? o.map(v => remap(v, key)) : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, remap(v, k)])) : o;
  const { c, dropped, lastAt, rep, ...body } = pack;
  const B = remap(jclone(body), ''), m = S.model, sk = SKM(), F = p => { const q = f(p); return { x: q.x, y: q.y }; };
  if (mir) { // phản xạ: cung đổi điểm đầu/cuối (chiều quay ngược), spline đảo thứ tự, góc hv/ang đổi dấu
    for (const e of B.ents) { if (e.type === 'arc') { const t = e.a; e.a = e.b; e.b = t; } else if (e.type === 'spline' && Array.isArray(e.pts)) e.pts = [...e.pts].reverse(); }
    for (const c of B.cons) if (c.type === 'hv' && c.a != null) c.a = -c.a;
    for (const d of B.dims) { if (d.type === 'ang') d.sign = -(d.sign || 1); if (d.ang != null) d.ang = 2 * mir.phi - d.ang; }
  }
  for (const j of B.joints) {
    const p = F(j); j.x = p.x; j.y = p.y; if (!j.hidden) j.name = newJointName();
    if (j.slider && j.fixed) j.slider = null; else if (j.slider && mir) j.slider = { ...j.slider, ang: 2 * mir.phi - j.slider.ang }; else if (j.slider && ang) j.slider = { ...j.slider, ang: j.slider.ang + ang };
    m.joints.push(j);
  }
  for (const p of B.pts) { const q = F(p); p.x = q.x; p.y = q.y; sk.pts.push(p); }
  for (const c of B.cons) if (c.type === 'fix' && !c.owner && c.x != null && !B.ents.some(e => e.owner && SK.entPts(e).includes(c.p))) { const q = F(c); c.x = q.x; c.y = q.y; }
  sk.ents.push(...B.ents); sk.cons.push(...B.cons); (sk.dims = sk.dims || []).push(...B.dims);
  for (const L of B.links) {
    L.name = L.kind === 'body' ? nextName(m.links.filter(l => l.kind === 'body'), 'K') : nextName(m.links, L.kind === 'cyl' ? 'X' : 'L');
    if (L.rest) L.rest = L.rest.map(F);
    if (L.guide) { const q = F(L.guide); L.guide = { ...L.guide, x: +q.x.toFixed(2), y: +q.y.toFixed(2) }; }
    delete L.hitSaved; delete L.sweep;
    m.links.push(L);
  }
  for (const s of B.slots) { s.name = nextName(m.slots, 'R'); m.slots.push(s); }
  for (const mo of B.motors) if (mo.o) mo.o = F(mo.o);
  m.mates = m.mates || [];
  for (const q of B.mates) { // mate với nền: cạnh nền (thế giới) và góc tương đối với nền đổi theo bản sao
    q.name = nextName(m.mates, 'M');
    if (!q.b) { if (q.ea) q.ea = F(q.ea); if (q.eb) q.eb = F(q.eb); if ((q.type === 'sld' || q.type === 'par') && q.c != null) q.c = mir ? 2 * mir.phi - q.c : q.c + ang; }
    else if (q.type === 'eq' && q.c != null) q.c = mir ? -q.c : q.c + 2 * ang;
    m.mates.push(q);
  }
  m.features.push(...B.features); m.compounds.push(...B.comps); m.motors.push(...B.motors);
  // khung phác thảo của khâu mới = khung ở tư thế mới (điểm phác thảo đã ở đúng chỗ)
  const D = designMap(m); for (const L of B.links) if (L.joints.length >= 2) { S.skFrames[L.id] = frameOf(L, D); if (isBody(L)) L.dframe = S.skFrames[L.id]; }
  for (const L of B.links) if (L.kind === 'body') freezeForPart(L, sk.ents.filter(e => e.owner === L.id)); // giữ hình tại tư thế mới (cố định theo khung của bản sao)
  return B.links;
}
function copySel() {
  const ids = [...new Set([...(S.msel || []), S.sel].filter(o => o && o.k === 'l').map(o => o.id))].filter(id => getL(id));
  if (!ids.length) { toast(T('toast_copy_none')); return; }
  CLIP = packLinks(ids); pasteN = 0;
  toast(T('toast_copied', { n: CLIP.links.length }));
}
function pasteClip() {
  if (!CLIP) { toast(T('toast_paste_none')); return; }
  if (S.playing) togglePlay(); commitPose(); pasteN++;
  // vị trí dán: tâm bản sao đặt tại con trỏ (nếu con trỏ trên bản vẽ), không thì lệch dần 10 mm
  const cur = S.cursor && S.cursor.w && S.cursor.x >= 0 && S.cursor.y >= 0 && S.cursor.x <= W && S.cursor.y <= H ? S.cursor.w : null;
  // dán lặp lại khi con trỏ đứng yên → mỗi lần lệch thêm 10 mm để bản sao không chồng lên nhau
  const same = cur && CLIP.lastAt && Math.hypot(cur.x - CLIP.lastAt.x, cur.y - CLIP.lastAt.y) < 1; CLIP.rep = same ? (CLIP.rep || 0) + 1 : 0; if (cur) CLIP.lastAt = { x: cur.x, y: cur.y };
  const off = cur && Math.hypot(cur.x - CLIP.c.x, cur.y - CLIP.c.y) > 1 ? { x: cur.x - CLIP.c.x + 10 * CLIP.rep, y: cur.y - CLIP.c.y - 10 * CLIP.rep } : { x: 10 * pasteN, y: -10 * pasteN };
  const made = placePack(CLIP, p => ({ x: p.x + off.x, y: p.y + off.y }), 0);
  skOwnerMap(); refreshMotorPhases();
  S.msel = made.map(L => ({ k: 'l', id: L.id })); S.sel = S.msel[0];
  toast(T('toast_pasted', { n: made.length })); rebuild();
}
