// ===== Rà soát bậc tự do chưa dẫn =====
// Không gian rỗng của Jacobian ràng buộc (kể cả motor, bỏ tiếp xúc 'ct') tại tư thế hiện tại = các chuyển động còn tự do.
// Cơ sở được đưa về dạng bậc thang rút gọn → mỗi bậc gắn với một tọa độ khớp chính, chuyển động cục bộ nhất có thể.
// Mỗi bậc: các khớp chuyển động (vận tốc tức thời), các khâu/part bị kéo theo, kiểu chuyển động (xoay quanh khớp / điểm, tịnh tiến).
S.fd = { open: false, modes: null, hover: -1 };

// trị riêng / vector riêng ma trận đối xứng (Jacobi quay vòng)
function symEig(A) {
  const n = A.length, a = A.map(r => r.slice()), V = Array.from({ length: n }, (_, i) => { const r = new Array(n).fill(0); r[i] = 1; return r; });
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0; for (let i = 0; i < n; i++) for (let k = i + 1; k < n; k++) off += a[i][k] * a[i][k];
    if (off < 1e-22) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(a[p][q]) < 1e-300) continue;
      const th = (a[q][q] - a[p][p]) / (2 * a[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
      for (let k = 0; k < n; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < n; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
    }
  }
  return { val: a.map((r, i) => r[i]), vec: i => V.map(r => r[i]) };
}

function freeModes() {
  const m = S.model, vars = movingVars(m), n = vars.length * 2; if (!n || !S.pos || !vars.every(id => S.pos[id])) return [];
  const cons = (S.cons || compile(m)).filter(c => c.t !== 'ct');
  const rows = solveLM(cons, S.pos, { vars, theta: S.theta, jacOnly: true });
  const JtJ = Array.from({ length: n }, () => new Array(n).fill(0));
  for (const { g } of rows) for (const [i, vi] of g) for (const [k, vk] of g) JtJ[i][k] += vi * vk;
  const { val, vec } = symEig(JtJ), mx = Math.max(1, ...val.map(Math.abs));
  const N = []; val.forEach((v, i) => { if (v < 1e-8 * mx) N.push(vec(i)); });
  // bậc thang rút gọn của cơ sở (hàng = vector rỗng): trụ = tọa độ lớn nhất còn lại, ưu tiên khớp hiện (không phải khớp ẩn của part)
  const hid = new Set(vars.map((id, i) => (getJ(id) || {}).hidden ? i : -1).filter(i => i >= 0));
  const piv = [];
  for (let r = 0; r < N.length; r++) {
    let best = -1, bv = 1e-9;
    for (const pass of [0, 1]) { for (let c = 0; c < n; c++) { if (piv.includes(c) || (!pass && hid.has(c >> 1))) continue; const v = Math.abs(N[r][c]); if (v > bv) { bv = v; best = c; } } if (best >= 0) break; }
    if (best < 0) { piv.push(0); continue; }
    const f = N[r][best]; N[r] = N[r].map(x => x / f);
    for (let k = 0; k < N.length; k++) if (k !== r) { const g = N[k][best]; if (g) N[k] = N[k].map((x, c) => x - g * N[r][c]); }
    piv.push(best);
  }
  return N.map((v, i) => describeMode(vars, v, piv[i])).filter(Boolean);
}

