// ===== Khớp chạy theo đường phác thảo (đoạn thẳng, cung, đường tròn, spline) =====
// j.path = { ent }: ràng buộc 'pc' trong solver4 (pathGeom / pathEval); đầu đường hở là điểm chặn (violation)
const PATH_TYPES = ['line', 'arc', 'circle', 'spline'];
function startPathPick(jid) { if (S.playing) togglePlay(); S.pathJoint = jid; setTool('pathpick'); }
// bấm chọn nét khi đang ở công cụ pathpick
function pathPick(x, y) {
  const h = hitSketch(x, y, 'e'), e = h && SKM().ents.find(q => q.id === h.id);
  if (!e || !PATH_TYPES.includes(e.type)) { toast(T('toast_path_pick')); return; }
  setJointPath(S.pathJoint, e.id); toolDone();
}
function setJointPath(jid, eid) {
  const j = getJ(jid); if (!j) return; if (j.fixed) { toast(T('toast_path_fixed')); return; }
  commitPose();
  const g = pathGeom(S.model, eid); if (!g) { toast(T('toast_path_pick')); return; }
  // đặt khớp lên đường: chân vuông góc (tọa độ thiết kế; nét thuộc khâu → đổi về thế giới bằng khung khâu ở tư thế thiết kế)
  const D = designMap(S.model), ev = pathEval(g, { x: j.x, y: j.y }, D);
  // khớp là lỗ chốt của part: dời CẢ part cứng theo (giữ chốt đúng tâm lỗ) — trước đây chỉ dời riêng khớp nên chốt lệch khỏi tâm part
  const body = S.model.links.find(L => L.kind === 'body' && L.joints.includes(jid));
  if (body && !pathMoveBody(body, j, eid, ev.foot)) return;
  if (!body) { j.x = ev.foot.x; j.y = ev.foot.y; }
  j.path = { ent: eid }; j.slider = null; j.slot = null; refreshMotorPhases(); // motor tịnh tiến: dẫn hướng mới → đặt lại hành trình
  const e = SKM().ents.find(q => q.id === eid); S.sel = { k: 'j', id: jid };
  toast(T('toast_path_on', { j: j.name, e: e ? entLabel(e) : '' })); rebuild();
}
// đưa part chứa khớp j tới đường: part tự do → tịnh tiến nguyên khối tới chân vuông góc; part ghim 1 chốt cố định → xoay quanh chốt
// tới giao điểm gần nhất của đường tròn (tâm chốt, bán kính chốt→j) với đường; ghim ≥ 2 chốt → không dời được
function pathMoveBody(body, j, eid, foot) {
  const fixed = body.joints.filter(id => getJ(id).fixed);
  if (fixed.length >= 2) { toast(T('toast_path_pinned')); return false; }
  let xf;
  if (!fixed.length) { const dx = foot.x - j.x, dy = foot.y - j.y; xf = p => ({ x: p.x + dx, y: p.y + dy }); }
  else {
    const E = getJ(fixed[0]), r = Math.hypot(j.x - E.x, j.y - E.y), sk = SKM(), e = sk.ents.find(q => q.id === eid); if (r < 1e-6 || !e) return false;
    const pts = SK.sample(e, SK.ptMap(sk), 2).pts; if (e.type === 'circle') pts.push(pts[0]);
    let best = null; // giao đường tròn bán kính r với từng đoạn của đường dẫn
    for (let i = 0; i < pts.length - 1; i++) { const A = pts[i], B = pts[i + 1], dx = B.x - A.x, dy = B.y - A.y, fx = A.x - E.x, fy = A.y - E.y, a = dx * dx + dy * dy, b = 2 * (fx * dx + fy * dy), c = fx * fx + fy * fy - r * r, disc = b * b - 4 * a * c; if (a < 1e-12 || disc < 0) continue;
      for (const t of [(-b - Math.sqrt(disc)) / (2 * a), (-b + Math.sqrt(disc)) / (2 * a)]) if (t >= 0 && t <= 1) { const q = { x: A.x + t * dx, y: A.y + t * dy }, d = Math.hypot(q.x - j.x, q.y - j.y); if (!best || d < best.d) best = { q, d }; } }
    if (!best) { toast(T('toast_path_reach')); return false; }
    const da = Math.atan2(best.q.y - E.y, best.q.x - E.x) - Math.atan2(j.y - E.y, j.x - E.x), co = Math.cos(da), si = Math.sin(da);
    xf = p => ({ x: E.x + (p.x - E.x) * co - (p.y - E.y) * si, y: E.y + (p.x - E.x) * si + (p.y - E.y) * co });
  }
  for (const id of body.joints) { const q = getJ(id); if (q.fixed) continue; const n = xf(q); q.x = n.x; q.y = n.y; } // hình (CP) của part đi theo khung khi dựng lại
  return true;
}
function clearJointPath(jid) { const j = getJ(jid); if (!j || !j.path) return; commitPose(); delete j.path; toast(T('toast_path_off', { j: j.name })); rebuild(); }
function pathMenuItems(j) {
  const e = j.path && SKM().ents.find(q => q.id === j.path.ent);
  const it = [{ label: e ? T('m_path_on', { e: entLabel(e) }) : T('m_path'), check: !!j.path, disabled: j.fixed, act: () => startPathPick(j.id) }];
  if (j.path) it.push({ label: T('m_path_off'), act: () => clearJointPath(j.id) });
  return it;
}
// đường ray dẫn hướng: nét được dùng làm đường dẫn vẽ đậm (đi theo khâu sở hữu nếu có)
function drawPathRails() {
  const used = new Set(S.model.joints.filter(j => j.path).map(j => j.path.ent)); if (!used.size) return;
  const sk = SKM(), pm = SK.ptMap(sk);
  for (const e of sk.ents) {
    if (!used.has(e.id)) continue; const pts = sampleNow(e, pm).map(w2s); if (pts.length < 2) continue;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [w, col, a] of [[9, colors['ink-2'], .35], [5, colors.sheet, 1]]) {
      ctx.strokeStyle = col; ctx.globalAlpha = a; ctx.lineWidth = w; ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); if (e.type === 'circle') ctx.closePath(); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

// ===== Motor tịnh tiến trên khớp (mo.lin): đẩy khớp dọc rãnh vô hạn ngang/dọc hoặc dọc đường phác thảo đã gán =====
// mo.min…mo.max = hành trình (mm) đo dọc dẫn hướng (linMotorCon trong solver4); mo.gk = khóa dẫn hướng lúc đặt hành trình
const LIN_DEF = 20;
const linMotorOf = jid => S.model.motors.find(mo => mo.lin === jid);
const linGuideKey = j => j.path ? 'p' + j.path.ent : j.slider ? 's' + j.slider.ang.toFixed(6) : '';
function linMotorValid(m, mo) { const j = m.joints.find(q => q.id === mo.lin); return !!j && !j.fixed && (!!j.slider || (!!j.path && m.sketch.ents.some(e => e.id === j.path.ent))); }
// đường kín: đưa vị trí về một vòng [min, min + chu vi)
const linWrap = (c, u) => { if (!c.per) return u; const r = (((u - c.min) % c.per) + c.per) % c.per; return c.min + (r > c.per - 1e-6 ? 0 : r); };
// hành trình mặc định từ vị trí hiện tại: rãnh vô hạn 20 mm; đường hở 20 mm về phía còn chỗ; đường kín = cả vòng, chạy vòng lặp
function linMotorInit(mo) {
  const j = getJ(mo.lin); if (!j) return; mo.gk = linGuideKey(j); delete mo.o;
  if (j.slider) { mo.o = { x: +j.x.toFixed(4), y: +j.y.toFixed(4) }; mo.min = 0; mo.max = LIN_DEF; return; }
  const g = j.path && pathGeom(S.model, j.path.ent); if (!g) return;
  const u = pathS(g, j, designMap(S.model)), L = pathLen(g);
  if (pathClosed(g)) { mo.min = +u.toFixed(3); mo.max = +(u + L).toFixed(3); mo.pb = 'loop'; return; }
  const st = Math.min(LIN_DEF, L), a = u + st <= L + 1e-6 ? u : Math.max(0, u - st);
  mo.min = +a.toFixed(3); mo.max = +(a + st).toFixed(3);
}
// dẫn hướng của khớp đã đổi (ngang ⇄ dọc ⇄ đường khác): đặt lại hành trình
function linMotorRetarget(mo) { const j = getJ(mo.lin); if (j && mo.gk !== linGuideKey(j)) linMotorInit(mo); }
function toggleLinMotor(jid) {
  const j = getJ(jid); if (!j) return; if (S.playing) togglePlay(); commitPose();
  if (linMotorOf(jid)) { S.model.motors = S.model.motors.filter(mo => mo.lin !== jid); toast(T('toast_lmotor_off', { j: j.name })); rebuild(); return; }
  if (j.fixed || !(j.slider || j.path)) { toast(T('toast_lmotor_need')); return; }
  const mo = { id: uid('M'), lin: jid, ratio: 1, phase: 0, phaseSign: 1, pb: 'rec' }; linMotorInit(mo);
  S.model.motors.push(mo); refreshMotorPhases();
  toast(T('toast_lmotor_on', { j: j.name })); S.sel = { k: 'j', id: jid }; rebuild();
}
function setLinStroke(moId, key, v) {
  const mo = S.model.motors.find(q => q.id === moId); if (!mo || !isFinite(v)) return; if (S.playing) togglePlay(); commitPose();
  if (key === 'len') { if (!(v > 0)) return; mo.max = mo.min + v; } // khoảng cách đẩy: giữ điểm đầu
  else { const L = mo.max - mo.min; mo.min = v; mo.max = v + L; } // dời điểm đầu: giữ khoảng cách
  refreshMotorPhases(); rebuild();
}
function linMotorMenuItems(j) {
  return [{ label: T('m_lmotor'), check: !!linMotorOf(j.id), disabled: j.fixed || !(j.slider || j.path), act: () => toggleLinMotor(j.id) }];
}
// form khớp: hộp bật motor + kiểu chạy, điểm đầu, khoảng cách đẩy, tỉ số, chu kỳ
function linMotorFormRows(j, num, select, info) {
  if (j.fixed || !(j.slider || j.path)) return '';
  const mo = linMotorOf(j.id); let h = `<label class="toggle"><input type="checkbox" class="flmotor" ${mo ? 'checked' : ''}><span>${T('m_lmotor')}</span></label>`;
  if (!mo) return h;
  const c = (S.cons || []).find(q => q.lin === j.id), pb = mo.pb || 'rec', rpm = +document.getElementById('rpm').value || 20, cyc = 60 / (rpm * Math.abs(mo.ratio ?? 1));
  select(T('f_pb'), [['single', T('pb_single')], ['rec', T('pb_rec')], ['loop', T('pb_loop')]], pb, v => setMotorOpt(mo.id, 'pb', v));
  if (j.path && c && c.g) info(T('f_lm_path'), pathLen(c.g).toFixed(2) + ' mm' + (c.per ? ' ' + T('f_lm_closed') : ''));
  num(T('f_stroke_min'), mo.min, 'mm', v => setLinStroke(mo.id, 'min', v), { step: 1 });
  num(T('f_lm_dist'), +(mo.max - mo.min).toFixed(3), 'mm', v => setLinStroke(mo.id, 'len', v), { step: 1 });
  info(T('f_stroke_max'), mo.max.toFixed(2) + ' mm');
  if (c && S.pos[j.id]) info(T('f_lm_now'), linWrap(c, msU(c, S.pos)).toFixed(2) + ' mm');
  num(T('f_ratio'), mo.ratio ?? 1, '×', v => setRatio(mo.id, v), { step: 0.5 });
  const dist = (mo.max - mo.min) * (pb === 'rec' ? 2 : 1);
  info(T('f_cycle'), T(pb === 'single' ? 'mm_cycle1' : 'mm_cycle', { t: cyc.toFixed(2), v: (dist / cyc).toFixed(1), u: 'mm/s' }));
  h += `<label class="toggle"><input type="checkbox" class="flmrev" ${mo.rev ? 'checked' : ''}><span>${T('f_mm_rev')}</span></label><p class="muted">${T(j.path ? 'f_lm_note_p' : 'f_lm_note_s')}</p>`;
  return h;
}
// điểm thế giới tại vị trí s dọc dẫn hướng của ràng buộc motor c (tư thế P)
function linPoint(c, s, P) {
  if (!c.g) { const ux = c.wb.x - c.wa.x, uy = c.wb.y - c.wa.y; return { x: c.wa.x + ux * s, y: c.wa.y + uy * s }; }
  const p = pathAt(c.g, s); if (!c.g.own) return p; const fN = frameOf({ joints: c.g.own }, P); return fN ? toWorld(fN, toLocal(c.g.fD, p)) : p;
}
// vẽ hành trình motor tịnh tiến: dải màu nhấn từ điểm đầu tới điểm cuối, vạch chặn ở hai đầu, mũi tên hai chiều tại khớp
function drawLinMotors() {
  for (const c of S.cons || []) {
    if (!c.lin || !S.pos[c.lin]) continue;
    const n = c.g && c.g.type !== 'line' ? 64 : 1, pts = [];
    for (let i = 0; i <= n; i++) pts.push(w2s(linPoint(c, c.min + (c.max - c.min) * i / n, S.pos)));
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = colors.accent; ctx.setLineDash([]);
    ctx.globalAlpha = .45; ctx.lineWidth = 4; ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
    ctx.globalAlpha = 1; ctx.lineWidth = 2;
    if (!c.per) for (const [p, q] of [[pts[0], pts[1]], [pts[pts.length - 1], pts[pts.length - 2]]]) { // vạch chặn ⟂ ở hai đầu hành trình
      const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 1, nx = -dy / d * 7, ny = dx / d * 7;
      ctx.beginPath(); ctx.moveTo(p.x + nx, p.y + ny); ctx.lineTo(p.x - nx, p.y - ny); ctx.stroke();
    }
    const u = linWrap(c, msU(c, S.pos)), J = w2s(S.pos[c.lin]), A = w2s(linPoint(c, u + 0.5, S.pos)), B = w2s(linPoint(c, u - 0.5, S.pos));
    let dx = A.x - B.x, dy = A.y - B.y; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    ctx.fillStyle = colors.accent;
    for (const sg of [1, -1]) { const tx = J.x + sg * dx * 22, ty = J.y + sg * dy * 22; ctx.beginPath(); ctx.moveTo(tx + sg * dx * 7, ty + sg * dy * 7); ctx.lineTo(tx - dy * 5, ty + dx * 5); ctx.lineTo(tx + dy * 5, ty - dx * 5); ctx.closePath(); ctx.fill(); }
    ctx.beginPath(); ctx.moveTo(J.x - dx * 22, J.y - dy * 22); ctx.lineTo(J.x + dx * 22, J.y + dy * 22); ctx.stroke();
    ctx.restore();
  }
}
