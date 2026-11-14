// ===== Vật liệu & biến dạng của part (phương án 1: chỉ tính, không ảnh hưởng chuyển động) =====
// L.mat = { m: mã vật liệu, t: bề dày mm, E, sy (MPa, chỉ dùng khi m = 'custom'), F: lực thử N (0 = tự tính từ cân bằng) }
// Lực tiếp xúc: phương từ contactGeoms (⟂ mặt chạm); độ lớn = cân bằng tĩnh của part với lò xo / trọng lực (ẩn: lực tiếp xúc ≥ 0,
// phản lực chốt, phản lực rãnh trượt; nghiệm chuẩn nhỏ nhất) hoặc lực thử nhập tay.
// Biến dạng: phần tử hữu hạn phẳng (ứng suất phẳng, Q4 vuông cạnh h trên lưới đều theo bodyInside ở hệ cục bộ part),
// gối = các nút quanh chốt của part; không có chốt → cân bằng quán tính (inertia relief) + bỏ chuyển động cứng.
// Ma trận dải được phân tích Cholesky một lần cho mỗi part (độ cứng không đổi); mỗi tư thế chỉ giải thế.
const MATS = {
  ABS: { E: 2200, nu: 0.35, sy: 40 }, PP: { E: 1300, nu: 0.42, sy: 30 }, POM: { E: 2900, nu: 0.35, sy: 65 },
  PA6: { E: 1800, nu: 0.39, sy: 50 }, PC: { E: 2350, nu: 0.37, sy: 62 }, HIPS: { E: 1900, nu: 0.35, sy: 25 }, PE: { E: 1000, nu: 0.42, sy: 24 },
};
const FEA_PIN_R = 1.5; // bán kính lỗ chốt quy ước (mm), như vòng khớp khi xuất DXF
function matProps(L) {
  const m = L && L.mat; if (!m) return null;
  const b = MATS[m.m] || { E: m.E || 2000, nu: 0.38, sy: m.sy || 40 };
  return { name: m.m === 'custom' ? T('mat_custom') : m.m, E: m.m === 'custom' ? (m.E || 2000) : b.E, nu: b.nu, sy: m.m === 'custom' ? (m.sy || 40) : b.sy, t: m.t || 2, F: m.F || 0 };
}
function setPartMat(lid, key, v) {
  const L = getL(lid); if (!isBody(L)) return;
  if (L.mat && (key === 'view' || key === 'scale')) { L.mat[key] = v; delete L.mat.show; changed(); return; } // chỉ hiển thị: không lưu tư thế / dựng lại
  commitPose();
  if (key === 'm') { if (!v) delete L.mat; else L.mat = { ...(L.mat || { t: 2 }), m: v }; }
  else if (L.mat && key === 'show') L.mat.show = !!v;
  else if (L.mat && (key === 'F' ? v >= 0 : v > 0)) L.mat[key] = v; else return;
  feaCache.clear(); rebuild();
}

