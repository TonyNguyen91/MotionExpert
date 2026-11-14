// ===== Menu chuột phải =====
const ctxEl = document.getElementById('ctx');
function menuItems(h) {
  const it = [];
  if (h.k === 'j') {
    const j = getJ(h.id), ls = linksOf(j.id), mo = motorAt(j.id), own = new Set(ls.map(L => L.id));
    it.push({ head: T('k_joint', { n: esc(j.name) }) }, { label: T('m_edit'), act: () => openPopover(h) }, { sep: 1 });
    it.push({ label: T('m_fixed'), check: j.fixed, act: () => toggleFixed(j.id) });
    const rot = ls.filter(L => L.kind !== 'cyl');
    if (rot.length) for (const L of rot) it.push({ label: T('m_motor', { l: esc(L.name) }), check: mo && mo.link === L.id, act: () => setMotor(j.id, L.id) });
    else it.push({ label: T('m_nomotor'), disabled: true });
    it.push({ sep: 1 });
    const slots = S.model.slots.filter(s => !s.link || !own.has(s.link));
    for (const s of slots) it.push({ label: T('m_slot', { s: esc(s.name), h: s.link ? T('sl_on', { l: esc(getL(s.link).name) }) : T('sl_ground') }), check: j.slot === s.id, act: () => attachSlot(j.id, j.slot === s.id ? null : s.id, true) });
    if (j.slot) it.push({ label: T('m_unslot'), act: () => attachSlot(j.id, null) });
    it.push({ label: T('m_slh'), check: j.slider && Math.abs(j.slider.ang) < 1e-6, act: () => setSlider(j.id, 0) });
    it.push({ label: T('m_slv'), check: j.slider && Math.abs(j.slider.ang * R2D - 90) < 1e-6, act: () => setSlider(j.id, 90) });
    it.push(...pathMenuItems(j)); // chạy theo đường phác thảo
    it.push(...linMotorMenuItems(j)); // motor tịnh tiến đẩy khớp dọc rãnh ngang/dọc/đường
    it.push({ sep: 1 });
    it.push({ label: T('m_trace'), check: !!j.trace, act: () => toggleTrace(j.id) });
    it.push({ label: T('m_lockpos'), check: !!lk(j).pos, disabled: !j.fixed, act: () => toggleLockPos(j.id) });
    it.push({ label: T('m_flip'), disabled: !flippable(j.id), act: () => flipJoint(j.id) });
    it.push({ label: T('m_split'), disabled: ls.length < 2, act: () => splitJoint(j.id) });
    it.push({ sep: 1 }, { label: T('m_deljoint'), danger: 1, act: () => deleteJoint(j.id) });
  } else if (h.k === 'l') {
    const L = getL(h.id);
    it.push({ head: T('k_link', { n: esc(L.name) }) }, { label: T('m_edit'), act: () => openPopover(h) }, { sep: 1 });
    if (L.kind === 'cyl') it.push({ label: T('m_cylmotor'), check: !!cylMotor(L.id), act: () => toggleCylMotor(L.id) });
    else if (isBody(L)) it.push(...addOnLinkItems(L), { sep: 1 }, ...partSlideItems(L), { sep: 1 }, { label: T('m_delpart'), act: () => deletePart(L.id) }); // part: lỗ chốt / điểm vẽ / rãnh + trượt vô hạn
    else {
      it.push({ label: T('m_locklen'), check: !!lk(L).len, act: () => toggleLockLen(L.id) });
      it.push(...addOnLinkItems(L));
    }
    it.push({ sep: 1 }, { label: T('m_dellink'), danger: 1, act: () => deleteLink(L.id) });
  } else if (h.k === 's') {
    const sl = getSlot(h.id);
    it.push({ head: T('k_slot', { n: esc(sl.name) }) }, { label: T('m_edit'), act: () => openPopover(h) }, { sep: 1 }, { label: T('m_delslot'), danger: 1, act: () => deleteSlot(sl.id) });
  } else if (h.k === 'q') {
    return mateMenuItems(h);
  } else if ('pekdr'.includes(h.k)) {
    return skMenuItems(h);
  } else if (h.k === 'm') {
    const m = getMeas(h.id), can = m.kind === 'dist' && m.p[0].j && m.p[1].j;
    it.push({ head: T('k_meas', { n: esc(m.name) }) }, { label: T('m_edit'), act: () => openPopover(h) }, { sep: 1 });
    if (m.kind === 'dist') it.push({ label: can ? T('m_mfixed') : T('m_mfixed_na'), check: !!m.fixed, disabled: !can, act: () => toggleMeasFixed(m.id) });
    it.push({ sep: 1 }, { label: T('m_delmeas'), danger: 1, act: () => deleteMeas(m.id) });
  }
  return it;
}
function openMenu(h, cx, cy) { openItems(menuItems(h), cx, cy); }
function openBoolMenu(ka, kb, cx, cy) {
  const a = regionByKey(ka), b = regionByKey(kb); if (!a || !b || a === b) return;
  const items = [{ head: T('cp_bool', { a: a.name, b: b.name }) },
    { label: T('cp_union'), act: () => createCompound('union', ka, kb) },
    { label: T('cp_sub_ab', { a: a.name, b: b.name }), act: () => createCompound('subtract', ka, kb) },
    { label: T('cp_sub_ab', { a: b.name, b: a.name }), act: () => createCompound('subtract', kb, ka) },
    { label: T('cp_intersect'), act: () => createCompound('intersect', ka, kb) },
    { sep: 1 }, { label: T('cp_skip'), act: () => { S.msel = [S.sel]; draw(); } }];
  openItems(items, cx + 12, cy + 12);
}
function openItems(items, cx, cy) {
  ctxEl.innerHTML = items.map((m, i) => m.head ? `<div class="head">${m.head}</div>` : m.sub ? `<div class="sub">${m.sub}</div>` : m.sep ? '<hr>' :
    `<button role="${m.check !== undefined ? 'menuitemcheckbox' : 'menuitem'}" ${m.check !== undefined ? `aria-checked="${!!m.check}"` : ''} data-i="${i}" class="${m.danger ? 'danger' : ''}" ${m.disabled ? 'disabled' : ''}><span class="ck">${m.check ? '✓' : ''}</span><span>${m.label}</span></button>`).join('');
  ctxEl.hidden = false;
  const r = ctxEl.getBoundingClientRect();
  ctxEl.style.left = Math.max(8, Math.min(cx, innerWidth - r.width - 8)) + 'px';
  ctxEl.style.top = Math.max(8, Math.min(cy, innerHeight - r.height - 8)) + 'px';
  ctxEl.querySelectorAll('button').forEach(b => b.onclick = () => { const m = items[+b.dataset.i]; closeMenu(); m.act(); });
  const first = ctxEl.querySelector('button:not(:disabled)'); first && first.focus();
}
function closeMenu() { ctxEl.hidden = true; }
document.addEventListener('pointerdown', e => { if (!ctxEl.hidden && !ctxEl.contains(e.target)) closeMenu(); });
ctxEl.addEventListener('keydown', e => {
  const bs = [...ctxEl.querySelectorAll('button:not(:disabled)')]; const i = bs.indexOf(document.activeElement);
  if (e.key === 'ArrowDown') { e.preventDefault(); bs[(i + 1) % bs.length].focus(); }
  if (e.key === 'ArrowUp') { e.preventDefault(); bs[(i - 1 + bs.length) % bs.length].focus(); }
});

