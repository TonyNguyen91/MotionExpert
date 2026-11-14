// ===== E22: căn chỉnh hàng loạt khớp / khâu =====
// Chọn: Shift/Ctrl + bấm khớp hoặc khâu để thêm; Shift + kéo trên vùng trống để quét khung. Khâu chọn = mọi khớp của nó.
// Thứ tự chọn có ý nghĩa: khớp chọn đầu tiên là mốc (căn ngang/dọc), đầu–cuối định đường thẳng (thẳng hàng, chia đều).
const AL = { dx: 10, dy: 0, ang: 90, k: 1.5 };
const isMechSel = o => o.k === 'j' || o.k === 'l';
// khớp được chọn theo thứ tự chọn (bỏ khớp ẩn của part, trừ khi chọn cả part)
function alignJoints() {
  const out = [];
  for (const o of S.msel || []) {
    if (o.k === 'j' && getJ(o.id)) out.push(o.id);
    else if (o.k === 'l' && getL(o.id)) getL(o.id).joints.forEach(id => out.push(id));
  }
  return [...new Set(out)];
}
// chỉ khi chọn từ 2 khớp/khâu trở lên (chọn 1 khâu thì hiện form thuộc tính của khâu)
const alignActive = () => (S.msel || []).filter(isMechSel).length >= 2 && alignJoints().length >= 2;
function alignPanelHTML() {
  const J = alignJoints(), nl = S.msel.filter(o => o.k === 'l').length, b = (act, label, need) => `<button class="btn" data-al="${act}" ${J.length < (need || 2) ? 'disabled' : ''}>${label}</button>`;
  const num = (k, unit, step) => `<span class="unit" data-u="${unit}"><input type="number" data-alv="${k}" step="${step}" value="${AL[k]}"></span>`;
  return `<p class="muted">${T('al_sel', { n: J.length, l: nl })}</p>
    <div class="algrid">${b('h', T('al_h'))}${b('v', T('al_v'))}${b('line', T('al_line'), 3)}${b('dist', T('al_dist'), 3)}${b('perp', T('al_perp'), 3)}${b('para', T('al_para'), 4)}${b('mx', T('al_mx'))}${b('my', T('al_my'))}</div>
    <div class="alrows">
      <div class="alrow"><label>${T('al_move')}</label><div class="alin">${num('dx', 'ΔX', 1)}${num('dy', 'ΔY', 1)}</div><button class="btn" data-al="move">${T('al_go')}</button></div>
      <div class="alrow"><label>${T('al_rot')}</label><div class="alin">${num('ang', '°', 5)}</div><button class="btn" data-al="rot">${T('al_go')}</button></div>
      <div class="alrow"><label>${T('al_scale')}</label><div class="alin">${num('k', '×', 0.1)}</div><button class="btn" data-al="scale">${T('al_go')}</button></div>
      <div class="alrow"><label>${T('al_copy')} <span class="muted">(ΔX, ΔY)</span></label><div class="alin"></div><button class="btn" data-al="copy" ${nl ? '' : 'disabled'}>${T('al_go')}</button></div>
    </div>
    <p class="muted">${T('al_note')}</p>`;
}
function mountAlignPanel(box) {
  box.innerHTML = alignPanelHTML();
  box.querySelectorAll('[data-alv]').forEach(el => el.onchange = () => { const v = +el.value; if (Number.isFinite(v)) AL[el.dataset.alv] = v; });
  box.querySelectorAll('[data-al]').forEach(el => el.onclick = () => alignDo(el.dataset.al));
}
// áp phép biến đổi lên vị trí thiết kế các khớp; khớp gối đã khóa vị trí thì giữ nguyên
function alignDo(act) {
  if (S.playing) togglePlay(); commitPose();
  const ids = alignJoints(), P = ids.map(id => getJ(id)), n = P.length;
  if (act === 'copy') { alignCopy(); return; }
  if (ids.some(id => lockedItem({ k: 'j', id }))) { lockToast(); return; } // có khớp thuộc part khóa
  const cx = P.reduce((s, j) => s + j.x, 0) / n, cy = P.reduce((s, j) => s + j.y, 0) / n, A = P[0], Z = P[n - 1];
  const set = (j, x, y) => { if (j.fixed && lk(j).pos) { set.skip = true; return; } j.x = x; j.y = y; };
  const ux = Z.x - A.x, uy = Z.y - A.y, ul = Math.hypot(ux, uy) || 1;
  if (act === 'h') P.forEach(j => set(j, j.x, A.y));
  else if (act === 'v') P.forEach(j => set(j, A.x, j.y));
  else if (act === 'line') P.forEach(j => { const t = ((j.x - A.x) * ux + (j.y - A.y) * uy) / (ul * ul); set(j, A.x + t * ux, A.y + t * uy); });
  else if (act === 'dist') { // chia đều theo thứ tự hình chiếu trên đường đầu–cuối, giữ hai đầu
    const ord = P.slice().sort((a, b) => ((a.x - A.x) * ux + (a.y - A.y) * uy) - ((b.x - A.x) * ux + (b.y - A.y) * uy));
    const f = ord[0], l = ord[n - 1]; ord.forEach((j, i) => set(j, f.x + (l.x - f.x) * i / (n - 1), f.y + (l.y - f.y) * i / (n - 1)));
  }
  else if (act === 'perp') { // 3 khớp A, B, C: xoay C quanh B để BC ⊥ AB, giữ |BC|
    const [a, b, c] = P, r = Math.hypot(c.x - b.x, c.y - b.y), dx = b.x - a.x, dy = b.y - a.y, dl = Math.hypot(dx, dy) || 1;
    const n1 = { x: -dy / dl, y: dx / dl }, s = ((c.x - b.x) * n1.x + (c.y - b.y) * n1.y) >= 0 ? 1 : -1; set(c, b.x + s * n1.x * r, b.y + s * n1.y * r);
  }
  else if (act === 'para') { const [a, b, c, d] = P; set(d, a.x + c.x - b.x, a.y + c.y - b.y); } // ABCD hình bình hành: D = A + C − B
  else if (act === 'mx') P.forEach(j => set(j, 2 * cx - j.x, j.y));
  else if (act === 'my') P.forEach(j => set(j, j.x, 2 * cy - j.y));
  else if (act === 'move') P.forEach(j => set(j, j.x + AL.dx, j.y + AL.dy));
  else if (act === 'rot') { const c = Math.cos(AL.ang * D2R), s = Math.sin(AL.ang * D2R); P.forEach(j => set(j, cx + (j.x - cx) * c - (j.y - cy) * s, cy + (j.x - cx) * s + (j.y - cy) * c)); }
  else if (act === 'scale') { if (!(AL.k > 0)) return; P.forEach(j => set(j, cx + (j.x - cx) * AL.k, cy + (j.y - cy) * AL.k)); }
  if (set.skip) toast(T('al_locked'));
  // lật đối xứng thì rãnh trên khâu cũng lật theo hệ cục bộ (giữ hình dạng đối xứng)
  if (act === 'mx' || act === 'my') for (const o of S.msel) if (o.k === 'l') for (const s of S.model.slots) if (s.link === o.id) { s.a = { x: s.a.x, y: -s.a.y }; s.b = { x: s.b.x, y: -s.b.y }; }
  refreshMotorPhases(); rebuild();
}
// nhân bản các khâu đã chọn (kèm khớp, rãnh trên khâu), dời ΔX, ΔY; khớp chung giữa khâu chọn và khâu không chọn được nhân bản luôn
function alignCopy() {
  const m = S.model, Ls = S.msel.filter(o => o.k === 'l').map(o => getL(o.id)).filter(L => L && L.kind !== 'body'); if (!Ls.length) return;
  const jmap = {}, smap = {}, nl = [];
  for (const L of Ls) for (const id of L.joints) if (!jmap[id]) { const j = getJ(id), nj = newJoint({ x: j.x + AL.dx, y: j.y + AL.dy }, { fixed: j.fixed, trace: j.trace }); jmap[id] = nj.id; }
  for (const L of Ls) {
    const N = { ...JSON.parse(JSON.stringify(L)), id: uid('l'), name: nextName(m.links, 'L'), joints: L.joints.map(id => jmap[id]) }; delete N.sweep; m.links.push(N); nl.push(N);
    for (const s of m.slots) if (s.link === L.id) { const ns = { ...JSON.parse(JSON.stringify(s)), id: uid('s'), name: nextName(m.slots, 'R'), link: N.id }; m.slots.push(ns); smap[s.id] = ns.id; }
  }
  for (const id in jmap) { const j = getJ(id), nj = getJ(jmap[id]); if (j.slot && smap[j.slot]) nj.slot = smap[j.slot]; else if (j.slider) nj.slider = { ...j.slider }; }
  S.msel = nl.map(L => ({ k: 'l', id: L.id })); S.sel = S.msel[0];
  toast(T('al_copied', { n: nl.length })); rebuild();
}
// ----- chọn bằng khung (Shift + kéo trên vùng trống) -----