// ----- mô hình phần tử hữu hạn (lưu đệm theo hình + vật liệu + gối) -----
const feaCache = new Map();
function feaModel(L) {
  const mp = matProps(L); if (!mp) return null;
  const D = designMap(S.model), fD = frameOf(L, D), sh = collData().shapes[L.id]; if (!fD || !sh) return null;
  const pins = feaPins(L, D), edges = feaEdges(L, D);
  const key = JSON.stringify([mp.E, mp.nu, mp.t, sh.box, pins.map(p => [p.u, p.v]), edges.map(e => e.pts), L.joints.map(id => [D[id].x, D[id].y])]) + '|' + (S.regions && S.regions.length);
  const old = feaCache.get(L.id); if (old && old.key === key && old.regions === S.regions) return old;
  const body = bodyInside(L, D), [u0, v0, u1, v1] = sh.box;
  // cạnh ô: ~2500 phần tử trong khung bao, tối thiểu 0.15 mm
  let h = Math.max(0.15, Math.sqrt((u1 - u0) * (v1 - v0) / 2500)), nx, ny, cells;
  for (let it = 0; it < 3; it++) {
    nx = Math.ceil((u1 - u0) / h); ny = Math.ceil((v1 - v0) / h); cells = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (body(toWorld(fD, { u: u0 + (i + .5) * h, v: v0 + (j + .5) * h }))) cells.push([i, j]);
    if (cells.length >= 400 || h <= 0.15) break; h = Math.max(0.15, h * Math.sqrt(cells.length / 1200)); // part mảnh → làm mịn thêm
  }
  if (cells.length < 2) return null;
  // đánh số nút theo phương ngắn hơn trước → bề rộng dải nhỏ
  const colMajor = nx > ny, gk = (i, j) => colMajor ? i * (ny + 1) + j : j * (nx + 1) + i, used = new Map();
  for (const [i, j] of cells) for (const [a, b] of [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]]) used.set(gk(a, b), [a, b]);
  const keys = [...used.keys()].sort((a, b) => a - b), idx = new Map(keys.map((k, n) => [k, n])), N = keys.length;
  const nodes = keys.map(k => { const [a, b] = used.get(k); return { u: u0 + a * h, v: v0 + b * h }; });
  const els = cells.map(([i, j]) => [gk(i, j), gk(i + 1, j), gk(i + 1, j + 1), gk(i, j + 1)].map(k => idx.get(k)));
  const deg = new Uint8Array(N); for (const e of els) for (const n of e) deg[n]++;
  const ecnt = new Map(); for (const e of els) for (let i = 0; i < 4; i++) { const a = e[i], b = e[(i + 1) % 4], k = a < b ? a * N + b : b * N + a; ecnt.set(k, (ecnt.get(k) || 0) + 1); }
  const bedges = [...ecnt].filter(([, c]) => c === 1).map(([k]) => [Math.floor(k / N), k % N]), bnodes = [...new Set(bedges.flat())]; // cạnh / nút biên (vẽ đường viền hình biến dạng)
  // kéo nút biên về đúng biên dạng thật (linkOutline, chính xác ~1e-5 mm): lưới bậc thang làm part mảnh dày thêm tới h,
  // mà độ cứng uốn ∝ bề rộng³ → sai hàng chục % (ngón 2 mm, h 0.175 → 2.1 mm → cứng hơn 17%)
  { const segs = []; for (const lp of linkOutline(L, 0)) for (let i = 0; i < lp.length; i++) { const a = lp[i], b = lp[(i + 1) % lp.length]; segs.push([{ x: a.u, y: a.v }, { x: b.u, y: b.v }]); }
    for (const k of bnodes) { const q = nodes[k]; let best = null; for (const [a, b] of segs) { const r = segDist(q.u, q.v, a, b); if (!best || r.d < best.d) best = { d: r.d, u: a.x + (b.x - a.x) * r.t, v: a.y + (b.y - a.y) * r.t }; } if (best && best.d < 0.75 * h) { q.u = best.u; q.v = best.v; } } }
  let bw = 0; for (const e of els) { const mn = Math.min(...e), mx = Math.max(...e); bw = Math.max(bw, 2 * (mx - mn) + 1); }
  const nd = 2 * N, W = bw + 1, K = new Float64Array(nd * W); // K[i·W + (i − j)], j ≤ i
  const ElK = els.map(e => q4El(mp, e.map(n => nodes[n]))); // phần tử tứ giác đẳng tham số theo hình thật (biên đã kéo về biên dạng)
  els.forEach((e, ei) => { const Ke = ElK[ei].Ke; for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) {
    const I = 2 * e[a >> 1] + (a & 1), J = 2 * e[b >> 1] + (b & 1); if (J > I) continue; K[I * W + (I - J)] += Ke[a * 8 + b];
  } });
  // gối: nút quanh chốt; không có chốt → ràng buộc tối thiểu 3 bậc + cân bằng quán tính
  let dmax = 0; for (let i = 0; i < nd; i++) dmax = Math.max(dmax, K[i * W]);
  const fixed = new Set(), pinOf = new Int16Array(N).fill(-1), near = new Uint8Array(N); // near: vùng sát chốt (ứng suất kỳ dị của gối) — không tính vào σ thân
  pins.forEach((p, pi) => { let best = -1, bd = Infinity; nodes.forEach((q, n) => { const d = Math.hypot(q.u - p.u, q.v - p.v); if (d <= FEA_PIN_R + h * .75) { fixed.add(2 * n); fixed.add(2 * n + 1); pinOf[n] = pi; } if (d <= FEA_PIN_R + 2 * h) near[n] = 1; if (d < bd) { bd = d; best = n; } }); if (best >= 0) { fixed.add(2 * best); fixed.add(2 * best + 1); pinOf[best] = pi; near[best] = 1; } });
  // diện tích phần tử dồn về nút
  const wt = new Float64Array(N); els.forEach((e, ei) => { for (const n of e) wt[n] += ElK[ei].A / 4; }); let Wt = 0, cu = 0, cv = 0; nodes.forEach((q, n) => { Wt += wt[n]; cu += wt[n] * q.u; cv += wt[n] * q.v; }); cu /= Wt; cv /= Wt;
  edges.forEach((ed, ei) => { // ngàm cạnh: khóa các nút nằm trên cạnh (gối thứ pins.length + ei)
    const pu = ed.pts.map(p => ({ x: p.u, y: p.v }));
    nodes.forEach((q, n) => { let d = Infinity; for (let i = 0; i < pu.length - 1; i++) d = Math.min(d, segDist(q.u, q.v, pu[i], pu[i + 1]).d); if (d <= h * .75) { fixed.add(2 * n); fixed.add(2 * n + 1); pinOf[n] = pins.length + ei; } });
  });
  const relief = !pins.length && !edges.length;
  if (relief) { // nút gần trọng tâm (khóa u, v) + nút xa nhất (khóa phương vuông góc) → khử 3 chuyển động cứng
    let a = 0, b = 0, ba = Infinity, bb = -1; nodes.forEach((q, n) => { const d = Math.hypot(q.u - cu, q.v - cv); if (d < ba) { ba = d; a = n; } });
    nodes.forEach((q, n) => { const d = Math.hypot(q.u - nodes[a].u, q.v - nodes[a].v); if (d > bb) { bb = d; b = n; } });
    const du = nodes[b].u - nodes[a].u, dv = nodes[b].v - nodes[a].v; fixed.add(2 * a); fixed.add(2 * a + 1); fixed.add(2 * b + (Math.abs(du) >= Math.abs(dv) ? 1 : 0));
  }
  for (const i of fixed) K[i * W] += dmax * 1e8;
  if (!bandChol(K, nd, W)) return null;
  const M = { key, regions: S.regions, L: L.id, mp, h, nodes, els, deg, wt, Wt, cu, cv, K, nd, W, relief, pins, fD, ElK, pinOf, near, bedges, bnodes, edges, nsup: pins.length + edges.length, size: Math.max(u1 - u0, v1 - v0) };
  feaCache.set(L.id, M); return M;
}
// cạnh ngàm của part: mate cố định chọn theo cạnh (m.ent) → đường gấp khúc hệ cục bộ thiết kế
function feaEdges(L, D) {
  const fD = frameOf(L, D), sk = S.model.sketch, pm = SK.ptMap(sk), out = [];
  for (const m of S.model.mates || []) {
    if (m.type !== 'fix' || m.a !== L.id || !m.ent) continue; const e = sk.ents.find(q => q.id === m.ent); if (!e) continue;
    out.push({ id: m.id, ent: m.ent, pts: SK.sample(e, pm).pts.map(p => toLocal(fD, p)) });
  }
  return out;
}
// chốt của part (hệ cục bộ thiết kế): khớp hiện của part (gối cố định, khớp nối khâu khác, chốt trong rãnh) + khớp của mate xoay
function feaPins(L, D) {
  const fD = frameOf(L, D), ids = new Set(L.joints.filter(id => { const j = getJ(id); return j && !j.hidden; }));
  for (const q of S.model.mates || []) if (q.type === 'rev' && (q.a === L.id || q.b === L.id) && q.joint) ids.add(q.joint);
  return [...ids].filter(id => D[id]).map(id => ({ id, ...toLocal(fD, D[id]) }));
}
// ma trận cứng phần tử Q4 vuông cạnh h, ứng suất phẳng (Gauss 2×2), nhân bề dày t; đơn vị N, mm, MPa
function q4Stiff(mp, h) {
  const { E, nu, t } = mp, c = E / (1 - nu * nu), Dm = [c, c * nu, 0, c * nu, c, 0, 0, 0, c * (1 - nu) / 2], Ke = new Float64Array(64), g = 1 / Math.sqrt(3);
  for (const xi of [-g, g]) for (const et of [-g, g]) {
    const B = q4B(xi, et, h), DB = new Float64Array(24);
    for (let r = 0; r < 3; r++) for (let k = 0; k < 8; k++) DB[r * 8 + k] = Dm[r * 3] * B[k] + Dm[r * 3 + 1] * B[8 + k] + Dm[r * 3 + 2] * B[16 + k];
    const w = t * h * h / 4; // det J = h²/4, trọng số Gauss 1
    for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) Ke[a * 8 + b] += w * (B[a] * DB[b] + B[8 + a] * DB[8 + b] + B[16 + a] * DB[16 + b]);
  }
  return Ke;
}
// phần tử Q4 đẳng tham số tổng quát (4 nút ngược kim đồng hồ): Ke (Gauss 2×2), B tại tâm, diện tích
function q4El(mp, X) {
  const { E, nu, t } = mp, c = E / (1 - nu * nu), Dm = [c, c * nu, 0, c * nu, c, 0, 0, 0, c * (1 - nu) / 2], Ke = new Float64Array(64), g = 1 / Math.sqrt(3), s = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const Bat = (xi, et) => {
    const dNx = s.map(([a, b]) => a * (1 + b * et) / 4), dNe = s.map(([a, b]) => b * (1 + a * xi) / 4);
    let j11 = 0, j12 = 0, j21 = 0, j22 = 0; for (let n = 0; n < 4; n++) { j11 += dNx[n] * X[n].u; j12 += dNx[n] * X[n].v; j21 += dNe[n] * X[n].u; j22 += dNe[n] * X[n].v; }
    const det = j11 * j22 - j12 * j21, B = new Float64Array(24);
    for (let n = 0; n < 4; n++) { const dx = (j22 * dNx[n] - j12 * dNe[n]) / det, dy = (-j21 * dNx[n] + j11 * dNe[n]) / det; B[2 * n] = dx; B[8 + 2 * n + 1] = dy; B[16 + 2 * n] = dy; B[16 + 2 * n + 1] = dx; }
    return { B, det };
  };
  let A = 0;
  for (const xi of [-g, g]) for (const et of [-g, g]) {
    const { B, det } = Bat(xi, et), DB = new Float64Array(24); A += det;
    for (let r = 0; r < 3; r++) for (let k = 0; k < 8; k++) DB[r * 8 + k] = Dm[r * 3] * B[k] + Dm[r * 3 + 1] * B[8 + k] + Dm[r * 3 + 2] * B[16 + k];
    const w = t * det; for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) Ke[a * 8 + b] += w * (B[a] * DB[b] + B[8 + a] * DB[8 + b] + B[16 + a] * DB[16 + b]);
  }
  return { Ke, B0: Bat(0, 0).B, A };
}
function q4B(xi, et, h) { // ma trận biến dạng 3×8 tại (ξ, η); nút 0..3 ngược kim đồng hồ từ góc dưới trái
  const s = [[-1, -1], [1, -1], [1, 1], [-1, 1]], B = new Float64Array(24);
  s.forEach(([a, b], n) => { const dx = a * (1 + b * et) / 4 * 2 / h, dy = b * (1 + a * xi) / 4 * 2 / h; B[2 * n] = dx; B[8 + 2 * n + 1] = dy; B[16 + 2 * n] = dy; B[16 + 2 * n + 1] = dx; });
  return B;
}
// Cholesky ma trận dải đối xứng tại chỗ (lưu tam giác dưới A[i·W + (i − j)])
function bandChol(A, n, W) {
  for (let i = 0; i < n; i++) {
    const j0 = Math.max(0, i - W + 1);
    for (let j = j0; j <= i; j++) {
      let s = A[i * W + (i - j)]; const k0 = Math.max(j0, j - W + 1);
      for (let k = k0; k < j; k++) s -= A[i * W + (i - k)] * A[j * W + (j - k)];
      if (j === i) { if (!(s > 0)) return false; A[i * W] = Math.sqrt(s); } else A[i * W + (i - j)] = s / A[j * W];
    }
  }
  return true;
}
function bandSolve(A, n, W, b) {
  const y = Float64Array.from(b);
  for (let i = 0; i < n; i++) { let s = y[i]; for (let k = Math.max(0, i - W + 1); k < i; k++) s -= A[i * W + (i - k)] * y[k]; y[i] = s / A[i * W]; }
  for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < Math.min(n, i + W); k++) s -= A[k * W + (k - i)] * y[k]; y[i] = s / A[i * W]; }
  return y;
}