// ===== Biểu mẫu thông số =====
const LOCK_SVG = on => on
  ? '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2.5" y="6" width="9" height="6.5" rx="1" fill="currentColor"/><path d="M4.5 6V4.2a2.5 2.5 0 0 1 5 0V6"/></svg>'
  : '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2.5" y="6" width="9" height="6.5" rx="1"/><path d="M4.5 6V4.2a2.5 2.5 0 0 1 4.9-.7"/></svg>';
let fseq = 0;
function jointType(j) { if (j.fixed) return motorAt(j.id) ? 'jt_motor' : 'jt_fixed'; if (j.path) return 'jt_path'; if (j.slot) return 'jt_slot'; if (j.slider) return 'jt_slider'; return linksOf(j.id).length > 1 || j.trace ? 'jt_pin' : 'jt_free'; }
function linkTypeText(L) { return L.kind === 'body' ? T('lt_body') : L.kind === 'cyl' ? T('lt_cyl') : L.joints.length === 2 ? T('lt_bar') : T('lt_plate', { n: L.joints.length }); }
function formHTML(sel) {
  const rows = [], fields = []; let extra = '';
  const num = (label, val, unit, onset, o = {}) => {
    const id = 'f' + (fseq++); fields.push({ id, onset, kind: 'num' });
    const lock = o.lock ? `<button class="lockbtn" data-lockact="${o.lock}" aria-pressed="${!!o.locked}" title="${T('lock_tip')}" aria-label="${T('lock_tip')}">${LOCK_SVG(o.locked)}</button>` : '<span></span>';
    rows.push(`<label for="${id}">${label}</label><span class="unit" data-u="${unit}"><input type="text" inputmode="decimal" class="numx" autocomplete="off" spellcheck="false" id="${id}" data-live="${o.live || ''}" value="${(+val).toFixed(o.dec ?? 2)}" ${o.locked || o.ro ? 'readonly' : ''}></span>${lock}`);
  };
  const select = (label, opts, cur, onset) => { const id = 'f' + (fseq++); fields.push({ id, onset, kind: 'sel' }); rows.push(`<label for="${id}">${label}</label><select class="sel span2" id="${id}">${opts.map(([v, t]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`); };
  const info = (label, text) => rows.push(`<label>${label}</label><span class="typetag span2">${text}</span>`);
  const chk = (label, checked, onset) => { const id = 'f' + (fseq++); fields.push({ id, onset, kind: 'chk' }); extraChk.push(`<label class="toggle"><input type="checkbox" id="${id}" ${checked ? 'checked' : ''}><span>${label}</span></label>`); };
  const extraChk = [];
  const o = getAny(sel);
  if (sel.k === 'q') { const ex = mateFormRows(sel, num, select, info); return { html: `<div class="props">${rows.join('')}</div>${ex}<div class="btnrow"><button class="btn danger fdel">${T('del')}</button></div>`, fields }; }
  if ('pekdr'.includes(sel.k)) { const ex = skFormRows(sel, num, select, info, chk); return { html: `<div class="props">${rows.join('')}</div>${extraChk.join('')}${ex}<div class="btnrow"><button class="btn danger fdel">${T('del')}</button></div>`, fields }; }
  info(T('f_type'), sel.k === 'j' ? T(jointType(o)) : sel.k === 'l' ? linkTypeText(o) : sel.k === 's' ? T('t_slot') : T('mk_' + o.kind));
  rows.push(`<label for="nm${fseq}">${T('f_name')}</label><input type="text" class="span2 fname" id="nm${fseq}" value="${esc(o.name)}" maxlength="12">`);
  if (sel.k === 'j') {
    const j = o, p = S.pos[j.id] || j, mo = motorAt(j.id);
    num(T('f_x'), p.x, 'mm', v => setJointXY(j.id, v, (S.pos[j.id] || j).y), { lock: j.fixed ? 'jpos' : null, locked: j.fixed && lk(j).pos, live: 'x', ro: lockedItem(sel) });
    num(T('f_y'), p.y, 'mm', v => setJointXY(j.id, (S.pos[j.id] || j).x, v), { lock: j.fixed ? 'jpos' : null, locked: j.fixed && lk(j).pos, live: 'y', ro: lockedItem(sel) });
    if (mo) { num(T('f_ratio'), mo.ratio ?? 1, '×', v => setRatio(mo.id, v), { step: 0.5 }); select(T('f_drive'), linksOf(j.id).filter(L => L.kind !== 'cyl').map(L => [L.id, L.name]), mo.link, v => setDriveLink(j.id, v)); }
    if (j.slider) num(T('f_slang'), j.slider.ang * R2D, '°', v => setSlotAngle(j.id, v), { step: 1, dec: 1 });
    extra += linMotorFormRows(j, num, select, info);
    if (!j.fixed) { const own = new Set(linksOf(j.id).map(L => L.id)); select(T('f_slot'), [['', T('f_none')], ...S.model.slots.filter(s => !s.link || !own.has(s.link)).map(s => [s.id, s.name])], j.slot || '', v => attachSlot(j.id, v || null, !!v)); }
    extra += `<label class="toggle"><input type="checkbox" class="ftrace" ${j.trace ? 'checked' : ''}><span>${T('f_trace')}</span></label><p class="muted">${T('f_pose_note')}${mo ? ' ' + T('f_ratio_note') : ''}</p>`;
  } else if (sel.k === 'l') {
    const L = o, D = designMap(S.model);
    if (L.kind === 'cyl') {
      const A = S.pos[L.joints[0]], B = S.pos[L.joints[1]];
      num(T('f_ccur'), Math.hypot(B.x - A.x, B.y - A.y), 'mm', () => {}, { ro: true, live: 'cyl' });
      num(T('f_cmin'), L.cyl.min, 'mm', v => setCylStroke(L.id, v, L.cyl.max));
      num(T('f_cmax'), L.cyl.max, 'mm', v => setCylStroke(L.id, L.cyl.min, v));
      const mo = cylMotor(L.id); if (mo) num(T('f_ratio'), mo.ratio ?? 1, '×', v => setRatio(mo.id, v), { step: 0.5 });
      extra += `<label class="toggle"><input type="checkbox" class="fcylm" ${mo ? 'checked' : ''}><span>${T('m_cylmotor')}</span></label><p class="muted">${T('f_cyl_note')}</p>`;
    } else if (L.kind === 'body') {
      // hộp tích bật/tắt nhanh, đặt đầu phần tùy chọn của part
      extra += `<div class="physbox"><label class="toggle"><input type="checkbox" class="fgrav" ${L.grav ? 'checked' : ''}><span>${T('f_grav')} <kbd class="kbd">W</kbd></span></label>`;
      extra += `<label class="toggle"><input type="checkbox" class="fspr" ${L.spr ? 'checked' : ''}><span>${T('f_spr')} <kbd class="kbd">J</kbd></span></label></div>`;
      extra += `<div class="btnrow"><button class="btn fhole">${T('m_addhole_p')}</button><button class="btn fslot">${T('m_addslot')}</button></div>`;
      extra += `<p class="muted">${T('body_note')} ${T('body_locked')}</p><div class="btnrow"><button class="btn danger fdelpart">${T('m_delpart')}</button></div>`;
      extra += `<div class="matbox"><div class="mathead">${T('f_mathead')}</div>${matFormRows(L, num, select)}</div>`;
      if (L.spr) { num(T('f_k'), L.k ?? 0.5, 'N/mm', v => setPartPhys(L.id, 'k', v), { step: 0.05, dec: 2 }); if (L.grav) num(T('f_mass'), L.mass ?? 20, 'g', v => setPartPhys(L.id, 'mass', v), { step: 1, dec: 0 }); }
      if (L.spr) extra += `<div class="btnrow"><button class="btn frest">${T('f_rest')}</button></div>`;
      if (guideDir(L)) {
        extra += `<label class="toggle"><input type="checkbox" class="fguide" ${L.guide ? 'checked' : ''}><span>${T('f_guide')}</span></label>`;
        if (L.guide) {
          num(T('f_glen'), L.guide.len, 'mm', v => setGuide(L.id, 'len', v), { step: 1, dec: 1 }); num(T('f_gx'), L.guide.x, 'mm', v => setGuide(L.id, 'x', v), { step: 1, dec: 1 }); num(T('f_gy'), L.guide.y, 'mm', v => setGuide(L.id, 'y', v), { step: 1, dec: 1 });
          const gs = guideSpan(L, S.pos); if (gs) num(T('f_gcur'), gs.out ? 0 : gs.L, 'mm', () => {}, { ro: true, dec: 1 });
          extra += `<div class="btnrow"><button class="btn fgfit">${T('f_gfit')}</button></div><p class="muted">${T('f_guide_note', { m: muG() })}</p>`;
        }
      }
      if (L.grav || L.spr) extra += `<p class="muted">${S.model.phys === false ? T('f_phys_off') : L.grav && L.spr ? T('f_sag', { s: ((L.mass ?? 20) * 0.00981 / (L.k ?? 0.5)).toFixed(2) }) : L.grav ? T('f_grav_note') : T('f_spr_note')}</p>`;
    }
    else for (const [a, b] of linkPairs(L)) num(T('f_len', { a: esc(jname(a)), b: esc(jname(b)) }), Math.hypot(D[b].x - D[a].x, D[b].y - D[a].y), 'mm', v => setLinkLen(L.id, a, b, v), { lock: 'llen', locked: !!lk(L).len });
    num(T('f_w'), L.w || 6, 'mm', v => setLinkWidth(L.id, v), { step: 0.5, dec: 1 });
    if (L.kind !== 'cyl') {
      num(T('f_layer'), L.layer || 0, '', v => setLinkLayer(L.id, v), { step: 1, dec: 0 }); extra += `<p class="muted">${T('f_layer_note')}</p>`;
      extra += `<label class="toggle"><input type="checkbox" class="fnocoll" ${L.nocoll ? 'checked' : ''}><span>${T('f_nocoll')}</span></label><label class="toggle"><input type="checkbox" class="fsweep" ${L.sweep ? 'checked' : ''}><span>${T('f_sweep')}</span></label>`;
    }
  } else if (sel.k === 's') {
    const sl = o; info(T('f_host'), sl.link ? esc(getL(sl.link).name) : T('sl_ground'));
    if (sl.ent) { const e = SKM().ents.find(q => q.id === sl.ent); info(T('f_spath'), e ? esc(entLabel(e)) : '—'); num(T('f_sll'), slotLen(sl), 'mm', () => {}, { ro: true }); }
    else num(T('f_sll'), Math.hypot(sl.b.x - sl.a.x, sl.b.y - sl.a.y), 'mm', v => setSlotLen(sl.id, v));
    num(T('f_slw'), sl.w, 'mm', v => setSlotW(sl.id, v), { step: 0.5, dec: 1 });
  } else if (sel.k === 'm') {
    const m = o, v = measValue(m), can = m.kind === 'dist' && m.p[0].j && m.p[1].j;
    if (m.kind === 'dist') num(T('f_val'), m.fixed ? m.val : v, 'mm', val => setMeasVal(m.id, val), { ro: !can, live: 'meas' });
    else num(T('f_val'), v, isAngMeas(m) ? '°' : 'mm', () => {}, { ro: true, dec: isAngMeas(m) ? 1 : 2, live: 'meas' });
    if (m.kind === 'dist') extra += `<label class="toggle"><input type="checkbox" class="fmfix" ${m.fixed ? 'checked' : ''} ${can ? '' : 'disabled'}><span>${T('f_fixed')}</span></label><p class="muted">${T('f_meas_note')}</p>`;
  }
  return { html: `<div class="props">${rows.join('')}</div>${extra}<div class="btnrow"><button class="btn danger fdel">${T('del')}</button></div>`, fields };
}
function mountForm(box, sel) {
  if (!sel || !getAny(sel)) { box.innerHTML = `<p class="muted">${T('noSel')}</p>`; return; }
  // dựng lại form khi đang gõ / ↑↓ trên một ô → focus lại đúng ô đó (id ô đổi mỗi lần dựng nên dò theo thứ tự)
  const ae = document.activeElement, q = 'input, select, textarea', fi = ae && box.contains(ae) ? [...box.querySelectorAll(q)].indexOf(ae) : -1;
  const sameSel = fi >= 0 && box._sel && box._sel.k === sel.k && box._sel.id === sel.id;
  const { html, fields } = formHTML(sel); box.innerHTML = html; box._sel = { k: sel.k, id: sel.id };
  if (sameSel) { const el = box.querySelectorAll(q)[fi]; if (el) { el.focus({ preventScroll: true }); if (el.select && el.type === 'text') { const n = el.value.length; el.setSelectionRange(n, n); } } }
  fields.forEach(f => { const el = box.querySelector('#' + f.id); if (!el) return; el.addEventListener('change', () => { if (el.readOnly) return; if (f.kind === 'num') { const v = evalExpr(el.value); if (!isFinite(v)) { el.classList.add('bad'); return; } el.classList.remove('bad'); f.onset(v); } else f.onset(f.kind === 'chk' ? el.checked : el.value); }); });
  box.querySelectorAll('input.numx').forEach(el => el.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); el.blur(); } }));
  const nm = box.querySelector('.fname'); if (nm) nm.addEventListener('change', () => rename(sel, nm.value));
  box.querySelectorAll('[data-lockact]').forEach(b => b.onclick = () => b.dataset.lockact === 'jpos' ? toggleLockPos(sel.id) : toggleLockLen(sel.id));
  const tr = box.querySelector('.ftrace'); if (tr) tr.onchange = () => toggleTrace(sel.id);
  box.querySelectorAll('[data-xf]').forEach(b => b.onclick = () => xfCommit(sel.id, { type: 'mirror', axis: b.dataset.xf }));
  const flm = box.querySelector('.flmotor'); if (flm) flm.onchange = () => toggleLinMotor(sel.id);
  const flr = box.querySelector('.flmrev'), lmo = flr && linMotorOf(sel.id); if (lmo) flr.onchange = () => setMotorOpt(lmo.id, 'rev', flr.checked);
  const cm = box.querySelector('.fcylm'); if (cm) cm.onchange = () => toggleCylMotor(sel.id);
  for (const k of ['grav', 'spr']) { const el = box.querySelector('.f' + k); if (el) el.onchange = () => setPartPhys(sel.id, k, el.checked); }
  for (const k of ['nocoll', 'sweep']) { const el = box.querySelector('.f' + k); if (el) el.onchange = () => setLinkFlag(sel.id, k, el.checked); }
  const fmi = box.querySelector('.fmotinf'); if (fmi) fmi.onchange = () => setMotorInf(fmi.checked);
  const fms = box.querySelector('.fmatshow'); if (fms) fms.onchange = () => setPartMat(sel.id, 'show', fms.checked);
  const fg = box.querySelector('.fguide'); if (fg) fg.onchange = () => setGuide(sel.id, 'on', fg.checked);
  const gf = box.querySelector('.fgfit'); if (gf) gf.onclick = () => setGuide(sel.id, 'fit');
  const fdv = box.querySelector('.fdriven'); if (fdv) fdv.onchange = () => setDimDriven(sel.id, fdv.checked);
  const fdp = box.querySelector('.fdelpart'); if (fdp) fdp.onclick = () => deletePart(fdp.dataset.part || sel.id);
  const rs = box.querySelector('.frest'); if (rs) rs.onclick = () => setPartPhys(sel.id, 'rest');
  const fh = box.querySelector('.fhole'); if (fh) fh.onclick = () => { if (S.playing) togglePlay(); S.addTo = sel.id; setTool('addhole'); };
  const fs = box.querySelector('.fslot'); if (fs) fs.onclick = () => { if (S.playing) togglePlay(); setTool('slot'); S.slotHost = sel.id; updateHint(); };
  const mf = box.querySelector('.fmfix'); if (mf) mf.onchange = () => toggleMeasFixed(sel.id);
  box.querySelector('.fdel').onclick = () => { closePopover(); S.sel = sel; deleteSel(); };
}
function liveValue(sel, key) {
  if (sel.k === 'p') { XF = skXform(true); const q = skP(sel.id, SK.ptMap(S.model.sketch)); return q ? (key === 'skx' ? q.x : q.y) : null; }
  if (sel.k === 'j') { const p = S.pos[sel.id]; return p ? p[key] : null; }
  if (sel.k === 'l' && key === 'cyl') { const L = getL(sel.id), A = S.pos[L.joints[0]], B = S.pos[L.joints[1]]; return Math.hypot(B.x - A.x, B.y - A.y); }
  if (sel.k === 'm' && key === 'meas') return measValue(getMeas(sel.id));
  return null;
}
function renderProps(liveOnly) {
  const box = document.getElementById('props');
  if (liveOnly) {
    for (const [b, sel] of [[box, S.sel], [document.getElementById('popBody'), popSel]]) {
      if (!sel || !getAny(sel)) continue;
      feaFormLive(b);
      b.querySelectorAll('input[data-live]').forEach(el => { const k = el.dataset.live; if (!k || document.activeElement === el) return; const v = liveValue(sel, k); if (v != null) el.value = v.toFixed(k === 'meas' && getMeas(sel.id).kind === 'ang' ? 1 : 2); });
    }
    return;
  }
  if (isMPTool(S.tool)) mpRefreshOpts();
  if (mpPanelActive()) { mountMPPanel(box); return; } // ≥ 2 MP: căn chỉnh / dời / mảng MP
  if (alignActive()) { mountAlignPanel(box); return; }
  mountForm(box, S.sel);
}
const popEl = document.getElementById('pop'); let popSel = null;
function openPopover(sel) {
  popSel = sel; refreshPopover(); popEl.hidden = false;
  const r = popEl.getBoundingClientRect(), sr = stage.getBoundingClientRect();
  popEl.style.left = Math.max(8, Math.min(sr.right - r.width - 12, innerWidth - r.width - 8)) + 'px';
  popEl.style.top = Math.max(8, sr.top + 56) + 'px';
}
function refreshPopover() {
  if (!popSel) return; const o = getAny(popSel); if (!o) { closePopover(); return; }
  document.getElementById('popTitle').textContent = popSel.k === 'e' ? entLabel(o) : popSel.k === 'r' ? T('k_reg', { n: o.name }) : popSel.k === 'p' ? T('k_pt') : popSel.k === 'k' ? consLabel(o) : popSel.k === 'd' ? T('k_dim') : popSel.k === 'q' ? o.name + ' · ' + mateLabel(o) : T({ j: 'k_joint', l: 'k_link', s: 'k_slot', m: 'k_meas' }[popSel.k], { n: o.name });
  mountForm(document.getElementById('popBody'), popSel);
}
function closePopover() { popEl.hidden = true; popSel = null; }
document.getElementById('popClose').onclick = closePopover;
(() => {
  const head = document.getElementById('popHead'); let d = null;
  head.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; const r = popEl.getBoundingClientRect(); d = { x: e.clientX - r.left, y: e.clientY - r.top }; head.setPointerCapture(e.pointerId); });
  head.addEventListener('pointermove', e => { if (!d) return; popEl.style.left = Math.max(0, Math.min(innerWidth - 60, e.clientX - d.x)) + 'px'; popEl.style.top = Math.max(0, Math.min(innerHeight - 40, e.clientY - d.y)) + 'px'; });
  head.addEventListener('pointerup', () => d = null);
})();

