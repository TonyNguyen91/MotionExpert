// ===== C12: tổng hợp cơ cấu 4 khâu theo tư thế (motion generation, kiểu MotionGen / Burmester) =====
// Người dùng đặt N tư thế của thanh truyền (điểm p_i + góc φ_i) và tùy chọn 1–2 gối cố định mong muốn.
// Khâu đôi RR = điểm m gắn trên thanh truyền + gối c trên nền sao cho |T_i(m) − c| không đổi.
//  · có gối c cho trước: các phương trình hiệu bình phương tuyến tính theo m → bình phương tối thiểu (3 tư thế: chính xác)
//  · không có gối: quét lưới m, khớp đường tròn (Kåsa) cho các điểm T_i(m), tinh chỉnh Nelder–Mead → khâu đôi sai số nhỏ nhất
// Ghép từng cặp khâu đôi thành 4 khâu rồi MÔ PHỎNG THẬT (stepTo) để loại lỗi nhánh lắp ráp / sai thứ tự tư thế.
const SY = { open: false, sel: -1, results: null, busy: false, preview: null };
const synEl = document.createElement('section'); synEl.className = 'tpanel synpanel'; synEl.hidden = true; document.getElementById('stage').appendChild(synEl);
const synData = () => S.model.synth || (S.model.synth = { poses: [], pivots: [] });
const rotv = (m, a) => ({ x: m.x * Math.cos(a) - m.y * Math.sin(a), y: m.x * Math.sin(a) + m.y * Math.cos(a) });
const poseT = (P, m) => { const r = rotv(m, P.a * D2R); return { x: P.x + r.x, y: P.y + r.y }; };
const POSE_L = 10; // độ dài mũi tên hướng tư thế (mm)