// ----- tải trọng tại một tư thế -----
// tiếp xúc của part L với mọi khâu/part đang chạm (theo ràng buộc 'ct' của vật lý): [{ C, f (đơn vị, lên L), by }]
function feaContacts(L, P) {
  const out = [];
  for (const c of S.cons || []) {
    if (c.t !== 'ct') continue; const [a, b] = c.pair.split('|'); if (a !== L.id && b !== L.id) continue;
    const other = a === L.id ? b : a; for (const g of contactGeoms(L.id, other, P)) out.push({ C: g.C, f: g.f, by: other });
  }
  return out;
}
// lực ngoài đã biết: lò xo tại 2 khớp khung, trọng lực tại trọng tâm
function feaKnown(L, P) {
  const out = [];
  if (L.spr && L.rest) L.joints.slice(0, 2).forEach((id, i) => { const p = P[id], k = L.k ?? 0.5; if (p) out.push({ C: p, F: { x: k * (L.rest[i].x - p.x), y: k * (L.rest[i].y - p.y) }, kind: 'spr' }); });
  if (L.grav) { const f = frameOf(L, P), c = f && toWorld(f, L._cm || { u: 0, v: 0 }); if (c) out.push({ C: c, F: { x: 0, y: -(L.mass ?? 20) * 0.00981 }, kind: 'grav' }); }
  return out;
}
// độ lớn lực tiếp xúc: cân bằng 3 phương trình (Fx, Fy, M) — ẩn: lực tiếp xúc ≥ 0, phản lực chốt (2/chốt), rãnh trượt (lực ⟂ + mômen)
function feaForces(L, P, cts) {
  const mp = matProps(L); if (!cts.length) return [];
  if (mp.F > 0) return cts.map(() => mp.F);
  const known = feaKnown(L, P); if (!known.length) return cts.map(() => 0);
  const b = [0, 0, 0]; for (const k of known) { b[0] -= k.F.x; b[1] -= k.F.y; b[2] -= k.C.x * k.F.y - k.C.y * k.F.x; }
  const cols = [], fD = frameOf(L, designMap(S.model)), fN = frameOf(L, P);
  cts.forEach(c => cols.push([c.f.x, c.f.y, c.C.x * c.f.y - c.C.y * c.f.x]));
  for (const p of feaPins(L, designMap(S.model))) { const w = toWorld(fN, p); cols.push([1, 0, -w.y], [0, 1, w.x]); }
  for (const ed of feaEdges(L, designMap(S.model))) { const w = toWorld(fN, ed.pts[ed.pts.length >> 1]); cols.push([1, 0, -w.y], [0, 1, w.x], [0, 0, 1]); } // ngàm cạnh
  const d = partSlideDir(L); if (d) { const m = { x: -d.y, y: d.x }, o = P[L.joints[0]]; cols.push([m.x, m.y, o.x * m.y - o.y * m.x], [0, 0, 1]); }
  let act = cts.map((_, i) => i), x = null;
  for (let it = 0; it < 4; it++) { // chuẩn nhỏ nhất x = Aᵀ(AAᵀ)⁻¹b trên các tiếp xúc còn hoạt động, bỏ tiếp xúc bị kéo (lực âm)
    const C = [...act.map(i => cols[i]), ...cols.slice(cts.length)], G = [0, 1, 2].map(r => [0, 1, 2].map(s => C.reduce((a, c) => a + c[r] * c[s], 0) + (r === s ? 1e-9 : 0)));
    const y = linsolve(G.map(r => r.slice()), b.slice()); if (!y) return cts.map(() => 0);
    x = C.map(c => c[0] * y[0] + c[1] * y[1] + c[2] * y[2]);
    const neg = act.filter((_, k) => x[k] < -1e-9); if (!neg.length) break; act = act.filter(i => !neg.includes(i));
  }
  const F = cts.map(() => 0); act.forEach((i, k) => F[i] = Math.max(0, x[k])); return F;
}
// độ lấn sâu nhất của khâu khác vào part L ở tư thế P (lưới va chạm): { d mm, C, n (phương lực lên L), by }
// mẫu biên nằm trong thân ~½ ô và LM chấp nhận lấn ≤ 0.1 mm → trừ nền (h_L + h_B)/2 + 0.1 mm để tiếp xúc bình thường cho δ ≈ 0
const FEA_PEN_MIN = 0.03;
function feaPenetration(L, P) {
  const cd = collData(), SK = cd.shapes[L.id], fK = frameOf(L, P); if (!SK || !fK) return null; let best = null;
  const W = (f, gu, gv) => { const x = gu * f.ex - gv * f.ey, y = gu * f.ey + gv * f.ex, l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l }; };
  // mọi cặp va chạm của L (collPairs: cùng lớp, không chung khớp, không mate...) — kể cả cặp đã bị bỏ khỏi vật lý vì chồng lấn sẵn ở tư thế thiết kế
  // (lưu tư thế đang bị ép lấn làm tư thế thiết kế sẽ làm cặp đó thành S.physSkip; độ lấn vẫn phải đo được)
  for (const [A, Bs] of cd.pairs || []) {
    if (A.id !== L.id && Bs.id !== L.id) continue;
    const bid = A.id === L.id ? Bs.id : A.id, SB = cd.shapes[bid], B = getL(bid), fB = B && frameOf(B, P); if (!SB || !fB) continue;
    const base = (SK.h + SB.h) / 2 + 0.1;
    for (let k = 0; k < SB.samp.length; k += 2) { // điểm biên của B nằm trong L: lực lên L ngược pháp tuyến ngoài của L
      const w = toWorld(fB, { u: SB.samp[k], v: SB.samp[k + 1] }), l = toLocal(fK, w), [sd, gu, gv] = collSdGrad(SK, l.u, l.v), d = -sd - base;
      if (!best || d > best.d) { const g = W(fK, gu, gv); best = { d, C: w, n: { x: -g.x, y: -g.y }, by: bid }; }
    }
    for (let k = 0; k < SK.samp.length; k += 2) { // điểm biên của L nằm trong B: lực lên L theo pháp tuyến ngoài của B
      const w = toWorld(fK, { u: SK.samp[k], v: SK.samp[k + 1] }), l = toLocal(fB, w), [sd, gu, gv] = collSdGrad(SB, l.u, l.v), d = -sd - base;
      if (!best || d > best.d) best = { d, C: w, n: W(fB, gu, gv), by: bid };
    }
  }
  return best && best.d > 0 ? best : null;
}
// khoảng cách có dấu tới khâu B ở tư thế P (âm = bên trong) + pháp tuyến ngoài: thanh / tấm không có hình ghép → chính xác
// (nét bút tròn bán kính w/2 dọc đa giác khớp, như drawLinkBody); part / khâu có hình ghép → trường SDF của lưới va chạm
function linkSD(B, P, x) {
  const pts = B.joints.map(id => P[id]);
  if (B.kind !== 'body' && B.kind !== 'cyl' && pts.every(Boolean) && !S.model.features.some(f => f.link === B.id)) {
    const r = (B.w || 6) / 2, segs = pts.length > 2 ? pts.map((p, i) => [p, pts[(i + 1) % pts.length]]) : [[pts[0], pts[1]]]; let best = null;
    for (const [a, b] of segs) { const s = segDist(x.x, x.y, a, b); if (!best || s.d < best.d) best = { d: s.d, c: { x: a.x + (b.x - a.x) * s.t, y: a.y + (b.y - a.y) * s.t } }; }
    const dl = best.d || 1e-9, out = { x: (x.x - best.c.x) / dl, y: (x.y - best.c.y) / dl };
    return pts.length > 2 && inPoly(x.x, x.y, pts) ? { d: -best.d - r, n: { x: -out.x, y: -out.y } } : { d: best.d - r, n: out };
  }
  const SB = collData().shapes[B.id], fB = frameOf(B, P); if (!SB || !fB) return null;
  const l = toLocal(fB, x), [sd, gu, gv] = collSdGrad(SB, l.u, l.v), nx = gu * fB.ex - gv * fB.ey, ny = gu * fB.ey + gv * fB.ex, nl = Math.hypot(nx, ny) || 1;
  return { d: sd, n: { x: nx / nl, y: ny / nl } };
}
// tiếp xúc một chiều với khâu cứng (motor lực vô hạn): mọi nút biên part sau biến dạng phải nằm ngoài khâu:
//   g_i + n_i·u_i ≥ 0, λ_i ≥ 0, λ_i·(g_i + n_i·u_i) = 0 — u = Σ λ_j·(nghiệm tải đơn vị n_j tại nút j) (ma trận độ mềm C, tập hoạt động)
// → trả { u, f, d (độ lấn lớn nhất ban đầu), F (hợp lực), C, n, by, nodes (nút đang chạm) } hoặc null nếu không lấn
function feaContactSolve(L, M, P, fN, warm) {
  const others = (collData().pairs || []).filter(([a, b]) => a.id === L.id || b.id === L.id).map(([a, b]) => getL(a.id === L.id ? b.id : a.id)).filter(Boolean);
  if (!others.length) return null;
  // khe hở thật của nút biên k khi part đã dời u (hệ cục bộ) → { g, n (thế giới), nl (cục bộ), by }
  const toL = v => ({ x: v.x * fN.ex + v.y * fN.ey, y: -v.x * fN.ey + v.y * fN.ex });
  const gapAt = (k, u) => { const x = toWorld(fN, { u: M.nodes[k].u + (u ? u[2 * k] : 0), v: M.nodes[k].v + (u ? u[2 * k + 1] : 0) }); let best = null;
    for (const B of others) { const s = linkSD(B, P, x); if (s && (!best || s.d < best.g)) best = { g: s.d, n: s.n, nl: toL(s.n), by: B.id }; } return best; };
  let dmin = 0, by = null; for (const k of M.bnodes) { const q = gapAt(k, null); if (q && q.g < dmin) { dmin = q.g; by = q.by; } }
  if (-dmin < FEA_PEN_MIN) return null;
  // nghiệm tải đơn vị theo u, v tại nút k (không phụ thuộc tư thế → lưu đệm trong mô hình)
  M.cols = M.cols || new Map();
  const col = k => { let c = M.cols.get(k); if (!c) { const fx = new Float64Array(M.nd), fy = new Float64Array(M.nd); fx[2 * k] = 1; fy[2 * k + 1] = 1; c = [bandSolve(M.K, M.nd, M.W, fx), bandSolve(M.K, M.nd, M.W, fy)]; if (M.cols.size > 400) M.cols.clear(); M.cols.set(k, c); } return c; };
  // khởi động ấm từ hình đã biến dạng ở bước trước (warm.u): mỗi bước khâu chỉ tiến ~0.5 mm nên nút mới chạm nằm sát mặt khâu, pháp tuyến rõ ràng.
  // Giải "lạnh" từ hình chưa biến dạng khi khâu đã lấn sâu: nút nằm sâu trong khâu có mặt gần nhất là mặt bên/đáy → bị kéo ra sai hướng, biên part bị xé méo
  const margin = Math.max(0.3, 2 * M.h); let u = warm ? Float64Array.from(warm.u) : new Float64Array(M.nd), act = [], lam = [], nls = [], resid = 0;
  for (let outer = 0; outer < 12; outer++) {
    // ứng viên: nút biên có khe hở thật (ở hình đã biến dạng) < margin, cộng các nút đang có lực; tối đa 64 nút sâu nhất
    const gs = new Map(); for (const k of M.bnodes) { const q = gapAt(k, u); if (q && q.g < margin) gs.set(k, q); }
    act.forEach((k, j) => { if (lam[j] > 0 && !gs.has(k)) { const q = gapAt(k, u); if (q) gs.set(k, q); } });
    const cand = [...gs].sort((a, b) => a[1].g - b[1].g).slice(0, 64); if (!cand.length) break;
    const m = cand.length, nl = cand.map(([, q]) => q.nl), cc = cand.map(([k], j) => { const [cx, cy] = col(k); return { cx, cy, n: nl[j] }; });
    const Cm = cand.map(([k], i) => cc.map(({ cx, cy, n }) => nl[i].x * (n.x * cx[2 * k] + n.y * cy[2 * k]) + nl[i].y * (n.x * cx[2 * k + 1] + n.y * cy[2 * k + 1])));
    // tuyến tính hóa quanh u hiện tại: khe hở(λ) = g_i(u) − n_i·u_i + n_i·U(λ)_i ≥ 0
    const w = cand.map(([k, q]) => q.g - (q.nl.x * u[2 * k] + q.nl.y * u[2 * k + 1])), L2 = new Array(m).fill(0);
    for (let it = 0; it < 4000; it++) { let dm = 0; for (let i = 0; i < m; i++) { const v = Math.max(0, L2[i] - w[i] / Cm[i][i]), d = v - L2[i]; if (!d) continue; L2[i] = v; for (let r = 0; r < m; r++) w[r] += Cm[r][i] * d; dm = Math.max(dm, Math.abs(d) * Cm[i][i]); } if (dm < 1e-7) break; }
    const un = new Float64Array(M.nd); cc.forEach(({ cx, cy, n }, j) => { const l = L2[j]; if (!(l > 0)) return; for (let i = 0; i < M.nd; i++) un[i] += l * (n.x * cx[i] + n.y * cy[i]); });
    u = un; act = cand.map(([k]) => k); lam = L2; nls = cand.map(([, q]) => q);
    resid = Infinity; for (const k of M.bnodes) { const q = gapAt(k, u); if (q) resid = Math.min(resid, q.g); }
    if (Math.abs(resid) < 0.01) break; // vừa chạm: không lấn, không hở (> 0 là đẩy quá tay do tuyến tính hóa → lặp tiếp)
  }
  const f = new Float64Array(M.nd); let Fx = 0, Fy = 0, cx = 0, cy = 0, lt = 0;
  act.forEach((k, j) => { const l = lam[j]; if (!(l > 0)) return; f[2 * k] += l * nls[j].nl.x; f[2 * k + 1] += l * nls[j].nl.y; Fx += l * nls[j].n.x; Fy += l * nls[j].n.y; const w = toWorld(fN, M.nodes[k]); cx += l * w.x; cy += l * w.y; lt += l; });
  if (!(lt > 0)) return null;
  const Fm = Math.hypot(Fx, Fy) || 1e-12;
  return { u, f, d: -dmin, F: Fm, C: { x: cx / lt, y: cy / lt }, n: { x: Fx / Fm, y: Fy / Fm }, by, resid, nodes: act.filter((_, j) => lam[j] > 0) };
}
// bước motor khi bị chặn (motor lực vô hạn): part có vật liệu đang chạm được giữ đứng yên tại chỗ kẹt, bỏ tiếp xúc của chúng → khâu đi xuyên vào part
// (độ lấn = biến dạng cưỡng bức, feaSolve tính lực / ứng suất); part không có vật liệu vẫn cứng như cũ
function stepForced(model, cons, P, th, nx, step) {
  if (!model.motorInf || !P) return null;
  const K = model.links.filter(L => isBody(L) && L.mat && (feaPenetration(L, P) || feaContacts(L, P).length)); if (!K.length) return null;
  const ids = new Set(K.flatMap(L => L.joints)), kid = new Set(K.map(L => L.id));
  const m2 = { ...model, joints: model.joints.map(j => ids.has(j.id) && !j.fixed && P[j.id] ? { ...j, fixed: true, x: P[j.id].x, y: P[j.id].y } : j) };
  const c2 = cons.filter(c => !(c.t === 'ct' && c.pair.split('|').some(id => kid.has(id))));
  const save = S.ignoreJam; S.ignoreJam = true; let r = null;
  try { r = stepTo(m2, c2, P, th, nx, step); } finally { S.ignoreJam = save; }
  if (r) S.jamInfo = null; return r;
}
function setMotorInf(v) { if (S.playing) togglePlay(); commitPose(); S.model.motorInf = !!v; feaPoseCache.clear(); rebuild(); }
// giải biến dạng của part L ở tư thế P → { cts, F, sig (ứng suất von Mises tại nút), smax, at, umax, sf }
const feaPoseCache = new Map();
// lịch sử tiếp xúc cưỡng bức: nghiệm của bước trước (θ gần) làm điểm khởi đầu cho bước sau
S.feaLast = {};
const FEA_WARM_DTH = 5 * D2R;
function feaAt(L, P = S.pos) {
  const M = feaModel(L); if (!M) return null;
  const c = feaPoseCache.get(L.id); if (c && c.P === P && c.M === M && c.cons === S.cons) return c.r;
  let warm = null;
  if (S.model.motorInf && P === S.pos) {
    const w = S.feaLast[L.id]; if (w && w.M === M && w.cons === S.cons && Math.abs(w.th - S.theta) < FEA_WARM_DTH) warm = w;
    else warm = feaRamp(L, M, S.theta); // nhảy thẳng tới tư thế (bấm Phân tích, kéo thanh θ): giải lại tuần tự từ lúc bắt đầu bị ép
  }
  const r = feaSolve(L, M, P, warm); feaPoseCache.set(L.id, { P, M, cons: S.cons, r });
  if (P === S.pos) { if (r && r.forced) S.feaLast[L.id] = { th: S.theta, u: r.u, M, cons: S.cons }; else delete S.feaLast[L.id]; }
  return r;
}
// đi theo các khung quét S.an.sweep từ khung gần θ nhất lùi về lúc chưa bị ép, rồi giải xuôi từng khung (mỗi khung khởi động ấm từ khung trước)
function feaRamp(L, M, th) {
  const fr = S.an && S.an.sweep; if (!fr || !fr.length) return null;
  let i = 0, bd = Infinity; fr.forEach((f, k) => { const d = Math.abs(f.th - th); if (d < bd) { bd = d; i = k; } }); if (bd > FEA_WARM_DTH) return null;
  const n = fr.length, full = S.an.full, at = k => fr[((k % n) + n) % n]; // quay toàn vòng: khung nối vòng (đợt ép có thể vắt qua mốc 0°/360°)
  let j = i; while ((full || j > 0) && i - j < n - 1 && feaInterf(L, M, at(j - 1).pos)) j--;
  let warm = null; for (let k = j; k <= i; k++) { const f = at(k), r = feaSolve(L, M, f.pos, warm); warm = r && r.forced ? { th: th + (f.th - fr[i].th), u: r.u, M, cons: S.cons } : null; }
  return warm;
}
// part có bị khâu khác lấn vào ở tư thế P không (khe hở nút biên chưa biến dạng < −ngưỡng) — dò nhanh, không giải
function feaInterf(L, M, P) {
  const fN = frameOf(L, P); if (!fN) return false;
  const others = (collData().pairs || []).filter(([a, b]) => a.id === L.id || b.id === L.id).map(([a, b]) => getL(a.id === L.id ? b.id : a.id)).filter(Boolean);
  for (const k of M.bnodes) { const x = toWorld(fN, M.nodes[k]); for (const B of others) { const s2 = linkSD(B, P, x); if (s2 && s2.d < -FEA_PEN_MIN) return true; } }
  return false;
}
function feaSolve(L, M, P, warm) {
  const fN = frameOf(L, P); if (!fN) return null;
  // motor lực vô hạn: part bị kẹt nhưng khâu cứng vẫn đi tiếp → biên part bị đẩy ra NGOÀI khâu (tiếp xúc một chiều, feaContactSolve)
  const cs = S.model.motorInf && M.nsup ? feaContactSolve(L, M, P, fN, warm) : null, forced = !!cs;
  let cts, F, loads;
  if (forced) { cts = [{ C: cs.C, f: cs.n, by: cs.by }]; F = [cs.F]; loads = [{ C: cs.C, F: { x: cs.n.x * cs.F, y: cs.n.y * cs.F } }]; }
  else {
    cts = feaContacts(L, P); F = feaForces(L, P, cts); loads = cts.map((c, i) => ({ C: c.C, F: { x: c.f.x * F[i], y: c.f.y * F[i] } })).filter(l => Math.hypot(l.F.x, l.F.y) > 1e-9);
    if (!(M.mp.F > 0)) loads.push(...feaKnown(L, P).filter(k => cts.length));
  }
  const res = { cts, F, smax: 0, umax: 0, sf: Infinity, at: null, sig: null, u: null, arm: null, forced: null };
  if (!forced && !(M.mp.F > 0) && M.pins.length === 1 && !M.edges.length) { // tay đòn nhỏ nhất của lực tiếp xúc quanh chốt: ≈ 0 → lực tự tính tăng vọt (sát vị trí kẹt)
    const E = toWorld(fN, M.pins[0]); cts.forEach((c, i) => { if (F[i] > 1e-6) { const d = Math.abs((c.C.x - E.x) * c.f.y - (c.C.y - E.y) * c.f.x); if (res.arm == null || d < res.arm) res.arm = d; } });
  }
  if (!loads.length) return res;
  const N = M.nodes.length, R = M.h * 1.5, skip = Uint8Array.from(M.near); let f = new Float64Array(M.nd), u;
  if (forced) { f = cs.f; u = cs.u; res.forced = { d: cs.d, F: cs.F, by: cs.by, nodes: cs.nodes }; for (const k of cs.nodes) M.nodes.forEach((n, i) => { if (Math.hypot(n.u - M.nodes[k].u, n.v - M.nodes[k].v) < 2 * M.h) skip[i] = 1; }); }
  else {
  const toL = v => ({ x: v.x * fN.ex + v.y * fN.ey, y: -v.x * fN.ey + v.y * fN.ex });
  let patchW = null; // các nút nhận tải đơn vị (để đo độ mềm khi cưỡng bức)
  for (const l of loads) { // rải lực lên các nút biên trong bán kính R quanh điểm đặt (tránh ứng suất kỳ dị của lực tập trung)
    const q = toLocal(fN, l.C), Fl = toL(l.F); let ws = [], tot = 0;
    if (l.kind) { // lò xo hồi vị / trọng lực: lực quy ước không có điểm móc cụ thể → tải khối phân bố theo diện tích, cùng tổng lực và mômen quanh trọng tâm
      const Mz = (q.u - M.cu) * Fl.y - (q.v - M.cv) * Fl.x; let J = 0; M.nodes.forEach((n, k) => { J += M.wt[k] * ((n.u - M.cu) ** 2 + (n.v - M.cv) ** 2); });
      M.nodes.forEach((n, k) => { const w = M.wt[k]; f[2 * k] += Fl.x * w / M.Wt - Mz / J * w * (n.v - M.cv); f[2 * k + 1] += Fl.y * w / M.Wt + Mz / J * w * (n.u - M.cu); });
      continue;
    }
    M.nodes.forEach((n, k) => { if (M.deg[k] >= 4 && l.kind !== 'grav') return; const d = Math.hypot(n.u - q.u, n.v - q.v); if (d < R) { const w = R - d; ws.push([k, w]); tot += w; } });
    if (!tot) { let best = 0, bd = Infinity; M.nodes.forEach((n, k) => { const d = Math.hypot(n.u - q.u, n.v - q.v); if (d < bd) { bd = d; best = k; } }); ws = [[best, 1]]; tot = 1; }
    for (const [k, w] of ws) { f[2 * k] += Fl.x * w / tot; f[2 * k + 1] += Fl.y * w / tot; }
    if (!patchW) patchW = { ws, tot, Fl };
    if (l.kind !== 'grav') M.nodes.forEach((n, k) => { if (Math.hypot(n.u - q.u, n.v - q.v) < R + 2 * M.h) skip[k] = 1; }); // vùng đặt lực: ứng suất tiếp xúc cục bộ không mô hình được
  }
  if (!forced && !M.relief && M.pins.length === 1 && !M.edges.length) { // một chốt chỉ chịu lực (cưỡng bức: part đang bị kẹt, không xoay được → vòng chốt giữ cả mômen), không chịu mômen: mômen chưa cân bằng (lực thử) trả về bằng tải xoay phân bố quanh chốt
    const pu = M.pins[0].u, pv = M.pins[0].v; let Mz = 0, J = 0;
    M.nodes.forEach((n, k) => { Mz += (n.u - pu) * f[2 * k + 1] - (n.v - pv) * f[2 * k]; J += M.wt[k] * ((n.u - pu) ** 2 + (n.v - pv) ** 2); });
    M.nodes.forEach((n, k) => { const w = M.wt[k]; f[2 * k] += Mz / J * w * (n.v - pv); f[2 * k + 1] -= Mz / J * w * (n.u - pu); });
  }
  if (M.relief) { // khử hợp lực + mômen bằng lực khối phân bố theo diện tích (cân bằng quán tính)
    let Fx = 0, Fy = 0, Mz = 0, J = 0; M.nodes.forEach((n, k) => { Fx += f[2 * k]; Fy += f[2 * k + 1]; Mz += (n.u - M.cu) * f[2 * k + 1] - (n.v - M.cv) * f[2 * k]; J += M.wt[k] * ((n.u - M.cu) ** 2 + (n.v - M.cv) ** 2); });
    M.nodes.forEach((n, k) => { const w = M.wt[k]; f[2 * k] -= Fx * w / M.Wt - Mz / J * w * (n.v - M.cv); f[2 * k + 1] -= Fy * w / M.Wt + Mz / J * w * (n.u - M.cu); });
  }
  u = bandSolve(M.K, M.nd, M.W, f);
  }
  if (M.relief) { // bỏ chuyển động cứng (khớp bình phương tối thiểu tịnh tiến + xoay nhỏ)
    let tu = 0, tv = 0; for (let k = 0; k < N; k++) { tu += M.wt[k] * u[2 * k]; tv += M.wt[k] * u[2 * k + 1]; } tu /= M.Wt; tv /= M.Wt;
    let num = 0, J = 0; M.nodes.forEach((n, k) => { const ru = n.u - M.cu, rv = n.v - M.cv; num += M.wt[k] * (ru * (u[2 * k + 1] - tv) - rv * (u[2 * k] - tu)); J += M.wt[k] * (ru * ru + rv * rv); }); const th = num / J;
    M.nodes.forEach((n, k) => { u[2 * k] -= tu - th * (n.v - M.cv); u[2 * k + 1] -= tv + th * (n.u - M.cu); });
  }
  // ứng suất tâm phần tử → trung bình về nút (làm mượt), von Mises tại nút
  const c = M.mp.E / (1 - M.mp.nu ** 2), sx = new Float64Array(N), sy = new Float64Array(N), txy = new Float64Array(N), cnt = new Uint8Array(N);
  M.els.forEach((e, ei) => { const B0 = M.ElK[ei].B0;
    let ex = 0, ey = 0, gxy = 0; for (let a = 0; a < 8; a++) { const ua = u[2 * e[a >> 1] + (a & 1)]; ex += B0[a] * ua; ey += B0[8 + a] * ua; gxy += B0[16 + a] * ua; }
    const s1 = c * (ex + M.mp.nu * ey), s2 = c * (M.mp.nu * ex + ey), s3 = c * (1 - M.mp.nu) / 2 * gxy;
    for (const n of e) { sx[n] += s1; sy[n] += s2; txy[n] += s3; cnt[n]++; }
  });
  const sig = new Float64Array(N); let smax = 0, at = -1, umax = 0, sall = 0, atAll = 0;
  for (let n = 0; n < N; n++) { const a = sx[n] / cnt[n], b = sy[n] / cnt[n], t = txy[n] / cnt[n]; sig[n] = Math.sqrt(a * a - a * b + b * b + 3 * t * t); if (!skip[n] && sig[n] > smax) { smax = sig[n]; at = n; } if (sig[n] > sall) { sall = sig[n]; atAll = n; } umax = Math.max(umax, Math.hypot(u[2 * n], u[2 * n + 1])); }
  if (at < 0) { smax = sall; at = atAll; } // part quá nhỏ: toàn bộ nằm trong vùng loại trừ
  for (let n = 0; n < N; n++) if (skip[n]) sig[n] = Math.min(sig[n], smax); // bản đồ màu không nóng hơn số báo cáo
  // phản lực từng chốt = nội lực − ngoại lực tại các nút bị khóa của chốt đó → ứng suất ép mặt σb = |R| / (d·t)
  const fi = new Float64Array(M.nd);
  M.els.forEach((e, ei) => { const Ke = M.ElK[ei].Ke; for (let a = 0; a < 8; a++) { let s = 0; for (let b2 = 0; b2 < 8; b2++) s += Ke[a * 8 + b2] * u[2 * e[b2 >> 1] + (b2 & 1)]; fi[2 * e[a >> 1] + (a & 1)] += s; } });
  const Rp = Array.from({ length: M.nsup }, () => ({ x: 0, y: 0 })); for (let n = 0; n < N; n++) { const p = M.pinOf[n]; if (p >= 0) { Rp[p].x += fi[2 * n] - f[2 * n]; Rp[p].y += fi[2 * n + 1] - f[2 * n + 1]; } }
  const pinR = Rp.map((r, i) => i < M.pins.length ? { id: M.pins[i].id, R: Math.hypot(r.x, r.y), sb: Math.hypot(r.x, r.y) / (2 * FEA_PIN_R * M.mp.t) } : { edge: M.edges[i - M.pins.length].id, R: Math.hypot(r.x, r.y), sb: 0 }), sb = Math.max(0, ...pinR.map(p => p.sb));
  const gov = Math.max(smax, sb), big = umax > 0.15 * M.size; // độ võng > 15% kích thước part: ngoài phạm vi đàn hồi tuyến tính (góc xoay nhỏ)
  return Object.assign(res, { big, sig, u, smax, sb, pinR, umax, at: toWorld(fN, M.nodes[at]), sf: gov > 1e-9 ? M.mp.sy / gov : Infinity, loads });
}