// ===== Danh sách thành phần (dọc, lề phải) =====
const TAG_LOCK = `<span class="tag">${LOCK_SVG(true)}`;
function rowHTML(k, id, sw, name, sub, tags) {
  return `<div class="prow" data-k="${k}" data-id="${id}" aria-selected="${isSel(k, id)}">${sw}<div class="main"><div class="nm">${name}${tags || ''}</div><div class="sub">${sub}</div></div><button class="rowmenu" aria-label="Menu">···</button></div>`;
}
function renderList() {
  const m = S.model, P = S.pos; let h = '';
  const group = (key, title, items, empty) => {
    h += `<div class="pgroup" data-g="${key}" data-open="${S.groups[key]}"><button class="ghead"><svg viewBox="0 0 10 10" fill="currentColor"><path d="M1 3h8L5 8z"/></svg>${title}<span class="n">${items.length}</span></button><div class="rows">`;
    h += items.length ? items.join('') : `<div class="emptyrow">${empty}</div>`; h += '</div></div>';
  };
  group('links', T('grp_links'), m.links.map(L => {
    const mo = m.motors.find(x => x.link === L.id || x.cyl === L.id || (x.lin && L.joints.includes(x.lin)) || (x.mate && (m.mates.find(q => q.id === x.mate) || {}).a === L.id));
    let sub;
    if (L.kind === 'cyl') { const A = P[L.joints[0]], B = P[L.joints[1]]; sub = `${T('lt_cyl')} ${Math.hypot(B.x - A.x, B.y - A.y).toFixed(1)} (${L.cyl.min}–${L.cyl.max})`; }
    else sub = linkTypeText(L) + ' · ' + linkPairs(L).slice(0, 3).map(([a, b]) => `${esc(jname(a))}${esc(jname(b))} ${Math.hypot(P[b].x - P[a].x, P[b].y - P[a].y).toFixed(1)}`).join(' · ');
    const tags = (mo ? `<span class="tag motor">${T('tg_drive')}</span>` : '') + (lk(L).len ? TAG_LOCK + '</span>' : '') + (m.features.some(f => f.link === L.id) ? `<span class="tag">+${m.features.filter(f => f.link === L.id).length}</span>` : '') + (L.kind === 'body' && L.mat ? `<span class="tag mat">${esc(matProps(L).name)} ${matProps(L).t}</span>` : '');
    return rowHTML('l', L.id, `<span class="sw" style="background:${linkColorVar(L)}"></span>`, esc(L.name), sub, tags);
  }), T('e_links'));
  group('joints', T('grp_joints'), m.joints.filter(j => !j.hidden).map(j => {
    const mo = motorAt(j.id), p = P[j.id] || j;
    const cls = mo ? 'motor' : j.fixed ? 'fixed' : 'round';
    const tags = (mo ? `<span class="tag motor">${T('tg_motor')}</span>` : '') + (lk(j).pos ? TAG_LOCK + '</span>' : '') + (j.trace ? `<span class="tag">${T('tg_trace')}</span>` : '') + (j.slot ? `<span class="tag">${esc(nameOf('s', j.slot))}</span>` : '');
    return rowHTML('j', j.id, `<span class="sw ${cls}"></span>`, esc(j.name), `${T(jointType(j))} · <span data-c="xy">${p.x.toFixed(1)}, ${p.y.toFixed(1)}</span>`, tags);
  }), T('e_joints'));
  group('slots', T('grp_slots'), m.slots.map(s => rowHTML('s', s.id, '<span class="sw slot"></span>', esc(s.name), `${s.link ? T('sl_on', { l: esc(getL(s.link).name) }) : T('sl_ground')} · ${slotLen(s).toFixed(1)} × ${s.w}`, '')), T('e_slots'));
  skListGroups(group);
  mateListGroup(group);
  group('measures', T('grp_measures'), m.measures.map(me => {
    const v = measValue(me), lbl = me.kind === 'dist' || me.kind === 'ang' ? me.p.map(r => r.j ? esc(jname(r.j)) : '•').join(me.kind === 'ang' ? '∠' : '–') : T('mk_' + me.kind);
    const val = v == null ? '?' : isAngMeas(me) ? v.toFixed(1) + '°' : v.toFixed(2);
    return rowHTML('m', me.id, '<span class="sw meas"></span>', esc(me.name), `${lbl} = <span data-c="mv">${me.fixed ? val : '(' + val + ')'}</span>`, `<span class="tag">${me.fixed ? T('tg_fixed') : T('tg_ref')}</span>`);
  }), T('e_measures'));
  const list = document.getElementById('plist'); list.innerHTML = h;
  list.querySelectorAll('.ghead').forEach(b => b.onclick = () => { const g = b.parentElement.dataset.g; S.groups[g] = !S.groups[g]; b.parentElement.dataset.open = S.groups[g]; });
  list.querySelectorAll('.prow').forEach(r => {
    const hh = { k: r.dataset.k, id: r.dataset.id };
    r.onclick = e => { if (e.target.closest('.rowmenu')) return; S.sel = hh; renderList(); renderProps(); draw(); };
    r.oncontextmenu = e => { e.preventDefault(); S.sel = hh; renderList(); renderProps(); draw(); openMenu(hh, e.clientX, e.clientY); };
    r.onmouseenter = () => { S.hover = hh; draw(); }; r.onmouseleave = () => { S.hover = null; draw(); };
    r.querySelector('.rowmenu').onclick = e => { e.stopPropagation(); S.sel = hh; renderList(); renderProps(); draw(); const rr = e.target.getBoundingClientRect(); openMenu(hh, rr.left - 240, rr.bottom + 4); };
  });
}
function highlightRow() { document.querySelectorAll('.prow').forEach(r => r.style.background = S.hover && r.dataset.k === S.hover.k && r.dataset.id === S.hover.id ? 'var(--hover)' : ''); }
function liveList() {
  document.querySelectorAll('.prow[data-k="j"]').forEach(r => { const p = S.pos[r.dataset.id], c = r.querySelector('[data-c=xy]'); if (p && c) c.textContent = `${p.x.toFixed(1)}, ${p.y.toFixed(1)}`; });
  document.querySelectorAll('.prow[data-k="m"]').forEach(r => { const me = getMeas(r.dataset.id), c = r.querySelector('[data-c=mv]'); if (!me || !c) return; const v = measValue(me); if (v == null) return; const val = me.kind === 'ang' ? v.toFixed(1) + '°' : v.toFixed(2); c.textContent = me.fixed ? val : '(' + val + ')'; });
}