// mô tả một bậc tự do: vận tốc khớp, khâu bị kéo theo, kiểu chuyển động của khâu chính
function describeMode(vars, v, pivot) {
  const vel = {}; let vmax = 0;
  vars.forEach((id, i) => { const q = { x: v[2 * i], y: v[2 * i + 1] }; vel[id] = q; vmax = Math.max(vmax, Math.hypot(q.x, q.y)); });
  if (!(vmax > 0)) return null;
  for (const id in vel) { vel[id].x /= vmax; vel[id].y /= vmax; }
  const sp = id => vel[id] ? Math.hypot(vel[id].x, vel[id].y) : 0, moving = vars.filter(id => sp(id) > 0.02);
  const links = S.model.links.filter(L => L.joints.some(id => sp(id) > 0.02));
  const pj = vars[pivot >> 1], nMov = L => L.joints.filter(id => sp(id) > .02).length;
  // khâu chính: part chứa khớp trụ, rồi khâu chứa khớp trụ có nhiều khớp chuyển động nhất
  const cand = links.filter(L => L.joints.includes(pj)).sort((a, b) => (b.kind === 'body') - (a.kind === 'body') || nMov(b) - nMov(a));
  const main = cand[0] || links[0];
  return { vel, moving, links: links.map(L => L.id), main: main ? main.id : null, joint: pj, motion: main ? linkMotion(main, vel) : { t: 'pt' } };
}
// chuyển động tức thời của khâu: tịnh tiến (mọi điểm cùng vận tốc) hoặc xoay quanh tâm quay tức thời
function linkMotion(L, vel) {
  const P = S.pos, V = id => vel[id] || { x: 0, y: 0 }, js = L.joints.filter(id => P[id]);
  if (js.length < 2) return { t: 'pt' };
  let a = js[0], b = js[1], best = 0; // cặp khớp xa nhau nhất
  for (let i = 0; i < js.length; i++) for (let k = i + 1; k < js.length; k++) { const d = Math.hypot(P[js[k]].x - P[js[i]].x, P[js[k]].y - P[js[i]].y); if (d > best) { best = d; a = js[i]; b = js[k]; } }
  const A = P[a], B = P[b], rx = B.x - A.x, ry = B.y - A.y, r2 = rx * rx + ry * ry || 1, va = V(a), vb = V(b);
  const w = (rx * (vb.y - va.y) - ry * (vb.x - va.x)) / r2;
  if (Math.abs(w) * Math.sqrt(r2) < 0.02) { const l = Math.hypot(va.x + vb.x, va.y + vb.y) || 1; return { t: 'tr', dir: Math.atan2((va.y + vb.y) / l, (va.x + vb.x) / l) * R2D }; }
  const c = { x: A.x - va.y / w, y: A.y + va.x / w }; // v = ω × (p − c)
  let near = null, nd = Infinity; for (const j of S.model.joints) { const p = P[j.id]; if (!p || j.hidden) continue; const d = Math.hypot(p.x - c.x, p.y - c.y); if (d < nd) { nd = d; near = j; } }
  return near && nd < Math.max(0.5, 0.02 * Math.sqrt(r2)) ? { t: 'rj', j: near.id, c } : { t: 'rp', c };
}
// phương tịnh tiến so với trục X của bàn vẽ (góc gốc O, ngược kim đồng hồ)
function trText(dir) { const a = ((dir % 180) + 180) % 180; return a < 1 || a > 179 ? T('fd_tr_x') : Math.abs(a - 90) < 1 ? T('fd_tr_y') : T('fd_tr', { a: a.toFixed(0) }); }
// tâm khâu (thế giới, tư thế hiện tại): part → tâm CP của part, khâu → trung bình các khớp
function linkCenter(L) {
  if (L.kind === 'body') { const f = S.model.features.find(q => q.link === L.id && q.op === 'union'), r = f && S.featReg[f.id]; if (r) { XF = skXform(); const c = regionCentroid(r), x = XF[L.id]; return x ? x(c) : c; } }
  const ps = L.joints.map(id => S.pos[id]).filter(Boolean); return ps.length ? { x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length } : null;
}
// vận tốc tức thời của điểm p gắn cứng trên khâu L (từ vận tốc 2 khớp khung)
function linkPointVel(L, vel, p) {
  const P = S.pos, a = L.joints[0], b = L.joints[1], A = P[a], B = P[b]; if (!A || !B) return { x: 0, y: 0 };
  const va = vel[a] || { x: 0, y: 0 }, vb = vel[b] || { x: 0, y: 0 }, rx = B.x - A.x, ry = B.y - A.y, r2 = rx * rx + ry * ry || 1, w = (rx * (vb.y - va.y) - ry * (vb.x - va.x)) / r2;
  return { x: va.x - w * (p.y - A.y), y: va.y + w * (p.x - A.x) };
}
function modeText(md) {
  const L = md.main && getL(md.main), nm = L ? L.name : getJ(md.joint).name, mo = md.motion;
  const how = mo.t === 'rj' ? T('fd_rot_j', { j: esc(getJ(mo.j).name) }) : mo.t === 'rp' ? T('fd_rot_p', { x: mo.c.x.toFixed(1), y: mo.c.y.toFixed(1) }) : mo.t === 'tr' ? trText(mo.dir) : T('fd_pt');
  const kind = L ? linkTypeText(L) : T('jt_free');
  const others = md.links.filter(id => id !== md.main).map(id => esc(getL(id).name));
  const js = md.moving.filter(id => !getJ(id).hidden).map(id => esc(getJ(id).name));
  return { head: `${kind} <b>${esc(nm)}</b> — ${how}`, sub: [js.length ? T('fd_joints', { j: js.join(', ') }) : '', others.length ? T('fd_also', { l: others.join(', ') }) : ''].filter(Boolean).join(' · ') };
}