// ----- quét cả vùng làm việc: ứng suất lớn nhất theo θ (chạy trễ) -----
let feaSweepTimer = 0; S.feaSweep = null;
function feaSweepInfo() {
  const parts = S.model.links.filter(L => isBody(L) && L.mat); if (!parts.length || !S.an || !S.an.sweep.length) return null;
  const key = JSON.stringify(parts.map(L => [L.id, L.mat])), cur = S.feaSweep;
  if (cur && cur.an === S.an && cur.key === key && cur.cons === S.cons) return cur.done ? cur : null;
  S.feaSweep = { an: S.an, key, cons: S.cons, done: false }; clearTimeout(feaSweepTimer);
  feaSweepTimer = setTimeout(() => {
    const job = S.feaSweep; if (!job || job.done || job.an !== S.an) return;
    job.res = parts.map(L => { const M = feaModel(L); let best = null, warm = null; if (M) feaSweepOrder(L, M).forEach(i => { const f = S.an.sweep[i]; // giải tuần tự theo θ, khởi động ấm từ khung trước
      const r = feaSolve(L, M, f.pos, warm); warm = r && r.forced ? { u: r.u, M } : null; if (r && r.smax > 0 && (!best || r.sf < best.sf)) best = { i, smax: r.smax, sb: r.sb, umax: r.umax, sf: r.sf, F: Math.max(0, ...r.F), arm: r.arm, forced: r.forced }; }); return { id: L.id, best }; });
    job.done = true; renderAnalysis();
  }, 60);
  return null;
}
// thứ tự khung để giải tuần tự: quay toàn vòng → bắt đầu ở khung chưa bị ép rồi đi hết vòng (đợt ép vắt qua mốc 0° vẫn liền mạch)
function feaSweepOrder(L, M) {
  const n = S.an.sweep.length; if (!S.an.full) return [...Array(n).keys()];
  let s0 = 0; while (s0 < n && feaInterf(L, M, S.an.sweep[s0].pos)) s0++; if (s0 >= n) s0 = 0;
  return Array.from({ length: n }, (_, k) => (s0 + k) % n);
}
function feaAnalysisRows() {
  const parts = S.model.links.filter(L => isBody(L) && L.mat); if (!parts.length) return '';
  const info = feaSweepInfo(); if (!info) return `<dt>${T('a_fea')}</dt><dd class="muted">${T('a_coll_busy')}</dd>`;
  return info.res.map(r => {
    const L = getL(r.id); if (!L) return ''; const mp = matProps(L), nm = `${T('a_fea')} ${esc(L.name)} (${esc(mp.name)} ${mp.t} mm)`;
    if (!r.best) return `<dt>${nm}</dt><dd class="muted">${T(mp.F > 0 || L.spr || L.grav ? 'fea_noload' : 'fea_noforce')}</dd>`;
    const b = r.best, cls = b.sf < 1 ? 'bad' : b.sf < 1.5 ? 'warn' : 'ok';
    return `<dt>${nm}</dt><dd class="${cls}"><a href="#" class="feajump" data-fi="${b.i}">σ ${b.smax.toFixed(1)} MPa${b.sb > 0 ? ` · ${T('fea_sb')} ${b.sb.toFixed(1)}` : ''} · ${T('fea_sf')} ${b.sf.toFixed(1)} · ${T('fea_def')} ${b.umax.toFixed(3)} mm · F ${b.F.toFixed(1)} N @ ${degN(S.an.sweep[b.i].th).toFixed(0)}°${b.arm != null && b.arm < 2 && !b.forced ? ' · ' + T('fea_arm', { d: b.arm.toFixed(2) }) : ''}${b.forced ? ' · ' + T('fea_forced', { d: b.forced.d.toFixed(2), f: b.forced.F.toFixed(1) }) : ''}</a></dd>`;
  }).join('');
}
document.getElementById('analysis').addEventListener('click', e => { const a = e.target.closest('.feajump'); if (!a) return; e.preventDefault(); const f = S.an && S.an.sweep[+a.dataset.fi]; if (!f) return; if (S.playing) togglePlay(); S.pos = f.pos; S.theta = f.th; afterMove(); });

