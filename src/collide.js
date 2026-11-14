// ===== Kiểm tra va chạm giữa các khâu (thân thanh/tấm ∪ CP hợp nhất − CP khoét − rãnh) =====
// Mỗi khâu được rời rạc thành lưới ô trong hệ trục cục bộ (tư thế thiết kế): 0 = ngoài, 1 = sát biên, 2 = bên trong.
// Lưới "chạm" gt = thân khâu nới thêm 1 ô (8 hướng). Va chạm = tâm ô biên của khâu này rơi vào gt của khâu kia
// → tiếp xúc mép-mép (khe hở dưới ~1 ô lưới) cũng tính là va chạm.
// Bỏ qua cặp khâu: khác lớp, chung khớp, có mate với nhau, chốt-trong-rãnh của nhau, cả hai đứng yên; xi lanh không xét.
S.opt.coll = true; S.opt.collstop = false;
S.coll = null; S.collSweep = null;
const COLL_CELLS = 90000, COLL_HMIN = 0.2;
let collCache = { key: null, regions: null, shapes: null, pairs: null };

function collKey() {
  const m = S.model, used = new Set(); m.links.forEach(L => L.joints.forEach(id => used.add(id)));
  return JSON.stringify([m.links.map(L => [L.id, L.joints, L.w, L.kind, L.layer, L.nocoll]), m.joints.filter(j => used.has(j.id)).map(j => [j.id, j.x, j.y, j.fixed, j.slot]),
    m.slots, m.slots.some(s => s.ent) ? JSON.stringify(m.sketch.pts) : 0, m.features.map(f => [f.id, f.link, f.op]), (m.mates || []).map(q => [q.a, q.b])]);
}
// hàm thuộc thân khâu, tọa độ thế giới ở tư thế thiết kế (cùng thứ tự phép toán như drawLinkBody)
function bodyInside(L, D) {
  const P = L.joints.map(id => D[id]), hw = (L.w || 6) / 2, bar = L.kind !== 'body', fD = frameOf(L, D);
  const segs = P.length > 2 ? P.map((p, i) => [p, P[(i + 1) % P.length]]) : [[P[0], P[1]]];
  const feats = S.model.features.filter(f => f.link === L.id && S.featReg[f.id]).map(f => [f.op, S.featReg[f.id]]);
  const slots = S.model.slots.filter(s => s.link === L.id).map(s => ({ pts: s.ent ? slotPoly(s, D).pts : [toWorld(fD, { u: s.a.x, v: s.a.y }), toWorld(fD, { u: s.b.x, v: s.b.y })], r: s.w / 2 }));
  return p => {
    let v = bar && (segs.some(([a, b]) => segDist(p.x, p.y, a, b).d <= hw) || (P.length > 2 && inPoly(p.x, p.y, P)));
    for (const [op, r] of feats) { const q = insideDesign(r, p); v = op === 'subtract' ? v && !q : op === 'intersect' ? v && q : v || q; }
    if (v) for (const s of slots) if (polyNear(p.x, p.y, s.pts).d < s.r) return false;
    return v;
  };
}
function collShape(L, D) {
  const fD = frameOf(L, D); if (!fD) return null;
  const inside = bodyInside(L, D), hw = (L.w || 6) / 2;
  let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
  const ext = (p, r) => { const l = toLocal(fD, p); u0 = Math.min(u0, l.u - r); u1 = Math.max(u1, l.u + r); v0 = Math.min(v0, l.v - r); v1 = Math.max(v1, l.v + r); };
  if (L.kind !== 'body') L.joints.forEach(id => ext(D[id], hw));
  for (const f of S.model.features) { const r = f.link === L.id && f.op === 'union' && S.featReg[f.id]; if (r) (r.kind === 'c' ? r.pts : r.outer).forEach(p => ext(p, 0)); }
  if (!(u1 > u0)) return null;
  const h = Math.max(COLL_HMIN, Math.sqrt((u1 - u0 + 2) * (v1 - v0 + 2) / COLL_CELLS));
  u0 -= h; v0 -= h; const nx = Math.ceil((u1 - u0) / h) + 2, ny = Math.ceil((v1 - v0) / h) + 2;
  const g = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (inside(toWorld(fD, { u: u0 + (i + .5) * h, v: v0 + (j + .5) * h }))) g[j * nx + i] = 2;
  const samp = [];
  for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const k = j * nx + i; if (!g[k]) continue;
    if (!g[k - 1] || !g[k + 1] || !g[k - nx] || !g[k + nx]) { g[k] = 1; samp.push(u0 + (i + .5) * h, v0 + (j + .5) * h); }
  }
  if (!samp.length) return null;
  const gt = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (!g[j * nx + i]) continue;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a < nx && b < ny) gt[b * nx + a] = 1; }
  }
  return { id: L.id, h, u0, v0, nx, ny, g, gt, sd: collSDF(g, nx, ny, h), samp: Float64Array.from(samp), box: [u0, v0, u0 + nx * h, v0 + ny * h] };
}
// trường khoảng cách có dấu tại tâm ô (âm = trong thân), biến đổi khoảng cách chamfer 2 lượt
function collSDF(g, nx, ny, h) {
  const N = nx * ny, dIn = new Float32Array(N), dOut = new Float32Array(N), d2 = h * Math.SQRT2;
  for (let k = 0; k < N; k++) { dIn[k] = g[k] ? 1e9 : 0; dOut[k] = g[k] ? 0 : 1e9; }
  for (const d of [dIn, dOut]) {
    const at = (i, j) => i < 0 || j < 0 || i >= nx || j >= ny ? (d === dIn ? 0 : 1e9) : d[j * nx + i];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i; d[k] = Math.min(d[k], at(i - 1, j) + h, at(i, j - 1) + h, at(i - 1, j - 1) + d2, at(i + 1, j - 1) + d2); }
    for (let j = ny - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) { const k = j * nx + i; d[k] = Math.min(d[k], at(i + 1, j) + h, at(i, j + 1) + h, at(i + 1, j + 1) + d2, at(i - 1, j + 1) + d2); }
  }
  const sd = new Float32Array(N); for (let k = 0; k < N; k++) sd[k] = g[k] ? h / 2 - dIn[k] : dOut[k] - h / 2;
  return sd;
}
// nội suy song tuyến khoảng cách có dấu tại (u, v) cục bộ; ngoài lưới thì ngoại suy liên tục (giá trị biên + khoảng ra ngoài)
// → hàm luôn hữu hạn, đạo hàm số trong solveLM không ra NaN khi điểm vừa rời lưới
function collSdAt(B, u, v) {
  const x = (u - B.u0) / B.h - .5, y = (v - B.v0) / B.h - .5, mx = B.nx - 1.000001, my = B.ny - 1.000001;
  const cx = Math.min(mx, Math.max(0, x)), cy = Math.min(my, Math.max(0, y)), out = Math.hypot(x - cx, y - cy) * B.h;
  const i = Math.floor(cx), j = Math.floor(cy), fx = cx - i, fy = cy - j, k = j * B.nx + i, sd = B.sd;
  return (sd[k] * (1 - fx) + sd[k + 1] * fx) * (1 - fy) + (sd[k + B.nx] * (1 - fx) + sd[k + B.nx + 1] * fx) * fy + out;
}
// như collSdAt nhưng trả thêm gradient theo (u, v) cục bộ: [sd, gu, gv]
function collSdGrad(B, u, v) {
  const x = (u - B.u0) / B.h - .5, y = (v - B.v0) / B.h - .5, mx = B.nx - 1.000001, my = B.ny - 1.000001;
  const cx = Math.min(mx, Math.max(0, x)), cy = Math.min(my, Math.max(0, y)), ox = x - cx, oy = y - cy, od = Math.hypot(ox, oy);
  const i = Math.floor(cx), j = Math.floor(cy), fx = cx - i, fy = cy - j, k = j * B.nx + i, sd = B.sd, n = B.nx;
  const a = sd[k], b = sd[k + 1], c = sd[k + n], d = sd[k + n + 1];
  let gu = cx === x ? ((b - a) * (1 - fy) + (d - c) * fy) / B.h : 0, gv = cy === y ? ((c - a) * (1 - fx) + (d - b) * fx) / B.h : 0;
  if (od > 0) { gu += ox / od; gv += oy / od; }
  return [(a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy + od * B.h, gu, gv];
}
// đạo hàm hệ trục khâu (gốc P0, trục e = (P1−P0)/|P1−P0|): M = (I − e·eᵀ)/|d| = ∂e/∂P1 = −∂e/∂P0, ∂e⊥ = R·∂e
function frameJac(f, P0, P1) { const L = Math.hypot(P1.x - P0.x, P1.y - P0.y) || 1; return { m11: (1 - f.ex * f.ex) / L, m12: -f.ex * f.ey / L, m22: (1 - f.ey * f.ey) / L }; }
function collPairs(shapes) {
  const m = S.model, out = [], ids = Object.keys(shapes);
  const mated = new Set((m.mates || []).filter(q => q.a && q.b).flatMap(q => [q.a + '|' + q.b, q.b + '|' + q.a]));
  const pinIn = (A, B) => A.joints.some(id => { const j = getJ(id), s = j && j.slot && getSlot(j.slot); return s && s.link === B.id; });
  const still = L => L.joints.every(id => (getJ(id) || {}).fixed);
  for (let i = 0; i < ids.length; i++) for (let k = i + 1; k < ids.length; k++) {
    const A = getL(ids[i]), B = getL(ids[k]);
    if (A.nocoll || B.nocoll || (A.layer || 0) !== (B.layer || 0) || A.joints.some(id => B.joints.includes(id)) || mated.has(A.id + '|' + B.id) || pinIn(A, B) || pinIn(B, A) || (still(A) && still(B))) continue;
    out.push([shapes[ids[i]], shapes[ids[k]]]);
  }
  return out;
}
function collData() {
  const key = collKey();
  if (collCache.key === key && collCache.regions === S.regions) return collCache;
  const D = designMap(S.model), shapes = {};
  for (const L of S.model.links) { if (L.kind === 'cyl' || L.joints.length < 2 || !L.joints.every(id => D[id])) continue; const sh = collShape(L, D); if (sh) shapes[L.id] = sh; }
  collCache = { key, regions: S.regions, shapes, pairs: collPairs(shapes) };
  return collCache;
}
// ----- tương tác vật lý: part (khâu kind 'body') bị khâu khác đẩy, không lấn vào nhau -----
// Mỗi cặp part–khâu thành một ràng buộc một chiều 'ct' cho solveLM: phần dư = độ lấn của điểm biên vào thân bên kia.
const physOn = () => S.model.phys !== false;
const CT_S = 0.02, CT_SHIFT = 3 * CT_S;
const isPhysPair = (A, B) => getL(A.id).kind === 'body' || getL(B.id).kind === 'body';
function ctRowsFn(A, B, LA, LB) {
  const fa = [LA.joints[0], LA.joints[1]], fb = [LB.joints[0], LB.joints[1]], nA = A.samp.length / 2;
  const mA = A.h / 2, mB = B.h / 2; // điểm biên nằm trong thân ~nửa ô → tiếp xúc khi cách thân kia nửa ô
  const one = (S0, f0, S1, f1, i, m) => { const u = S0.samp[2 * i], v = S0.samp[2 * i + 1], w = toWorld(f0, { u, v }), l = toLocal(f1, w); return m - collSdAt(S1, l.u, l.v); };
  // phần dư trơn (softplus, độ mềm CT_S): không có điểm gãy ở 0 → LM không bị kẹt khi điểm mẫu bật/tắt
  let near = null, ref = null;
  // dời ngưỡng CT_SHIFT: tại điểm vừa chạm (x = 0) phần dư ≈ 0.001 thay vì CT_S·ln2 ≈ 0.014 — tiếp xúc theo cả một cạnh (hàng chục điểm)
  // không còn “đẩy” tranh với ràng buộc cứng làm khâu căng quá dung sai; vẫn trong mức lấn cho phép 0.1 mm
  const sp = x => (x -= CT_SHIFT) > 0 ? x + CT_S * Math.log1p(Math.exp(-x / CT_S)) : CT_S * Math.log1p(Math.exp(x / CT_S));
  const sig = x => 1 / (1 + Math.exp(-(x - CT_SHIFT) / CT_S)); // sp'(x)
  // đạo hàm giải tích của x = m − sd_T(điểm mẫu của S0 trong hệ T) theo 4 tọa độ khung: thay 8 lần tính lại bằng sai phân số
  // trả [x, gP0s, gP1s, gP0t, gP1t] (mỗi g = [gx, gy])
  const oneG = (S0, f0, J0, S1, f1, J1, i, m) => {
    const u = S0.samp[2 * i], v = S0.samp[2 * i + 1], w = toWorld(f0, { u, v }), rx = w.x - f1.ox, ry = w.y - f1.oy;
    const q = { u: rx * f1.ex + ry * f1.ey, v: -rx * f1.ey + ry * f1.ex }, [sd, gu, gv] = collSdGrad(S1, q.u, q.v);
    const gwx = gu * f1.ex - gv * f1.ey, gwy = gu * f1.ey + gv * f1.ex; // ∂sd/∂w (thế giới)
    // nguồn: w = P0 + u·e + v·e⊥ → ∂w/∂P1 = u·M + v·R·M, ∂w/∂P0 = I − ∂w/∂P1
    const Ms = J0, a11 = u * Ms.m11 - v * Ms.m12, a12 = u * Ms.m12 - v * Ms.m22, a21 = u * Ms.m12 + v * Ms.m11, a22 = u * Ms.m22 + v * Ms.m12;
    const g1s = [gwx * a11 + gwy * a21, gwx * a12 + gwy * a22], g0s = [gwx - g1s[0], gwy - g1s[1]];
    // đích: q_u = r·e, q_v = r·e⊥ (r = w − P0) → ∂q/∂P1 = (M·r, M·Rᵀ·r), ∂q/∂P0 = −(e, e⊥) − ∂q/∂P1
    const Mt = J1, Mr = [Mt.m11 * rx + Mt.m12 * ry, Mt.m12 * rx + Mt.m22 * ry], Mrt = [Mt.m11 * ry - Mt.m12 * rx, Mt.m12 * ry - Mt.m22 * rx];
    const g1t = [gu * Mr[0] + gv * Mrt[0], gu * Mr[1] + gv * Mrt[1]], g0t = [-gu * f1.ex + gv * f1.ey - g1t[0], -gu * f1.ey - gv * f1.ex - g1t[1]];
    const x = m - sd; return [x, [-g0s[0], -g0s[1]], [-g1s[0], -g1s[1]], [-g0t[0], -g0t[1]], [-g1t[0], -g1t[1]]];
  };
  return (P, act, grad) => {
    const f0 = frameOf({ joints: fa }, P), f1 = frameOf({ joints: fb }, P);
    if (act) return { act, r: act.map(k => sp(k < nA ? one(A, f0, B, f1, k, mA) : one(B, f1, A, f0, k - nA, mB))) };
    if (grad) { // hàng + gradient giải tích theo (id khớp, trục)
      const out = rowsOf(P, f0, f1), Ja = frameJac(f0, P[fa[0]], P[fa[1]]), Jb = frameJac(f1, P[fb[0]], P[fb[1]]);
      out.g = out.act.map(k => {
        const [x, s0, s1, t0, t1] = k < nA ? oneG(A, f0, Ja, B, f1, Jb, k, mA) : oneG(B, f1, Jb, A, f0, Ja, k - nA, mB);
        const ds = sig(x), ids = k < nA ? [fa[0], fa[1], fb[0], fb[1]] : [fb[0], fb[1], fa[0], fa[1]], gs = [s0, s1, t0, t1], g = [];
        ids.forEach((id, n) => g.push([id, 0, gs[n][0] * ds], [id, 1, gs[n][1] * ds]));
        return g;
      });
      return out;
    }
    return rowsOf(P, f0, f1);
  };
  function rowsOf(P, f0, f1) {
    const out = { act: [], r: [] }, cut = -6 * CT_S, J = [fa[0], fa[1], fb[0], fb[1]].map(id => P[id]);
    // chỉ quét lại toàn bộ khi khung dời > 0.2 mm so với lần quét trước; còn lại xét các điểm trong dải 1.5 mm
    if (!near || J.some((p, i) => Math.hypot(p.x - ref[i].x, p.y - ref[i].y) > 0.2)) {
      ref = J.map(p => ({ x: p.x, y: p.y })); near = [];
      const a = collWorldBox(A, f0), b = collWorldBox(B, f1);
      if (a[0] > b[2] + 2 || b[0] > a[2] + 2 || a[1] > b[3] + 2 || b[1] > a[3] + 2) return out;
      for (let k = 0; k < nA; k++) if (one(A, f0, B, f1, k, mA) > -1.5) near.push(k);
      for (let k = 0; k < B.samp.length / 2; k++) if (one(B, f1, A, f0, k, mB) > -1.5) near.push(nA + k);
    }
    for (const k of near) { const x = k < nA ? one(A, f0, B, f1, k, mA) : one(B, f1, A, f0, k - nA, mB); if (x > cut) { out.act.push(k); out.r.push(sp(x)); } }
    return out;
  }
}
// gọi trong rebuild: cặp đã chồng lấn sẵn ở tư thế thiết kế thì bỏ qua (nếu không cơ cấu sẽ kẹt ngay)
function contactCons() {
  S.physSkip = [];
  if (!physOn()) return [];
  const cd = collData(), D = designMap(S.model), out = [];
  for (const [A, B] of cd.pairs) {
    if (!isPhysPair(A, B)) continue;
    const LA = getL(A.id), LB = getL(B.id), rows = ctRowsFn(A, B, LA, LB), o = rows(D, null);
    if (o.r.some(r => r > Math.max(A.h, B.h))) { S.physSkip.push([A.id, B.id]); continue; }
    out.push({ t: 'ct', ids: [...new Set([LA.joints[0], LA.joints[1], LB.joints[0], LB.joints[1]])], rows, pair: A.id + '|' + B.id });
  }
  return out;
}
function collWorldBox(sh, f) {
  const [a, b, c, d] = sh.box; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [u, v] of [[a, b], [c, b], [a, d], [c, d]]) { const p = toWorld(f, { u, v }); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  return [x0, y0, x1, y1];
}
// điểm biên của A chạm hoặc lấn vào B; trả về điểm thế giới (tối đa cap), hoặc true/false nếu chỉ cần biết có/không
function collHits(A, fA, B, fB, out, cap) {
  const s = A.samp, n = s.length;
  // ghép phép biến đổi cục bộ A → cục bộ B: q = R·p + t
  const c = fA.ex * fB.ex + fA.ey * fB.ey, sn = fA.ey * fB.ex - fA.ex * fB.ey;
  const dx = fA.ox - fB.ox, dy = fA.oy - fB.oy, tu = dx * fB.ex + dy * fB.ey, tv = -dx * fB.ey + dy * fB.ex;
  let hit = false;
  for (let i = 0; i < n; i += 2) {
    const u = s[i], v = s[i + 1], qu = c * u - sn * v + tu, qv = sn * u + c * v + tv;
    const ci = Math.floor((qu - B.u0) / B.h), cj = Math.floor((qv - B.v0) / B.h);
    if (ci < 0 || cj < 0 || ci >= B.nx || cj >= B.ny || !B.gt[cj * B.nx + ci]) continue;
    hit = true; if (!out) return true;
    if (out.length < cap) out.push(toWorld(fA, { u, v }));
  }
  return hit;
}
// va chạm ở tư thế pos: [{ a, b, pts }] (pts = null nếu ptsOn = false)
function collAt(pos, ptsOn = true) {
  const cd = collData(), res = [], fr = {}, box = {};
  for (const id in cd.shapes) { const f = frameOf(getL(id), pos); if (f) { fr[id] = f; box[id] = collWorldBox(cd.shapes[id], f); } }
  const tol = id => 2 * cd.shapes[id].h;
  for (const [A, B] of cd.pairs) {
    const fA = fr[A.id], fB = fr[B.id]; if (!fA || !fB) continue;
    const a = box[A.id], b = box[B.id]; const t = tol(A.id) + tol(B.id); if (a[0] > b[2] + t || b[0] > a[2] + t || a[1] > b[3] + t || b[1] > a[3] + t) continue;
    const pts = ptsOn ? [] : null;
    const h1 = collHits(A, fA, B, fB, pts, 300), h2 = (ptsOn || !h1) && collHits(B, fB, A, fA, pts, 600);
    if (h1 || h2) res.push({ a: A.id, b: B.id, pts });
  }
  return res;
}
function collNow() {
  if (!S.opt.coll || !S.model.links.length) return (S.coll = null);
  const key = collKey();
  if (S.coll && S.coll.pos === S.pos && S.coll.key === key && S.coll.regions === S.regions) return S.coll;
  return (S.coll = { pos: S.pos, key, regions: S.regions, list: collAt(S.pos) });
}

// ----- quét cả vùng làm việc (chạy trễ để không chặn giao diện) -----
let collSweepTimer = 0;
function collSweepInfo() {
  if (!S.opt.coll || !S.an || !S.an.sweep.length) return null;
  const key = collKey();
  const cur = S.collSweep;
  if (cur && cur.an === S.an && cur.key === key && cur.regions === S.regions) return cur.done ? cur : null;
  S.collSweep = { an: S.an, key, regions: S.regions, done: false };
  clearTimeout(collSweepTimer);
  collSweepTimer = setTimeout(() => {
    const job = S.collSweep; if (!job || job.done || job.an !== S.an) return;
    const fr = S.an.sweep, map = new Map();
    fr.forEach((f, i) => { for (const c of collAt(f.pos, false)) { const k = c.a + '|' + c.b; if (!map.has(k)) map.set(k, { a: c.a, b: c.b, idx: [] }); map.get(k).idx.push(i); } });
    job.pairs = [...map.values()].map(p => {
      const ranges = []; let r = null;
      for (const i of p.idx) { if (r && i === r[1] + 1) r[1] = i; else { r = [i, i]; ranges.push(r); } }
      if (S.an.full && ranges.length > 1 && ranges[0][0] === 0 && ranges[ranges.length - 1][1] === fr.length - 1) { const last = ranges.pop(); ranges[0] = [last[0], ranges[0][1] + fr.length]; }
      return { a: p.a, b: p.b, ranges, first: ranges[0][0] % fr.length };
    });
    job.done = true; renderAnalysis();
  }, 30);
  return null;
}
const degN = th => { const d = th * R2D; return S.an && S.an.full ? ((d % 360) + 360) % 360 : d; };
function collRangeText(r) {
  const fr = S.an.sweep, n = fr.length, th = i => fr[i % n].th;
  return r[0] === r[1] ? degN(th(r[0])).toFixed(0) + '°' : `${degN(th(r[0])).toFixed(0)}° … ${degN(th(r[1])).toFixed(0)}°`;
}
function collAnalysisRows() {
  if (!S.opt.coll || !S.model.motors.length) return '';
  const info = collSweepInfo();
  if (!info) return `<dt>${T('a_coll')}</dt><dd class="muted">${T('a_coll_busy')}</dd>`;
  if (!info.pairs.length && !(S.physSkip || []).length) return `<dt>${T('a_coll')}</dt><dd class="ok">${T('a_coll_none')}</dd>`;
  const phys = new Set(physOn() ? S.cons.filter(c => c.t === 'ct').map(c => c.pair) : []);
  const skip = (S.physSkip || []).map(([a, b]) => `<dt>${T('a_phys_skip')} ${esc(nameOf('l', a))} × ${esc(nameOf('l', b))}</dt><dd class="warn">${T('a_phys_skip_v')}</dd>`).join('');
  return skip + info.pairs.map((p, i) => phys.has(p.a + '|' + p.b)
    ? `<dt>${T('a_contact')} ${esc(nameOf('l', p.a))} × ${esc(nameOf('l', p.b))}</dt><dd class="ok"><a href="#" class="colljump" data-ci="${i}">${p.ranges.map(collRangeText).join(', ')}</a></dd>`
    : `<dt>${T('a_coll')} ${esc(nameOf('l', p.a))} × ${esc(nameOf('l', p.b))}</dt><dd class="bad"><a href="#" class="colljump" data-ci="${i}">${p.ranges.map(collRangeText).join(', ')}</a></dd>`).join('');
}
// nhảy tới tư thế va chạm đầu tiên của cặp
function collJump(i) {
  const info = S.collSweep, p = info && info.done && info.pairs[i]; if (!p) return;
  if (S.playing) togglePlay();
  const f = S.an.sweep[p.first]; S.pos = f.pos; S.theta = f.th; afterMove();
}
document.getElementById('analysis').addEventListener('click', e => { const a = e.target.closest('.colljump'); if (a) { e.preventDefault(); collJump(+a.dataset.ci); } });

// ----- vẽ -----
function physPairs() { return new Set(physOn() ? S.cons.filter(c => c.t === 'ct').map(c => c.pair) : []); }
const isContact = (o, ph) => ph.has(o.a + '|' + o.b);
function collLinkSet() { const c = collNow(), ph = physPairs(); return new Set(c ? c.list.filter(o => !isContact(o, ph)).flatMap(o => [o.a, o.b]) : []); }
function drawCollisions() {
  const c = S.coll; if (!S.opt.coll || !c || !c.list.length) return;
  const ph = physPairs();
  for (const o of c.list) {
    const col = isContact(o, ph) ? colors.ok : colors.bad; ctx.fillStyle = col;
    let sx = 0, sy = 0;
    for (const p of o.pts) { const q = w2s(p); sx += q.x; sy += q.y; ctx.fillRect(q.x - 1.5, q.y - 1.5, 3, 3); }
    const n = o.pts.length || 1, lbl = `${nameOf('l', o.a)} × ${nameOf('l', o.b)}`, x = sx / n + 12, y = sy / n - 12;
    ctx.font = '600 11.5px ' + bodyFont(); const tw = ctx.measureText(lbl).width;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y - 15, tw + 12, 20, 4) : ctx.rect(x, y - 15, tw + 12, 20); ctx.fill();
    ctx.fillStyle = colors.panel; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(lbl, x + 6, y - 5);
  }
}
// gọi trong vòng mô phỏng: dừng khi vừa bắt đầu va chạm
let collWas = false;
function collCheckStop() {
  if (!S.opt.coll || !S.opt.collstop) { collWas = false; return false; }
  const c = collNow(), ph = physPairs(), list = c ? c.list.filter(o => !isContact(o, ph)) : [], hit = !!list.length;
  const stop = hit && !collWas; collWas = hit;
  if (stop) { togglePlay(); toast(T('toast_coll', { a: nameOf('l', list[0].a), b: nameOf('l', list[0].b) })); }
  return stop;
}
function togglePhys(on) { commitPose(); S.model.phys = !!on; rebuild(); }
function setLinkLayer(lid, v) { const L = getL(lid); if (!L || !Number.isFinite(v)) return; L.layer = Math.round(v) || 0; if (!L.layer) delete L.layer; changed(); }