// ----- bảng danh sách (bấm chip trạng thái) -----
const fdEl = document.createElement('div'); fdEl.className = 'exmenu fdpanel'; fdEl.hidden = true; document.body.appendChild(fdEl);
const stChip = document.getElementById('status');
stChip.addEventListener('click', () => { if (fdEl.hidden && stChip.dataset.fd) openFreeDof(); else closeFreeDof(); });
function openFreeDof() { S.fd.open = true; fdEl.hidden = false; renderFreeDof(); }
function closeFreeDof() { if (!S.fd.open) return; S.fd.open = false; S.fd.hover = -1; fdEl.hidden = true; draw(); }
function renderFreeDof() {
  if (!S.fd.open) return;
  const md = S.fd.modes = freeModes(), gr = S.an ? S.an.dof - S.model.motors.length : 0;
  if (S.fd.hover >= md.length) S.fd.hover = -1;
  let h = `<div class="exhead">${T('fd_head', { n: md.length })}</div>`;
  if (!md.length) h += `<p class="muted">${T(gr > 0 ? 'fd_none_red' : 'fd_none', { n: gr })}</p>`;
  else {
    if (gr !== md.length) h += `<p class="muted">${T('fd_mismatch', { g: gr, n: md.length })}</p>`;
    h += md.map((m, i) => { const t = modeText(m); return `<button class="fditem" data-i="${i}"><span class="fdn">${i + 1}</span><span><span class="fdh">${t.head}</span>${t.sub ? `<span class="fds">${t.sub}</span>` : ''}</span></button>`; }).join('');
    h += `<p class="muted">${T('fd_note')}</p>`;
  }
  fdEl.innerHTML = h;
  const r = stChip.getBoundingClientRect(), w = fdEl.offsetWidth;
  fdEl.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + 'px'; fdEl.style.top = (r.bottom + 6) + 'px';
  fdEl.querySelectorAll('.fditem').forEach(b => {
    const i = +b.dataset.i;
    b.onmouseenter = b.onfocus = () => { S.fd.hover = i; draw(); };
    b.onmouseleave = b.onblur = () => { if (S.fd.hover === i) { S.fd.hover = -1; draw(); } };
    b.onclick = () => { const m = S.fd.modes[i]; S.sel = m.main ? { k: 'l', id: m.main } : { k: 'j', id: m.joint }; S.msel = []; renderList(); renderProps(); S.fd.hover = i; draw(); };
  });
}
document.addEventListener('pointerdown', e => { if (!fdEl.hidden && !fdEl.contains(e.target) && e.target !== stChip) closeFreeDof(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !fdEl.hidden) closeFreeDof(); });

// ----- vẽ bậc đang rê chuột: tô khâu bị kéo theo, mũi tên hai chiều tại khớp, cung xoay quanh tâm -----
function drawFreeDof() {
  const md = S.fd.open && S.fd.modes && S.fd.modes[S.fd.hover]; if (!md) return;
  const P = S.pos, col = colors.warn || colors.accent;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.setLineDash([]);
  for (const id of md.links) {
    // part: khớp khung ẩn, không tô dải giữa chúng (mũi tên tại tâm part chỉ hướng)
    const L = getL(id); if (!L || L.kind === 'body') continue; const pts = L.joints.filter(j => P[j]).map(j => w2s(P[j])); if (pts.length < 2) continue;
    ctx.strokeStyle = col; ctx.globalAlpha = id === md.main ? .5 : .25; ctx.lineWidth = Math.max(8, wpx(L)) + 8;
    ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); if (pts.length > 2) ctx.closePath(); ctx.stroke();
  }
  ctx.globalAlpha = 1; ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2.2;
  const head = (x, y, a) => { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 9 * Math.cos(a - .45), y - 9 * Math.sin(a - .45)); ctx.lineTo(x - 9 * Math.cos(a + .45), y - 9 * Math.sin(a + .45)); ctx.closePath(); ctx.fill(); };
  for (const id of md.moving) {
    const j = getJ(id); if (!j || j.hidden) continue; const v = md.vel[id], s = Math.hypot(v.x, v.y); if (s < .02) continue;
    const p = w2s(P[id]), len = 14 + 30 * s, a = Math.atan2(-v.y, v.x), dx = Math.cos(a) * len, dy = Math.sin(a) * len;
    ctx.beginPath(); ctx.moveTo(p.x - dx, p.y - dy); ctx.lineTo(p.x + dx, p.y + dy); ctx.stroke(); head(p.x + dx, p.y + dy, a); head(p.x - dx, p.y - dy, a + Math.PI);
  }
  const ML = md.main && getL(md.main), mc = ML && linkCenter(ML);
  if (mc) { // mũi tên lớn tại tâm khâu chính + nhãn hướng
    const v = linkPointVel(ML, md.vel, mc), s = Math.hypot(v.x, v.y);
    if (s > .02) { const p = w2s(mc), a = Math.atan2(-v.y, v.x), len = 44, dx = Math.cos(a) * len, dy = Math.sin(a) * len; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.moveTo(p.x - dx, p.y - dy); ctx.lineTo(p.x + dx, p.y + dy); ctx.stroke(); head(p.x + dx, p.y + dy, a); head(p.x - dx, p.y - dy, a + Math.PI); ctx.lineWidth = 2.2;
      if (md.motion.t === 'tr') { ctx.font = '700 12px ' + monoFont(); ctx.textBaseline = 'middle'; ctx.fillText(trText(md.motion.dir), p.x + Math.abs(dy) * .4 + 10, p.y - Math.abs(dx) * .4 - 14); } }
  }
  const mo = md.motion;
  if (mo.t === 'rj' || mo.t === 'rp') { const c = w2s(mo.c); ctx.beginPath(); ctx.arc(c.x, c.y, 16, -2.4, 1.2); ctx.stroke(); head(c.x + 16 * Math.cos(1.2), c.y + 16 * Math.sin(1.2), 1.2 + Math.PI / 2); ctx.beginPath(); ctx.arc(c.x, c.y, 3.5, 0, 2 * Math.PI); ctx.fill(); }
  ctx.restore();
}
