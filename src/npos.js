// ===== Bỏ qua kẹt · Vị trí đã lưu (named positions) =====

// ---- Bỏ qua kẹt: người dùng thấy báo kẹt vô lý → mô phỏng tiếp ----
// bật: không dừng vì tự hãm ma sát / nêm / ngăn kéo (frictionJam trả false); bước bị hình học chặn thì giải lại không có tiếp xúc (vật xuyên qua nhau)
S.ignoreJam = false;
function toggleIgnoreJam() {
  S.ignoreJam = !S.ignoreJam; S.jamShow = null; syncNoJamBtn();
  toast(T(S.ignoreJam ? 'toast_nojam_on' : 'toast_nojam_off'), 7000); draw();
}
function syncNoJamBtn() { const b = document.querySelector('[data-act=nojam]'); if (b) b.setAttribute('aria-pressed', S.ignoreJam); }
// bước mô phỏng khi đang bỏ qua kẹt: bỏ ràng buộc tiếp xúc cho riêng bước bị chặn
function stepIgnoringJam(P, th, nx, step) { return S.ignoreJam ? stepTo(S.model, S.cons.filter(c => c.t !== 'ct'), P, th, nx, step) : null; }

// ---- Vị trí đã lưu: chụp vị trí mọi khớp + góc motor, đặt tên, quay lại bất kỳ lúc nào (lưu trong .xcc: model.positions) ----
const posSnap = () => { const pos = {}; for (const id in S.pos) pos[id] = [+S.pos[id].x.toFixed(6), +S.pos[id].y.toFixed(6)]; return pos; };
// lần bấm chạy đầu tiên của mỗi cơ cấu: tự lưu vị trí "Original" lên đầu danh sách (một lần — cờ model.origSaved lưu trong .xcc,
// nên mở lại file không tạo thêm và đã xóa thì không tự tạo lại)
function saveOriginal() {
  const m = S.model; if (m.origSaved) return; m.positions = m.positions || []; m.origSaved = true;
  if (!m.positions.some(q => q.orig)) m.positions.unshift({ id: uid('np'), name: 'Original', theta: S.theta, pos: posSnap(), orig: true });
  changed(); toast(T('toast_np_orig')); renderNpMenu();
}
// ---- điểm va chạm đầu tiên của mỗi MP khi chạy → tự lưu "Va chạm N" (một lần mỗi part: cờ L.hitSaved lưu trong .xcc) ----
// chỉ tính lúc chuyển từ KHÔNG chạm sang chạm trong khi chạy (part đang chạm sẵn lúc bấm chạy thì chờ tách ra rồi chạm lại);
// "chạm" = cùng định nghĩa với kiểm tra va chạm (collAt: tiếp xúc mép–mép cũng tính); góc chạm được tinh chỉnh bằng chia đôi bước
S.touchPrev = {};
const hitParts = () => S.model.links.filter(L => L.kind === 'body' && !L.hitSaved);
function touchSet(P) { const s = new Set(); for (const o of collAt(P, false)) { s.add(o.a); s.add(o.b); } return s; }
function hitInit() { S.touchPrev = {}; const ps = hitParts(); if (!ps.length) return; const t = touchSet(S.pos); for (const L of ps) S.touchPrev[L.id] = t.has(L.id); }
function hitCheck(P0, th0, P1, th1) {
  const ps = hitParts().filter(L => L.id in S.touchPrev); if (!ps.length) return;
  const t1 = touchSet(P1);
  for (const L of ps) {
    const now = t1.has(L.id), was = S.touchPrev[L.id]; S.touchPrev[L.id] = now; if (!now || was) continue;
    let a = { P: P0, th: th0 }, b = { P: P1, th: th1 }; // chia đôi: a chưa chạm, b đã chạm
    for (let k = 0; k < 6; k++) { const tm = (a.th + b.th) / 2, Q = stepTo(S.model, S.cons, a.P, a.th, tm, 1 * D2R); if (!Q) break; if (touchSet(Q).has(L.id)) b = { P: Q, th: tm }; else a = { P: Q, th: tm }; }
    const m = S.model, num = Math.max(0, ...(m.positions || []).map(q => +((/^Va chạm (\d+)/.exec(q.name) || [])[1] || 0))) + 1, nm = 'Va chạm ' + num;
    m.positions = m.positions || []; const pos = {}; for (const id in b.P) pos[id] = [+b.P[id].x.toFixed(6), +b.P[id].y.toFixed(6)];
    m.positions.push({ id: uid('np'), name: nm, theta: b.th, pos, hit: L.id }); L.hitSaved = true;
    markDirty(); pushUndo(); toast(T('toast_np_hit', { n: nm, p: L.name, t: (b.th * R2D).toFixed(1) }), 6000); renderNpMenu();
  }
}
function savePosition(name) {
  const m = S.model; m.positions = m.positions || [];
  const pos = posSnap();
  const nm = (name || '').trim() || T('np_default', { n: m.positions.length + 1 });
  m.positions.push({ id: uid('np'), name: nm.slice(0, 32), theta: S.theta, pos }); changed(); toast(T('toast_np_saved', { n: nm })); renderNpMenu();
}
function gotoPosition(id) {
  const np = (S.model.positions || []).find(q => q.id === id); if (!np) return;
  if (S.playing) togglePlay();
  const P = { ...S.pos }; for (const jid in np.pos) if (P[jid]) P[jid] = { x: np.pos[jid][0], y: np.pos[jid][1] };
  // khôi phục ĐÚNG vị trí đã lưu; chỉ khi mô hình có khớp mới (chưa có trong bản lưu) mới giải lại quanh đó
  const missing = Object.keys(S.pos).some(jid => !np.pos[jid]);
  const r = missing ? stepTo(S.model, S.cons, P, np.theta, np.theta, 1 * D2R) : null;
  S.pos = r || P; S.theta = np.theta; S.jamShow = null; afterMove(); closeNpMenu(); toast(T('toast_np_goto', { n: np.name }));
}
function deletePosition(id) { const m = S.model; m.positions = (m.positions || []).filter(q => q.id !== id); changed(); renderNpMenu(); }
function renamePosition(id, name) { const np = (S.model.positions || []).find(q => q.id === id); if (!np || !name.trim()) return; np.name = name.trim().slice(0, 32); changed(); renderNpMenu(); }