// ----- trọng lực & lò xo hồi vị cho part -----
// trọng tâm part trong hệ cục bộ, lấy từ lưới va chạm (đã gồm mọi CP cộng/trừ/giao)
function physPrep() {
  const cd = collData(), D = designMap(S.model);
  for (const L of S.model.links) {
    if (L.kind !== 'body') continue;
    const sh = cd.shapes[L.id]; let su = 0, sv = 0, n = 0;
    if (sh) for (let j = 0; j < sh.ny; j++) for (let i = 0; i < sh.nx; i++) if (sh.g[j * sh.nx + i]) { su += i; sv += j; n++; }
    L._cm = n ? { u: sh.u0 + (su / n + .5) * sh.h, v: sh.v0 + (sv / n + .5) * sh.h } : null;
    if (L.spr && !L.rest) L.rest = L.joints.slice(0, 2).map(id => ({ x: D[id].x, y: D[id].y }));
  }
}
// thả cho part rơi / về lò xo tới khi đứng yên ở tư thế hiện tại (không đổi góc motor)
function physSettle() {
  if (!hasPhysParts(S.model)) return;
  for (let i = 0; i < 120; i++) {
    const r = stepTo(S.model, S.cons, S.pos, S.theta, S.theta, 1); if (!r) break;
    let mv = 0; for (const id in r) if (S.pos[id]) mv = Math.max(mv, Math.hypot(r[id].x - S.pos[id].x, r[id].y - S.pos[id].y));
    S.pos = r; if (mv < 1e-3) break;
  }
}
function setPartPhys(lid, key, v) {
  const L = getL(lid); if (!L) return; commitPose();
  if (key === 'grav' || key === 'spr') { if (v) L[key] = true; else delete L[key]; if (key === 'spr' && v) L.rest = L.joints.slice(0, 2).map(id => ({ x: getJ(id).x, y: getJ(id).y })); }
  else if (key === 'rest') L.rest = L.joints.slice(0, 2).map(id => ({ x: getJ(id).x, y: getJ(id).y }));
  else if (v > 0) L[key] = v; else return;
  rebuild();
}