// ===== Phân tích =====
function renderAnalysis() {
  const a = S.an, dl = document.getElementById('analysis'), st = document.getElementById('status'), m = S.model;
  if (!m.links.length) { dl.innerHTML = m.sketch.ents.length ? `<dt>${T('a_skdof')}</dt><dd class="${S.skDof ? 'warn' : 'ok'}">${S.skDof ? S.skDof : T('sk_full')}</dd>` : ''; st.className = 'status-chip warn'; st.textContent = T('st_empty'); return; }
  let rows = `<dt>${T('a_counts')}</dt><dd>${m.links.length} / ${m.joints.length}</dd><dt>${T('a_dof')}</dt><dd>${a.dof}</dd>`;
  rows += `<dt>${T('a_motor')}</dt><dd>${m.motors.map(mo => mo.lin ? esc(jname(mo.lin)) + ' (' + T('m_lmotor') + ')' : mo.mate ? esc(((m.mates.find(q => q.id === mo.mate) || {}).name || '') + ' (' + T('mt_' + ((m.mates.find(q => q.id === mo.mate) || {}).type || 'rev')) + ')') : mo.cyl ? esc(nameOf('l', mo.cyl)) : esc(jname(mo.joint)) + '→' + esc(nameOf('l', mo.link))).join(', ') || '—'}</dd>`;
  if (m.motors.length) { const rng = a.full ? T('a_full') : a.range ? `${a.range[0].toFixed(0)}° … ${a.range[1].toFixed(0)}°` : '—'; rows += `<dt>${T('a_range')}</dt><dd class="${a.full ? 'ok' : 'warn'}">${rng}</dd>`; }
  if (a.minTA != null) { const bad = a.minTA < 40; rows += `<dt>${T('a_ta')} (${esc(jname(a.minTAJoint))})</dt><dd class="${bad ? 'warn' : 'ok'}">${a.minTA.toFixed(1)}°${bad ? ' · ' + T('a_ta_bad') : ''}</dd>`; }
  for (const id in a.traces) { const t = a.traces[id]; rows += `<dt>${T('a_stroke')} ${esc(jname(id))}</dt><dd>${t.w.toFixed(1)} × ${t.h.toFixed(1)} mm</dd>`; }
  for (const tr of S.skTraces) if (tr.pts.length > 1) rows += `<dt>${T('a_stroke')} ${esc(skTraceName(tr.t))}</dt><dd>${tr.w.toFixed(1)} × ${tr.h.toFixed(1)} mm</dd>`;
  if (S.model.sketch.ents.length) rows += `<dt>${T('a_skdof')}</dt><dd class="${S.skDof ? 'warn' : 'ok'}">${S.skDof ? S.skDof : T('sk_full')}</dd>`;
  rows += insightRows();
  rows += collAnalysisRows();
  rows += feaAnalysisRows();
  document.getElementById('optPhys').checked = physOn();
  { const el = document.getElementById('optMu'); if (document.activeElement !== el) el.value = mu(); }
  { const el = document.getElementById('optMuG'); if (document.activeElement !== el) el.value = muG(); }
  dl.innerHTML = rows;
  const free = a.dof - m.motors.length, lim = m.drive.limit;
  st.dataset.fd = m.motors.length && free > 0 ? '1' : ''; st.title = st.dataset.fd ? T('fd_tip') : ''; renderFreeDof();
  if (!m.motors.length) { st.className = 'status-chip warn'; st.textContent = T('st_nomotor'); }
  else if (free < 0) { st.className = 'status-chip bad'; st.textContent = T('st_over'); }
  else if (!a.full && a.range && a.range[0] === a.range[1]) { st.className = 'status-chip bad'; st.textContent = T('st_lock'); }
  else if (free > 0) { st.className = 'status-chip warn'; st.textContent = T('st_under', { n: free }); }
  else if (lim.on) { st.className = 'status-chip ok'; st.textContent = T('st_limited', { a: lim.min.toFixed(0), b: lim.max.toFixed(0) }); }
  else if (a.full) { st.className = 'status-chip ok'; st.textContent = T('st_full'); }
  else { st.className = 'status-chip warn'; st.textContent = T('st_rock'); }
}
function renderAll() { if (SY.model !== S.model) { SY.model = S.model; SY.results = null; SY.sel = -1; if (SY.open) renderSynth(); } computeSkTraces(); renderAnalysis(); renderList(); renderProps(); refreshPopover(); renderDock(); renderTracePanel(); draw(); }
