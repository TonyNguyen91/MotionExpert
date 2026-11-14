// ===== Thanh công cụ (sinh bằng mã) =====
const I = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"${extra}>${d}</svg>`;
const TOOLBAR = [
  { g: 'g_file', tools: [
    { act: 'examples', i: '<rect x="3" y="4" width="8" height="7" rx="1"/><rect x="13" y="4" width="8" height="7" rx="1"/><rect x="3" y="13" width="8" height="7" rx="1"/><path d="M14 16.5l3 3 3-3"/>' },
    { act: 'dxf', i: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M12 10v7M9 14l3 3 3-3"/>' },
    { act: 'media', i: '<rect x="3" y="5" width="13" height="14" rx="2"/><path d="M16 10l5-3v10l-5-3z"/><path d="M8 9.5v5l4-2.5z"/>' },
    { act: 'step', i: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>' },
  ] },
  { g: 'g_edit', tools: [{ id: 'select', i: '<path d="M6 3l11 8.5-5 1.1 2.3 5.6-2.2.9-2.3-5.8L6 17z"/>' }] },
  { g: 'g_mech', tools: [
    { id: 'link', k: 'N', i: '<path d="M6 18L18 6" stroke-width="5" opacity=".22"/><path d="M6 18L18 6"/><circle cx="6" cy="18" r="2.4" fill="var(--panel)"/><circle cx="18" cy="6" r="2.4" fill="var(--panel)"/>' },
    { id: 'plate', k: 'P', i: '<path d="M4 19L20 17L11 4Z" fill="currentColor" fill-opacity=".15"/><circle cx="4" cy="19" r="2.2" fill="var(--panel)"/><circle cx="20" cy="17" r="2.2" fill="var(--panel)"/><circle cx="11" cy="4" r="2.2" fill="var(--panel)"/>' },
    { id: 'cyl', k: 'Y', i: '<rect x="3" y="9" width="11" height="6" rx="1.5" fill="currentColor" fill-opacity=".15"/><path d="M14 12h6"/><circle cx="3.5" cy="12" r="1.8" fill="var(--panel)"/><circle cx="20.5" cy="12" r="1.8" fill="var(--panel)"/>' },
    { id: 'slot', k: 'S', i: '<rect x="3" y="9" width="18" height="6" rx="3"/><circle cx="14" cy="12" r="1.6" fill="currentColor"/>' },
      { act: 'synth', i: '<path d="M4 20L9 9l7 2 4 9" opacity=".45"/><path d="M9 9l7 2"/><path d="M14 3l2 3-3 1z" fill="currentColor"/><path d="M18 6l2 3-3 1z" fill="currentColor"/><circle cx="4" cy="20" r="1.6" fill="currentColor"/><circle cx="20" cy="20" r="1.6" fill="currentColor"/>' },
  ] },
  { g: 'g_sketch', tools: [
    { id: 'sk_line', k: 'L', i: '<path d="M5 19L19 5"/><rect x="3" y="17" width="4" height="4" fill="var(--panel)"/><rect x="17" y="3" width="4" height="4" fill="var(--panel)"/>' },
    { id: 'sk_arc', k: 'A', i: '<path d="M4 18A10 10 0 0 1 20 18"/><circle cx="4" cy="18" r="1.6" fill="currentColor"/><circle cx="20" cy="18" r="1.6" fill="currentColor"/><circle cx="12" cy="8.5" r="1.6" fill="currentColor"/>' },
    { id: 'sk_tarc', i: '<path d="M3 19h8"/><path d="M11 19a8 8 0 0 0 8-8"/><circle cx="11" cy="19" r="1.6" fill="currentColor"/><circle cx="19" cy="11" r="1.6" fill="currentColor"/>' },
    { id: 'sk_carc', i: '<path d="M5 15a8 8 0 0 1 14 0"/><circle cx="12" cy="15" r="1.6" fill="currentColor"/><path d="M12 15L5 15" stroke-dasharray="2 2"/>' },
    { id: 'sk_circle', k: 'C', i: '<circle cx="12" cy="12" r="8"/><path d="M12 12l5.6-5.6" stroke-dasharray="2 2"/><path d="M10.5 12h3M12 10.5v3"/>' },
    { id: 'sk_circle3', i: '<circle cx="12" cy="12" r="8"/><circle cx="4" cy="12" r="1.6" fill="currentColor"/><circle cx="17.7" cy="6.3" r="1.6" fill="currentColor"/><circle cx="16" cy="19" r="1.6" fill="currentColor"/>' },
    { id: 'sk_crect', k: 'R', i: '<rect x="4" y="6" width="16" height="12"/><path d="M4 6l16 12M20 6L4 18" stroke-dasharray="2 2" opacity=".6"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/>' },
    { id: 'sk_rect', k: 'G', i: '<rect x="4" y="6" width="16" height="12"/><rect x="2.5" y="4.5" width="3" height="3" fill="var(--panel)"/><rect x="18.5" y="16.5" width="3" height="3" fill="var(--panel)"/>' },
    { id: 'sk_spline', i: '<path d="M3 17C7 3 11 21 15 9s5-3 6-4"/><circle cx="3" cy="17" r="1.5" fill="currentColor"/><circle cx="12" cy="13" r="1.5" fill="currentColor"/><circle cx="21" cy="5" r="1.5" fill="currentColor"/>' },
    { id: 'sk_point', k: 'Shift+S', i: '<circle cx="12" cy="12" r="2.6" fill="currentColor"/><path d="M12 4v4M12 16v4M4 12h4M16 12h4" opacity=".5"/>' },
    { act: 'cs', k: 'Q', i: '<path d="M4 20L20 4" stroke-dasharray="3 3"/>' },
  ] },
  { g: 'g_cons', tools: [
    { id: 'cn_coinc', k: 'I', i: '<path d="M4 18L12 12M20 18L12 12"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/>' },
    { id: 'cn_conc', k: 'Shift+O', i: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/>' },
    { id: 'cn_par', k: 'B', i: '<path d="M5 19L13 5M11 19L19 5"/>' },
    { id: 'cn_tan', k: 'T', i: '<circle cx="11" cy="13" r="6"/><path d="M3 7h18"/>' },
    { id: 'cn_horiz', k: 'H', i: '<path d="M4 12h16"/><path d="M4 9v6M20 9v6" opacity=".55"/>' },
    { id: 'cn_vert', k: 'V', i: '<path d="M12 4v16"/><path d="M9 4h6M9 20h6" opacity=".55"/>' },
    { id: 'cn_perp', k: 'Shift+L', i: '<path d="M5 19h14M12 19V5"/><path d="M12 15h4v4" opacity=".6"/>' },
    { id: 'cn_eq', k: 'E', i: '<path d="M5 9h14M5 15h14"/>' },
    { id: 'cn_mid', k: 'Shift+M', i: '<path d="M4 16h16"/><circle cx="12" cy="16" r="2.4" fill="currentColor"/><path d="M12 5v6" stroke-dasharray="2 2"/>' },
    { id: 'cn_sym', k: 'Shift+Q', i: '<path d="M12 3v18" stroke-dasharray="2 2"/><circle cx="6" cy="10" r="2.2" fill="currentColor"/><circle cx="18" cy="10" r="2.2" fill="currentColor"/>' },
    { id: 'cn_fix', k: 'Shift+J', i: '<circle cx="12" cy="9" r="3" fill="currentColor"/><path d="M12 12v4M5 18h14M7 18l-2 3M11 18l-2 3M15 18l-2 3M19 18l-2 3"/>' },
    { id: 'cn_dim', k: 'D', i: '<path d="M4 8v8M20 8v8M4 12h16"/><path d="M7 10l-3 2 3 2M17 10l3 2-3 2"/>' },
  ] },
  { g: 'g_modify', tools: [
    { id: 'ed_fillet', k: 'Shift+F', i: '<path d="M5 20V12a7 7 0 0 1 7-7h8"/><path d="M5 5h3M5 5v3" opacity=".45"/>' },
    { id: 'ed_trim', k: 'M', i: '<circle cx="7" cy="17" r="3"/><circle cx="17" cy="17" r="3"/><path d="M9 15L17 4M15 15L7 4"/>' },
    { id: 'ed_extend', k: 'X', i: '<path d="M3 12h10" /><path d="M13 12h5" stroke-dasharray="2 2"/><path d="M20 5v14"/><path d="M15 9l3 3-3 3"/>' },
    { id: 'ed_split', i: '<path d="M3 12h7M14 12h7"/><path d="M12 6v12" stroke-dasharray="2 2"/>' },
    { id: 'ed_offset', k: 'O', i: '<path d="M4 18C6 8 12 6 20 6"/><path d="M8 20C9 13 13 10 20 10" stroke-dasharray="3 2"/>' },
    { id: 'ed_mirror', i: '<path d="M12 3v18" stroke-dasharray="2 2"/><path d="M9 7L4 17h5z"/><path d="M15 7l5 10h-5z" opacity=".55"/>' },
    { id: 'ed_lpat', i: '<rect x="2.5" y="9" width="5" height="6"/><rect x="9.5" y="9" width="5" height="6" opacity=".7"/><rect x="16.5" y="9" width="5" height="6" opacity=".45"/>' },
    { id: 'ed_cpat', i: '<circle cx="12" cy="12" r="7" stroke-dasharray="2 3" opacity=".6"/><circle cx="12" cy="5" r="2" fill="currentColor"/><circle cx="18.1" cy="15.5" r="2" fill="currentColor"/><circle cx="5.9" cy="15.5" r="2" fill="currentColor"/>' },
  ] },
  { g: 'g_mate', tools: [
    { id: 'mk_part', k: 'K', i: '<path d="M5 6h10l4 4v8H5z" fill="currentColor" fill-opacity=".18"/><path d="M15 6v4h4"/><path d="M9 13l2 2 4-4"/>' },
    { id: 'addhole', k: 'Shift+H', i: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.4" fill="currentColor"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4" opacity=".55"/>' },
    { id: 'ph_grav', k: 'W', i: '<rect x="7" y="3" width="10" height="7" rx="1.5" fill="currentColor" fill-opacity=".18"/><path d="M12 11v8M8.5 15.5L12 19l3.5-3.5"/><path d="M4 21h16" opacity=".5"/>' },
    { id: 'ph_spr', k: 'J', i: '<path d="M4 12h2l1.5-4 3 8 3-8 3 8 1.5-4h2"/><path d="M3 7v10M21 7v10" opacity=".5"/>' },
    { id: 'mt_fix', i: '<path d="M7 4h10v8H7z" fill="currentColor" fill-opacity=".15"/><path d="M12 12v3M4 18h16M6 18l-2 3M10 18l-2 3M14 18l-2 3M18 18l-2 3"/>' },
    { id: 'mt_rev', i: '<circle cx="12" cy="12" r="3"/><path d="M12 12L4 18M12 12l8-7" stroke-width="3" opacity=".35"/><path d="M17 15a6 6 0 0 1-9 2" /><path d="M8 17l-.5-2.5L10 15"/>' },
    { id: 'mt_sld', i: '<rect x="3" y="14" width="18" height="5" rx="1" opacity=".4"/><rect x="8" y="7" width="8" height="7" rx="1"/><path d="M4 10h3M17 10h3M5 9l-1.5 1L5 11M19 9l1.5 1L19 11"/>' },
    { id: 'mt_par', i: '<rect x="3" y="4" width="10" height="6" rx="1" opacity=".5"/><rect x="9" y="14" width="12" height="6" rx="1" opacity=".5"/><path d="M3 12h18" stroke-dasharray="2 2"/>' },
    { id: 'mt_eq', i: '<circle cx="8" cy="12" r="5"/><circle cx="17" cy="12" r="4"/><path d="M6 10l2 2-2 2M19 10l-2 2 2 2"/>' },
    { id: 'mt_cnt', i: '<path d="M3 18h18"/><path d="M12 18L7 8h10z"/>' },
    { id: 'mt_tan', i: '<circle cx="12" cy="10" r="6"/><path d="M3 16h18"/><circle cx="12" cy="10" r="1.2" fill="currentColor"/>' },
  ] },
  { g: 'g_mp', tools: [
    { id: 'mp_move', i: '<path d="M8 8h8v8H8z" fill="currentColor" fill-opacity=".18"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/><path d="M10 4l2-2 2 2M10 20l2 2 2-2M4 10l-2 2 2 2M20 10l2 2-2 2"/>' },
    { id: 'mp_rot', i: '<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/>' },
    { id: 'mp_align', i: '<path d="M4 3v18"/><rect x="4" y="5" width="14" height="5" rx="1" fill="currentColor" fill-opacity=".2"/><rect x="4" y="14" width="9" height="5" rx="1" fill="currentColor" fill-opacity=".2"/>' },
    { id: 'mp_lpat', i: '<path d="M2 9h5l1.5 2v5H2z" fill="currentColor" fill-opacity=".25"/><path d="M9.5 9h5l1.5 2v5H9.5z" fill="currentColor" fill-opacity=".14" opacity=".75"/><path d="M17 9h5v7h-5z" opacity=".45"/><path d="M3 5h17M17.5 3l2.5 2-2.5 2" opacity=".7"/>' },
    { id: 'mp_mirror', i: '<path d="M12 3v18" stroke-dasharray="2 2"/><path d="M9.5 7L4 18h5.5z" fill="currentColor" fill-opacity=".25"/><path d="M14.5 7L20 18h-5.5z"/>' },
    { id: 'mp_cpat', i: '<circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="8" stroke-dasharray="2 3" opacity=".5"/><rect x="9.5" y="1.5" width="5" height="4" rx=".8" fill="currentColor" fill-opacity=".25"/><rect x="16.5" y="13" width="5" height="4" rx=".8" transform="rotate(120 19 15)" opacity=".7"/><rect x="2.5" y="13" width="5" height="4" rx=".8" transform="rotate(240 5 15)" opacity=".45"/>' },
  ] },
  { g: 'g_measure', tools: [
    { id: 'mdist', k: 'Shift+D', i: '<path d="M4 8v8M20 8v8M4 12h16"/><circle cx="4" cy="12" r="1.6" fill="currentColor"/><circle cx="20" cy="12" r="1.6" fill="currentColor"/>' },
  ] },
  { g: 'g_ref', tools: [{ act: 'bg', i: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><circle cx="9" cy="10" r="1.8"/><path d="M3 17l5-5 4 4 3-3 6 6"/>' }] },
  { g: null, tools: [{ act: 'npos', i: '<path d="M6 3h12v18l-6-4-6 4z"/><path d="M9 8h6M9 11h4" opacity=".6"/>' },
    { act: 'nojam', i: '<circle cx="12" cy="12" r="8"/><path d="M6.5 6.5l11 11"/><path d="M9 4.6l1.5 2.6M15 19.4l-1.5-2.6" opacity=".5"/>' },
    { act: 'reset', k: 'Home', i: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v5h5"/><circle cx="12" cy="12" r="2" fill="currentColor"/>' }, { act: 'delete', k: 'Del', i: '<path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13"/>' }] },
];
function bodyDragStart(lid, w, mode = 'move') {
  if (S.playing) togglePlay(); commitPose(); const L = getL(lid), start = designMap(S.model);
  const r = S.regions.find(q => q.feature && q.feature.link === lid);
  let c; if (r) { const o = regionCentroid(r), f = XF[lid]; c = f ? f(o) : o; } else { const ps = L.joints.map(id => start[id]); c = { x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length }; }
  const free = !(S.model.mates || []).some(m => m.a === lid || m.b === lid) && L.joints.every(id => !getJ(id).fixed && linksOf(id).length === 1 && !S.model.motors.some(mo => mo.joint === id));
  if (L.joints.some(id => getJ(id).fixed) && L.joints.every(id => getJ(id).fixed)) toast(T('toast_body_fixed'));
  return { kind: 'body', lid, id: L.joints[0], mode, start, w0: w, c, free, moved: false };
}
function bodyDragMove(d, w) {
  const L = getL(d.lid), tg = {};
  if (d.mode === 'rot') { const a = Math.atan2(w.y - d.c.y, w.x - d.c.x) - Math.atan2(d.w0.y - d.c.y, d.w0.x - d.c.x), co = Math.cos(a), si = Math.sin(a);
    for (const id of L.joints) { const p = d.start[id], x = p.x - d.c.x, y = p.y - d.c.y; tg[id] = { x: d.c.x + x * co - y * si, y: d.c.y + x * si + y * co }; } }
  else { const dx = w.x - d.w0.x, dy = w.y - d.w0.y; for (const id of L.joints) tg[id] = { x: d.start[id].x + dx, y: d.start[id].y + dy }; }
  S.pos = d.free ? { ...d.start, ...tg } : dragSolveMulti(tg, d.start);
}
function toolTitle(t) { const key = t.id ? 't_' + t.id.replace(/^cn_/, 'c_').replace(/^sk_/, 's').replace(/^ed_/, 'e_') : 't_' + t.act; return T(key) + (t.k ? ` (${t.k})` : ''); }
function renderToolbar() {
  const bar = document.getElementById('toolbar');
  bar.innerHTML = TOOLBAR.map(g => `<div class="tgroup"><span class="tg-label">${g.g ? T(g.g) : '&nbsp;'}</span><div class="tg-row">${g.tools.map(t => {
    const title = esc(toolTitle(t));
    return t.id ? `<button class="tool ic" data-tool="${t.id}" aria-pressed="${S.tool === t.id}" title="${title}" aria-label="${title}">${I(t.i)}</button>`
      : `<button class="tool ic" data-act="${t.act}" ${t.act === 'cs' ? `aria-pressed="${S.csMode}"` : ''} title="${title}" aria-label="${title}">${I(t.i)}</button>`;
  }).join('')}</div></div>`).join('');
  bar.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => pickTool(b.dataset.tool));
  bar.querySelector('[data-act=delete]').onclick = deleteSel;
  bar.querySelector('[data-act=reset]').onclick = resetPose;
  bar.querySelector('[data-act=examples]').onclick = ev => toggleExamples(ev.currentTarget);
  bar.querySelector('[data-act=dxf]').onclick = exportDXF;
  bar.querySelector('[data-act=synth]').onclick = () => { SY.open = !SY.open; if (!SY.open && S.tool.startsWith('syn')) setTool('select'); renderSynth(); draw(); };
  bar.querySelector('[data-act=media]').onclick = () => openExportDialog('media');
  bar.querySelector('[data-act=step]').onclick = () => openExportDialog('step');
  bar.querySelector('[data-act=bg]').onclick = () => document.getElementById('bgFile').click();
  bar.querySelector('[data-act=cs]').onclick = () => {
    const ids = S.msel.filter(p => p.k === 'e').map(p => p.id); if (ids.length) { toggleCs(ids); return; }
    S.csMode = !S.csMode; bar.querySelector('[data-act=cs]').setAttribute('aria-pressed', S.csMode);
  };
}
function pickTool(t) {
  if ((t === 'ph_grav' || t === 'ph_spr') && selectedParts().length) { togglePartPhys(selectedParts(), t === 'ph_grav' ? 'grav' : 'spr'); setTool('select'); return; }
  if (t === 'mk_part' && togglePartSel()) { setTool('select'); return; } // K: CP ⇄ part theo lựa chọn hiện tại
  if (t.startsWith('cn_')) { const type = t.slice(3); if (S.msel.length && applyConsToSelection(type)) { renderAll(); return; } }
  setTool(t);
}

// ===== Chuột trên bản vẽ =====
let drag = null;
function evXY(ev) { const r = cv.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }
function snapModeFor(t) { return ['link', 'plate', 'cyl'].includes(t) ? 'joint' : 'pt'; }
function bgHit(w) { // trong khung ảnh (đã xoay)
  const bg = S.model.bg; if (!bg || bg.lock || bg.show === false || !S.bgImg || !S.bgImg.naturalWidth) return false;
  const l = bgToLocal(bg, w); return Math.abs(l.u) <= bg.w / 2 && Math.abs(l.v) <= bgH(bg) / 2;
}
let lastEv = null, lastRUp = 0;
cv.addEventListener('pointerdown', ev => {
  lastEv = ev;
  if (ev.button === 2) { // chuột phải: kéo biên dạng kín hoặc mở menu khi thả
    closeMenu(); hideSpeed(); const [x, y] = evXY(ev); cv.setPointerCapture(ev.pointerId);
    S.rdown = { x, y, cx: ev.clientX, cy: ev.clientY, h: S.tool === 'select' ? hitRegion(x, y) : null };
    return;
  }
  closeMenu(); hideSpeed();
  const [x, y] = evXY(ev); cv.setPointerCapture(ev.pointerId);
  if (ev.button === 1) { drag = { kind: 'pan', x, y, ox: S.view.ox, oy: S.view.oy, moved: true }; return; }
  if (S.tool === 'pathpick') { pathPick(x, y); return; } // chọn nét làm đường dẫn cho khớp
  if (S.tool.startsWith('syn')) { drag = synDown(x, y); return; } // tổng hợp: đặt tư thế / gối mong muốn
  if (S.tool === 'select') return selectDown(x, y, ev.shiftKey || ev.ctrlKey || ev.metaKey);
  if (S.tool.startsWith('mt_')) { matePick(x, y); return; }
  if (S.tool === 'mk_part') { partPick(x, y); return; }
  if (isMPTool(S.tool)) { drag = mpDown(x, y, ev); return; } // nhóm Moving Part: chọn / dời / căn / mảng MP
  if (S.tool === 'ph_grav' || S.tool === 'ph_spr') { physPick(x, y); return; }
  if (S.tool === 'ed_trim') { skBegin(); drag = trimStrokeStart(x, y); return; } // Trim: bấm hoặc giữ kéo lê
  if (S.tool === 'ed_lpat' || S.tool === 'ed_cpat') { skBegin(); if (S.pat) drag = patDown(x, y); return; }
  if (isSkTool(S.tool)) { skBegin(); const first = S.tool === 'sk_line' ? !S.skd.last : !(S.skd.clicks && S.skd.clicks.length); skToolDown(x, y); S.skPress = first && ['sk_line', 'sk_rect', 'sk_crect', 'sk_circle'].includes(S.tool) ? { x, y } : null; return; }
  toolClick(x, y);
});
function selectDown(x, y, add) {
  const w = s2w(x, y);
  const gz = hitGizmo(x, y); if (gz && !lockedItem(S.sel)) { drag = xfDragStart(S.sel.id, gz, x, y); return; }
  const sh = synHit(x, y); if (sh) { drag = { kind: 'syn', h: sh, moved: false }; return; } // kéo tư thế tổng hợp
  const bh = bgHandleHit(x, y); if (bh) { drag = bgXfStart(bh, x, y); return; } // tay nắm ảnh nền: góc = đổi kích thước, tròn = xoay
  const h = hitAny(x, y);
  if (h) {
    const skKind = 'pekdr'.includes(h.k);
    const boolA = !add && h.k === 'r' && S.sel && S.sel.k === 'r' && S.sel.id !== h.id && regionByKey(S.sel.id) ? S.sel.id : null;
    const mech = isMechSel(h);
    let was = false;
    if (skKind || mech) { // bấm liên tiếp = chọn thêm: phác thảo với phác thảo, khớp/khâu với khớp/khâu (khác nhóm → bắt đầu lại)
      if (S.msel.some(o => isMechSel(o) !== mech)) S.msel = S.sel && S.msel.some(o => o.k === S.sel.k && o.id === S.sel.id) && isMechSel(S.sel) === mech ? [S.sel] : [];
      was = S.msel.some(o => o.k === h.k && o.id === h.id); if (!was) S.msel.push(h); S.sel = h;
    }
    else { S.sel = h; S.msel = []; }
    renderList(); renderProps(); refreshPopover();
    if (h.k !== 'd' && h.k !== 'm' && lockedItem(h)) drag = { kind: 'locked', x0: x, y0: y, moved: false }; // part khóa: chọn được, không kéo được
    else if (h.k === 'j') {
      const j = getJ(h.id);
      if (j.fixed && lk(j).pos) { toast(T('toast_locked')); draw(); return; }
      if (S.playing) togglePlay();
      commitPose();
      drag = { kind: 'joint', id: h.id, start: designMap(S.model), moved: false };
    } else if (h.k === 'm') drag = { kind: 'meas', id: h.id };
    else if ('ped'.includes(h.k)) drag = skDragStart(h, w);
    else if (h.k === 'l' && isBody(getL(h.id))) drag = bodyDragStart(h.id, w);
    else if (h.k === 'r') { const r = regionByKey(h.id), L = r && r.feature && getL(r.feature.link); drag = isBody(L) ? bodyDragStart(L.id, w) : xfDragStart(h.id, 'move', x, y); }
    if (boolA) { S.msel = [{ k: 'r', id: boolA }, h]; if (drag) { drag.boolA = boolA; drag.cxy = [lastEv.clientX, lastEv.clientY]; } }
    else if (was) { if (drag) drag.unsel = h; else unselect(h); } // đã chọn rồi: thả chuột mà không kéo → bỏ chọn
    draw(); return;
  }
  if (bgHit(w)) { drag = { kind: 'bg', last: w, moved: false }; return; }
  drag = { kind: 'box', add }; S.boxSel = { x0: x, y0: y, x1: x, y1: y, add }; // kéo trái trên chỗ trống: quét chọn (trái→phải: nằm trọn · phải→trái: chạm)
}
cv.addEventListener('pointermove', ev => {
  const [x, y] = evXY(ev); const w = s2w(x, y); S.cursor = { x, y, w }; lastEv = ev;
  if (S.rdown && !drag && !S.rdown.h && Math.hypot(x - S.rdown.x, y - S.rdown.y) > 4) { drag = { kind: 'pan', x: S.rdown.x, y: S.rdown.y, ox: S.view.ox, oy: S.view.oy, moved: true, right: true }; } // kéo phải trên chỗ trống: dời màn hình
  if (S.rdown && !drag && S.rdown.h && Math.hypot(x - S.rdown.x, y - S.rdown.y) > 4) {
    const mode = ev.shiftKey ? 'rot' : (ev.ctrlKey || ev.altKey) ? 'scale' : 'move';
    S.sel = S.rdown.h; S.msel = [S.rdown.h]; const rr = regionByKey(S.rdown.h.id), BL = rr && rr.feature && getL(rr.feature.link);
    drag = isBody(BL) ? (lockToast(), { kind: 'locked', moved: true }) : xfDragStart(S.rdown.h.id, mode, S.rdown.x, S.rdown.y); if (drag) { drag.right = true; renderList(); renderProps(); }
  }
  document.getElementById('coord').textContent = `x ${w.x.toFixed(1)} · y ${w.y.toFixed(1)} mm`;
  if (drag) return dragMove(x, y, w);
  const t = S.tool;
  if (t.startsWith('sk_')) { if (S.skPress && ev.buttons !== 1) S.skPress = null; S.snap = skSnap(x, y, { from: S.skd.lastP, closeId: t === 'sk_spline' && S.skd.clicks && S.skd.clicks[0] && S.skd.clicks[0].t === 'sp' ? S.skd.clicks[0].id : null }); skTrack(); draw(); return; }
  if (t.startsWith('mt_')) {
    S.snap = ['fix', 'rev', 'sld', 'cnt'].includes(t.slice(3)) && !S.mpick.length ? skSnap(x, y, { parts: true }) : null;
    const eh = hitSketch(x, y, 'e'), bid = bodyAt(x, y); S.hover = eh || (bid ? { k: 'l', id: bid } : null); cv.style.cursor = 'crosshair'; draw(); return;
  }
  if (t === 'ed_offset' && S.offs) { offsetMove(w); S.hover = hitSketch(x, y, 'e'); draw(); return; }
  if (t.startsWith('cn_') || t.startsWith('ed_')) {
    S.snap = null; let h = null;
    if (t === 'ed_fillet') { const pid = cornerPointNear(x, y); h = pid ? { k: 'p', id: pid } : null; }
    else h = hitSketch(x, y, t.startsWith('cn_') ? 'pe' : 'e');
    S.hover = h; cv.style.cursor = h ? 'pointer' : 'crosshair'; draw(); return;
  }
  if (isMPTool(t)) { mpHover(x, y); return; }
  if (t !== 'select') {
    if (t === 'addhole' || t === 'addpt') { const j = hitJoint(x, y); S.snap = j ? { t: 'j', id: j, p: { ...S.pos[j] }, label: T('sn_joint', { n: jname(j) }) } : skSnap(x, y, { parts: true }); draw(); return; }
    if (t === 'slot' && !S.draft.length) { S.snap = snapAt(x, y, 'pt'); const l = hitLink(x, y); const host = S.slotHost || l; if (host) S.snap.label = T('t_slot') + ' ' + T('sl_on', { l: getL(host).name }); }
    else S.snap = snapAt(x, y, snapModeFor(t), {});
    if (t === 'mdist') { const eh = S.snap.t === 'grid' ? hitSketch(x, y, 'e') : null, e = eh && SKM().ents.find(q => q.id === eh.id); S.hover = e && e.type === 'line' ? eh : null; if (S.hover) S.snap = null; cv.style.cursor = S.hover ? 'pointer' : 'crosshair'; }
    draw(); return;
  }
  const h = hitAny(x, y);
  const same = (h && S.hover && h.k === S.hover.k && h.id === S.hover.id) || (!h && !S.hover);
  S.hover = h; const gz = hitGizmo(x, y), bh = !gz && bgHandleHit(x, y); cv.style.cursor = gz === 'rot' || (bh && bh.k === 'rot') ? 'alias' : gz === 'scale' || bh ? 'nwse-resize' : h ? ('jper'.includes(h.k) ? 'move' : 'pointer') : (bgHit(w) ? 'move' : 'grab');
  if (!same) { draw(); highlightRow(); }
});
function dragMove(x, y, w) {
  if (drag.kind === 'locked') { if (!drag.moved && Math.hypot(x - drag.x0, y - drag.y0) > 4) { drag.moved = true; lockToast(); } return; }
  if (drag.kind === 'pathandle') { patDrag(x, y); return; }
  if (drag.kind === 'mpmove' || drag.kind === 'mppathandle') { mpDragMove(drag, x, y, w); return; }
  if (drag.kind === 'box') { S.boxSel.x1 = x; S.boxSel.y1 = y; draw(); return; }
  if (drag.kind === 'pan') { if (Math.abs(x - drag.x) + Math.abs(y - drag.y) > 3) drag.moved = true; S.view.ox = drag.ox - (x - drag.x) / S.view.s; S.view.oy = drag.oy + (y - drag.y) / S.view.s; draw(); return; }
  if (drag.kind === 'joint') {
    const j = getJ(drag.id); const own = new Set(linksOf(j.id).map(L => L.id));
    const sameLinkJoints = new Set([j.id]); linksOf(j.id).forEach(L => L.joints.forEach(id => sameLinkJoints.add(id)));
    S.snap = snapAt(x, y, 'joint', { joints: sameLinkJoints, links: own, merge: true, noSlot: j.fixed || !!j.slot, noLink: j.fixed });
    S.pos = dragSolve(drag.id, S.snap.p, drag.start); drag.moved = true;
    renderProps(true); draw(); return;
  }
  if (drag.kind === 'skxf') { xfDragMove(x, y, lastEv); return; }
  if (drag.kind === 'body') { if (!drag.moved && Math.hypot(w.x - drag.w0.x, w.y - drag.w0.y) * S.view.s < 3) return; bodyDragMove(drag, w); drag.moved = true; draw(); return; }
  if (drag.kind && drag.kind.startsWith('sk')) { skDragMove(x, y); return; }
  if (drag.kind === 'trimstroke') { trimStrokeMove(drag, x, y); return; }
  if (drag.kind === 'syn') { synMove(drag, x, y, lastEv); return; }
  if (drag.kind === 'none') return;
  if (drag.kind === 'bgxf') { bgXfMove(drag, x, y, lastEv); syncBgPanel(); draw(); return; }
  if (drag.kind === 'bg') { const bg = S.model.bg; bg.x += w.x - drag.last.x; bg.y += w.y - drag.last.y; drag.last = w; drag.moved = true; draw(); return; }
  if (drag.kind === 'meas') {
    const m = getMeas(drag.id); if (m.kind !== 'dist') return; const P = m.p.map(r => refWorld(r)); const dx = P[1].x - P[0].x, dy = P[1].y - P[0].y, d = Math.hypot(dx, dy) || 1;
    m.off = ((w.x - P[0].x) * -dy + (w.y - P[0].y) * dx) / d; drag.moved = true; draw();
  }
}
function unselect(h) {
  S.msel = S.msel.filter(o => !(o.k === h.k && o.id === h.id)); S.sel = S.msel[S.msel.length - 1] || null;
  renderList(); renderProps(); refreshPopover(); draw();
}
function clearSelection() { // phím Space: bỏ chọn tất cả, về công cụ Chọn
  S.sel = null; S.msel = []; S.cpick = []; S.mpick = []; setTool('select'); closePopover(); renderList(); renderProps(); draw();
}
function endDrag() {
  if (!drag) return; const d = drag; drag = null;
  if (d.unsel && !d.moved) { if (d.kind === 'skxf') xfDragEnd(d); else if (d.kind && d.kind.startsWith('sk')) skDragEnd(d); unselect(d.unsel); return; }
  if (d.kind === 'box') { boxSelectEnd(S.boxSel); return; }
  if (d.kind === 'trimstroke') { trimStrokeEnd(d); return; }
  if (d.kind === 'mpmove' || d.kind === 'mppathandle') { mpDragEnd(d); return; }
  if (d.kind === 'syn') { synUp(d); return; }
  if (d.kind === 'none' || d.kind === 'pathandle' || d.kind === 'locked') return;
  if (d.boolA && !d.moved) { if (d.kind === 'skxf') xfDragEnd(d); openBoolMenu(d.boolA, S.sel.id, d.cxy[0], d.cxy[1]); return; }
  if (d.boolA && d.moved) { S.msel = [S.sel]; }
  if (d.kind === 'pan' && !d.moved && S.tool === 'select') { S.sel = null; S.msel = []; renderList(); renderProps(); draw(); }
  if (d.kind === 'joint' && d.moved) {
    const sn = S.snap; S.snap = null; S.guides = [];
    for (const id in S.pos) { const j = getJ(id); if (j) { j.x = S.pos[id].x; j.y = S.pos[id].y; } }
    const j = getJ(d.id);
    if (sn && sn.t === 'j' && sn.id !== d.id) {
      if (S.model.links.some(L => L.joints.includes(d.id) && L.joints.includes(sn.id))) toast(T('toast_sameLink'));
      else { const a = j.name, b = jname(sn.id); mergeJoints(d.id, sn.id); toast(T('toast_merged', { a, b })); }
    } else if (sn && sn.t === 'slot') { refreshMotorPhases(); attachSlot(d.id, sn.id, true); return; }
    else if (sn && sn.t === 'link') { const L = getL(sn.id); if (L && !L.joints.includes(d.id)) { L.joints.push(d.id); toast(T('toast_pinned', { j: j.name, l: L.name })); } }
    refreshMotorPhases(); rebuild(); return;
  }
  if (d.kind === 'skxf') { xfDragEnd(d); return; }
  if (d.kind === 'body') { if (!d.moved) return; for (const id in S.pos) { const j = getJ(id); if (j) { j.x = S.pos[id].x; j.y = S.pos[id].y; } } refreshMotorPhases(); rebuild(); return; }
  if (d.kind && d.kind.startsWith('sk')) { skDragEnd(d); return; }
  if ((d.kind === 'bg' || d.kind === 'bgxf') && d.moved) { syncBgPanel(); changed(); return; }
  if (d.kind === 'meas' && d.moved) changed();
}
cv.addEventListener('pointerup', ev => {
  if (ev.button === 2) {
    const rd = S.rdown; S.rdown = null; lastRUp = performance.now();
    if (drag && drag.right) { endDrag(); return; }
    if (rd) { const [x, y] = evXY(ev); rightClick(x, y, ev.clientX, ev.clientY); }
    return;
  }
  const pr = S.skPress; S.skPress = null;
  if (pr && !drag && isSkTool(S.tool)) { const [x, y] = evXY(ev); if (Math.hypot(x - pr.x, y - pr.y) > 6) { const line = S.tool === 'sk_line'; S.snap = skSnap(x, y, { from: S.skd.lastP }); skToolDown(x, y); if (line) { S.skd = {}; SK.pruneRefs(SKM()); updateHint(); draw(); } return; } }
  endDrag();
});
cv.addEventListener('pointercancel', () => { S.rdown = null; endDrag(); });
cv.addEventListener('pointerleave', () => { if (!drag && S.tool !== 'select') { S.snap = null; S.guides = []; draw(); } });
cv.addEventListener('dblclick', ev => {
  if (S.tool === 'plate' && S.draft.length >= 2) { finishDraft(); return; }
  if (S.tool === 'sk_spline' || S.tool === 'sk_line') { skFinish(); return; }
  if (S.tool === 'mp_lpat' || S.tool === 'mp_cpat') { const [x, y] = evXY(ev); mpPatDbl(x, y); return; }
  if (S.tool === 'ed_lpat' || S.tool === 'ed_cpat') { const [x, y] = evXY(ev), h = S.pat && S.pat.ids.length && patHandles(); if (h && Math.hypot(h.lbl.x - x, h.lbl.y - y) < 18) patEditCount(); return; }
  if (S.tool === 'select' || S.tool === 'cn_dim') { const [x, y] = evXY(ev); const h = hitSketch(x, y, 'd'); if (h) dimEditInline(h.id); } // bấm đúp nhãn kích thước: sửa ngay tại chỗ
});
// chặn menu chuột phải của trình duyệt trên toàn trang (trừ ô nhập chữ): menu của app mở lúc nhả chuột,
// sự kiện contextmenu của Windows tới sau và rơi vào menu app → nếu không chặn, menu Chrome hiện đè lên
document.addEventListener('contextmenu', ev => { if (!ev.target.closest('input, textarea, [contenteditable]')) ev.preventDefault(); });
cv.addEventListener('contextmenu', ev => {
  ev.preventDefault();
  if (S.rdown || performance.now() - lastRUp < 400) return; // đã xử lý ở pointerup
  const [cx, cy] = evXY(ev); rightClick(cx, cy, ev.clientX, ev.clientY);
});
function rightClick(x0, y0, clientX, clientY) {
  const ev = { clientX, clientY };
  if (S.tool === 'plate' && S.draft.length >= 2) { finishDraft(); return; }
  if ((S.tool === 'sk_spline' && (S.skd.clicks || []).length >= 2) || (S.tool === 'sk_line' && S.skd.last)) { skFinish(); return; }
  if (S.tool !== 'select') { setTool('select'); return; }
  const x = x0, y = y0; const h = hitAny(x, y) || hitRegion(x, y); if (!h) { closeMenu(); return; }
  if (!S.msel.some(o => o.k === h.k && o.id === h.id)) S.msel = 'pekdr'.includes(h.k) ? [h] : [];
  S.sel = h; renderList(); renderProps(); draw(); openMenu(h, ev.clientX, ev.clientY);
}
cv.addEventListener('wheel', ev => {
  ev.preventDefault(); const [x, y] = evXY(ev);
  if (patWheel(ev, x, y) || mpPatWheel(ev, x, y)) return; // lăn trên nhãn số bản sao của mảng
  if (ev.altKey && ev.shiftKey && bgHit(s2w(x, y))) { ev.preventDefault(); const bg = S.model.bg; bg.rot = ((((bg.rot || 0) + (ev.deltaY > 0 ? -5 : 5)) % 360) + 540) % 360 - 180; syncBgPanel(); draw(); clearTimeout(bgWheelT); bgWheelT = setTimeout(changed, 400); return; }
  if (ev.altKey && bgHit(s2w(x, y))) { const bg = S.model.bg, f = Math.exp(-ev.deltaY * 0.0015), w = s2w(x, y); bg.x = w.x + (bg.x - w.x) * f; bg.y = w.y + (bg.y - w.y) * f; bg.w *= f; syncBgPanel(); draw(); clearTimeout(bgWheelT); bgWheelT = setTimeout(changed, 400); return; }
  zoomAt(x, y, Math.exp(-ev.deltaY * 0.0015));
}, { passive: false });
let bgWheelT;
function zoomAt(x, y, f) { const b = s2w(x, y); S.view.s = Math.max(0.3, Math.min(80, S.view.s * f)); const a = s2w(x, y); S.view.ox += b.x - a.x; S.view.oy += b.y - a.y; draw(); }
document.getElementById('zin').onclick = () => zoomAt(W / 2, H / 2, 1.25);
document.getElementById('zout').onclick = () => zoomAt(W / 2, H / 2, 0.8);
document.getElementById('zfit').onclick = fitView;
function fitView() {
  const pts = Object.values(S.pos); if (S.an) for (const k in S.an.traces) pts.push(...S.an.traces[k].pts);
  pts.push(...S.model.sketch.pts);
  for (const e of S.model.sketch.ents) if (e.type === 'circle') { const c = S.model.sketch.pts.find(p => p.id === e.c); if (c) pts.push({ x: c.x - e.r, y: c.y - e.r }, { x: c.x + e.r, y: c.y + e.r }); }
  if (!pts.length) { S.view = { s: 6, ox: 0, oy: 0 }; draw(); return; }
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  const w = Math.max(20, x1 - x0), h = Math.max(20, y1 - y0);
  S.view.s = Math.max(0.5, Math.min(40, Math.min((W - 120) / w, (H - 200) / h))); S.view.ox = (x0 + x1) / 2; S.view.oy = (y0 + y1) / 2 - 30 / S.view.s; draw();
}

// ===== Công cụ cơ cấu =====
// đo: điểm–điểm → khoảng cách · 1 cạnh rồi bấm chỗ trống (hoặc Enter) → độ dài cạnh · 2 cạnh song song → khoảng cách · 2 cạnh chéo → góc
// · điểm (khớp / điểm phác thảo) + cạnh → khoảng cách từ điểm tới đường thẳng chứa cạnh
function measPickItem(x, y) {
  const sn = snapAt(x, y, 'pt'); if (sn.t === 'j' || sn.t === 'sp') return { t: sn.t, id: sn.id, p: sn.p, ref: draftRef(sn) };
  const h = hitSketch(x, y, 'e'), e = h && SKM().ents.find(q => q.id === h.id);
  if (e && e.type === 'line') { const w = entWorld(e.id), c = s2w(x, y), dx = w.b.x - w.a.x, dy = w.b.y - w.a.y, tp = Math.max(0, Math.min(1, ((c.x - w.a.x) * dx + (c.y - w.a.y) * dy) / (dx * dx + dy * dy || 1)));
    return { t: 'e', id: e.id, tp, p: { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 } }; }
  return { t: 'grid', p: sn.p, ref: { x: sn.p.x, y: sn.p.y } };
}
function measPick(x, y) {
  const it = measPickItem(x, y), D = S.draft, a = D[0];
  if (!a) { D.push(it); if (it.t === 'e') S.cpick = [{ k: 'e', id: it.id }]; updateHint(); draw(); return; }
  let m;
  if (a.t === 'e') {
    if (it.t === 'e') {
      if (it.id === a.id) return;
      const e1 = entWorld(a.id), e2 = entWorld(it.id), c = Math.abs((e1.b.x - e1.a.x) * (e2.b.y - e2.a.y) - (e1.b.y - e1.a.y) * (e2.b.x - e2.a.x)) / (Math.hypot(e1.b.x - e1.a.x, e1.b.y - e1.a.y) * Math.hypot(e2.b.x - e2.a.x, e2.b.y - e2.a.y) || 1);
      m = c < Math.sin(0.5 * D2R) ? { kind: 'edist', e: [a.id, it.id] } : { kind: 'eang', e: [a.id, it.id], t: [a.tp, it.tp] }; // lệch < 0.5° coi là song song; góc lấy phía đã bấm
    } else if (it.t === 'grid') m = { kind: 'elen', e: [a.id] };
    else m = { kind: 'pldist', p: [it.ref], e: [a.id] };
  } else if (it.t === 'e') m = { kind: 'pldist', p: [a.ref], e: [it.id] };
  else { if (Math.hypot(it.p.x - a.p.x, it.p.y - a.p.y) < 1e-6) return; m = { kind: 'dist', p: [a.ref, it.ref] }; }
  addMeasure(m);
}
function addMeasure(o) {
  if (S.playing) togglePlay(); commitPose();
  const m = { id: uid('m'), name: nextName(S.model.measures, 'D'), p: [], fixed: false, off: o.kind === 'dist' || o.kind === 'elen' ? 10 : 0, ...o };
  S.model.measures.push(m); S.sel = { k: 'm', id: m.id }; S.draft = []; S.cpick = []; rebuild(); toolDone();
}
function toolClick(x, y) {
  const t = S.tool;
  if (t === 'mdist') return measPick(x, y);
  const sn = S.snap || (t === 'slot' && !S.draft.length ? snapAt(x, y, 'pt') : snapAt(x, y, snapModeFor(t)));
  const item = { ...sn, p: { ...sn.p } };
  if (t === 'slot' && !S.draft.length && sn.t !== 'j' && sn.t !== 'sp') { // bấm trúng nét phác thảo (không phải điểm) → rãnh theo nét đó
    const h = hitSketch(x, y, 'e'), e = h && SKM().ents.find(q => q.id === h.id);
    if (e && PATH_TYPES.includes(e.type)) { addPathSlot(e.id); return; }
  }
  if (S.draft.length === 0) item.host = t === 'slot' ? (S.slotHost || hitLink(x, y)) : null;
  // điểm vẽ (addpt) / lỗ chốt (addhole): khớp gắn cứng vào khâu hoặc part S.addTo
  if (t === 'addhole' && !S.addTo) { const b = bodyAt(x, y); if (!b) { toast(T('h_addhole0')); return; } S.addTo = b; } // từ thanh công cụ: lỗ đặt lên part / khâu dưới con trỏ
  if (t === 'addpt' || t === 'addhole') { commitPose(); const L = getL(S.addTo); if (L) { const j = newJoint(item.p, t === 'addpt' ? { trace: true } : {}); L.joints.push(j.id); S.sel = { k: 'j', id: j.id }; if (t === 'addhole') toast(T('toast_hole', { j: j.name, l: L.name })); } setTool('select'); rebuild(); return; }
  const last = S.draft[S.draft.length - 1];
  if (last && Math.hypot(last.p.x - item.p.x, last.p.y - item.p.y) < 1e-6) { if (t === 'plate' && S.draft.length >= 2) finishDraft(); return; }
  if (item.t === 'j' && S.draft.some(d => d.t === 'j' && d.id === item.id)) return;
  S.draft.push(item);
  const need = { link: 2, cyl: 2, slot: 2 }[t];
  if (need && S.draft.length >= need) finishDraft();
  updateHint(); draw();
}
function draftToJoint(d) {
  if (d.t === 'j') return d.id;
  if (d.t === 'slot') { const j = newJoint(d.p, { slot: d.id }); return j.id; }
  if (d.t === 'link') { const j = newJoint(d.p); getL(d.id).joints.push(j.id); return j.id; }
  return newJoint(d.p).id;
}
function draftRef(d) { return d.t === 'j' ? { j: d.id } : d.t === 'sp' ? { sp: d.id } : { x: d.p.x, y: d.p.y }; }
function finishDraft() {
  const t = S.tool, D = S.draft; S.draft = []; S.snap = null; S.guides = [];
  if (S.playing) togglePlay();
  commitPose();
  if (t === 'link' || t === 'plate' || t === 'cyl') {
    if (D.length < 2) { draw(); return; }
    const ids = D.map(draftToJoint);
    const L = { id: uid('l'), name: nextName(S.model.links, t === 'cyl' ? 'X' : 'L'), joints: ids, lock: {}, w: drawWidth(t === 'cyl' ? 30 : 36) };
    if (t === 'cyl') { const A = getJ(ids[0]), B = getJ(ids[1]), len = Math.hypot(B.x - A.x, B.y - A.y); L.kind = 'cyl'; L.cyl = { min: +(len * .7).toFixed(1), max: +(len * 1.3).toFixed(1) }; }
    S.model.links.push(L); S.sel = { k: 'l', id: L.id };
  } else if (t === 'slot') {
    const host = D[0].host || null; const D0 = designMap(S.model);
    const conv = p => host ? worldToLoc(host, p, D0) : { x: p.x, y: p.y };
    const sl = { id: uid('s'), name: nextName(S.model.slots, 'R'), link: host, a: conv(D[0].p), b: conv(D[1].p), w: 3 };
    S.model.slots.push(sl); S.sel = { k: 's', id: sl.id }; S.slotHost = null;
  }
  rebuild(); toolDone();
}
// bề rộng khâu mới theo mức zoom lúc vẽ: giữ bề rộng px trên màn hình (36 px = 6 mm ở zoom mặc định 6 px/mm), làm tròn 0.5 mm
const drawWidth = px => Math.max(0.5, Math.round(px / S.view.s * 2) / 2);
// rãnh theo nét phác thảo (đoạn thẳng / cung / tròn / spline): khớp trong rãnh chạy theo nét (ràng buộc 'pc'), rãnh khoét vào khâu sở hữu nét
function addPathSlot(eid) {
  const e = SKM().ents.find(q => q.id === eid); if (!e || !PATH_TYPES.includes(e.type)) { toast(T('toast_path_pick')); return false; }
  if (S.playing) togglePlay(); commitPose();
  const host = e.owner && getL(e.owner) ? e.owner : null, D0 = designMap(S.model), pts = SK.sample(e, SK.ptMap(SKM())).pts;
  const conv = p => host ? worldToLoc(host, p, D0) : { x: p.x, y: p.y };
  const sl = { id: uid('s'), name: nextName(S.model.slots, 'R'), link: host, ent: eid, a: conv(pts[0]), b: conv(pts[pts.length - 1]), w: 3 };
  S.model.slots.push(sl); S.sel = { k: 's', id: sl.id }; S.slotHost = null;
  toast(T('toast_pslot', { s: sl.name, e: entLabel(e) })); rebuild(); toolDone(); return true;
}
// lệnh đã hoàn tất → về công cụ Chọn (V)
function toolDone() { if (S.tool !== 'select') setTool('select'); }
function setTool(t) {
  if (t !== S.tool && S.tool === 'sk_line' && S.skd.last) SK.pruneRefs(S.model.sketch);
  S.tool = t; S.draft = []; S.snap = null; S.guides = []; S.skd = {}; S.cpick = []; S.mpick = []; S.skPress = null; if (t !== 'addpt' && t !== 'addhole') S.addTo = null; if (t !== 'slot') S.slotHost = null;
  skToolReset(t); mpToolReset(t);
  if (t === 'slot' && S.sel && S.sel.k === 'e' && addPathSlot(S.sel.id)) return; // chọn sẵn nét rồi bấm Rãnh
  document.querySelectorAll('.tool[data-tool]').forEach(b => b.setAttribute('aria-pressed', b.dataset.tool === t));
  cv.style.cursor = t === 'select' ? 'grab' : 'crosshair'; renderToolOpts(); updateHint(); if (SY.open) renderSynth(); draw();
}
function updateHint() {
  const t = S.tool, n = S.draft.length; let h;
  const map = {
    select: T('h_select'), mk_part: T('h_mkpart'), pathpick: T('h_pathpick', { j: esc((getJ(S.pathJoint) || {}).name || '') }), synpose: T('h_synpose'), synpivot: T('h_synpivot'), ph_grav: T('h_phys', { t: T('f_grav') }), ph_spr: T('h_phys', { t: T('f_spr') }), link: T(n ? 'h_link2' : 'h_link1'), cyl: T(n ? 'h_cyl2' : 'h_cyl1'), plate: T('h_plate'),
    slot: n ? T('h_slot2', { h: S.draft[0].host ? '(' + T('sl_on', { l: getL(S.draft[0].host).name }) + ')' : '' }) : T('h_slot1'),
    mdist: S.draft.length ? T(S.draft[0].t === 'e' ? 'h_mdist_e' : 'h_mdist_p') : T('h_mdist'), addpt: T('h_addpt', { l: esc((getL(S.addTo) || {}).name || '') }), addhole: S.addTo ? T('h_addhole', { l: esc((getL(S.addTo) || {}).name || '') }) : T('h_addhole0'),
    sk_line: T(S.skd.tarc ? 'h_sline_tarc' : 'h_sline'), sk_tarc: T('h_starc'), sk_carc: T('h_scarc'), sk_arc: T('h_sarc'), sk_circle: T('h_scircle'), sk_circle3: T('h_scircle3'), sk_rect: T('h_srect'), sk_crect: T('h_screct'), sk_spline: T('h_sspline'), sk_point: T('h_spoint'),
    ed_fillet: T(S.fil2 ? 'h_e_fillet2' : 'h_e_fillet'), ed_trim: T('h_e_trim'), ed_extend: T('h_e_extend'), ed_split: T('h_e_split'), ed_offset: T(S.offs ? 'h_e_offset2' : 'h_e_offset'),
    ...mpHints(),
    ed_mirror: S.cpick.length ? T('h_e_mirror') : T('h_e_mirror0'), ed_lpat: T(S.pat && S.pat.ids.length ? 'h_e_pat1' : 'h_e_pat0', { t: T('t_e_lpat'), h: T('pat_h_lin') }), ed_cpat: T(S.pat && S.pat.ids.length ? 'h_e_pat1' : 'h_e_pat0', { t: T('t_e_cpat'), h: T('pat_h_cir') }),
  };
  if (t.startsWith('mt_')) { const ty = t.slice(3); h = T('h_mate', { t: T('mt_' + ty), n: mateNeed(ty, S.mpick.length) }); }
  else if (t.startsWith('cn_')) { const ty = t.slice(3); h = ty === 'dim' ? T(S.cpick.length ? 'h_dim2' : 'h_dim0') : T('h_cons_more', { t: T('t_c_' + ty), n: T('need_' + ty) }); }
  else h = map[t] + (t !== 'select' && !t.startsWith('sk_') ? T('h_esc') : '');
  document.getElementById('hint').innerHTML = h;
}
// phím tắt lấy từ trường k của TOOLBAR (một nguồn duy nhất cho tooltip và bàn phím): 'L' → 'l', 'Shift+O' → 'S-o'
const TOOL_KEYS = Object.fromEntries(TOOLBAR.flatMap(g => g.tools).filter(t => t.id && t.k).map(t => [t.k.replace(/^Shift\+/, 'S-').toLowerCase().replace(/^s-/, 'S-'), t.id]));
window.addEventListener('keydown', ev => {
  const k = ev.key.toLowerCase();
  if ((ev.ctrlKey || ev.metaKey) && k === 's') { ev.preventDefault(); saveProject(); return; }
  if ((ev.ctrlKey || ev.metaKey) && k === 'o') { ev.preventDefault(); openInput.click(); return; }
  if (ev.target.matches('input, select, textarea')) return;
  if ((ev.ctrlKey || ev.metaKey) && k === 'z') { ev.preventDefault(); ev.shiftKey ? redo() : undo(); return; }
  if ((ev.ctrlKey || ev.metaKey) && k === 'y') { ev.preventDefault(); redo(); return; }
  if ((ev.ctrlKey || ev.metaKey) && k === 'c' && !String(window.getSelection() || '')) { ev.preventDefault(); copySel(); return; }
  if ((ev.ctrlKey || ev.metaKey) && k === 'v') { ev.preventDefault(); pasteClip(); return; }
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
  if (ev.key === ' ' && ev.repeat) { ev.preventDefault(); return; }
  if (ev.key === 'Escape') { escAction(); return; }
  if (S.tool === 'sk_line' && ev.shiftKey && k === 'a') { if (S.skd.last && S.skd.lastEnt) { S.skd.tarc = !S.skd.tarc; updateHint(); draw(); } return; } // Shift+A: đổi đoạn thẳng ↔ cung tiếp tuyến
  if (ev.key === 'Enter') { if (S.tool === 'mdist' && S.draft.length === 1 && S.draft[0].t === 'e') { addMeasure({ kind: 'elen', e: [S.draft[0].id] }); return; } if (S.tool === 'plate') { finishDraft(); return; } if (S.tool === 'sk_spline' || S.tool === 'sk_line') { skFinish(); return; } }
  if (ev.key === 'Delete' || ev.key === 'Backspace') { deleteSel(); return; }
  if (ev.key === ' ') { ev.preventDefault(); if (ev.shiftKey) togglePlay(); else clearSelection(); return; }
  if (ev.key === 'Home') { ev.preventDefault(); resetPose(); return; }
  const kc = (ev.shiftKey ? 'S-' : '') + k;
  if (kc === 'q') { document.querySelector('[data-act=cs]').click(); return; }
  if (TOOL_KEYS[kc]) pickTool(TOOL_KEYS[kc]);
});
// nét xem trước khi phác thảo
function skOverlay() {
  skOverlay2(); // xem trước kiểu Onshape: cung tiếp tuyến / cung tâm / kích thước / offset / mảng
  const t = S.tool; if (!t.startsWith('sk_')) return;
  const sn = S.snap, C = (S.skd.clicks || []).map(c => c.p), cur = sn ? sn.p : null;
  ctx.strokeStyle = colors.accent; ctx.lineWidth = 1.6; ctx.setLineDash([6, 4]);
  const line = (a, b) => { const p = w2s(a), q = w2s(b); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); };
  if (t === 'sk_line' && S.skd.lastP && cur) { line(S.skd.lastP, cur); ctx.setLineDash([]); dimLabel(w2s(S.skd.lastP), w2s(cur), Math.hypot(cur.x - S.skd.lastP.x, cur.y - S.skd.lastP.y).toFixed(1), false, 6); }
  if (t === 'sk_rect' && C.length === 1 && cur) { const a = w2s(C[0]), b = w2s(cur); ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)); }
  if (t === 'sk_crect' && C.length === 1 && cur) { const a = w2s(C[0]), b = w2s(cur), dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y); ctx.strokeRect(a.x - dx, a.y - dy, 2 * dx, 2 * dy); }
  if (t === 'sk_circle' && C.length === 1 && cur) { const a = w2s(C[0]); ctx.beginPath(); ctx.arc(a.x, a.y, Math.hypot(cur.x - C[0].x, cur.y - C[0].y) * S.view.s, 0, TAU); ctx.stroke(); }
  if ((t === 'sk_circle3' || t === 'sk_arc') && cur) {
    if (C.length === 2) {
      const cc = circum(C[0], C[1], cur);
      if (cc && t === 'sk_arc') { // như Onshape: xem trước đúng cung đầu → cuối đi qua con trỏ (cùng quy tắc chọn chiều với finishSk)
        const c = w2s(cc), ang = p => SK.angNorm(Math.atan2(p.y - cc.y, p.x - cc.x)), a0 = ang(C[0]), a1 = ang(C[1]), ccw = SK.angNorm(ang(cur) - a0) <= SK.angNorm(a1 - a0);
        const [s, e] = ccw ? [a0, a1] : [a1, a0]; ctx.beginPath(); ctx.arc(c.x, c.y, cc.r * S.view.s, -s, -e, true); ctx.stroke(); // màn hình lật trục y → góc âm, ngược kim đồng hồ
      } else if (cc) { const c = w2s(cc); ctx.beginPath(); ctx.arc(c.x, c.y, cc.r * S.view.s, 0, TAU); ctx.stroke(); }
      else line(C[0], C[1]);
    }
    else if (C.length === 1) line(C[0], cur);
  }
  if (t === 'sk_spline' && C.length && cur) { const pts = SK.splineSample([...C, cur], false, 12).map(w2s); ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke(); }
  ctx.setLineDash([]);
  for (const p of C) { const q = w2s(p); ctx.fillStyle = colors.accent; ctx.fillRect(q.x - 3, q.y - 3, 6, 6); }
}