// ----- tự hãm do ma sát (kẹt thực tế) -----
// Part quay quanh một chốt cố định E bị khâu B đẩy tại C với lực theo pháp tuyến f. Có ma sát μ thì phương lực lệch tối đa φ = atan μ,
// nên khi góc α giữa f và đường EC nhỏ hơn φ, mômen không thắng được ma sát → kẹt (α = 0: lực đi qua chốt, kẹt cả khi không ma sát).
const mu = () => S.model.mu ?? 0.2;
const muG = () => S.model.muG ?? 0.2; // hệ số ma sát rãnh trượt (dẫn hướng của part trượt / khâu bị motor tịnh tiến đẩy)
// ===== Nêm: part K chỉ trượt theo phương d, bị B đẩy qua mặt tiếp xúc pháp tuyến n (lên K) =====
// Lực lên K: N·w, w = n + μ·σ·t (ma sát mặt tiếp xúc cùng chiều trượt tương đối của B so với K).
// Rãnh của K: phản lực vuông góc |w·m|·N → ma sát μr·|w·m|·N cản chuyển động. K chạy được khi (w·d)·sK > μr·|w·m|.
// Quy về góc: α = góc giữa n và pháp tuyến rãnh m; αhq = α ∓ φ; tự hãm khi αhq ≤ φr ⇔ α ≤ φ + φr (ma sát cản) — công thức nêm kinh điển.
// dB, dK: dịch chuyển của điểm vật liệu tại C trên B và K trong bước (chỉ lấy chiều); thiếu → giả định trường hợp xấu nhất.
function wedgeEval(g, dB, dK) {
  const n = g.f, t = { x: -n.y, y: n.x }, d = g.slide, m = { x: -d.y, y: d.x }, mc = mu(), mg = muG();
  let sig = 0, sK = 0;
  if (dB && dK) { const s = (dB.x - dK.x) * t.x + (dB.y - dK.y) * t.y; sig = Math.abs(s) > 1e-9 ? Math.sign(s) : 0; sK = Math.sign(dK.x * d.x + dK.y * d.y); }
  const dn = n.x * d.x + n.y * d.y; if (!sK) sK = Math.sign(dn) || 1; // K bị đẩy theo chiều có thành phần dọc pháp tuyến
  const W = s => ({ x: n.x + mc * s * t.x, y: n.y + mc * s * t.y });
  const P = g.P || S.pos, gK = guideSpan(g.K, P);
  // lực ép ngang lên rãnh (trên một đơn vị N): rãnh vô hạn → |w·m|; rãnh hữu hạn → max(|w·m|, 2|M|/Lđ) (kẹt ngăn kéo)
  const pressOf = w => { const p = Math.abs(w.x * m.x + w.y * m.y); if (!gK) return { p }; const M = Math.abs((g.C.x - gK.O.x) * w.y - (g.C.y - gK.O.y) * w.x), q = 2 * M / gK.L; return { p: Math.max(p, q), M, gov: q > p }; };
  const res = s => { const w = W(s), drive = (w.x * d.x + w.y * d.y) * sK, pr = pressOf(w); return { w, drive, pr, margin: drive - mg * pr.p }; };
  if (!sig) sig = res(1).margin < res(-1).margin ? 1 : -1;
  const { w, drive, pr, margin } = res(sig), press = pr.p;
  const aEff = Math.atan2(drive, press) * R2D, aLim = g.alpha - aEff + Math.atan(mg) * R2D; // ngưỡng α tự hãm (= φ + φr khi ma sát mặt nêm cản)
  const out = { margin, aEff, aLim, jam: margin <= 0, sig, sK };
  if (gK) { const h = drive > 1e-9 ? pr.M / drive : Infinity; out.dr = { L: gK.L, h, Lmin: 2 * mg * h, gov: pr.gov, out: gK.out, g: g.K.name }; } // h: cánh tay đòn tương đương so với lực dọc rãnh
  // hiệu suất & hệ số lực khi B là khâu bị motor tịnh tiến đẩy theo phương e (rãnh của B cũng có ma sát μr)
  const mo = S.model.motors.find(q => q.mate && (S.model.mates.find(x => x.id === q.mate) || {}).a === g.B.id), mt = mo && S.model.mates.find(x => x.id === mo.mate);
  if (mt && margin > 0) {
    const el = Math.hypot(mt.eb.x - mt.ea.x, mt.eb.y - mt.ea.y) || 1; let e = { x: (mt.eb.x - mt.ea.x) / el, y: (mt.eb.y - mt.ea.y) / el };
    const fB = mt.b && getL(mt.b) && frameOf(getL(mt.b), S.pos); if (fB) e = { x: e.x * fB.ex - e.y * fB.ey, y: e.x * fB.ey + e.y * fB.ex };
    const sE = Math.sign((dB ? dB.x * e.x + dB.y * e.y : n.x * e.x + n.y * e.y)) || 1, m1 = { x: -e.y, y: e.x };
    const A0 = (w.x * e.x + w.y * e.y) * sE, B0 = Math.abs(w.x * m1.x + w.y * m1.y), gB = guideSpan(g.B, P);
    let fin = A0 + mg * B0; // lực motor / N (rãnh vô hạn)
    if (gB && P[mt.joint]) {
      // rãnh hữu hạn của B: mômen quanh tâm đoạn dẫn O = phản lực −N·w tại C + lực motor f·N·e tại khớp J (f = P/N, ẩn)
      // → f = A0 + μr·max(B0, 2|f·k − c|/Lđ), giải nghiệm nhỏ nhất (tuyến tính từng khúc); vô nghiệm = motor kẹt ngăn kéo
      const J = P[mt.joint], c = (g.C.x - gB.O.x) * w.y - (g.C.y - gB.O.y) * w.x, k = ((J.x - gB.O.x) * e.y - (J.y - gB.O.y) * e.x) * sE;
      const hf = f => f - mg * Math.max(B0, 2 * Math.abs(f * k - c) / gB.L) - A0;
      fin = Math.abs(k) > 1e-9 ? pwRoot(hf, [c / k, (c + B0 * gB.L / 2) / k, (c - B0 * gB.L / 2) / k]) : pwRoot(hf, []);
      out.mdr = { L: gB.L, h: Math.abs(k), Lmin: 2 * mg * Math.abs(k), g: g.B.name, out: gB.out };
      if (fin == null) { out.mjam = true; out.force = Infinity; return out; }
    }
    const ratio = Math.abs(n.x * e.x + n.y * e.y) / (Math.abs(dn) || 1e-9); // |v2| / |v1|
    out.eta = fin > 0 ? margin * ratio / fin : null; out.force = fin / margin; // lực motor cần / lực tải dọc rãnh K
  }
  return out;
}
// nghiệm nhỏ nhất ≥ 0 của h(f) = 0, h tuyến tính từng khúc với các điểm gãy bps (không có → null)
function pwRoot(h, bps) {
  const xs = [0, ...bps.filter(x => x > 0 && isFinite(x)).sort((a, b) => a - b)];
  for (let i = 0; i < xs.length; i++) { const a = xs[i], b = i + 1 < xs.length ? xs[i + 1] : a + 1e6, ha = h(a), hb = h(b); if (ha >= 0) return a; if (hb >= 0) return a + (b - a) * -ha / (hb - ha); }
  return null;
}
// ===== Kẹt ngăn kéo: dẫn hướng hữu hạn L.guide = { x, y, len } (tâm rãnh trong hệ thế giới, phương = phương trượt của part) =====
// Rãnh chỉ đỡ part trên đoạn chồng Lđ (phần part nằm trong rãnh). Lực F tại C lệch khỏi tâm đoạn dẫn O tạo mômen M = (C−O)×F,
// rãnh cân bằng bằng hai phản lực ở hai đầu đoạn: |N1| + |N2| = max(|F⊥|, 2|M|/Lđ) → ma sát rãnh μr(|N1| + |N2|).
// Lực dọc rãnh với cánh tay đòn h: kẹt khi Lđ ≤ 2μr·h — quy tắc ngăn kéo kinh điển (bỏ qua khe hở và bề rộng rãnh).
function guideDir(L) {
  const d = partSlideDir(L); if (d) return d;
  if (!isBody(L)) return null;
  const m = (S.model.mates || []).find(q => q.type === 'sld' && q.a === L.id && !q.b); // part do motor tịnh tiến trên mate dẫn
  if (!m) return null; const dx = m.eb.x - m.ea.x, dy = m.eb.y - m.ea.y, l = Math.hypot(dx, dy) || 1; return { x: dx / l, y: dy / l };
}
function guideJoint(L) { // điểm của part nằm trên trục dẫn: khớp trượt đầu tiên hoặc khớp của mate trượt
  const j = getJ(L.joints[0]); if (j && j.slider) return j.id;
  const m = (S.model.mates || []).find(q => q.type === 'sld' && q.a === L.id && !q.b); return m ? m.joint : null;
}
function partExtent(L, P, o, d) { // khoảng chiếu biên part lên trục (o, d) ở tư thế P
  const Sh = collData().shapes[L.id], f = frameOf(L, P); if (!Sh || !f) return null; let lo = Infinity, hi = -Infinity;
  for (let k = 0; k < Sh.samp.length; k += 2) { const w = toWorld(f, { u: Sh.samp[k], v: Sh.samp[k + 1] }), s = (w.x - o.x) * d.x + (w.y - o.y) * d.y; if (s < lo) lo = s; if (s > hi) hi = s; }
  return lo <= hi ? { lo, hi } : null;
}
function guideSpan(L, P) {
  const G = L && L.guide, d = G && guideDir(L); if (!d || !(G.len > 0)) return null;
  const ex = partExtent(L, P, G, d); if (!ex) return null;
  const a = Math.max(ex.lo, -G.len / 2), b = Math.min(ex.hi, G.len / 2), out = b - a < 0.5, sm = (a + b) / 2;
  return { L: Math.max(b - a, 0.5), O: { x: G.x + d.x * sm, y: G.y + d.y * sm }, d, a, b, out }; // ra khỏi rãnh: Lđ tối thiểu 0.5 mm
}
function defaultGuide(L) { // rãnh ôm trọn part ở tư thế hiện tại, trục đi qua khớp dẫn (lực motor / chốt trượt nằm trên trục → không tạo mômen)
  const d = guideDir(L); if (!d) return null; const jid = guideJoint(L), Pj = jid && S.pos[jid], m = { x: -d.y, y: d.x };
  const ex = partExtent(L, S.pos, { x: 0, y: 0 }, d), ey = partExtent(L, S.pos, { x: 0, y: 0 }, m); if (!ex || !ey) return null;
  const tm = Pj ? Pj.x * m.x + Pj.y * m.y : (ey.lo + ey.hi) / 2, sm = (ex.lo + ex.hi) / 2, r = v => Math.round(v * 100) / 100;
  return { x: r(d.x * sm + m.x * tm), y: r(d.y * sm + m.y * tm), len: r(ex.hi - ex.lo) };
}
function setGuide(lid, key, v) {
  const L = getL(lid); if (!L) return; if (S.playing) togglePlay(); commitPose();
  if (key === 'on') { if (v) { const g = defaultGuide(L); if (g) L.guide = g; } else delete L.guide; }
  else if (key === 'fit') L.guide = defaultGuide(L) || L.guide;
  else if (L.guide && isFinite(v) && (key !== 'len' || v > 0)) L.guide[key] = v; else return;
  rebuild();
}
// vẽ rãnh dẫn hữu hạn: cả rãnh (mờ) + đoạn đang đỡ part Lđ (đậm, vạch ở hai điểm tựa)
function drawGuides() {
  for (const L of S.model.links) {
    if (!L.guide) continue; const gs = guideSpan(L, S.pos); if (!gs) continue; const G = L.guide, d = gs.d, c = ctx;
    const at = s => w2s({ x: G.x + d.x * s, y: G.y + d.y * s }), p0 = at(-G.len / 2), p1 = at(G.len / 2), q0 = at(gs.a), q1 = at(gs.b), nx = -(p1.y - p0.y), ny = p1.x - p0.x, nl = Math.hypot(nx, ny) || 1, ux = nx / nl, uy = ny / nl;
    c.lineCap = 'butt'; c.strokeStyle = colors.l1; c.globalAlpha = .22; c.lineWidth = 12; c.beginPath(); c.moveTo(p0.x, p0.y); c.lineTo(p1.x, p1.y); c.stroke(); c.globalAlpha = 1;
    if (!gs.out) {
      c.strokeStyle = colors.accent; c.lineWidth = 3; c.beginPath(); c.moveTo(q0.x, q0.y); c.lineTo(q1.x, q1.y); c.stroke();
      for (const q of [q0, q1]) { c.beginPath(); c.moveTo(q.x - ux * 9, q.y - uy * 9); c.lineTo(q.x + ux * 9, q.y + uy * 9); c.stroke(); }
    }
    const mx = (q0.x + q1.x) / 2 + ux * 16, my = (q0.y + q1.y) / 2 + uy * 16, txt = gs.out ? T('g_out') : `Lđ ${gs.L.toFixed(1)}`;
    c.font = '600 11px ' + bodyFont(); c.fillStyle = gs.out ? colors.bad : colors.accent; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, mx, my); c.lineCap = 'round';
  }
}
// hình học tiếp xúc khi khâu B đẩy part/khâu K ở tư thế P, TÁCH THEO TỪNG VÙNG CHẠM (điểm cách nhau > 1.5 mm là vùng khác):
// mỗi vùng: điểm C, phương lực f (lên K, vuông góc mặt tiếp xúc); nếu K quay quanh đúng một chốt cố định: chốt E, α (góc f với C→E), d = EC·sin α
function contactGeoms(kid, bid, P) {
  const cd = collData(), K = getL(kid), B = getL(bid), SK = cd.shapes[kid], SB = cd.shapes[bid]; if (!K || !B || !SK || !SB) return [];
  const fK = frameOf(K, P), fB = frameOf(B, P); if (!fK || !fB) return [];
  // dải nhận diện: điểm mẫu biên nằm trong thân ~½ ô + ngưỡng softplus → lúc tiếp xúc cách mặt kia ≈ 0.15–0.2 mm; trọng số càng sát càng nặng
  const pts = [];
  const acc = (S0, f0, S1, f1, sgn) => { const band = S0.h / 2 + CT_SHIFT + 0.1; for (let k = 0; k < S0.samp.length; k += 2) {
    const w = toWorld(f0, { u: S0.samp[k], v: S0.samp[k + 1] }), l = toLocal(f1, w), [sd, gu, gv] = collSdGrad(S1, l.u, l.v); if (sd > band) continue;
    pts.push({ x: w.x, y: w.y, wt: band - sd, gx: sgn * (gu * f1.ex - gv * f1.ey), gy: sgn * (gu * f1.ey + gv * f1.ex) }); } };
  acc(SK, fK, SB, fB, 1);  // điểm của K sát B: lực lên K theo pháp tuyến ngoài của B
  acc(SB, fB, SK, fK, -1); // điểm của B sát K: lực lên K hướng vào trong K
  // gom vùng (liên kết đơn, ngưỡng 1.5 mm)
  const grp = new Int32Array(pts.length).fill(-1), out = []; let ng = 0;
  for (let a = 0; a < pts.length; a++) { if (grp[a] >= 0) continue; grp[a] = ng; const st = [a];
    while (st.length) { const u = st.pop(); for (let b = 0; b < pts.length; b++) if (grp[b] < 0 && Math.hypot(pts[b].x - pts[u].x, pts[b].y - pts[u].y) < 1.5) { grp[b] = ng; st.push(b); } } ng++; }
  const piv = K.joints.filter(id => (getJ(id) || {}).fixed);
  for (let gI = 0; gI < ng; gI++) {
    let cx = 0, cy = 0, fx = 0, fy = 0, n = 0; pts.forEach((p, k) => { if (grp[k] !== gI) return; cx += p.wt * p.x; cy += p.wt * p.y; fx += p.wt * p.gx; fy += p.wt * p.gy; n += p.wt; });
    if (n < 1e-9) continue; const C = { x: cx / n, y: cy / n }, fl = Math.hypot(fx, fy); if (fl < 1e-9) continue;
    // pháp tuyến chính xác: gradient SDF chamfer bị lượng tử ~45° → khớp đường (PCA) qua điểm biên của mặt PHẲNG hơn quanh C
    // (góc nhọn tì vào cạnh: lực vuông góc với cạnh), chỉ dùng gradient để lấy chiều
    const f = exactNormal(C, [K, B], P, contactNormal(C, [[SK, fK], [SB, fB]], { x: fx / fl, y: fy / fl })), g = { K, B, C, f, fB, P };
    if (piv.length === 1) {
      // vùng chạm kéo dài (vd. cạnh áp cạnh): part kẹt nếu MỘT điểm bị đẩy mà không né được → lấy điểm có α nhỏ nhất trong vùng
      const E = P[piv[0]]; let best = null;
      const consider = Q => { const r = { x: Q.x - E.x, y: Q.y - E.y }, rl = Math.hypot(r.x, r.y); if (rl < 1e-6) return; const sinA = Math.abs(r.x * f.y - r.y * f.x) / rl; if (!best || sinA < best.sinA) best = { sinA, rl, Q }; };
      consider(C); pts.forEach((p, k) => { if (grp[k] === gI) consider(p); });
      if (best) Object.assign(g, { C: { x: best.Q.x, y: best.Q.y }, Cmid: C, E, pivot: getJ(piv[0]).name, EC: best.rl, alpha: Math.asin(Math.min(1, best.sinA)) * R2D, d: best.rl * best.sinA });
    } else if (!piv.length) {
      // part trượt (nêm, con trượt): chỉ thành phần lực dọc phương trượt d làm part chạy. α = góc giữa F và pháp tuyến dẫn hướng;
      // α < φ → ma sát ở mặt tiếp xúc giữ được toàn bộ → tự hãm (kẹt) giống α của part có chốt
      const d = partSlideDir(K); if (d) Object.assign(g, { slide: d, pivot: T('jam_guide', { a: ((Math.atan2(d.y, d.x) * R2D % 180) + 180) % 180 | 0 }), alpha: Math.asin(Math.min(1, Math.abs(f.x * d.x + f.y * d.y))) * R2D });
    }
    out.push(g);
  }
  return out;
}
// tư thế khởi động lại cho stepTo khi LM đứng yên ở tiếp xúc: mỗi part đang chạm (không do motor dẫn) xoay quanh chốt cố định ±0.25…2°
// hoặc trượt theo rãnh ±0.1…1 mm; ràng buộc tiếp xúc vẫn chặn lấn nên chỉ nhận nghiệm hợp lệ thật
function contactNudges(model, Q) {
  if (!physOn() || !S.cons) return [];
  const out = [], ids = new Set(activeContacts(Q).flat());
  for (const id of ids) {
    const L = getL(id); if (!isBody(L) || model.motors.some(mo => (mo.lin && L.joints.includes(mo.lin)) || mo.mate && (model.mates.find(m => m.id === mo.mate) || {}).a === L.id)) continue;
    const piv = L.joints.filter(j => (getJ(j) || {}).fixed), move = fn => { const R = { ...Q }; for (const j of L.joints) if (!getJ(j).fixed && Q[j]) R[j] = fn(Q[j]); return R; };
    if (piv.length === 1) { const E = Q[piv[0]]; for (const a of [0.25, -0.25, 0.5, -0.5, 1, -1, 2, -2]) { const c = Math.cos(a * D2R), s = Math.sin(a * D2R); out.push(move(p => ({ x: E.x + (p.x - E.x) * c - (p.y - E.y) * s, y: E.y + (p.x - E.x) * s + (p.y - E.y) * c }))); } }
    else if (!piv.length) { const d = partSlideDir(L); if (d) for (const s of [0.1, -0.1, 0.25, -0.25, 0.5, -0.5, 1, -1]) out.push(move(p => ({ x: p.x + d.x * s, y: p.y + d.y * s }))); }
  }
  return out;
}
// part chỉ tịnh tiến theo một phương (không bị motor dẫn): trả vector đơn vị phương trượt hoặc null
function partSlideDir(L) {
  if (!isBody(L)) return null;
  const a = getJ(L.joints[0]), b = getJ(L.joints[1]);
  if (a && b && a.slider && b.slider && Math.abs(a.slider.ang - b.slider.ang) < 1e-9 && !L.joints.some(id => (getJ(id) || {}).fixed) && !S.model.motors.some(mo => mo.lin && L.joints.includes(mo.lin))) return { x: Math.cos(a.slider.ang), y: Math.sin(a.slider.ang) };
  const m = (S.model.mates || []).find(q => q.type === 'sld' && q.a === L.id && !q.b && !S.model.motors.some(mo => mo.mate === q.id));
  if (m) { const dx = m.eb.x - m.ea.x, dy = m.eb.y - m.ea.y, d = Math.hypot(dx, dy) || 1; return { x: dx / d, y: dy / d }; }
  return null;
}
// pháp tuyến chính xác từ cạnh phác thảo thật (đoạn thẳng / cung / tròn của part) khi điểm chạm nằm trên cạnh đó:
// lưới va chạm cho pháp tuyến sai ~1°, đủ làm lệch kết luận kẹt khi α sát ngưỡng φ + φr
function exactNormal(C, links, P, f0) {
  const sk = SKM(), pm = SK.ptMap(sk); let best = null;
  for (const L of links) {
    if (!isBody(L)) continue; const fD = S.skFrames[L.id], fN = frameOf(L, P); if (!fD || !fN) continue;
    const W = id => { const q = pm.get(id); return q && toWorld(fN, toLocal(fD, q)); };
    for (const e of sk.ents) {
      if (e.owner !== L.id) continue; let n = null, dist = Infinity;
      if (e.type === 'line') { const a = W(e.a), b = W(e.b); if (!a || !b) continue; const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1e-12, t = Math.max(0, Math.min(1, ((C.x - a.x) * dx + (C.y - a.y) * dy) / l2)); if (t <= 0.001 || t >= 0.999) continue; dist = Math.hypot(a.x + t * dx - C.x, a.y + t * dy - C.y); const l = Math.sqrt(l2); n = { x: -dy / l, y: dx / l }; }
      else if (e.type === 'circle' || e.type === 'arc') { const c = W(e.c); if (!c) continue; const r = e.type === 'circle' ? e.r : Math.hypot(pm.get(e.a).x - pm.get(e.c).x, pm.get(e.a).y - pm.get(e.c).y), dl = Math.hypot(C.x - c.x, C.y - c.y) || 1e-9; dist = Math.abs(dl - r); n = { x: (C.x - c.x) / dl, y: (C.y - c.y) / dl }; }
      if (!n || dist > 0.6) continue;
      const dot = n.x * f0.x + n.y * f0.y; if (Math.abs(dot) < Math.cos(6 * D2R)) continue; // chỉ tinh chỉnh, không đổi hẳn phương
      if (!best || dist < best.dist) best = { dist, n: dot < 0 ? { x: -n.x, y: -n.y } : n };
    }
  }
  return best ? Object.assign({ x: best.n.x, y: best.n.y }, { exact: true }) : f0;
}
// các cặp tiếp xúc đang chạm (part với khâu/part): [kid bị đẩy, bid đẩy] — part có chốt được ưu tiên làm K
// khâu / part do motor dẫn (motor khớp, motor trên mate, xi lanh): motor cấp mô-men/lực nên KHÔNG thể tự hãm vì bị vật khác đẩy —
// phép thử tự hãm chỉ áp cho vật bị dẫn (trước đây càng do motor quay bị coi là "bị đẩy" → báo kẹt sai)
function isDrivenLink(L) { return !!L && S.model.motors.some(mo => mo.link === L.id || mo.cyl === L.id || (mo.lin && L.joints.includes(mo.lin)) || (mo.mate && ((S.model.mates || []).find(m => m.id === mo.mate) || {}).a === L.id)); }
function activeContacts(P) {
  const out = [];
  for (const c of S.cons || []) {
    if (c.t !== 'ct' || !c.rows(P, null).r.length) continue; // lọc nhanh bằng bộ nhớ đệm điểm gần của ràng buộc
    const [ia, ib] = c.pair.split('|'), A = getL(ia), B = getL(ib); if (!A || !B) continue;
    const pv = L => isBody(L) && !isDrivenLink(L) && (L.joints.filter(id => (getJ(id) || {}).fixed).length === 1 || !!partSlideDir(L)); // part có chốt hoặc part trượt, không do motor dẫn
    if (pv(A) || (!pv(B) && isBody(A))) out.push([ia, ib]); if (pv(B) || (!pv(A) && isBody(B) && !isBody(A))) out.push([ib, ia]);
  }
  return out;
}
function frictionJam(model, Q, P, th) {
  if (!physOn() || !(mu() > 0) || !S.cons || S.ignoreJam) return false;
  const sinPhi = Math.sin(Math.atan(mu()));
  for (const [kid, bid] of activeContacts(P)) for (const g of contactGeoms(kid, bid, P)) {
    if (g.alpha == null || isDrivenLink(g.K)) continue;
    // B có đang đẩy vào K không: chuyển vị của điểm vật liệu C (gắn với B) trong bước này theo phương f
    const fBQ = frameOf(g.B, Q); if (!fBQ) continue; const CQ = toWorld(fBQ, toLocal(g.fB, g.C)), push = (g.C.x - CQ.x) * g.f.x + (g.C.y - CQ.y) * g.f.y;
    if (push < 1e-5) continue;
    // part bị đẩy có THỰC SỰ bị dời theo phương lực trong bước này? (điểm vật liệu C gắn với K) — nếu không (hai mép chỉ trượt qua nhau,
    // vd. mũi nêm lướt qua góc), tiếp xúc không truyền lực → không thể tự hãm
    const fKQ = frameOf(g.K, Q), fKP = frameOf(g.K, P); if (!fKQ || !fKP) continue;
    const CK = toWorld(fKQ, toLocal(fKP, g.C)), kpush = (g.C.x - CK.x) * g.f.x + (g.C.y - CK.y) * g.f.y;
    if (kpush < 0.5 * push) continue;
    let jam = Math.sin(g.alpha * D2R) < sinPhi, extra = {};
    if (g.slide) {
      const fBQ2 = frameOf(g.B, Q), CB = toWorld(fBQ2, toLocal(g.fB, g.C)), w = wedgeEval(g, { x: g.C.x - CB.x, y: g.C.y - CB.y }, { x: g.C.x - CK.x, y: g.C.y - CK.y });
      // chỉ tự hãm khi tiếp xúc MẶT (điểm chạm nằm trên cạnh phác thảo thật); đỉnh chạm đỉnh (mũi nêm lướt qua góc) chỉ tức thời
      S.wedgeLast = { key: g.K.id + '|' + g.B.id, sig: w.sig, sK: w.sK }; jam = (w.jam || !!w.mjam) && !!g.f.exact; extra = { aLim: w.aLim, wedge: true };
      if (w.mjam) extra.drawer = w.mdr; else if (w.jam && w.dr && (w.dr.gov || w.dr.out)) extra.drawer = w.dr; // mômen lệch tâm quyết định → kẹt ngăn kéo
    }
    if (jam) {
      const info = { k: g.K.name, b: g.B.name, alpha: g.alpha, phi: extra.wedge ? extra.aLim : Math.atan(mu()) * R2D, th: th * R2D, pivot: g.pivot, pos: P, rad: th, C: g.C, wedge: !!extra.wedge, drawer: extra.drawer };
      S.jamInfo = info; if (S.jamLog) S.jamLog.push(info); return true;
    }
  }
  return false;
}
// ----- hiển thị phân tích tiếp xúc khi mô phỏng: lực F ⟂ mặt tiếp xúc, nón ma sát ±φ, đường CE và góc α -----
S.opt.ctinfo = true;
let ctCache = null;
function drawContactInfo() {
  if (!S.opt.ctinfo || !physOn() || !S.cons) return;
  if (!ctCache || ctCache.pos !== S.pos || ctCache.mu !== mu()) ctCache = { pos: S.pos, mu: mu(), list: activeContacts(S.pos).flatMap(([k, b]) => contactGeoms(k, b, S.pos)) };
  const phi = Math.atan(mu()), c = ctx;
  if (S.jamShow && S.jamShow.pos === S.pos) { const q = w2s(S.jamShow.C); c.strokeStyle = colors.bad; c.lineWidth = 3; c.beginPath(); c.arc(q.x, q.y, 22, 0, TAU); c.stroke(); }
  for (const g of ctCache.list) {
    const Cs = w2s(g.C), dir = Math.atan2(-g.f.y, g.f.x); // góc trên màn hình (trục y lật)
    let wd = null; if (g.slide) { const L = S.wedgeLast && S.wedgeLast.key === g.K.id + '|' + g.B.id ? S.wedgeLast : null; wd = wedgeEval(g, L && { x: 0, y: 0, _s: 1 } && null, null); if (L) { const n = g.f, t = { x: -n.y, y: n.x }; wd = wedgeEval(g, { x: t.x * L.sig * 1e-3 + g.slide.x * L.sK * 1e-3, y: t.y * L.sig * 1e-3 + g.slide.y * L.sK * 1e-3 }, { x: g.slide.x * L.sK * 1e-3, y: g.slide.y * L.sK * 1e-3 }); } }
    const jam = wd ? wd.jam || !!wd.mjam : g.alpha != null && g.alpha * D2R < phi, col = g.alpha == null ? colors.accent : jam ? colors.bad : colors.ok;
    const Es = g.E && w2s(g.E), R = Es ? Math.min(Math.hypot(Es.x - Cs.x, Es.y - Cs.y) * 1.05, 260) : 90;
    // nón ma sát quanh phương lực
    if (phi > 0) { c.fillStyle = col; c.globalAlpha = .13; c.beginPath(); c.moveTo(Cs.x, Cs.y); c.arc(Cs.x, Cs.y, R, dir - phi, dir + phi); c.closePath(); c.fill(); c.globalAlpha = .8; c.strokeStyle = col; c.lineWidth = 1.2; c.setLineDash([5, 4]); c.stroke(); c.setLineDash([]); c.globalAlpha = 1; }
    // đường C → E và góc α
    if (Es) {
      c.strokeStyle = colors.l1; c.lineWidth = 1.4; c.setLineDash([6, 4]); c.beginPath(); c.moveTo(Cs.x, Cs.y); c.lineTo(Es.x, Es.y); c.stroke(); c.setLineDash([]);
      const aE = Math.atan2(Es.y - Cs.y, Es.x - Cs.x); let d = aE - dir; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
      c.strokeStyle = colors.warn; c.fillStyle = colors.warn; c.globalAlpha = .25; c.beginPath(); c.moveTo(Cs.x, Cs.y); c.arc(Cs.x, Cs.y, 34, dir, dir + d, d < 0); c.closePath(); c.fill(); c.globalAlpha = 1; c.lineWidth = 2; c.beginPath(); c.arc(Cs.x, Cs.y, 34, dir, dir + d, d < 0); c.stroke();
    }
    if (g.slide) { // pháp tuyến dẫn hướng: lực dọc đường này không đẩy được part trượt
      const nx = -g.slide.y, ny = g.slide.x, q1 = w2s({ x: g.C.x - nx * 12, y: g.C.y - ny * 12 }), q2 = w2s({ x: g.C.x + nx * 12, y: g.C.y + ny * 12 });
      c.strokeStyle = colors.l1; c.lineWidth = 1.4; c.setLineDash([6, 4]); c.beginPath(); c.moveTo(q1.x, q1.y); c.lineTo(q2.x, q2.y); c.stroke(); c.setLineDash([]);
    }
    // lực F: mũi tên vuông góc mặt tiếp xúc, đầu mũi tại C, hướng vào part bị đẩy
    const L = 46, tx = Cs.x - Math.cos(dir) * L, ty = Cs.y - Math.sin(dir) * L, ux = Math.cos(dir), uy = Math.sin(dir);
    c.strokeStyle = colors.bad; c.fillStyle = colors.bad; c.lineWidth = 3; c.lineCap = 'round'; c.beginPath(); c.moveTo(tx, ty); c.lineTo(Cs.x - ux * 9, Cs.y - uy * 9); c.stroke();
    c.beginPath(); c.moveTo(Cs.x, Cs.y); c.lineTo(Cs.x - ux * 11 - uy * 6, Cs.y - uy * 11 + ux * 6); c.lineTo(Cs.x - ux * 11 + uy * 6, Cs.y - uy * 11 - ux * 6); c.closePath(); c.fill();
    c.fillStyle = colors.ink; c.beginPath(); c.arc(Cs.x, Cs.y, 3.5, 0, TAU); c.fill();
    // nhãn
    const txt = wd ? `α ${g.alpha.toFixed(Math.abs(g.alpha - wd.aLim) < 0.5 ? 2 : 1)}° ${jam ? '≤' : '>'} φ+φr ${wd.aLim.toFixed(Math.abs(g.alpha - wd.aLim) < 0.5 ? 2 : 1)}°${jam ? ' · ' + T('ct_jam') : wd.eta != null ? ' · η ' + Math.round(wd.eta * 100) + '%' : ''}${[wd.dr, wd.mdr].filter(Boolean).map(r => ` · ${r.g}: Lđ ${r.L.toFixed(1)} ${r.L <= r.Lmin ? '≤' : '>'} 2μr·h ${isFinite(r.Lmin) ? r.Lmin.toFixed(1) : '∞'}`).join('')}` : g.alpha != null ? `α ${g.alpha.toFixed(1)}° ${jam ? '<' : '>'} φ ${(phi * R2D).toFixed(1)}°${jam ? ' · ' + T('ct_jam') : ''}` : `F ⟂ · φ ${(phi * R2D).toFixed(1)}°`;
    c.font = '600 11.5px ' + bodyFont(); const tw = c.measureText(txt).width, lx = tx - tw / 2 - 6, ly = ty - Math.sign(uy || 1) * 14 - 10;
    c.fillStyle = col; c.beginPath(); c.roundRect ? c.roundRect(lx, ly, tw + 12, 20, 4) : c.rect(lx, ly, tw + 12, 20); c.fill();
    c.fillStyle = colors.panel; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(txt, lx + 6, ly + 10);
  }
}
function contactNormal(C, bodies, guess) {
  let best = null;
  for (const [Sh, f] of bodies) {
    let sx = 0, sy = 0, n = 0; const pts = [];
    for (let k = 0; k < Sh.samp.length; k += 2) { const w = toWorld(f, { u: Sh.samp[k], v: Sh.samp[k + 1] }); if (Math.hypot(w.x - C.x, w.y - C.y) < 1.2) { pts.push(w); sx += w.x; sy += w.y; n++; } }
    if (n < 4) continue;
    const mx = sx / n, my = sy / n; let a = 0, b = 0, c = 0; for (const p of pts) { const dx = p.x - mx, dy = p.y - my; a += dx * dx; b += dx * dy; c += dy * dy; }
    const tr = a + c, det = a * c - b * b, l1 = tr / 2 + Math.sqrt(Math.max(0, tr * tr / 4 - det)), l2 = tr - l1, flat = l2 / (l1 || 1); // nhỏ = thẳng
    const ang = 0.5 * Math.atan2(2 * b, a - c), t = { x: Math.cos(ang), y: Math.sin(ang) };
    if (!best || flat < best.flat) best = { flat, t };
  }
  if (!best || best.flat > 0.08) return guess; // cả hai đều cong/gãy mạnh → giữ hướng gradient
  let nx = -best.t.y, ny = best.t.x; if (nx * guess.x + ny * guess.y < 0) { nx = -nx; ny = -ny; }
  return { x: nx, y: ny };
}
function setMuG(v) { if (!(v >= 0)) return; commitPose(); S.model.muG = Math.round(v * 1000) / 1000; rebuild(); }
function setMu(v) { if (!(v >= 0)) return; commitPose(); S.model.mu = Math.round(v * 1000) / 1000; rebuild(); }