let npEl = null;
function npMenuEl() {
  if (npEl) return npEl;
  npEl = document.createElement('div'); npEl.className = 'exmenu npmenu'; npEl.hidden = true; document.body.appendChild(npEl);
  npEl.addEventListener('click', e => {
    const go = e.target.closest('[data-npgo]'), del = e.target.closest('[data-npdel]'), ren = e.target.closest('[data-npren]');
    if (e.target.closest('.npren')) return;
    if (del) { e.stopPropagation(); deletePosition(del.dataset.npdel); return; }
    if (ren) { e.stopPropagation(); startRename(ren.dataset.npren); return; }
    if (go) { gotoPosition(go.dataset.npgo); return; }
    if (e.target.closest('#npSave')) savePosition(npEl.querySelector('#npName').value);
  });
  npEl.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter' && e.target.id === 'npName') savePosition(e.target.value); if (e.key === 'Escape') closeNpMenu(); });
  return npEl;
}
function startRename(id) { // nút ✎: đổi tên ngay trong danh sách
  const np = (S.model.positions || []).find(q => q.id === id), row = npEl.querySelector(`[data-npgo="${id}"]`), nm = row && row.querySelector('.npname'); if (!np || !nm) return;
  const inp = document.createElement('input'); inp.type = 'text'; inp.value = np.name; inp.className = 'npren'; nm.replaceWith(inp); inp.focus(); inp.select();
  let done = false; const fin = ok => { if (done) return; done = true; if (ok) renamePosition(id, inp.value); else renderNpMenu(); };
  inp.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Enter') fin(true); if (ev.key === 'Escape') fin(false); }); inp.addEventListener('blur', () => fin(true));
}
function renderNpMenu() {
  const el = npMenuEl(); if (el.hidden) return; const list = S.model.positions || [];
  el.innerHTML = `<div class="exhead">${T('np_head')}</div>
    <div class="nprow"><input type="text" id="npName" maxlength="32" placeholder="${esc(T('np_default', { n: list.length + 1 }))}"><button class="btn" id="npSave">${T('np_save')}</button></div>
    <div class="nplist">${list.length ? list.map(q => `<div class="npitem" data-npgo="${q.id}" title="${esc(T('np_tip'))}"><span class="npname">${esc(q.name)}</span><span class="npth">θ ${(q.theta * R2D).toFixed(1)}°</span><button class="npdel" data-npren="${q.id}" title="${esc(T('np_ren'))}" aria-label="${esc(T('np_ren'))}">✎</button><button class="npdel" data-npdel="${q.id}" title="${esc(T('del'))}" aria-label="${esc(T('del'))}">×</button></div>`).join('') : `<p class="muted">${T('np_empty')}</p>`}</div>`;
  setTimeout(() => { const n = el.querySelector('#npName'); n && n.focus(); }, 0);
}
function toggleNpMenu(btn) {
  const el = npMenuEl(); if (!el.hidden) { closeNpMenu(); return; }
  closeMenu(); el.hidden = false; btn.setAttribute('aria-expanded', 'true'); renderNpMenu();
  const r = btn.getBoundingClientRect(), w = el.offsetWidth; el.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px'; el.style.top = (r.bottom + 6) + 'px';
}
function closeNpMenu() { if (!npEl) return; npEl.hidden = true; const b = document.querySelector('[data-act=npos]'); b && b.setAttribute('aria-expanded', 'false'); }
document.addEventListener('pointerdown', e => { if (npEl && !npEl.hidden && !npEl.contains(e.target) && !e.target.closest('[data-act=npos]')) closeNpMenu(); });
// nút trên thanh công cụ (ủy quyền sự kiện: thanh công cụ có thể dựng lại khi đổi ngôn ngữ)
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-act=npos], [data-act=nojam]'); if (!b) return;
  if (b.dataset.act === 'npos') toggleNpMenu(b); else toggleIgnoreJam();
});