// ----- khâu đôi -----
function fitCircle(Q) {
  const n = Q.length; let sx = 0, sy = 0; for (const q of Q) { sx += q.x; sy += q.y; } const mx = sx / n, my = sy / n;
  let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0; for (const q of Q) { const x = q.x - mx, y = q.y - my, z = x * x + y * y; a11 += x * x; a12 += x * y; a22 += y * y; b1 += x * z / 2; b2 += y * z / 2; }
  const det = a11 * a22 - a12 * a12; if (Math.abs(det) < 1e-12) return null;
  const c = { x: mx + (b1 * a22 - b2 * a12) / det, y: my + (a11 * b2 - a12 * b1) / det }; let r = 0; for (const q of Q) r += Math.hypot(q.x - c.x, q.y - c.y); r /= n;
  let e = 0; for (const q of Q) e += (Math.hypot(q.x - c.x, q.y - c.y) - r) ** 2; return { c, r, err: Math.sqrt(e / n) };
}
const dyadErr = (poses, m) => { const f = fitCircle(poses.map(P => poseT(P, m))); return f ? f : { err: Infinity }; };
// gối c cho trước → m bình phương tối thiểu
function dyadForPivot(poses, c) {
  const p1 = poses[0], R1 = p1.a * D2R, d1 = { x: p1.x - c.x, y: p1.y - c.y }, g1 = rotv(d1, -R1); let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0;
  for (let i = 1; i < poses.length; i++) {
    const P = poses[i], d = { x: P.x - c.x, y: P.y - c.y }, g = rotv(d, -P.a * D2R), rx = 2 * (g.x - g1.x), ry = 2 * (g.y - g1.y), rhs = (d1.x ** 2 + d1.y ** 2) - (d.x ** 2 + d.y ** 2);
    a11 += rx * rx; a12 += rx * ry; a22 += ry * ry; b1 += rx * rhs; b2 += ry * rhs;
  }
  const det = a11 * a22 - a12 * a12; if (Math.abs(det) < 1e-12) return null;
  const m = { x: (b1 * a22 - b2 * a12) / det, y: (a11 * b2 - a12 * b1) / det }, Q = poses.map(P => poseT(P, m));
  let r = 0; for (const q of Q) r += Math.hypot(q.x - c.x, q.y - c.y); r /= Q.length; let e = 0; for (const q of Q) e += (Math.hypot(q.x - c.x, q.y - c.y) - r) ** 2;
  return { m, c: { ...c }, r, err: Math.sqrt(e / Q.length), given: true };
}
function nelderMead(f, x0, step, it = 120) {
  let S = [x0, [x0[0] + step, x0[1]], [x0[0], x0[1] + step]].map(x => ({ x, v: f(x) }));
  for (let k = 0; k < it; k++) {
    S.sort((a, b) => a.v - b.v); const [b, g, w] = S, c = [(b.x[0] + g.x[0]) / 2, (b.x[1] + g.x[1]) / 2], at = t => [c[0] + t * (w.x[0] - c[0]), c[1] + t * (w.x[1] - c[1])];
    const r = { x: at(-1) }; r.v = f(r.x);
    if (r.v < b.v) { const e = { x: at(-2) }; e.v = f(e.x); S[2] = e.v < r.v ? e : r; }
    else if (r.v < g.v) S[2] = r;
    else { const ct = { x: at(.5) }; ct.v = f(ct.x); if (ct.v < w.v) S[2] = ct; else S = S.map(p => p === b ? p : { x: [(p.x[0] + b.x[0]) / 2, (p.x[1] + b.x[1]) / 2], v: f([(p.x[0] + b.x[0]) / 2, (p.x[1] + b.x[1]) / 2]) }); }
  }
  S.sort((a, b) => a.v - b.v); return S[0];
}
function poseSpan(poses) { let s = 10; for (const a of poses) for (const b of poses) s = Math.max(s, Math.hypot(a.x - b.x, a.y - b.y)); return s; }
function findDyads(poses, pivots) {
  const span = poseSpan(poses), out = [];
  for (const c of pivots) { const d = dyadForPivot(poses, c); if (d) out.push(d); }
  // gối hợp lý: bán kính 0.15–3 lần tầm tư thế, gối không quá xa
  const cx = poses.reduce((s, p) => s + p.x, 0) / poses.length, cy = poses.reduce((s, p) => s + p.y, 0) / poses.length;
  // cơ cấu gọn: bán kính khâu đôi 0.15–2 lần tầm tư thế, gối không xa quá ~2 lần tầm tư thế
  const penal = d => (d.r < .15 * span ? (0.15 * span - d.r) * 4 : 0) + (d.r > 2 * span ? (d.r - 2 * span) : 0) + Math.max(0, Math.hypot(d.c.x - cx, d.c.y - cy) - 2.2 * span) * 0.5;
  const score = m => { const f = dyadErr(poses, { x: m[0], y: m[1] }); return f.err + penal(f) * 0.02 * span / span; };
  const G = 30, R = 1.5 * span, cand = [];
  for (let i = 0; i <= G; i++) for (let j = 0; j <= G; j++) { const m = [-R + 2 * R * i / G, -R + 2 * R * j / G]; cand.push({ m, v: score(m) }); }
  cand.sort((a, b) => a.v - b.v);
  const seeds = []; for (const c of cand) { if (seeds.length >= 60) break; if (seeds.every(s => Math.hypot(s.m[0] - c.m[0], s.m[1] - c.m[1]) > span * .14)) seeds.push(c); }
  for (const s of seeds) {
    const best = poses.length >= 4 ? nelderMead(score, s.m, span * .05) : { x: s.m };
    const m = { x: best.x[0], y: best.x[1] }, f = dyadErr(poses, m); if (!f.c || penal(f) > 0.5 * span) continue;
    if (out.some(d => Math.hypot(d.m.x - m.x, d.m.y - m.y) < span * .08)) continue;
    out.push({ m, c: f.c, r: f.r, err: f.err });
  }
  out.sort((a, b) => (b.given ? 1 : 0) - (a.given ? 1 : 0) || a.err - b.err);
  return out.slice(0, 22);
}
// ----- ghép 4 khâu & mô phỏng kiểm tra -----
function buildFourBar(poses, dIn, dOut) {
  const p0 = poses[0], M1 = poseT(p0, dIn.m), M2 = poseT(p0, dOut.m), J = (id, x, y, o = {}) => ({ id, name: id, x, y, fixed: false, slider: null, slot: null, trace: false, lock: {}, ...o });
  return normalizeModel({ theta0: 0, joints: [J('G1', dIn.c.x, dIn.c.y, { fixed: true }), J('G2', dOut.c.x, dOut.c.y, { fixed: true }), J('M1', M1.x, M1.y), J('M2', M2.x, M2.y), J('P', p0.x, p0.y, { trace: true })],
    links: [{ id: 'L1', name: 'L1', joints: ['G1', 'M1'], w: 5 }, { id: 'L2', name: 'L2', joints: ['M1', 'M2', 'P'], w: 5 }, { id: 'L3', name: 'L3', joints: ['G2', 'M2'], w: 5 }],
    motors: [{ id: 'M1', joint: 'G1', link: 'L1', ratio: 1, phase: Math.atan2(M1.y - dIn.c.y, M1.x - dIn.c.x) }] });
}
function evalFourBar(poses, dIn, dOut) {
  const m = buildFourBar(poses, dIn, dOut), cons = compile(m), ang = P => { const q = poseT(P, dIn.m); return Math.atan2(q.y - dIn.c.y, q.x - dIn.c.x); };
  const th = poses.map(ang), span = poseSpan(poses); let best = null;
  for (const dir of [1, -1]) {
    // góc tay quay cần tới mỗi tư thế (theo chiều dir, tăng dần) — sai thứ tự thì loại
    const d = th.map(t => { let x = (t - th[0]) * dir; x = ((x % TAU) + TAU) % TAU; return x; }); if (d.some((x, i) => i && x <= d[i - 1] + 1e-6)) continue;
    let P = designMap(m), cur = 0, err = 0, aerr = 0, ok = true; const frames = [P];
    for (let i = 1; i < poses.length && ok; i++) {
      const r = stepTo(m, cons, P, cur * dir, d[i] * dir, 2 * D2R); if (!r) { ok = false; break; } P = r; cur = d[i]; frames.push(P);
      const a = Math.atan2(P.M2.y - P.M1.y, P.M2.x - P.M1.x) - Math.atan2(poseT(poses[0], dOut.m).y - poseT(poses[0], dIn.m).y, poseT(poses[0], dOut.m).x - poseT(poses[0], dIn.m).x) + poses[0].a * D2R;
      err = Math.max(err, Math.hypot(P.P.x - poses[i].x, P.P.y - poses[i].y)); let da = (a - poses[i].a * D2R) % TAU; if (da > Math.PI) da -= TAU; if (da < -Math.PI) da += TAU; aerr = Math.max(aerr, Math.abs(da) * R2D);
    }
    if (!ok) continue;
    if (!best || err < best.err) best = { dir, err, aerr, sweep: d[d.length - 1] * R2D, frames };
  }
  if (!best) return null;
  const an = analyzeMech(m, cons, designMap(m), 0), L = { g: Math.hypot(dIn.c.x - dOut.c.x, dIn.c.y - dOut.c.y), a: dIn.r, b: Math.hypot(poseT(poses[0], dIn.m).x - poseT(poses[0], dOut.m).x, poseT(poses[0], dIn.m).y - poseT(poses[0], dOut.m).y), c: dOut.r };
  const arr = [L.g, L.a, L.b, L.c].sort((x, y) => x - y), grashof = arr[0] + arr[3] <= arr[1] + arr[2];
  const ok = best.err < Math.max(0.05 * span, 1) && best.aerr < 5;
  return { dIn, dOut, ...best, full: an.full, minTA: an.minTA, grashof, L, ok, model: m, path: an.sweep.map(f => f.pos.P), size: Math.max(L.g, L.a, L.b, L.c) };
}
async function synthRun() {
  const D = synData(), poses = D.poses; if (poses.length < 3) { toast(T('sy_need3')); return; }
  SY.busy = true; SY.results = null; SY.sel = -1; renderSynth(); await new Promise(r => setTimeout(r, 30));
  const t0 = performance.now(), dy = findDyads(poses, D.pivots || []), res = [];
  const pivotsGiven = (D.pivots || []).length;
  for (let i = 0; i < dy.length; i++) for (let j = 0; j < dy.length; j++) {
    if (i === j) continue; if (pivotsGiven >= 2 && !(dy[i].given && dy[j].given)) continue; if (pivotsGiven === 1 && !dy[i].given && !dy[j].given) continue;
    if (Math.hypot(dy[i].c.x - dy[j].c.x, dy[i].c.y - dy[j].c.y) < poseSpan(poses) * .05) continue;
    const r = evalFourBar(poses, dy[i], dy[j]); if (r) res.push(r);
    if (performance.now() - t0 > 6000) break;
  }
  // xếp hạng: đi đúng tư thế trước; rồi chất lượng = quay toàn vòng + góc truyền nhỏ nhất (tới 50°) − phạt kích thước lớn so với tầm tư thế
  const sp = poseSpan(poses), qual = r => (r.full ? 10 : 0) + Math.min(r.minTA || 0, 50) - 25 * Math.max(0, r.size / sp - 1.2);
  res.forEach(r => { r.q = qual(r); });
  res.sort((a, b) => (b.ok - a.ok) || b.q - a.q || a.err - b.err);
  SY.results = res.slice(0, 12); SY.busy = false; SY.sel = SY.results.length ? 0 : -1; renderSynth(); synFit(); draw();
  toast(T(SY.results.length ? 'sy_found' : 'sy_none', { n: SY.results.length, s: ((performance.now() - t0) / 1000).toFixed(1) }));
}
// canh khung nhìn: tư thế + gối + cơ cấu xem trước, chừa chỗ cho bảng tổng hợp
function synFit() {
  const D = synData(), r = SY.results && SY.results[SY.sel], pts = [...D.poses, ...(D.pivots || [])];
  if (r) for (const P of r.frames) for (const k of ['G1', 'G2', 'M1', 'M2', 'P']) pts.push(P[k]);
  if (!pts.length) return; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  const panelW = SY.open && !synEl.hidden ? synEl.getBoundingClientRect().width + 24 : 0, aw = Math.max(200, W - panelW - 80), ah = H - 220;
  const s = Math.max(0.5, Math.min(40, Math.min(aw / Math.max(10, x1 - x0), ah / Math.max(10, y1 - y0))));
  S.view.s = s; S.view.ox = (x0 + x1) / 2 + panelW / 2 / s; S.view.oy = (y0 + y1) / 2 - 20 / s;
}
function synthApply(i) {
  const r = SY.results && SY.results[i]; if (!r) return;
  if (S.playing) togglePlay(); commitPose();
  const m = S.model, src = r.model, map = {};
  for (const j of src.joints) { const nj = newJoint({ x: j.x, y: j.y }, { fixed: j.fixed, trace: j.trace }); map[j.id] = nj.id; }
  const ids = {};
  for (const L of src.links) { const nl = { id: uid('l'), name: nextName(m.links, 'L'), joints: L.joints.map(id => map[id]), lock: { len: 1 }, w: 5 }; m.links.push(nl); ids[L.id] = nl.id; }
  if (!m.motors.length) m.motors.push({ id: uid('M'), joint: map.G1, link: ids.L1, ratio: 1, phase: 0 });
  if (!r.full) m.drive.limit = { on: true, min: Math.min(0, r.sweep * r.dir), max: Math.max(0, r.sweep * r.dir) };
  if (r.dir < 0 && r.full) m.drive.reverse = true;
  refreshMotorPhases(); S.sel = { k: 'l', id: ids.L2 }; rebuild(); toast(T('sy_applied'));
}
// ----- giao diện bảng -----
function renderSynth() {
  synEl.hidden = !SY.open; document.querySelector('[data-act=synth]')?.setAttribute('aria-pressed', SY.open); if (!SY.open) return;
  const D = synData(), num = (v, k, i, w) => `<input type="number" class="synnum" data-k="${k}" data-i="${i}" data-w="${w}" step="${k === 'a' ? 5 : 1}" value="${(+v).toFixed(1)}">`;
  const poses = D.poses.map((p, i) => `<tr><td><b>${i + 1}</b></td><td>${num(p.x, 'x', i, 'p')}</td><td>${num(p.y, 'y', i, 'p')}</td><td>${num(p.a, 'a', i, 'p')}</td><td><button class="x" data-del="p${i}" aria-label="Xóa">×</button></td></tr>`).join('');
  const piv = (D.pivots || []).map((p, i) => `<tr><td><b>G${i + 1}</b></td><td>${num(p.x, 'x', i, 'g')}</td><td>${num(p.y, 'y', i, 'g')}</td><td></td><td><button class="x" data-del="g${i}" aria-label="Xóa">×</button></td></tr>`).join('');
  const res = SY.busy ? `<p class="muted">${T('sy_busy')}</p>` : !SY.results ? '' : !SY.results.length ? `<p class="muted">${T('sy_none', {})}</p>` : SY.results.map((r, i) => `
    <div class="sycard ${i === SY.sel ? 'on' : ''}" data-r="${i}">
      <div class="syh"><b>#${i + 1}</b> <span class="${r.ok ? 'ok' : 'warn'}">${r.ok ? T('sy_ok') : T('sy_approx')}</span> · ${r.full ? T('sy_crank') : T('sy_rock', { a: r.sweep.toFixed(0) })}${r.grashof ? '' : ' · ' + T('sy_nongr')}</div>
      <div class="syd">${T('sy_err', { e: r.err.toFixed(2), a: r.aerr.toFixed(1) })} · ${T('sy_ta', { t: r.minTA != null ? r.minTA.toFixed(0) : '—' })}</div>
      <div class="syd">${T('sy_len', { g: r.L.g.toFixed(1), a: r.L.a.toFixed(1), b: r.L.b.toFixed(1), c: r.L.c.toFixed(1) })}</div>
      <button class="btn primary syap" data-ap="${i}">${T('sy_apply')}</button>
    </div>`).join('');
  synEl.innerHTML = `<div class="tphead"><h3>${T('sy_title')}</h3><button class="x" id="syClose" aria-label="Close">×</button></div>
    <p class="muted">${T('sy_note')}</p>
    <div class="btnrow"><button class="btn" id="syAddPose" aria-pressed="${S.tool === 'synpose'}">${T('sy_addpose')}</button><button class="btn" id="syAddPiv" ${(D.pivots || []).length >= 2 ? 'disabled' : ''}>${T('sy_addpiv')}</button><button class="btn danger" id="syClear">${T('sy_clear')}</button></div>
    <table class="sytab"><thead><tr><th></th><th>x</th><th>y</th><th>φ°</th><th></th></tr></thead><tbody>${poses}${piv}</tbody></table>
    <div class="btnrow"><button class="btn primary" id="syRun" ${D.poses.length < 3 || SY.busy ? 'disabled' : ''}>${T('sy_run', { n: D.poses.length })}</button></div>
    <div class="syres">${res}</div>`;
  const q = s => synEl.querySelector(s);
  if (SY.pos) { synEl.style.left = SY.pos.x + 'px'; synEl.style.top = SY.pos.y + 'px'; synEl.style.right = 'auto'; }
  q('.tphead').onpointerdown = e => { // kéo bảng
    if (e.target.closest('button')) return; const st = stage.getBoundingClientRect(), bb = synEl.getBoundingClientRect(), dx = e.clientX - bb.left, dy = e.clientY - bb.top;
    const mv = ev => { SY.pos = { x: Math.max(0, Math.min(st.width - bb.width, ev.clientX - st.left - dx)), y: Math.max(0, Math.min(st.height - 40, ev.clientY - st.top - dy)) }; synEl.style.left = SY.pos.x + 'px'; synEl.style.top = SY.pos.y + 'px'; synEl.style.right = 'auto'; };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); }; addEventListener('pointermove', mv); addEventListener('pointerup', up); e.preventDefault(); };
  q('#syClose').onclick = () => { SY.open = false; if (S.tool.startsWith('syn')) setTool('select'); renderSynth(); draw(); };
  q('#syAddPose').onclick = () => setTool(S.tool === 'synpose' ? 'select' : 'synpose');
  q('#syAddPiv').onclick = () => setTool('synpivot');
  q('#syClear').onclick = () => { S.model.synth = { poses: [], pivots: [] }; SY.results = null; markDirty(); renderSynth(); draw(); };
  q('#syRun').onclick = synthRun;
  synEl.querySelectorAll('.synnum').forEach(el => el.onchange = () => { const v = +el.value; if (!Number.isFinite(v)) return; const arr = el.dataset.w === 'p' ? D.poses : D.pivots; arr[+el.dataset.i][el.dataset.k] = v; SY.results = null; markDirty(); renderSynth(); draw(); });
  synEl.querySelectorAll('[data-del]').forEach(el => el.onclick = () => { const k = el.dataset.del, arr = k[0] === 'p' ? D.poses : D.pivots; arr.splice(+k.slice(1), 1); SY.results = null; markDirty(); renderSynth(); draw(); });
  synEl.querySelectorAll('.sycard').forEach(el => el.onclick = e => { if (e.target.closest('[data-ap]')) return; SY.sel = +el.dataset.r; renderSynth(); draw(); });
  synEl.querySelectorAll('[data-ap]').forEach(el => el.onclick = () => synthApply(+el.dataset.ap));
}
// ----- vẽ tư thế, gối mong muốn, phương án đang chọn -----
function drawSynth() {
  if (!SY.open && !(S.model.synth && S.model.synth.poses.length && S.tool.startsWith('syn'))) return;
  const D = synData(), c = ctx, col = colors.l3;
  const r = SY.results && SY.results[SY.sel];
  if (r) { // bóng cơ cấu tại từng tư thế + đường cong điểm P
    c.strokeStyle = colors.accent; c.globalAlpha = .7; c.lineWidth = 1.5; c.setLineDash([4, 3]); c.beginPath(); r.path.forEach((p, i) => { const q = w2s(p); i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y); }); c.stroke(); c.setLineDash([]);
    for (const P of r.frames) {
      c.globalAlpha = .35; c.strokeStyle = colors.ink; c.lineWidth = 3;
      for (const [a, b] of [['G1', 'M1'], ['M1', 'M2'], ['G2', 'M2'], ['M1', 'P'], ['M2', 'P']]) { const A = w2s(P[a]), B = w2s(P[b]); c.beginPath(); c.moveTo(A.x, A.y); c.lineTo(B.x, B.y); c.stroke(); }
    }
    c.globalAlpha = 1;
    for (const g of ['G1', 'G2']) { const q = w2s(r.frames[0][g]); c.fillStyle = colors.ink; c.beginPath(); c.moveTo(q.x, q.y); c.lineTo(q.x - 7, q.y + 10); c.lineTo(q.x + 7, q.y + 10); c.closePath(); c.fill(); }
  }
  D.poses.forEach((P, i) => {
    const q = w2s(P), t = w2s(poseT(P, { x: POSE_L, y: 0 })), s = w2s(poseT(P, { x: 0, y: POSE_L * .45 }));
    c.strokeStyle = col; c.fillStyle = col; c.lineWidth = 2.5; c.beginPath(); c.moveTo(q.x, q.y); c.lineTo(t.x, t.y); c.stroke();
    const a = Math.atan2(t.y - q.y, t.x - q.x); c.beginPath(); c.moveTo(t.x, t.y); c.lineTo(t.x - 9 * Math.cos(a - .4), t.y - 9 * Math.sin(a - .4)); c.lineTo(t.x - 9 * Math.cos(a + .4), t.y - 9 * Math.sin(a + .4)); c.closePath(); c.fill();
    c.lineWidth = 1.5; c.beginPath(); c.moveTo(q.x, q.y); c.lineTo(s.x, s.y); c.stroke();
    c.beginPath(); c.arc(q.x, q.y, 5, 0, TAU); c.fillStyle = colors.panel; c.fill(); c.stroke();
    c.fillStyle = colors.ink; c.font = '700 12px ' + bodyFont(); c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(String(i + 1), q.x - 14, q.y - 12);
  });
  (D.pivots || []).forEach((g, i) => { const q = w2s(g); c.strokeStyle = colors.bad; c.lineWidth = 2; c.beginPath(); c.arc(q.x, q.y, 7, 0, TAU); c.stroke(); c.beginPath(); c.moveTo(q.x - 10, q.y + 12); c.lineTo(q.x + 10, q.y + 12); c.stroke(); c.fillStyle = colors.bad; c.font = '700 11px ' + bodyFont(); c.fillText('G' + (i + 1), q.x + 10, q.y - 10); });
}
// ----- chuột: đặt / kéo tư thế -----
function synHit(x, y) {
  if (!SY.open) return null; const D = synData();
  for (let i = D.poses.length - 1; i >= 0; i--) { const P = D.poses[i], q = w2s(P), t = w2s(poseT(P, { x: POSE_L, y: 0 }));
    if (Math.hypot(t.x - x, t.y - y) < 10) return { i, part: 'ang' }; if (Math.hypot(q.x - x, q.y - y) < 9) return { i, part: 'pos' }; }
  for (let i = 0; i < (D.pivots || []).length; i++) { const q = w2s(D.pivots[i]); if (Math.hypot(q.x - x, q.y - y) < 10) return { i, part: 'piv' }; }
  return null;
}
function synDown(x, y) {
  const D = synData(), h = synHit(x, y), w = s2w(x, y), sn = S.opt.snap ? { x: Math.round(w.x), y: Math.round(w.y) } : w;
  if (h) return { kind: 'syn', h, moved: false };
  if (S.tool === 'synpose') { D.poses.push({ x: sn.x, y: sn.y, a: 0 }); SY.results = null; renderSynth(); draw(); return { kind: 'syn', h: { i: D.poses.length - 1, part: 'ang', fresh: true }, moved: false }; }
  if (S.tool === 'synpivot') { (D.pivots = D.pivots || []).push({ x: sn.x, y: sn.y }); SY.results = null; markDirty(); toolDone(); renderSynth(); draw(); return { kind: 'none' }; }
  return null;
}
function synMove(d, x, y, ev) {
  const D = synData(), w = s2w(x, y), sn = S.opt.snap ? { x: Math.round(w.x), y: Math.round(w.y) } : w; d.moved = true;
  if (d.h.part === 'pos') { D.poses[d.h.i].x = sn.x; D.poses[d.h.i].y = sn.y; }
  else if (d.h.part === 'piv') { D.pivots[d.h.i].x = sn.x; D.pivots[d.h.i].y = sn.y; }
  else { const P = D.poses[d.h.i]; let a = Math.atan2(w.y - P.y, w.x - P.x) * R2D; if (!ev || !ev.shiftKey) a = Math.round(a / 5) * 5; P.a = a; }
  SY.results = null; draw();
}
function synUp(d) { if (d.moved || d.h?.fresh) { markDirty(); renderSynth(); } }