// ----- vẽ -----
// màu ứng suất: xanh dương (0) → xanh lá → vàng → đỏ (≥ σ chảy)
function feaColor(r) { const t = Math.max(0, Math.min(1, r)), stops = [[59, 130, 246], [34, 197, 94], [234, 179, 8], [239, 68, 68]], x = t * 3, i = Math.min(2, Math.floor(x)), f = x - i, a = stops[i], b = stops[i + 1]; return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(',')})`; }
// sọc chéo đặc trưng cho part đã gán vật liệu (vẽ lên ảnh thân khâu trước khi ghép, chỉ trong hình)
function matHatch(c, L, x0, y0, bw, bh) {
  c.save(); c.globalCompositeOperation = 'source-atop'; c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 1.6;
  c.beginPath(); for (let d = -bh; d < bw + bh; d += 9) { c.moveTo(x0 + d, y0 + bh); c.lineTo(x0 + d + bh, y0); } c.stroke();
  c.strokeStyle = 'rgba(0,0,0,.25)'; c.beginPath(); for (let d = -bh + 4.5; d < bw + bh; d += 9) { c.moveTo(x0 + d, y0 + bh); c.lineTo(x0 + d + bh, y0); } c.stroke(); c.restore();
}
// chế độ hiển thị: 'sig' ứng suất von Mises · 'disp' chuyển vị tổng · 'none'; hệ số phóng đại biến dạng (1 = thật)
const feaView = L => L.mat.show === false ? 'none' : (L.mat.view || 'sig'), feaScale = L => L.mat.scale || 1;
const feaGhost = L => !!(L.kind === 'body' && L.mat && feaView(L) !== 'none' && (feaAt(L) || {}).u); // đang vẽ hình biến dạng → hình gốc mờ đi
function drawFea() {
  const loaded = [];
  for (const L of S.model.links) {
    if (!isBody(L) || !L.mat) continue; const mp = matProps(L), ctr = linkCenter(L); if (!ctr) continue;
    const view = feaView(L), r = view === 'none' ? null : feaAt(L), M = feaCache.get(L.id), fN = frameOf(L, S.pos);
    let box = null; // khung bao trên màn hình (đặt nhãn + thang màu bên cạnh)
    if (r && r.u && M && fN) {
      const k = feaScale(L), N = M.nodes.length, pts = new Array(N);
      for (let n = 0; n < N; n++) { const q = w2s(toWorld(fN, { u: M.nodes[n].u + k * r.u[2 * n], v: M.nodes[n].v + k * r.u[2 * n + 1] })); pts[n] = q; }
      const val = view === 'disp' ? Array.from({ length: N }, (_, n) => Math.hypot(r.u[2 * n], r.u[2 * n + 1])) : r.sig, vmax = view === 'disp' ? Math.max(r.umax, 1e-9) : mp.sy;
      ctx.save(); ctx.globalAlpha = .92;
      for (const e of M.els) { const v = (val[e[0]] + val[e[1]] + val[e[2]] + val[e[3]]) / 4; ctx.fillStyle = ctx.strokeStyle = feaColor(v / vmax); ctx.lineWidth = .6; ctx.beginPath(); e.forEach((n, i) => i ? ctx.lineTo(pts[n].x, pts[n].y) : ctx.moveTo(pts[n].x, pts[n].y)); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      ctx.globalAlpha = 1; ctx.strokeStyle = colors.ink; ctx.lineWidth = 1.4; ctx.beginPath(); for (const [a, b] of M.bedges) { ctx.moveTo(pts[a].x, pts[a].y); ctx.lineTo(pts[b].x, pts[b].y); } ctx.stroke(); // biên hình biến dạng
      // mũi tên chuyển vị tại vài nút biên (chế độ chuyển vị)
      if (view === 'disp') { ctx.strokeStyle = ctx.fillStyle = colors.ink; ctx.lineWidth = 1.2; const step = Math.max(1, Math.floor(M.bnodes.length / 14));
        for (let i = 0; i < M.bnodes.length; i += step) { const n = M.bnodes[i], d = Math.hypot(r.u[2 * n], r.u[2 * n + 1]); if (d < 0.2 * r.umax) continue; const o = w2s(toWorld(fN, M.nodes[n])), q = pts[n], a = Math.atan2(q.y - o.y, q.x - o.x); if (Math.hypot(q.x - o.x, q.y - o.y) < 4) continue;
          ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(q.x, q.y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x - 6 * Math.cos(a - .5), q.y - 6 * Math.sin(a - .5)); ctx.lineTo(q.x - 6 * Math.cos(a + .5), q.y - 6 * Math.sin(a + .5)); ctx.closePath(); ctx.fill(); } }
      ctx.restore();
      const am = M.nodes.reduce((b, n, i) => (view === 'disp' ? val[i] > val[b] : r.sig[i] === r.smax) ? i : b, 0), q = view === 'disp' ? pts[am] : w2s(r.at); // điểm cực đại
      ctx.strokeStyle = colors.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(q.x, q.y, 6, 0, TAU); ctx.stroke();
      ctx.font = '600 11px ' + bodyFont(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      r.cts.forEach((c, i) => { if (!(r.F[i] > 1e-6)) return; const p = w2s(c.C); feaPill(`${r.F[i].toFixed(1)} N`, p.x, p.y - 18, colors.bad); });
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const q2 of pts) { x0 = Math.min(x0, q2.x); x1 = Math.max(x1, q2.x); y0 = Math.min(y0, q2.y); y1 = Math.max(y1, q2.y); } box = { x0, y0, x1, y1 };
    }
    // nhãn ngắn cạnh part: vật liệu (không tải) hoặc σ · HSAT tại điểm cực đại; chi tiết + thang màu nằm ở khung cố định (feaPanel)
    ctx.font = '700 11px ' + bodyFont(); ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    if (box && r.smax > 0) loaded.push({ L, r, mp, view, k: feaScale(L), box });
    else { const p = w2s(ctr); feaPill(`${mp.name} · ${mp.t} mm`, p.x, p.y, colors.accent); }
  }
  // khung chi tiết: part đang chọn (nếu đang chịu tải), không thì part có HSAT thấp nhất
  const act = loaded.find(o => S.sel && S.sel.k === 'l' && S.sel.id === o.L.id) || loaded.slice().sort((a, b) => a.r.sf - b.r.sf)[0];
  feaOverlay = { loaded, act };
}
// lớp trên cùng (vẽ sau khớp, nhãn tiếp xúc, gốc tọa độ): nhãn ngắn σ · HSAT cạnh mỗi part chịu tải + khung chi tiết
let feaOverlay = null;
function drawFeaOverlay() {
  const o = feaOverlay; feaOverlay = null; if (!o) return;
  ctx.font = '700 11px ' + bodyFont(); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  for (const { L, r, box } of o.loaded) { // bên phải khung bao hình biến dạng (tràn màn hình → bên trái)
    const col = r.sf < 1 ? colors.bad : r.sf < 1.5 ? colors.warn : colors.ok, t = `${L.name}: σ ${r.smax.toFixed(1)} MPa · ${T('fea_sf')} ${r.sf.toFixed(1)}`, w = ctx.measureText(t).width + 12;
    const x = box.x1 + 10 + w < W - 270 ? box.x1 + 10 : Math.max(8, box.x0 - 10 - w); feaPill(t, x, Math.max(14, box.y0 + 10), col, true);
  }
  if (o.act) feaPanel(o.act);
}
function feaPanel({ L, r, mp, view, k }) {
  const lines = [[`${L.name} · ${mp.name} ${mp.t} mm`, colors.ink, '700']];
  if (r.forced) lines.push([T('fea_forced', { d: r.forced.d.toFixed(2), f: r.forced.F.toFixed(1) }), colors.bad, '700']);
  else lines.push([T('fea_pf', { f: Math.max(0, ...r.F).toFixed(1) }), colors.ink, '600']);
  const col = r.sf < 1 ? colors.bad : r.sf < 1.5 ? colors.warn : colors.ok;
  lines.push([`σ max ${r.smax.toFixed(1)} MPa / σy ${mp.sy} MPa`, col, '700'], [`${T('fea_sf')} ${r.sf.toFixed(2)}${r.sf < 1 ? ' — ' + T('fea_yield') : ''}`, col, '700']);
  if (r.sb > 0) lines.push([`${T('fea_sb')} ${r.sb.toFixed(1)} MPa`, colors.ink, '600']);
  lines.push([`${T('fea_def')} max ${r.umax.toFixed(3)} mm`, colors.ink, '600']);
  if (r.big) lines.push([T('fea_big'), colors.warn, '700']);
  const sr = stage.getBoundingClientRect(), below = id => { const e = document.getElementById(id); if (!e || e.hidden || !e.offsetParent) return 0; const b = e.getBoundingClientRect(); return b.left < sr.right && b.right > sr.right - 270 ? b.bottom - sr.top : 0; };
  const pw = 250, lh = 17, bh = 96, ph = 14 + lines.length * lh + 28 + bh + 26, x = W - pw - 12, y = Math.max(12, below('hint'), below('status')) + 10; // dưới dòng hướng dẫn / chip trạng thái
  ctx.save(); ctx.fillStyle = colors.panel; ctx.globalAlpha = .94; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, pw, ph, 8) : ctx.rect(x, y, pw, ph); ctx.fill(); ctx.globalAlpha = 1;
  ctx.strokeStyle = colors.line; ctx.lineWidth = 1; ctx.stroke();
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  lines.forEach(([t, c, w], i) => { ctx.font = `${w} 11.5px ` + bodyFont(); ctx.fillStyle = c; ctx.fillText(t, x + 12, y + 14 + i * lh); });
  // thang màu
  const vmax = view === 'disp' ? Math.max(r.umax, 1e-9) : mp.sy, cur = view === 'disp' ? r.umax : r.smax, bx = x + 14, by = y + 14 + lines.length * lh + 22, bw = 14;
  ctx.font = '700 11px ' + bodyFont(); ctx.fillStyle = colors.ink; ctx.fillText(view === 'disp' ? T('fea_leg_disp') : T('fea_leg_sig'), bx - 2, by - 11);
  const g = ctx.createLinearGradient(0, by + bh, 0, by); [0, 1 / 3, 2 / 3, 1].forEach(t => g.addColorStop(t, feaColor(t)));
  ctx.fillStyle = g; ctx.fillRect(bx, by, bw, bh); ctx.strokeStyle = colors.ink; ctx.strokeRect(bx + .5, by + .5, bw, bh);
  const u = view === 'disp' ? 'mm' : 'MPa', fmt = v => view === 'disp' ? v.toFixed(3) : v.toFixed(1);
  ctx.font = '600 10.5px ' + monoFont(); ctx.fillStyle = colors.ink;
  ctx.fillText(view === 'disp' ? `${fmt(vmax)} ${u}` : `≥ σy ${fmt(vmax)} ${u}`, bx + bw + 8, by + 4); ctx.fillText(`${fmt(vmax / 2)} ${u}`, bx + bw + 8, by + bh / 2); ctx.fillText(`0 ${u}`, bx + bw + 8, by + bh - 4);
  if (view !== 'disp') { const yy = by + bh - Math.min(1, cur / vmax) * bh; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(bx - 5, yy); ctx.lineTo(bx + bw + 5, yy); ctx.stroke(); ctx.font = '700 10.5px ' + monoFont(); ctx.fillText(`◀ max ${fmt(cur)}`, bx + bw + 104, Math.max(by + 4, Math.min(by + bh - 4, yy))); }
  ctx.font = '600 11px ' + bodyFont(); ctx.fillStyle = colors['ink-2']; ctx.fillText(T('fea_leg_k', { k }), bx - 2, by + bh + 14);
  ctx.restore();
}
function feaPill(t, x, y, col, left) {
  const w = ctx.measureText(t).width + 12, x0 = left ? x : x - w / 2; ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x0, y - 9, w, 18, 9) : ctx.rect(x0, y - 9, w, 18); ctx.fill();
  ctx.fillStyle = colors.panel; ctx.fillText(t, left ? x + 6 : x, y);
}
// form part: vật liệu, bề dày, lực thử, kết quả tại tư thế hiện tại
function matFormRows(L, num, select) {
  select(T('f_mat'), [['', T('mat_none')], ...Object.keys(MATS).map(k => [k, `${k} · E ${MATS[k].E} MPa · σy ${MATS[k].sy} MPa`]), ['custom', T('mat_custom')]], (L.mat && L.mat.m) || '', v => setPartMat(L.id, 'm', v));
  if (!L.mat) return `<p class="muted">${T('f_mat_note')}</p>`;
  num(T('f_thick'), L.mat.t || 2, 'mm', v => setPartMat(L.id, 't', v), { step: 0.1, dec: 2 });
  if (L.mat.m === 'custom') { num(T('f_E'), L.mat.E || 2000, 'MPa', v => setPartMat(L.id, 'E', v), { step: 100, dec: 0 }); num(T('f_sy'), L.mat.sy || 40, 'MPa', v => setPartMat(L.id, 'sy', v), { step: 1, dec: 0 }); }
  num(T('f_ftest'), L.mat.F || 0, 'N', v => setPartMat(L.id, 'F', v), { step: 0.5, dec: 1 });
  select(T('f_feaview'), [['sig', T('fea_v_sig')], ['disp', T('fea_v_disp')], ['none', T('fea_v_none')]], feaView(L), v => setPartMat(L.id, 'view', v));
  select(T('f_feascale'), [1, 2, 5, 10, 20, 50].map(k => [String(k), k === 1 ? T('fea_k1') : '×' + k]), String(feaScale(L)), v => setPartMat(L.id, 'scale', +v));
  const h = `<label class="toggle"><input type="checkbox" class="fmotinf" ${S.model.motorInf ? 'checked' : ''}><span>${T('f_motinf')}</span></label>${S.model.motorInf ? `<p class="muted">${T('f_motinf_note')}</p>` : ''}`;
  return h + `<div class="fearesult" data-l="${L.id}">${feaResultHTML(L)}</div><p class="muted">${T('f_mat_note2')}</p>`;
}
// kết quả tại tư thế hiện tại (cập nhật trực tiếp theo tư thế: feaFormLive, gọi từ renderProps(liveOnly))
function feaResultHTML(L) {
  const r = feaAt(L), mp = matProps(L);
  return r && r.smax > 0 ? `<p class="${r.sf < 1 ? 'bad' : r.sf < 1.5 ? 'warn' : 'ok'}">${r.forced ? T('fea_forced_now', { d: r.forced.d.toFixed(2), f: r.forced.F.toFixed(1), b: esc(nameOf('l', r.forced.by)) }) + '<br>' : ''}${T('fea_now', { s: r.smax.toFixed(1), sy: mp.sy, sf: r.sf.toFixed(2), d: r.umax.toFixed(3), f: Math.max(0, ...r.F).toFixed(1) })}${r.pinR.map(p => ' · ' + (p.edge ? T('fea_edge', { m: esc(nameOf('q', p.edge)), r: p.R.toFixed(1) }) : T('fea_pin', { j: esc(jname(p.id)), r: p.R.toFixed(1), s: p.sb.toFixed(1) }))).join('')}${r.arm != null && r.arm < 2 ? '<br>' + T('fea_arm_note', { d: r.arm.toFixed(2) }) : ''}${r.smax > mp.sy ? '<br>' + T('fea_lin') : ''}${r.big ? '<br>' + T('fea_big_note') : ''}</p>`
    : `<p class="muted">${T(r && r.cts.length ? (mp.F > 0 || L.spr || L.grav ? 'fea_noload' : 'fea_noforce') : 'fea_nocontact')}</p>`;
}
function feaFormLive(box) { box.querySelectorAll('.fearesult').forEach(el => { const L = getL(el.dataset.l); if (L && L.mat) el.innerHTML = feaResultHTML(L); }); }