Object.assign(I18N.vi, {
  t_npos: 'Vị trí đã lưu (named position)', t_nojam: 'Bỏ qua kẹt (mô phỏng tiếp khi thấy báo kẹt vô lý)',
  toast_nojam_on: 'Đang BỎ QUA KẸT: không dừng vì tự hãm ma sát / nêm / ngăn kéo; bước bị hình học chặn thì cho các vật xuyên qua nhau. Bấm lại nút để bật lại kiểm tra.',
  toast_nojam_off: 'Đã bật lại kiểm tra kẹt.',
  np_head: 'Vị trí đã lưu', np_save: 'Lưu vị trí hiện tại', np_default: 'Vị trí {n}', np_empty: 'Chưa có vị trí nào. Đặt tên rồi bấm “Lưu vị trí hiện tại”.',
  toast_np_orig: 'Lần chạy đầu: đã tự lưu vị trí “Original” (mở Vị trí đã lưu để quay lại)', toast_np_hit: '{p} va chạm lần đầu tại θ {t}° — đã tự lưu vị trí “{n}”', np_tip: 'Bấm để quay lại vị trí này', np_ren: 'Đổi tên', toast_np_saved: 'Đã lưu vị trí “{n}”', toast_np_goto: 'Đã quay lại vị trí “{n}”',
});
Object.assign(I18N.en, {
  t_npos: 'Named positions', t_nojam: 'Ignore jams (keep simulating when a jam looks wrong)',
  toast_nojam_on: 'IGNORING JAMS: no stop for friction / wedge / drawer self-locking; a step blocked by geometry lets the bodies pass through. Press the button again to re-enable.',
  toast_nojam_off: 'Jam checking is on again.',
  np_head: 'Named positions', np_save: 'Save current position', np_default: 'Position {n}', np_empty: 'No positions yet. Type a name and press “Save current position”.',
  toast_np_orig: 'First run: saved position “Original” automatically (open Named positions to go back)', toast_np_hit: '{p} first touched at θ {t}° — saved position “{n}” automatically', np_tip: 'Click to go back to this position', np_ren: 'Rename', toast_np_saved: 'Saved position “{n}”', toast_np_goto: 'Back to position “{n}”',
});
