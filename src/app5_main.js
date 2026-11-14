// ===== Dock motor: giới hạn góc 2 đầu kéo thả, đảo chiều =====
const rangeEl = document.getElementById('range'), kMin = document.getElementById('kMin'), kMax = document.getElementById('kMax');
function domain() {
  const a = S.an; if (!a || !S.model.motors.length) return [0, 360];
  if (a.full) return [0, 360];
  if (a.range && a.range[1] > a.range[0]) return [a.range[0], a.range[1]];
  return [S.theta * R2D - 1, S.theta * R2D + 1];
}
const thetaDeg = () => { const d = S.theta * R2D; return S.an && S.an.full ? ((d % 360) + 360) % 360 : d; };
function clampLimit() {
  const lim = S.model.drive.limit, [d0, d1] = domain();
  lim.min = Math.max(d0, Math.min(d1, lim.min)); lim.max = Math.max(d0, Math.min(d1, lim.max));
  if (lim.max - lim.min < 1) { lim.min = d0; lim.max = d1; }
}
function trackGeom() { const r = rangeEl.getBoundingClientRect(); return { left: r.left + 10, width: r.width - 20 }; }
function d2x(v) { const [d0, d1] = domain(); return 10 + (v - d0) / ((d1 - d0) || 1) * (rangeEl.clientWidth - 20); }
function x2d(cx) { const g = trackGeom(), [d0, d1] = domain(); return d0 + Math.max(0, Math.min(1, (cx - g.left) / g.width)) * (d1 - d0); }
function renderDock() {
  const m = S.model, lim = m.drive.limit, has = m.motors.length > 0;
  const mo = m.motors[0];
  const chip = document.getElementById('mchip');
  document.getElementById('mchipTxt').textContent = has ? (mo.lin ? jname(mo.lin) : mo.mate ? ((S.model.mates.find(q => q.id === mo.mate) || {}).name || '') : mo.cyl ? nameOf('l', mo.cyl) : nameOf('l', mo.link)) + (m.motors.length > 1 ? ' +' + (m.motors.length - 1) : '') : '—';
  chip.title = has ? '' : T('mchip_none');
  rangeEl.dataset.on = lim.on;
  const x0 = d2x(lim.min), x1 = d2x(lim.max);
  kMin.style.left = x0 + 'px'; kMax.style.left = x1 + 'px';
  const fill = document.getElementById('rfill'); fill.style.left = x0 + 'px'; fill.style.width = Math.max(0, x1 - x0) + 'px';
  document.getElementById('rhead').style.left = d2x(Math.max(domain()[0], Math.min(domain()[1], thetaDeg()))) + 'px';
  const lMin = document.getElementById('lblMin'), lMax = document.getElementById('lblMax');
  let lx0 = x0, lx1 = x1; if (x1 - x0 < 42) { const c = (x0 + x1) / 2; lx0 = c - 21; lx1 = c + 21; } // hai núm sát nhau: tách nhãn
  lMin.style.left = Math.round(lx0) + 'px'; lMax.style.left = Math.round(lx1) + 'px';
  lMin.innerHTML = has ? '<b>' + lim.min.toFixed(0) + '°</b>' : ''; lMax.innerHTML = has ? '<b>' + lim.max.toFixed(0) + '°</b>' : '';
  kMin.setAttribute('aria-valuenow', lim.min.toFixed(0)); kMax.setAttribute('aria-valuenow', lim.max.toFixed(0));
  document.getElementById('thetaOut').textContent = thetaDeg().toFixed(1) + '°';
  document.getElementById('limitSw').setAttribute('aria-checked', lim.on);
  document.getElementById('reverse').setAttribute('aria-pressed', !!m.drive.reverse);
  for (const id of ['play', 'stop', 'reverse', 'limitSw', 'limMin', 'limMax']) document.getElementById(id).disabled = !has;
  // ô nhập, biên độ, chiều quay, mặt đồng hồ mini, vạch chia
  const dm = rangeEl.closest('.dmotor'); dm.dataset.on = lim.on;
  for (const [id, v] of [['limMin', lim.min], ['limMax', lim.max]]) { const inp = document.getElementById(id); if (document.activeElement !== inp) inp.value = has ? +v.toFixed(1) : ''; }
  document.getElementById('limSweep').textContent = has ? 'Δ ' + (lim.max - lim.min).toFixed(0) + '°' : '';
  const ccw = (S.dir || 1) > 0, dir = document.getElementById('dirOut');
  dir.textContent = has ? (ccw ? '↺' : '↻') : ''; dir.title = has ? T(ccw ? 'd_ccw' : 'd_cw') : '';
  renderDial(has, lim); renderTicks();
  if (S.an !== renderDock.an) { renderDock.an = S.an; renderThetaMarks(); }
}
// mặt đồng hồ mini: 0° = trục X+, góc dương ngược chiều kim đồng hồ
function dialPt(a, r) { const t = a * D2R; return [26 + r * Math.cos(t), 26 - r * Math.sin(t)]; }
function dialArc(a0, a1, r) {
  if (a1 - a0 >= 359.9) return `M${26 - r} 26a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
  const p = dialPt(a0, r), q = dialPt(a1, r);
  return `M${p[0].toFixed(2)} ${p[1].toFixed(2)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 0 ${q[0].toFixed(2)} ${q[1].toFixed(2)}`;
}
function renderDial(has, lim) {
  const [d0, d1] = domain(), set = (id, a, v) => document.getElementById(id).setAttribute(a, v);
  set('ddDom', 'd', has && d1 - d0 < 359.9 ? dialArc(d0, d1, 20) : '');
  set('ddLim', 'd', has ? dialArc(lim.min, Math.max(lim.min + .5, lim.max), 20) : '');
  const n = dialPt(has ? thetaDeg() : 0, 17);
  set('ddNeedle', 'x2', n[0]); set('ddNeedle', 'y2', n[1]); set('ddTip', 'cx', n[0]); set('ddTip', 'cy', n[1]);
}
function renderTicks() {
  const [d0, d1] = domain(), key = d0 + ',' + d1 + ',' + rangeEl.clientWidth;
  if (renderTicks.key === key) return; renderTicks.key = key;
  const span = d1 - d0, st = span >= 300 ? 90 : span > 150 ? 45 : span > 60 ? 20 : span > 25 ? 10 : 5;
  let h = '';
  for (let v = Math.ceil(d0 / st) * st; v <= d1 + 1e-6; v += st) h += `<span style="left:${Math.round(d2x(v))}px">${v}°</span>`;
  document.getElementById('rticks').innerHTML = span > 2.5 ? h : '';
}
// ô nhập Đầu / Cuối: gõ số + Enter; ↑↓ hoặc lăn chuột ±1°, Shift ±10°
function setLimit(key, v) {
  const lim = S.model.drive.limit; if (!S.model.motors.length || !isFinite(v)) { renderDock(); return; }
  const [d0, d1] = domain(); v = Math.max(d0, Math.min(d1, v)); lim.on = true;
  if (key === 'min') lim.min = Math.min(v, lim.max - 1); else lim.max = Math.max(v, lim.min + 1);
  clampLimit(); changed();
}
for (const [id, key] of [['limMin', 'min'], ['limMax', 'max']]) {
  const inp = document.getElementById(id);
  inp.addEventListener('change', () => setLimit(key, typeof evalExpr === 'function' ? evalExpr(String(inp.value).replace(',', '.')) : parseFloat(String(inp.value).replace(',', '.'))));
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { inp.blur(); return; }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); setLimit(key, S.model.drive.limit[key] + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1)); inp.value = +S.model.drive.limit[key].toFixed(1); }
  });
  inp.addEventListener('wheel', e => { if (inp.disabled) return; e.preventDefault(); setLimit(key, S.model.drive.limit[key] + (e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 10 : 1)); }, { passive: false });
  inp.addEventListener('blur', () => renderDock());
}
let rdrag = null;
rangeEl.addEventListener('pointerdown', e => {
  if (!S.model.motors.length || e.button !== 0) return;
  e.preventDefault(); // không bôi chọn chữ / kéo-thả chữ (gây pointercancel → núm dính chuột)
  if (e.target.focus) e.target.focus({ preventScroll: true });
  rangeEl.setPointerCapture(e.pointerId);
  if (e.target === kMin || e.target === kMax) { rdrag = { k: e.target === kMin ? 'min' : 'max' }; return; }
  rdrag = { k: 'scrub' }; scrubTo(x2d(e.clientX));
});
rangeEl.addEventListener('pointermove', e => {
  if (!rdrag) return; if (!(e.buttons & 1)) { endRangeDrag(); return; } // đã nhả chuột mà không nhận pointerup
  const raw = x2d(e.clientX), v = rdrag.k === 'scrub' || e.shiftKey ? raw : Math.round(raw), lim = S.model.drive.limit; // núm bắt 1°, Shift = tự do
  if (rdrag.k === 'scrub') { scrubTo(v); return; }
  lim.on = true;
  if (rdrag.k === 'min') lim.min = Math.min(v, lim.max - 1); else lim.max = Math.max(v, lim.min + 1);
  renderDock(); renderAnalysis(); draw();
});
function endRangeDrag() { const d = rdrag; rdrag = null; if (d && d.k !== 'scrub') changed(); }
rangeEl.addEventListener('pointerup', endRangeDrag);
rangeEl.addEventListener('pointercancel', endRangeDrag);
rangeEl.addEventListener('lostpointercapture', endRangeDrag);
window.addEventListener('blur', endRangeDrag);
for (const [el, key] of [[kMin, 'min'], [kMax, 'max']]) el.addEventListener('keydown', e => {
  const lim = S.model.drive.limit, step = e.shiftKey ? 10 : 1;
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
    e.preventDefault(); lim.on = true; const d = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -step : step;
    if (key === 'min') lim.min = Math.min(lim.max - 1, lim.min + d); else lim.max = Math.max(lim.min + 1, lim.max + d);
    clampLimit(); changed();
  }
});
function scrubTo(vDeg) {
  if (!isRunnable()) return;
  const lim = S.model.drive.limit; if (lim.on) vDeg = Math.max(lim.min, Math.min(lim.max, vDeg));
  const cur = thetaDeg(), d = vDeg - cur;
  const base = S.theta - cur * D2R + cur * D2R; // giữ nguyên số vòng
  const r = stepTo(S.model, S.cons, S.pos, base, base + d * D2R, 1 * D2R);
  if (r) { S.pos = r; S.theta = base + d * D2R; }
  afterMove();
}
function afterMove() { renderDock(); draw(); tpLive(); if (performance.now() - liveAt > 120) { liveList(); renderProps(true); liveAt = performance.now(); } }
let liveAt = 0;
document.getElementById('limitSw').onclick = () => { const lim = S.model.drive.limit; lim.on = !lim.on; clampLimit(); changed(); };
document.getElementById('reverse').onclick = () => { S.model.drive.reverse = !S.model.drive.reverse; S.dir = S.model.drive.reverse ? -1 : 1; changed(); };
document.getElementById('mchip').onclick = () => {
  const mo = S.model.motors[0]; if (!mo) { toast(T('toast_nomove')); return; }
  S.sel = mo.lin ? { k: 'j', id: mo.lin } : mo.mate ? { k: 'q', id: mo.mate } : mo.cyl ? { k: 'l', id: mo.cyl } : { k: 'j', id: mo.joint }; renderList(); renderProps(); draw(); openPopover(S.sel);
};
// Đặt lại vị trí: mọi khớp / khâu / part về tư thế ngay trước lần bấm chạy gần nhất;
// chưa chạy hoặc đã sửa cơ cấu sau đó (phân tích đã dựng lại) → về tư thế thiết kế
function resetPose() {
  if (S.playing) togglePlay();
  const snap = S.preAnim && S.preAnim.an === S.an ? S.preAnim : null, D = designMap(S.model);
  if (snap) { S.pos = Object.assign(D, snap.pos); S.theta = snap.theta; S.dir = snap.dir; }
  else { S.pos = D; S.theta = S.model.theta0; S.dir = S.model.drive.reverse ? -1 : 1; }
  S.jamShow = null; S.jamInfo = null; afterMove(); liveList(); renderProps(true);
  toast(T(snap ? 'toast_reset_pre' : 'toast_reset_design'));
}
document.getElementById('stop').onclick = () => {
  if (S.playing) togglePlay();
  S.pos = designMap(S.model); S.theta = S.model.theta0;
  const lim = S.model.drive.limit; if (lim.on) scrubTo(S.model.drive.reverse ? lim.max : lim.min);
  S.dir = S.model.drive.reverse ? -1 : 1; afterMove(); liveList(); renderProps(true);
};
const speedPop = document.getElementById('speedPop');
document.getElementById('speedBtn').onclick = e => { e.stopPropagation(); speedPop.hidden = !speedPop.hidden; document.getElementById('speedBtn').setAttribute('aria-pressed', !speedPop.hidden); };
function hideSpeed() { speedPop.hidden = true; document.getElementById('speedBtn').setAttribute('aria-pressed', 'false'); }
document.getElementById('rpm').oninput = e => document.getElementById('rpmOut').textContent = e.target.value + ' rpm';

let last = 0, revAt = 0;
function togglePlay() {
  if (!S.playing && !isRunnable()) { toast(T('toast_nomove')); return; }
  if (!S.playing) { saveOriginal(); hitInit(); } // lần chạy đầu: chụp "Original"; ghi trạng thái chạm của các MP để bắt lần va chạm đầu
  S.playing = !S.playing;
  document.getElementById('playicon').innerHTML = S.playing ? '<path d="M4 2h3.5v14H4zM10.5 2H14v14h-3.5z"/>' : '<path d="M4 2l12 7-12 7z"/>';
  document.getElementById('play').setAttribute('aria-label', S.playing ? 'Pause' : 'Play'); document.getElementById('play').title = T(S.playing ? 'b_pause' : 'b_play') + ' (Shift+Space)';
  if (S.playing && S.dir !== 1 && S.dir !== -1) S.dir = 1;
  if (S.playing) S.preAnim = { pos: S.pos, theta: S.theta, dir: S.dir, an: S.an }; // tư thế ngay trước khi chạy (cho nút Đặt lại vị trí)
  S.lastCur = null;
  if (S.playing) { mmSingleInit(); const w = mmLimitCheck(); if (w) toast(w, 7000); }
  if (S.playing) { const c = collNow(), ph = physPairs(); collWas = !!(c && c.list.some(o => !isContact(o, ph))); }
  last = 0; if (S.playing) requestAnimationFrame(tick);
}
document.getElementById('play').onclick = togglePlay;
const FRAME_MS = 10; // thời gian giải tối đa mỗi khung hình (để còn chỗ cho vẽ, giữ ~60 khung/giây)
function tick(ts) {
  if (!S.playing) return;
  if (last) {
    const rpm = +document.getElementById('rpm').value || 20, lim = S.model.drive.limit;
    let dDeg = Math.min(rpm * 6 * (ts - last) / 1000, 6) * S.dir;
    let cur = thetaDeg(); if (lim.on && S.an && S.an.full && S.lastCur != null) cur += 360 * Math.round((S.lastCur - cur) / 360); // biên 360° ≡ 0°: giữ liên tục với khung trước
    let target = cur + dDeg, bounce = false;
    if (lim.on) {
      if (cur < lim.min - 0.01 || cur > lim.max + 0.01) target = cur + Math.sign((cur < lim.min ? lim.min : lim.max) - cur) * Math.abs(dDeg);
      else if (target >= lim.max) { target = lim.max; bounce = S.dir > 0; } else if (target <= lim.min) { target = lim.min; bounce = S.dir < 0; }
    }
    S.lastCur = target;
    const base = S.theta - cur * D2R, sc = mmSingleClamp(base + target * D2R - S.theta), goal = S.theta + sc.d; // motor 'một lần' dừng ở cuối hành trình
    // giải từng bước ≤ 2° trong ngân sách FRAME_MS: va chạm nặng thì motor chậm lại một chút thay vì đứng hình
    const t0 = performance.now(); let P = S.pos, th = S.theta, fail = false; S.jamInfo = null;
    while (Math.abs(goal - th) > 1e-9) {
      const nx = th + Math.sign(goal - th) * Math.min(2 * D2R, Math.abs(goal - th)), r = stepTo(S.model, S.cons, P, th, nx, 2 * D2R) || stepForced(S.model, S.cons, P, th, nx, 2 * D2R) || stepIgnoringJam(P, th, nx, 2 * D2R);
      if (!r) { fail = true; break; }
      hitCheck(P, th, r, nx); // MP vừa va chạm lần đầu → lưu vị trí "Va chạm N"
      P = r; th = nx; if (performance.now() - t0 > FRAME_MS) break;
    }
    if (th !== S.theta && fail && S.jamInfo) { mmSingleAdvance(th - S.theta); S.pos = P; S.theta = th; } // đã đi được một đoạn rồi mới kẹt → chạy tiếp nhánh kẹt bên dưới
    if (th !== S.theta && !(fail && S.jamInfo)) {
      const done = Math.abs(goal - th) < 1e-9;
      mmSingleAdvance(th - S.theta); S.pos = P; S.theta = th; if (S.an && S.an.full && !lim.on) S.theta = ((S.theta % TAU) + TAU) % TAU; if (bounce && done) S.dir *= -1; collCheckStop();
      if (sc.fin && done) { togglePlay(); toast(T('toast_mm_single')); }
      else if (bounce && done && (S.mmRun || []).length) { togglePlay(); toast(T('toast_mm_limstop', { s: mmStrokeText(S.pos), l0: lim.min, l1: lim.max }), 9000); }
    } else if (fail && S.jamInfo) { // kẹt do ma sát: dừng ĐÚNG tại tư thế kẹt (lúc vừa chạm) để hình khớp với thông báo
      const j = S.jamInfo; togglePlay(); S.pos = j.pos; S.theta = j.rad; S.jamShow = j; afterMove();
      toast(j.drawer ? T('toast_djam', { b: j.b, k: j.k, g: j.drawer.g, h: j.drawer.h.toFixed(1), L: j.drawer.L.toFixed(1), m: j.drawer.Lmin.toFixed(1), t: thetaDeg().toFixed(1) }) + (j.drawer.out ? ' ' + T('g_out') : '') + (hasMateMotor() ? ' ' + mmStrokeText(S.pos) : '') : T(j.wedge ? 'toast_wjam' : 'toast_jam', { b: j.b, k: j.k, a: j.alpha.toFixed(j.wedge ? 2 : 1), f: j.phi.toFixed(j.wedge ? 2 : 1), p: j.pivot, t: thetaDeg().toFixed(1) }) + (hasMateMotor() ? ' ' + mmStrokeText(S.pos) : ''), 9000); }
    else if (fail && hasMateMotor()) { mmBlocked(P); return; } // motor trên mate không đảo chiều ngầm: báo kẹt, dừng tại chỗ
    else if (fail) { S.dir *= -1; if (ts - revAt > 4000) { toast(T('toast_reverse')); revAt = ts; } }
    afterMove();
  }
  last = ts; requestAnimationFrame(tick);
}

// ===== Ảnh nền =====
const bgFile = document.getElementById('bgFile');
bgFile.onchange = e => {
  const f = e.target.files[0]; if (!f) return; const rd = new FileReader();
  rd.onload = () => {
    const replacing = !!S.model.bg; setBgSrc(rd.result);
    if (!replacing) { const tl = s2w(0, 0), br = s2w(W, H); S.model.bg = { src: rd.result, x: (tl.x + br.x) / 2, y: (tl.y + br.y) / 2, w: Math.round((br.x - tl.x) * .6), op: .5, show: true, lock: false }; }
    else S.model.bg.src = rd.result;
    syncBgPanel(); changed(); toast(T('toast_bg'));
  };
  rd.readAsDataURL(f); e.target.value = '';
};
function setBgSrc(src) { S.bgSrc = src; S.bgImg = src ? new Image() : null; if (S.bgImg) { S.bgImg.onload = () => draw(); S.bgImg.src = src; } }
function syncBgPanel() {
  const bg = S.model.bg, sec = document.getElementById('bgSec'); sec.hidden = !bg; if (!bg) return;
  document.getElementById('bgOp').value = bg.op ?? .5; document.getElementById('bgOpOut').textContent = Math.round((bg.op ?? .5) * 100) + '%';
  if (document.activeElement !== document.getElementById('bgW')) document.getElementById('bgW').value = (+bg.w).toFixed(1);
  if (document.activeElement !== document.getElementById('bgRot')) document.getElementById('bgRot').value = (+(bg.rot || 0)).toFixed(1);
  document.getElementById('bgFx').setAttribute('aria-pressed', !!bg.fx); document.getElementById('bgFy').setAttribute('aria-pressed', !!bg.fy);
  document.getElementById('bgLock').checked = !!bg.lock; document.getElementById('bgShow').checked = bg.show !== false;
}
document.getElementById('bgOp').oninput = e => { S.model.bg.op = +e.target.value; document.getElementById('bgOpOut').textContent = Math.round(S.model.bg.op * 100) + '%'; draw(); };
document.getElementById('bgOp').onchange = () => changed();
document.getElementById('bgW').onchange = e => { const v = +e.target.value; if (v > 0) { S.model.bg.w = v; changed(); } };
document.getElementById('bgRot').onchange = e => { const v = +e.target.value; if (Number.isFinite(v)) { S.model.bg.rot = ((v % 360) + 540) % 360 - 180; syncBgPanel(); changed(); } };
for (const [id, op] of [['bgRm', 'r-'], ['bgRp', 'r+'], ['bgFx', 'fx'], ['bgFy', 'fy'], ['bgReset', 'reset']]) document.getElementById(id).onclick = () => bgOp(op);
document.getElementById('bgLock').onchange = e => { S.model.bg.lock = e.target.checked; changed(); };
document.getElementById('bgShow').onchange = e => { S.model.bg.show = e.target.checked; changed(); };
document.getElementById('bgReplace').onclick = () => bgFile.click();
document.getElementById('bgRemove').onclick = () => { S.model.bg = null; setBgSrc(null); syncBgPanel(); changed(); };

// ===== Mẫu =====
function presetModel(k) {
  if (PRESETS[k]) return normalizeModel(convertLegacy(buildPreset(PRESETS[k])));
  const J = (id, x, y, o = {}) => ({ id, name: id, x, y, fixed: false, slider: null, slot: null, trace: false, lock: {}, ...o });
  if (k === 'quick') return normalizeModel({
    joints: [J('O', 0, 0, { fixed: true }), J('A', 0, 12, { slot: 'S1' }), J('Q', 0, -30, { fixed: true }), J('R', 0, 50, { trace: true })],
    links: [{ id: 'L1', name: 'L1', joints: ['O', 'A'], w: 6 }, { id: 'L2', name: 'L2', joints: ['Q', 'R'], w: 9 }],
    slots: [{ id: 'S1', name: 'R1', link: 'L2', a: { x: 14, y: 0 }, b: { x: 60, y: 0 }, w: 3.5 }],
    motors: [{ id: 'M1', joint: 'O', link: 'L1', ratio: 1, phase: Math.PI / 2 }],
  });
  if (k === 'pump') {
    const m = normalizeModel({
      joints: [J('O', 0, 0, { fixed: true }), J('P', 25, 0), J('B', 50, 0, { trace: true }), J('C', 12, -22, { fixed: true })],
      links: [{ id: 'L1', name: 'L1', joints: ['O', 'B', 'P'], w: 7 }, { id: 'X1', name: 'X1', kind: 'cyl', cyl: { min: 16, max: 34 }, joints: ['C', 'P'], w: 5 }],
      motors: [{ id: 'M1', cyl: 'X1', ratio: 1, phase: 0, phaseSign: 1 }],
      shapes: [{ id: 'G1', name: 'H1', type: 'rect', link: 'L1', op: 'union', pts: [{ x: 40, y: -6 }, { x: 58, y: -6 }, { x: 58, y: 6 }, { x: 40, y: 6 }] }, { id: 'G2', name: 'H2', type: 'circle', link: 'L1', op: 'cut', c: { x: 49, y: 0 }, r: 3 }],
    });
    return m;
  }
  if (k === 'iris') return irisModel(J);
  if (FAMOUS[k]) return FAMOUS[k](J);
}
// ===== Cơ cấu kinh điển của các tác giả nổi tiếng (tọa độ tính sẵn để khép kín chính xác ở tư thế thiết kế) =====
const lk2 = (id, a, b, w = 5, extra = {}) => ({ id, name: id, joints: [a, b], w, ...extra });
const FAMOUS = {
  // James Watt (Scotland, 1784): hai cần lắc bằng nhau quay ngược hướng, điểm giữa M của thanh truyền vạch hình số 8 có đoạn gần thẳng
  watt: J => normalizeModel({
    joints: [J('A', 0, 0, { fixed: true }), J('B', 30, 0), J('C', 30, 20), J('D', 60, 20, { fixed: true }), J('M', 30, 10, { trace: true })],
    links: [lk2('L1', 'A', 'B', 5), { id: 'L2', name: 'L2', joints: ['B', 'C', 'M'], w: 5 }, lk2('L3', 'D', 'C', 5)],
    motors: [{ id: 'M1', joint: 'A', link: 'L1', ratio: 1, phase: 0 }], drive: { reverse: false, limit: { on: true, min: -28, max: 28 } } }),
  // Pafnuty Chebyshev (Nga): nền 2 · cần lắc chéo 2,5 · thanh truyền 1 (×20 mm); điểm giữa P đi gần thẳng ngang
  chebyshev: J => normalizeModel({
    joints: [J('A', 0, 0, { fixed: true }), J('D', 40, 0, { fixed: true }), J('C', 30, 40), J('B', 10, 40), J('P', 20, 40, { trace: true })],
    links: [lk2('L1', 'A', 'C', 5, { layer: 1 }), lk2('L3', 'D', 'B', 5, { layer: 2 }), { id: 'L2', name: 'L2', joints: ['B', 'C', 'P'], w: 5 }], // cần lắc bắt chéo: mỗi cần một lớp
    motors: [{ id: 'M1', joint: 'A', link: 'L1', ratio: 1, phase: 0 }], drive: { reverse: false, limit: { on: true, min: -22, max: 22 } } }),
  // Karl Hoeckens (Đức) — họ hàng (cognate) của "Lambda" Chebyshev: tay quay 1 · nền 2 · thanh truyền 2,5 · cần lắc 2,5 (×10 mm),
  // điểm P trên phần kéo dài thanh truyền cách B 5 đơn vị → quỹ đạo chữ D có đoạn thẳng dài, dùng cho chân robot đi bộ
  hoeckens: J => { const Cy = Math.sqrt(25 * 25 - 5 * 5); return normalizeModel({
    joints: [J('A', 0, 0, { fixed: true }), J('B', 10, 0), J('D', 20, 0, { fixed: true }), J('C', 15, Cy), J('P', 20, 2 * Cy, { trace: true })],
    links: [lk2('L1', 'A', 'B', 5), { id: 'L2', name: 'L2', joints: ['B', 'C', 'P'], w: 5 }, lk2('L3', 'D', 'C', 5)],
    motors: [{ id: 'M1', joint: 'A', link: 'L1', ratio: 1, phase: 0 }] }); },
  // Peaucellier (Pháp, 1864) – Lipkin (Litva): nghịch đảo hình học OC·OP = OA² − CA² → P đi thẳng TUYỆT ĐỐI (x = 2100 / (2·OQ))
  peaucellier: J => {
    const OQ = 20, OA = 50, CA = 20, phi = 0, C = { x: OQ + OQ * Math.cos(phi), y: OQ * Math.sin(phi) }, d = Math.hypot(C.x, C.y), k = (OA * OA - CA * CA) / (d * d);
    const P = { x: C.x * k, y: C.y * k }, mid = { x: (C.x + P.x) / 2, y: (C.y + P.y) / 2 }, half = Math.hypot(P.x - C.x, P.y - C.y) / 2, h = Math.sqrt(CA * CA - half * half);
    const ux = (P.x - C.x) / (2 * half), uy = (P.y - C.y) / (2 * half);
    return normalizeModel({
      joints: [J('O', 0, 0, { fixed: true }), J('Q', OQ, 0, { fixed: true }), J('C', C.x, C.y), J('A', mid.x - uy * h, mid.y + ux * h), J('B', mid.x + uy * h, mid.y - ux * h), J('P', P.x, P.y, { trace: true })],
      links: [['L1', 'Q', 'C', 5], ['OA', 'O', 'A', 4], ['OB', 'O', 'B', 4], ['CA', 'C', 'A', 4], ['CB', 'C', 'B', 4], ['PA', 'P', 'A', 4], ['PB', 'P', 'B', 4]].map(([id, a, b, w], i) => lk2(id, a, b, w, { layer: i + 1 })), // mỗi thanh một lớp
      motors: [{ id: 'M1', joint: 'Q', link: 'L1', ratio: 1, phase: 0 }], drive: { reverse: false, limit: { on: true, min: -60, max: 60 } } });
  },
};
// cơ cấu mống mắt (iris): vành dẫn V quay quanh O (motor, giới hạn −2° … +9°) có N rãnh hướng tâm;
// mỗi cánh quay quanh chốt cố định Pi (bán kính RP), chốt Qi trên cánh (cách Pi một đoạn D vào trong) chạy trong rãnh của vành
// → vành −2° … +9°: cánh xoay ≈ 50°, khẩu độ từ khép kín tới ≈ Ø66 mm. Mỗi cánh một lớp riêng (lá xếp chồng, không báo va chạm).
function irisModel(J) {
  const N = 6, RP = 40, D = 8, RM = 38.5, WB = 10, SPAN = 72 * D2R, BACK = 9 * D2R, OPEN = 42.5 * D2R;
  const joints = [J('O', 0, 0, { fixed: true }), J('K', 20, 0)], links = [], slots = [], shapes = [];
  links.push({ id: 'V', name: 'V', joints: ['O', 'K'], w: 4 });
  shapes.push({ id: 'GV1', name: 'V1', type: 'circle', link: 'V', op: 'union', c: { x: 0, y: 0 }, r: 50 }, { id: 'GV2', name: 'V2', type: 'circle', link: 'V', op: 'cut', c: { x: 0, y: 0 }, r: 27 });
  for (let i = 0; i < N; i++) {
    const a = i * TAU / N, er = { x: Math.cos(a), y: Math.sin(a) }, P = { x: RP * er.x, y: RP * er.y }, Q = { x: P.x - D * er.x, y: P.y - D * er.y };
    const n = i + 1, lid = 'C' + n;
    joints.push(J('P' + n, P.x, P.y, { fixed: true }), J('Q' + n, Q.x, Q.y, { slot: 'R' + n }));
    links.push({ id: lid, name: lid, joints: ['P' + n, 'Q' + n], w: 3, layer: n });
    // rãnh hướng tâm trên vành (hệ của V trùng hệ thế giới ở tư thế thiết kế)
    slots.push({ id: 'R' + n, name: 'R' + n, link: 'V', a: { x: 28 * er.x, y: 28 * er.y }, b: { x: 38.5 * er.x, y: 38.5 * er.y }, w: 3 });
    // lá cánh hình cung: ở tư thế MỞ (vành +9°) lá là cung đồng tâm O bán kính RM, nằm gọn trong vành, chạy ngược chiều kim đồng hồ từ Pi;
    // tư thế thiết kế (vành 0°) = tư thế mở xoay quanh Pi thêm OPEN (cánh xoay ≈ 42.5° cho 9° của vành)
    const f = frameOf({ joints: ['p', 'q'] }, { p: P, q: Q }), loc = w => { const l = toLocal(f, w); return { x: l.u, y: l.v }; };
    const c0 = Math.cos(OPEN), s0 = Math.sin(OPEN), rot = w => ({ x: P.x + (w.x - P.x) * c0 - (w.y - P.y) * s0, y: P.y + (w.x - P.x) * s0 + (w.y - P.y) * c0 });
    const arc = (t, r) => rot({ x: r * Math.cos(a + t), y: r * Math.sin(a + t) });
    const outer = [], inner = [], M = 14;
    for (let k = 0; k <= M; k++) { const t = -BACK + (SPAN + BACK) * k / M, hw = WB / 2 * (k === M ? .45 : 1); outer.push(loc(arc(t, RM + hw))); inner.push(loc(arc(t, RM - hw))); }
    shapes.push({ id: 'GB' + n, name: 'B' + n, type: 'poly', link: lid, op: 'union', pts: [...outer, ...inner.reverse()] });
  }
  joints.find(j => j.id === 'Q1').trace = true;
  return normalizeModel({ joints, links, slots, shapes, motors: [{ id: 'M1', joint: 'O', link: 'V', ratio: 1, phase: 0 }], drive: { reverse: false, limit: { on: true, min: -2, max: 9 } } });
}
const PRESET_ICONS = {
  fourbar: '<path d="M10 28L18 10L50 12L60 28" /><path d="M18 10L36 2L50 12" opacity=".6"/><circle cx="10" cy="28" r="2.5"/><circle cx="60" cy="28" r="2.5"/>',
  slider: '<circle cx="12" cy="20" r="2.5"/><path d="M12 20L20 8L52 20"/><rect x="46" y="15" width="14" height="10" rx="1"/><path d="M4 31h68"/>',
  wings: '<path d="M8 6L30 22M64 6L42 22"/><path d="M30 22L36 28L42 22"/><circle cx="36" cy="28" r="2.5"/><circle cx="30" cy="22" r="2"/><circle cx="42" cy="22" r="2"/>',
  jansen: '<path d="M40 10L28 6L14 12L22 22L28 32L34 20L40 10"/><path d="M28 6L34 20"/><circle cx="40" cy="10" r="2.5"/><circle cx="34" cy="20" r="2"/><path d="M18 32h20" stroke-dasharray="2 2"/>',
  quick: '<circle cx="36" cy="26" r="2.5"/><path d="M36 26L42 18"/><rect x="18" y="5" width="36" height="7" rx="3.5" transform="rotate(-20 36 9)"/><circle cx="42" cy="18" r="2"/><circle cx="20" cy="31" r="2.5"/>',
  pump: '<circle cx="10" cy="26" r="2.5"/><path d="M10 26L62 14"/><rect x="18" y="26" width="18" height="6" rx="1.5" transform="rotate(-35 18 29)"/><circle cx="36" cy="20" r="2"/><circle cx="18" cy="31" r="2"/>',
  watt: '<circle cx="12" cy="28" r="2.5"/><circle cx="60" cy="8" r="2.5"/><path d="M12 28L34 28L38 8L60 8"/><path d="M30 30q6-12 12-24" stroke-dasharray="2 2" opacity=".7"/>',
  chebyshev: '<circle cx="14" cy="30" r="2.5"/><circle cx="58" cy="30" r="2.5"/><path d="M14 30L46 6M58 30L26 6M26 6H46"/><path d="M10 6H62" stroke-dasharray="2 2" opacity=".6"/>',
  hoeckens: '<circle cx="16" cy="28" r="2.5"/><circle cx="34" cy="28" r="2.5"/><path d="M16 28l8-4L46 6l8-4M34 28L42 10"/><path d="M40 4h22q6 6-4 10H44" stroke-dasharray="2 2" opacity=".7"/>',
  peaucellier: '<circle cx="8" cy="18" r="2.5"/><circle cx="20" cy="18" r="2"/><path d="M8 18L44 6M8 18L44 30M30 18L44 6L58 18L44 30Z M20 18L30 18"/><path d="M58 2V34" stroke-dasharray="2 2" opacity=".7"/>',
  iris: '<circle cx="36" cy="17" r="15"/><path d="M36 2Q44 10 42 17M49 9.5Q48 21 42 17M49 24.5Q38 29 42 17M36 32Q28 24 30 17M23 24.5Q24 13 30 17M23 9.5Q34 5 30 17"/><path d="M36 13.5L39 15.2V18.8L36 20.5L33 18.8V15.2Z"/>',
};
function renderPresets() {
  const box = document.getElementById('presets');
  box.innerHTML = Object.keys(PRESET_ICONS).map(k => `<button class="preset" data-p="${k}" title="${esc(T('pd_' + k) === 'pd_' + k ? T('p_' + k) : T('pd_' + k))}"><svg viewBox="0 0 72 34" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">${PRESET_ICONS[k]}</svg><span>${T('p_' + k)}</span></button>`).join('');
  box.querySelectorAll('.preset').forEach(b => b.onclick = () => { closeExamples(); const m = presetModel(b.dataset.p); if (S.model.bg) { m.bg = S.model.bg; } loadModel(m); });
}
// ----- menu Ví dụ thả xuống trên thanh công cụ -----
const exEl = document.getElementById('exMenu');
function toggleExamples(btn) {
  if (!exEl.hidden) { closeExamples(); return; }
  closeMenu(); exEl.hidden = false; btn.setAttribute('aria-expanded', 'true');
  const r = btn.getBoundingClientRect(), w = exEl.offsetWidth;
  exEl.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px'; exEl.style.top = (r.bottom + 6) + 'px';
  const f = exEl.querySelector('.preset'); f && f.focus();
}
function closeExamples() { exEl.hidden = true; const b = document.querySelector('[data-act=examples]'); b && b.setAttribute('aria-expanded', 'false'); }
document.addEventListener('pointerdown', e => { if (!exEl.hidden && !exEl.contains(e.target) && !e.target.closest('[data-act=examples]')) closeExamples(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !exEl.hidden) closeExamples(); });

// ----- Xuất DXF (chèn vào sketch Onshape: Insert DXF/DWG) -----
// biên rãnh theo nét phác thảo (tư thế hiện tại): cung → 2 cung đồng tâm + 2 đầu bo; tròn → 2 đường tròn; đoạn thẳng → như rãnh thẳng; spline → 2 đường offset gấp khúc + 2 đầu bo
function slotPathDXF(sl, line, arc, circle, poly) {
  const e = SKM().ents.find(q => q.id === sl.ent); if (!e) return; const r = (sl.w || 3) / 2, P = slotPoly(sl).pts; if (P.length < 2) return;
  if (e.type === 'circle') { let cx = 0, cy = 0; const Q = P.slice(0, -1); for (const p of Q) { cx += p.x; cy += p.y; } const c = { x: cx / Q.length, y: cy / Q.length }; circle('RANH', c, e.r + r); if (e.r > r) circle('RANH', c, e.r - r); return; }
  const cap = (p, q, back) => { const t = Math.atan2(q.y - p.y, q.x - p.x) + (back ? Math.PI : 0); arc('RANH', p, r, t + Math.PI / 2, t + Math.PI * 1.5); }; // nửa tròn ở đầu p, quay ra ngoài (ngược hướng p→q)
  const off = s => P.map((p, i) => { const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)], dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1; return { x: p.x - dy / l * r * s, y: p.y + dx / l * r * s }; });
  if (e.type === 'arc') {
    const pm = SK.ptMap(SKM()), c0 = pm.get(e.c), a0 = pm.get(e.a), R = Math.hypot(a0.x - c0.x, a0.y - c0.y), A = P[0], B = P[P.length - 1], M = P[P.length >> 1];
    const c = (() => { const d = 2 * (A.x * (M.y - B.y) + M.x * (B.y - A.y) + B.x * (A.y - M.y)), a2 = A.x * A.x + A.y * A.y, m2 = M.x * M.x + M.y * M.y, b2 = B.x * B.x + B.y * B.y; return { x: (a2 * (M.y - B.y) + m2 * (B.y - A.y) + b2 * (A.y - M.y)) / d, y: (a2 * (B.x - M.x) + m2 * (A.x - B.x) + b2 * (M.x - A.x)) / d }; })();
    const t0 = Math.atan2(A.y - c.y, A.x - c.x), t1 = Math.atan2(B.y - c.y, B.x - c.x); // cung đi ngược kim đồng hồ từ A tới B
    arc('RANH', c, R + r, t0, t1); if (R > r) arc('RANH', c, R - r, t0, t1);
    cap(A, P[1], false); cap(B, P[P.length - 2], false); return;
  }
  const L1 = off(1), L2 = off(-1);
  if (e.closed) { L1.pop(); L2.pop(); poly('RANH', L1, true); poly('RANH', L2, true); return; } // spline kín: hai vòng offset, không có đầu rãnh
  if (e.type === 'line') { line('RANH', L1[0], L1[1]); line('RANH', L2[0], L2[1]); } else { poly('RANH', L1, false); poly('RANH', L2, false); }
  cap(P[0], P[1], false); cap(P[P.length - 1], P[P.length - 2], false);
}
// biên dạng thân thanh/tấm như drawLinkBody (nét bút tròn rộng 2r dọc đa giác khớp): đoạn offset + cung bo tại đỉnh lồi,
// đỉnh lõm → giao hai đường offset. Thanh 2 khớp = hình chữ nhật bo tròn hai đầu. Cung theo chiều DXF (ngược kim đồng hồ a0 → a1)
function barOutline(ps, r) {
  let P = ps.slice(), A = 0; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; A += a.x * b.y - b.x * a.y; }
  if (A < 0) P.reverse(); // ngược chiều kim đồng hồ → phía ngoài = bên phải chiều đi
  const n = P.length, E = P.map((a, i) => { const b = P[(i + 1) % n], L = Math.hypot(b.x - a.x, b.y - a.y) || 1, ux = (b.x - a.x) / L, uy = (b.y - a.y) / L; return { a, b, ux, uy, nx: uy, ny: -ux }; });
  const off = (e, p) => ({ x: p.x + e.nx * r, y: p.y + e.ny * r }), st = E.map(e => off(e, e.a)), en = E.map(e => off(e, e.b)), out = [], arcs = [];
  for (let i = 0; i < n; i++) { // đỉnh i+1 giữa cạnh i và i+1
    const e = E[i], f = E[(i + 1) % n], k = (i + 1) % n, cr = e.ux * f.uy - e.uy * f.ux, dt = e.ux * f.ux + e.uy * f.uy;
    if (cr > 1e-9 || (Math.abs(cr) <= 1e-9 && dt < 0)) arcs.push({ t: 'arc', c: f.a, r, a0: Math.atan2(e.ny, e.nx), a1: Math.atan2(f.ny, f.nx) });
    else if (cr < -1e-9) { // lõm: cắt hai đường offset tại giao điểm
      const t = ((st[k].x - en[i].x) * f.uy - (st[k].y - en[i].y) * f.ux) / (e.ux * f.uy - e.uy * f.ux), X = { x: en[i].x + e.ux * t, y: en[i].y + e.uy * t };
      en[i] = X; st[k] = X;
    }
  }
  for (let i = 0; i < n; i++) if (Math.hypot(en[i].x - st[i].x, en[i].y - st[i].y) > 1e-9) out.push({ t: 'line', a: st[i], b: en[i] });
  return out.concat(arcs);
}
function buildDXF() {
  // DXF R2000 (AC1015): có thực thể SPLINE thật (R12 không có → spline thành hàng trăm đoạn khi nhập vào Onshape)
  XF = skXform(true); const P = S.pos, out = [], layers = new Set();
  const n = v => (Math.abs(v) < 1e-9 ? 0 : v).toFixed(6);
  const put = (...kv) => { for (let i = 0; i < kv.length; i += 2) out.push(String(kv[i]), String(kv[i + 1])); };
  let hs = 0x100; const H = () => (hs++).toString(16).toUpperCase(), MS = '1F'; // handle; 1F = BLOCK_RECORD *Model_Space
  const ent = (type, ly, sub) => { layers.add(ly); put(0, type, 5, H(), 330, MS, 100, 'AcDbEntity', 8, ly, 100, sub); };
  const line = (ly, a, b) => { ent('LINE', ly, 'AcDbLine'); put(10, n(a.x), 20, n(a.y), 30, 0, 11, n(b.x), 21, n(b.y), 31, 0); };
  const circle = (ly, c, r) => { ent('CIRCLE', ly, 'AcDbCircle'); put(10, n(c.x), 20, n(c.y), 30, 0, 40, n(r)); };
  const arc = (ly, c, r, a0, a1) => { ent('ARC', ly, 'AcDbCircle'); put(10, n(c.x), 20, n(c.y), 30, 0, 40, n(r), 100, 'AcDbArc', 50, n(a0 * R2D), 51, n(a1 * R2D)); };
  const spline = (ly, ctrl) => { // B-spline bậc 3 kẹp đầu, nút trong lặp 3 (các đoạn Bézier nối nhau)
    const segs = (ctrl.length - 1) / 3, kn = [0, 0, 0, 0]; for (let k = 1; k < segs; k++) kn.push(k, k, k); kn.push(segs, segs, segs, segs);
    ent('SPLINE', ly, 'AcDbSpline'); put(210, 0, 220, 0, 230, 1, 70, 8, 71, 3, 72, kn.length, 73, ctrl.length, 74, 0, 42, '0.0000000001', 43, '0.0000000001');
    for (const k of kn) put(40, k); for (const p of ctrl) put(10, n(p.x), 20, n(p.y), 30, 0); };
  const poly = (ly, pts, closed) => { if (pts.length < 2) return; ent('LWPOLYLINE', ly, 'AcDbPolyline'); put(90, pts.length, 70, closed ? 1 : 0); for (const p of pts) put(10, n(p.x), 20, n(p.y)); };
  // khâu, xi lanh, khớp
  for (const L of S.model.links) {
    if (L.kind === 'body') continue; const ps = L.joints.map(id => P[id]).filter(Boolean); if (ps.length < 2) continue;
    if (L.kind === 'cyl') { line('XI_LANH', ps[0], ps[1]); continue; }
    for (const g of barOutline(ps, (L.w || 6) / 2)) g.t === 'line' ? line('KHAU', g.a, g.b) : arc('KHAU', g.c, g.r, g.a0, g.a1);
  }
  for (const j of S.model.joints) { if (j.hidden || !P[j.id] || !linksOf(j.id).length) continue; circle(j.fixed ? 'GOI_CO_DINH' : 'KHOP', P[j.id], 1.5); }
  for (const sl of S.model.slots || []) {
    if (sl.ent) { slotPathDXF(sl, line, arc, circle, poly); continue; }
    const w = slotWorld(sl), a = w.a, b = w.b, L = Math.hypot(b.x - a.x, b.y - a.y); if (L < 1e-6) continue;
    const r = (sl.w || 3) / 2, ux = (b.x - a.x) / L, uy = (b.y - a.y) / L, nx = -uy * r, ny = ux * r, t = Math.atan2(uy, ux);
    line('RANH', { x: a.x + nx, y: a.y + ny }, { x: b.x + nx, y: b.y + ny }); line('RANH', { x: a.x - nx, y: a.y - ny }, { x: b.x - nx, y: b.y - ny });
    arc('RANH', b, r, t - Math.PI / 2, t + Math.PI / 2); arc('RANH', a, r, t + Math.PI / 2, t + Math.PI * 1.5);
  }
  // phác thảo (đã đặt theo tư thế hiện tại)
  const sk = SKM(), pm = SK.ptMap(sk), AB = absorbMap();
  for (const e of sk.ents) {
    if (e.type === 'point') continue; const ly = e.cs ? 'DUNG_HINH' : 'PHAC_THAO', f = e.owner && XF[e.owner], T_ = p => f ? f(p) : p;
    const ab = AB.get(e.id);
    if (ab) { // chỉ xuất phần biên của CP ghép
      for (const sg of ab.segs) {
        const a = T_(sg[0]), b = T_(sg[sg.length - 1]);
        if (e.type === 'line') line(ly, a, b);
        else if (e.type === 'circle' || e.type === 'arc') {
          const c = T_(pm.get(e.c)), r = Math.hypot(a.x - c.x, a.y - c.y), full = sg.length > 3 && Math.hypot(a.x - b.x, a.y - b.y) < 1e-6;
          if (full) circle(ly, c, r); else arc(ly, c, r, Math.atan2(a.y - c.y, a.x - c.x), Math.atan2(b.y - c.y, b.x - c.x));
        } else poly(ly, sg.map(T_), false);
      }
      continue;
    }
    if (e.type === 'line') line(ly, T_(pm.get(e.a)), T_(pm.get(e.b)));
    else if (e.type === 'circle') circle(ly, T_(pm.get(e.c)), e.r);
    else if (e.type === 'arc') { const c = T_(pm.get(e.c)), a = T_(pm.get(e.a)), b = T_(pm.get(e.b)); arc(ly, c, Math.hypot(a.x - c.x, a.y - c.y), Math.atan2(a.y - c.y, a.x - c.x), Math.atan2(b.y - c.y, b.x - c.x)); }
    else if (e.type === 'spline') spline(ly, SK.splineBezier(e.pts.map(id => T_(pm.get(id))), !!e.closed)); // spline thật, không chia đoạn
  }
  // quỹ đạo
  if (S.an && S.an.traces) for (const id in S.an.traces) { const tr = S.an.traces[id]; if (tr.pts && tr.pts.length > 1) poly('QUY_DAO', tr.pts, !!S.an.full); }
  const col = { KHAU: 5, XI_LANH: 4, KHOP: 7, GOI_CO_DINH: 1, RANH: 3, PHAC_THAO: 7, DUNG_HINH: 8, QUY_DAO: 6 };
  const hd = []; const w = (...kv) => { for (let i = 0; i < kv.length; i += 2) hd.push(String(kv[i]), String(kv[i + 1])); };
  const tbl = (name, hnd, cnt, extra) => { w(0, 'TABLE', 2, name, 5, hnd, 330, 0, 100, 'AcDbSymbolTable', 70, cnt); if (extra) w(100, extra); };
  const rec = (type, hnd, owner, sub) => w(0, type, 5, hnd, 330, owner, 100, 'AcDbSymbolTableRecord', 100, sub);
  w(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1015', 9, '$HANDSEED', 5, 'FFFFF', 9, '$INSUNITS', 70, 4, 9, '$MEASUREMENT', 70, 1, 0, 'ENDSEC');
  w(0, 'SECTION', 2, 'CLASSES', 0, 'ENDSEC', 0, 'SECTION', 2, 'TABLES');
  tbl('VPORT', '8', 1); rec('VPORT', '29', '8', 'AcDbViewportTableRecord'); w(2, '*ACTIVE', 70, 0, 10, 0, 20, 0, 11, 1, 21, 1, 12, 0, 22, 0, 13, 0, 23, 0, 14, 10, 24, 10, 15, 10, 25, 10, 16, 0, 26, 0, 36, 1, 17, 0, 27, 0, 37, 0, 40, 200, 41, 1.5, 42, 50, 43, 0, 44, 0, 50, 0, 51, 0, 71, 0, 72, 100, 73, 1, 74, 3, 75, 0, 76, 0, 77, 0, 78, 0, 0, 'ENDTAB');
  tbl('LTYPE', '5', 4);
  rec('LTYPE', '14', '5', 'AcDbLinetypeTableRecord'); w(2, 'ByBlock', 70, 0, 3, '', 72, 65, 73, 0, 40, 0);
  rec('LTYPE', '15', '5', 'AcDbLinetypeTableRecord'); w(2, 'ByLayer', 70, 0, 3, '', 72, 65, 73, 0, 40, 0);
  rec('LTYPE', '16', '5', 'AcDbLinetypeTableRecord'); w(2, 'Continuous', 70, 0, 3, 'Solid line', 72, 65, 73, 0, 40, 0);
  rec('LTYPE', '17', '5', 'AcDbLinetypeTableRecord'); w(2, 'DASHED', 70, 0, 3, '__ __ __', 72, 65, 73, 2, 40, 9.525, 49, 6.35, 74, 0, 49, -3.175, 74, 0, 0, 'ENDTAB');
  const lys = ['0', ...layers]; tbl('LAYER', '2', lys.length);
  lys.forEach((ly, k) => { rec('LAYER', (0x40 + k).toString(16).toUpperCase(), '2', 'AcDbLayerTableRecord'); w(2, ly, 70, 0, 62, col[ly] || 7, 6, ly === 'DUNG_HINH' ? 'DASHED' : 'Continuous', 370, -3); });
  w(0, 'ENDTAB');
  tbl('STYLE', '3', 1); rec('STYLE', '11', '3', 'AcDbTextStyleTableRecord'); w(2, 'Standard', 70, 0, 40, 0, 41, 1, 50, 0, 71, 0, 42, 2.5, 3, 'txt', 4, '', 0, 'ENDTAB');
  tbl('VIEW', '6', 0); w(0, 'ENDTAB'); tbl('UCS', '7', 0); w(0, 'ENDTAB');
  tbl('APPID', '9', 1); rec('APPID', '12', '9', 'AcDbRegAppTableRecord'); w(2, 'ACAD', 70, 0, 0, 'ENDTAB');
  tbl('DIMSTYLE', 'A', 1, 'AcDbDimStyleTable'); w(0, 'DIMSTYLE', 105, '27', 330, 'A', 100, 'AcDbSymbolTableRecord', 100, 'AcDbDimStyleTableRecord', 2, 'Standard', 70, 0, 0, 'ENDTAB');
  tbl('BLOCK_RECORD', '1', 2); rec('BLOCK_RECORD', MS, '1', 'AcDbBlockTableRecord'); w(2, '*Model_Space'); rec('BLOCK_RECORD', '1B', '1', 'AcDbBlockTableRecord'); w(2, '*Paper_Space', 0, 'ENDTAB', 0, 'ENDSEC');
  w(0, 'SECTION', 2, 'BLOCKS');
  for (const [nm, br, b0, b1] of [['*Model_Space', MS, '20', '21'], ['*Paper_Space', '1B', '1C', '1D']]) {
    w(0, 'BLOCK', 5, b0, 330, br, 100, 'AcDbEntity', 8, '0', 100, 'AcDbBlockBegin', 2, nm, 70, 0, 10, 0, 20, 0, 30, 0, 3, nm, 1, '');
    w(0, 'ENDBLK', 5, b1, 330, br, 100, 'AcDbEntity', 8, '0', 100, 'AcDbBlockEnd'); }
  w(0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES');
  const tail = ['0', 'ENDSEC', '0', 'SECTION', '2', 'OBJECTS', '0', 'DICTIONARY', '5', 'C', '330', '0', '100', 'AcDbDictionary', '281', '1', '3', 'ACAD_GROUP', '350', 'D',
    '0', 'DICTIONARY', '5', 'D', '330', 'C', '100', 'AcDbDictionary', '281', '1', '0', 'ENDSEC', '0', 'EOF'];
  return { text: [...hd, ...out, ...tail].join('\r\n') + '\r\n', count: out.filter((v, i) => i % 2 === 0 && v === '0').length };
}
function crc32(u8) { let c, crc = -1; for (let i = 0; i < u8.length; i++) { c = (crc ^ u8[i]) & 255; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xEDB88320 : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ -1) >>> 0; }
function zipOne(name, u8) { // zip lưu (không nén) một file
  const nm = new TextEncoder().encode(name), crc = crc32(u8), d = new Date();
  const dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff, dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;
  const lh = new DataView(new ArrayBuffer(30)); [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, dt, 2], [12, dd, 2], [14, crc, 4], [18, u8.length, 4], [22, u8.length, 4], [26, nm.length, 2], [28, 0, 2]].forEach(([o, v, z]) => z === 4 ? lh.setUint32(o, v, true) : lh.setUint16(o, v, true));
  const ch = new DataView(new ArrayBuffer(46)); [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, dt, 2], [14, dd, 2], [16, crc, 4], [20, u8.length, 4], [24, u8.length, 4], [28, nm.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, 0, 4]].forEach(([o, v, z]) => z === 4 ? ch.setUint32(o, v, true) : ch.setUint16(o, v, true));
  const cdOff = 30 + nm.length + u8.length, cdLen = 46 + nm.length;
  const eo = new DataView(new ArrayBuffer(22)); [[0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2], [8, 1, 2], [10, 1, 2], [12, cdLen, 4], [16, cdOff, 4], [20, 0, 2]].forEach(([o, v, z]) => z === 4 ? eo.setUint32(o, v, true) : eo.setUint16(o, v, true));
  return new Blob([lh, nm, u8, ch, nm, eo], { type: 'application/zip' });
}
async function exportDXF() {
  const { text, count } = buildDXF(); if (!count) { toast(T('toast_dxf_empty')); return; }
  const name = projectName(); await dlReady;
  if (dlCap) {
    try { await dlCap.save({ filename: name + '-dxf.zip', data: zipOne(name + '.dxf', new TextEncoder().encode(text)) }); toast(T('toast_dxf_zip')); }
    catch (e) { toast(e && e.code === 'declined' ? T('toast_declined') : T('toast_savefail')); }
    return;
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/dxf' })); a.download = name + '.dxf';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); toast(T('toast_dxf'));
}
function loadModel(m, view, resetHistory = false) {
  if (S.playing) togglePlay();
  S.skFrames = {}; S.model = normalizeModel(m); S.sel = null; S.msel = []; S.draft = []; S.snap = null; S.skd = {}; S.cpick = []; closePopover(); closeMenu();
  S.dir = S.model.drive.reverse ? -1 : 1;
  if (resetHistory) { S.undo = []; S.redo = []; S.snapPrev = null; }
  if (S.model.bg && S.model.bg.src && S.model.bg.src !== S.bgSrc) setBgSrc(S.model.bg.src);
  refreshMotorPhases(); rebuild({ quiet: true });
  if (view && isFinite(view.s)) { S.view = { s: +view.s, ox: +view.ox || 0, oy: +view.oy || 0 }; draw(); } else fitView();
  syncBgPanel(); clearDirty();
}

// ===== File dự án .xcc =====
const XCC_FORMAT = 'XCC', XCC_VERSION = 5;
let dirty = false;
function markDirty() { dirty = true; document.getElementById('dirty').hidden = false; }
function clearDirty() { dirty = false; document.getElementById('dirty').hidden = true; }
function projectName() { return (document.getElementById('projName').value.trim() || 'co-cau').replace(/[\\/:*?"<>|]+/g, '-'); }
function serialize() {
  // ghi tư thế hiện tại làm tư thế thiết kế → hình phác thảo thuộc khâu/part phải đổi sang khung mới CÙNG LÚC
  // (trước đây chỉ khớp được ghi ở tư thế mới, hình CP vẫn ở khung cũ → mở lại thấy part lệch khỏi gối, vd. K1 xoay 8.9° quanh D)
  commitPose(); syncOwnedSketch(); solveSketch(); const m = S.model;
  const strip = o => { const c = { ...o }; if (c.lock && !Object.keys(c.lock).length) delete c.lock; for (const k in c) if (k[0] === '_') delete c[k]; return c; };
  return JSON.stringify({
    format: XCC_FORMAT, version: XCC_VERSION, app: 'MrT Motion Gen', units: 'mm',
    name: document.getElementById('projName').value.trim(), saved: new Date().toISOString(), view: S.view, options: S.opt,
    theta0: m.theta0, drive: m.drive, joints: m.joints.map(strip), links: m.links.map(strip), motors: m.motors, slots: m.slots,
    sketch: m.sketch, features: m.features, compounds: m.compounds, mates: m.mates, measures: m.measures.map(strip), bg: m.bg, mu: m.mu, muG: m.muG, motorInf: m.motorInf || undefined, origSaved: m.origSaved || undefined, positions: m.positions && m.positions.length ? m.positions : undefined, synth: m.synth && (m.synth.poses.length || (m.synth.pivots || []).length) ? m.synth : undefined,
  }, (k, v) => k[0] === '_' ? undefined : v);
}
let dlCap;
const dlReady = (async () => { try { dlCap = window.claude && window.claude.use ? await window.claude.use('downloads') : null; } catch (e) { dlCap = null; } })();
async function saveProject() {
  const data = serialize(); await dlReady;
  if (dlCap) {
    try { await dlCap.save({ filename: projectName() + '.xcc.json', data }); clearDirty(); toast(T('toast_saved')); }
    catch (e) { toast(e && e.code === 'declined' ? T('toast_declined') : T('toast_savefail')); }
    return;
  }
  try {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    a.download = projectName() + '.xcc'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000); clearDirty(); toast(T('toast_saved'));
  } catch (e) { toast(T('toast_savefail')); }
}
function openProjectText(txt, fname) {
  let d; try { d = JSON.parse(txt); } catch (e) { toast(T('toast_badfile')); return; }
  if (!d || !Array.isArray(d.joints) || (d.format && d.format !== XCC_FORMAT)) { toast(T('toast_badfile')); return; }
  let m;
  try {
    if (Array.isArray(d.links)) m = { theta0: +d.theta0 || 0, joints: d.joints, links: d.links, motors: d.motors || [], slots: d.slots, shapes: d.shapes, sketch: d.sketch, features: d.features, compounds: d.compounds, mates: d.mates, measures: d.measures, drive: d.drive, bg: d.bg, synth: d.synth, mu: d.mu, muG: d.muG, motorInf: !!d.motorInf, origSaved: !!d.origSaved, positions: Array.isArray(d.positions) ? d.positions : [] };
    else m = convertLegacy({ joints: d.joints.map(j => ({ ...j, p: j.p || [], lock: j.lock || {} })) });
  } catch (e) { toast(T('toast_badfile')); return; }
  if (d.options) for (const k of ['dims', 'trace', 'snap', 'infer', 'coll', 'collstop', 'ic', 'ctinfo']) if (k in d.options) { S.opt[k] = !!d.options[k]; const el = document.getElementById('opt' + k[0].toUpperCase() + k.slice(1)); if (el) el.checked = S.opt[k]; }
  document.getElementById('projName').value = d.name || (fname || '').replace(/\.xcc(\.json)?$|\.json$/i, '');
  if (!m.bg) setBgSrc(null);
  loadModel(m, d.view, true); toast(T('toast_loaded'));
}
const openInput = document.getElementById('loadProj'); let openArmed = 0;
openInput.addEventListener('click', e => { if (dirty && S.model.links.length && Date.now() - openArmed > 4000) { e.preventDefault(); openArmed = Date.now(); toast(T('confirm_open')); } });
openInput.onchange = e => { const f = e.target.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => openProjectText(rd.result, f.name); rd.readAsText(f); e.target.value = ''; };
document.getElementById('saveProj').onclick = saveProject;
document.getElementById('dxfBtn').onclick = exportDXF;
document.getElementById('projName').addEventListener('input', markDirty);
stage.addEventListener('dragover', e => e.preventDefault());
stage.addEventListener('drop', e => {
  e.preventDefault(); const f = e.dataTransfer.files[0]; if (!f) return; const rd = new FileReader();
  if (f.type.startsWith('image/')) { const dt = new DataTransfer(); dt.items.add(f); bgFile.files = dt.files; bgFile.onchange({ target: bgFile }); return; }
  rd.onload = () => openProjectText(rd.result, f.name); rd.readAsText(f);
});
let clearArmed = 0;
document.getElementById('clearAll').onclick = e => {
  if (Date.now() - clearArmed < 2500) { const bg = S.model.bg; S.model = emptyModel(); S.model.bg = bg; S.sel = null; closePopover(); rebuild(); toast(T('toast_cleared')); clearArmed = 0; e.target.textContent = T('clear'); }
  else { clearArmed = Date.now(); e.target.textContent = T('confirm_clear'); setTimeout(() => e.target.textContent = T('clear'), 2500); }
};
document.getElementById('lockPivots').onclick = () => { S.model.joints.forEach(j => { if (j.fixed) lk(j).pos = 1; }); changed(); toast(T('toast_lockp')); };
document.getElementById('lockDims').onclick = () => { S.model.links.forEach(L => { if (L.kind !== 'cyl') lk(L).len = 1; }); changed(); toast(T('toast_lockd')); };
document.getElementById('unlockAll').onclick = () => { S.model.joints.forEach(j => j.lock = {}); S.model.links.forEach(L => L.lock = {}); changed(); toast(T('toast_unlock')); };
['Dims', 'Trace', 'Snap', 'Infer', 'Sketch', 'Glyph'].forEach(k => document.getElementById('opt' + k).onchange = e => { S.opt[k.toLowerCase()] = e.target.checked; draw(); });
document.getElementById('optPhys').onchange = e => togglePhys(e.target.checked);
document.getElementById('optMu').onchange = e => setMu(+e.target.value);
document.getElementById('optMuG').onchange = e => setMuG(+e.target.value);
document.getElementById('optCtinfo').onchange = e => { S.opt.ctinfo = e.target.checked; draw(); };
document.getElementById('optIc').onchange = e => { S.opt.ic = e.target.checked; draw(); };
document.getElementById('optMkLim').onchange = e => { S.opt.mklim = e.target.checked; renderThetaMarks(); };
document.getElementById('optMkDead').onchange = e => { S.opt.mkdead = e.target.checked; renderThetaMarks(); };
['Coll', 'Collstop'].forEach(k => document.getElementById('opt' + k).onchange = e => { S.opt[k.toLowerCase()] = e.target.checked; renderAnalysis(); draw(); });
document.getElementById('undo').onclick = undo; document.getElementById('redo').onclick = redo;

let toastT; function toast(msg, ms) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms || 2600); }
function applyLang() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i]').forEach(el => el.textContent = T(el.dataset.i));
  document.getElementById('lang-vi').setAttribute('aria-pressed', lang === 'vi'); document.getElementById('lang-en').setAttribute('aria-pressed', lang === 'en');
  document.getElementById('reverse').title = T('rev_tip'); document.getElementById('limitSw').title = T('lim_tip');
  renderToolbar(); renderPresets(); updateHint(); renderToolOpts(); renderAll();
}
// đổi ngôn ngữ chỉ trong phiên này — không ghi gì lên máy, chạy offline hoàn toàn
document.getElementById('lang-vi').onclick = () => { lang = 'vi'; applyLang(); };
document.getElementById('lang-en').onclick = () => { lang = 'en'; applyLang(); };
const refreshTheme = () => { readColors(); draw(); };
try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', refreshTheme); } catch (e) {}
new MutationObserver(refreshTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
new ResizeObserver(() => { resize(); renderDock(); }).observe(stage);

readColors(); resize();
loadModel(presetModel('fourbar'), null, true);
applyLang(); fitView(); updateUndoBtns();
document.fonts && document.fonts.ready.then(() => draw());
