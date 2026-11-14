// ===== Bảng thông số điểm vết: tọa độ, vận tốc, gia tốc theo góc motor θ =====
// Ghi trực tiếp kiểu máy hiện sóng: trục θ cố định 0–360°, mỗi khung hình mô phỏng ghi vị trí thật của điểm vào ô 1° tương ứng
// (ghi đè vòng trước) → đồ thị luôn chạy theo motor, đúng cả với part vật lý (kết quả phụ thuộc lịch sử) và cơ cấu không quay đủ vòng.
// Khi đổi mô hình, các ô được điền sẵn từ S.an.sweep. Vận tốc = dP/dθ · ω, ω = rpm·6 °/s (thanh Tốc độ).
const TP = { open: false, key: null, origin: 'motor', step: 10, hover: null, data: null, bins: new Map(), binsFor: null, lastR: 0 };
const tpEl = document.getElementById('tpanel');
const TP_GAP = 12;
const tpBin = th => ((Math.round(th * R2D) % 360) + 360) % 360;

// điểm vết hiện có: khớp bật "vẽ quỹ đạo" + điểm vết phác thảo
function tpSources() {
  const out = S.model.joints.filter(j => j.trace).map(j => ({ key: 'j:' + j.id, name: j.name, at: pos => pos[j.id] }));
  S.skTraces.forEach((tr, i) => {
    const b = tr.base, L = b && b.owner && getL(b.owner), fD = L && S.skFrames[L.id];
    out.push({ key: 's:' + i, name: skTraceName(tr.t), at: pos => fD ? toWorld(frameOf(L, pos), toLocal(fD, b.p)) : b.p });
  });
  return out;
}
function tpRecord(pos, th, srcs = tpSources()) {
  const k = tpBin(th);
  for (const s of srcs) {
    const p = s.at(pos); if (!p) continue;
    let a = TP.bins.get(s.key); if (!a) TP.bins.set(s.key, a = new Array(360).fill(null));
    a[k] = { x: p.x, y: p.y, pos, th };
  }
}
// mô hình / phân tích mới → xóa dữ liệu ghi, điền sẵn từ quét phân tích
function tpSync() {
  if (TP.binsFor === S.an) return;
  TP.bins = new Map(); TP.binsFor = S.an;
  if (S.an && S.an.sweep.length) { const srcs = tpSources(); for (const f of S.an.sweep) tpRecord(f.pos, f.th, srcs); }
}
// gọi mỗi lần tư thế thay đổi (mỗi khung hình khi chạy)
function tpLive() {
  if (!S.model.motors.length) return;
  tpSync(); tpRecord(S.pos, S.theta);
  if (!TP.open) return;
  if (performance.now() - TP.lastR > 160) tpRenderBody(); else tpCursor();
}
// tâm motor: gối của motor quay đầu tiên, hoặc khớp đầu thân xi lanh
function tpMotorCenter() {
  const mo = S.model.motors[0]; if (!mo) return null;
  const mq = mo.mate && S.model.mates.find(q => q.id === mo.mate);
  const id = mo.lin || (mq ? mq.joint : mo.cyl ? (getL(mo.cyl) || { joints: [] }).joints[0] : mo.joint), j = id && getJ(id);
  return j ? { x: j.x, y: j.y, name: j.name } : null;
}
const tpRpm = () => +document.getElementById('rpm').value || 20;
function tpCompute(key) {
  const bins = TP.bins.get(key); if (!bins || !bins.some(Boolean)) return null;
  const w = tpRpm() * 6, C = TP.origin === 'motor' ? tpMotorCenter() : null, ox = C ? C.x : 0, oy = C ? C.y : 0;
  const P = bins.map(b => b && { x: b.x - ox, y: b.y - oy }), at = i => P[(i + 360) % 360];
  // ô có dữ liệu gần nhất về mỗi phía (≤ TP_GAP°): quét 2° và mô phỏng nhanh (tới 6°/khung) để lại ô trống xen kẽ
  const near = (i, s) => { for (let k = 1; k <= TP_GAP; k++) if (at(i + s * k)) return k; return 0; };
  const rows = [];
  for (let i = 0; i < 360; i++) {
    const p = P[i]; if (!p) continue;
    const da = near(i, -1), db = near(i, 1), pa = da && at(i - da), pb = db && at(i + db);
    let vx = NaN, vy = NaN, a = NaN;
    if (pa && pb) { // sai phân trung tâm, bước không đều
      vx = (pb.x - pa.x) / (da + db) * w; vy = (pb.y - pa.y) / (da + db) * w;
      a = Math.hypot((pb.x - p.x) / db - (p.x - pa.x) / da, (pb.y - p.y) / db - (p.y - pa.y) / da) * 2 / (da + db) * w * w;
    } else if (pa || pb) { const q = pb || pa, d = pb ? db : -da; vx = (q.x - p.x) / d * w; vy = (q.y - p.y) / d * w; }
    rows.push({ i, th: i, x: p.x, y: p.y, r: Math.hypot(p.x, p.y), phi: Math.atan2(p.y, p.x) * R2D, vx, vy, v: Math.hypot(vx, vy), a });
  }
  let len = 0, cov = 0; for (let i = 0; i < 360; i++) { const p = P[i], k = p && near(i, 1); if (k) { const q = at(i + k); len += Math.hypot(q.x - p.x, q.y - p.y); cov += k; } }
  const best = (k, sgn) => rows.reduce((m, r) => !isNaN(r[k]) && (m == null || sgn * (r[k] - m[k]) > 0) ? r : m, null);
  return { rows, C, len, full: cov >= 360, vAvg: cov ? len / (cov / w) : NaN, xLo: best('x', -1), xHi: best('x', 1), yLo: best('y', -1), yHi: best('y', 1), vLo: best('v', -1), vHi: best('v', 1), aHi: best('a', 1), rpm: tpRpm() };
}
const tpDeg = d => (((d % 360) + 360) % 360).toFixed(0) + '°';
const tpF = (v, d = 1) => v == null || isNaN(v) ? '—' : v.toFixed(d);
// trục số đẹp
function tpTicks(lo, hi, n = 3) {
  if (!(hi > lo)) { hi = lo + 1; lo -= 1; }
  const raw = (hi - lo) / n, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p, st = (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
  const a = Math.floor(lo / st) * st, b = Math.ceil(hi / st) * st, out = []; for (let v = a; v <= b + st * 1e-6; v += st) out.push(+v.toFixed(10));
  return out;
}
const TPW = 384, TPH = 92, TPM = { l: 46, r: 10, t: 8, b: 20 };
const tpX = deg => TPM.l + deg / 360 * (TPW - TPM.l - TPM.r);
function tpYScale(rows, key) {
  const vals = rows.map(r => r[key]).filter(v => !isNaN(v)), ys = tpTicks(Math.min(...vals), Math.max(...vals)), y0 = ys[0], y1 = ys[ys.length - 1];
  return { ys, Y: v => TPM.t + (1 - (v - y0) / ((y1 - y0) || 1)) * (TPH - TPM.t - TPM.b) };
}
function tpChart(key, label, unit, rows) {
  const { ys, Y } = tpYScale(rows, key);
  let g = '';
  for (const v of ys) g += `<line x1="${TPM.l}" x2="${TPW - TPM.r}" y1="${Y(v)}" y2="${Y(v)}" class="tg"/><text x="${TPM.l - 6}" y="${Y(v) + 3.5}" class="tyl">${+v.toFixed(2)}</text>`;
  for (const t of [0, 90, 180, 270, 360]) g += `<line x1="${tpX(t)}" x2="${tpX(t)}" y1="${TPM.t}" y2="${TPH - TPM.b}" class="tg"/><text x="${tpX(t)}" y="${TPH - 5}" class="txl">${t}°</text>`;
  // đường đứt đoạn ở chỗ chưa có dữ liệu
  let d = '', prev = null;
  for (const r of rows) { const v = r[key]; if (isNaN(v)) { prev = null; continue; } d += (prev != null && r.i - prev <= TP_GAP ? 'L' : 'M') + tpX(r.i).toFixed(1) + ' ' + Y(v).toFixed(1); prev = r.i; }
  return `<figure class="tchart" data-k="${key}"><figcaption>${label} <span>(${unit})</span></figcaption>
    <svg viewBox="0 0 ${TPW} ${TPH}" role="img" aria-label="${label}">${g}<path d="${d}" class="tl"/>
    <line class="tcur" y1="${TPM.t}" y2="${TPH - TPM.b}"/><line class="thov" y1="${TPM.t}" y2="${TPH - TPM.b}"/><circle class="tdot" r="4"/>
    <rect class="thit" x="${TPM.l}" y="0" width="${TPW - TPM.l - TPM.r}" height="${TPH}"/></svg></figure>`;
}
function renderTracePanel() {
  const btn = document.getElementById('tdBtn'); btn.setAttribute('aria-pressed', TP.open);
  tpEl.hidden = !TP.open; if (!TP.open) return;
  tpSync();
  const srcs = tpSources().filter(s => TP.bins.has(s.key));
  const head = `<div class="tphead"><h3>${T('tp_title')}</h3><button class="x" id="tpClose" aria-label="Close">×</button></div>`;
  if (!srcs.length || !S.model.motors.length) { TP.data = null; tpEl.innerHTML = head + `<p class="muted">${T(S.model.motors.length ? 'tp_none' : 'tp_nomotor')}</p>`; tpBind(); return; }
  if (!srcs.some(s => s.key === TP.key)) TP.key = srcs[0].key;
  const ctl = `<div class="tpctl"><select class="sel" id="tpSrc" aria-label="${T('tp_point')}">${srcs.map(s => `<option value="${s.key}" ${s.key === TP.key ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
    <select class="sel" id="tpOrg" aria-label="${T('tp_origin')}"><option value="motor" ${TP.origin === 'motor' ? 'selected' : ''} ${tpMotorCenter() ? '' : 'disabled'}>${T('tp_org_motor')}</option><option value="world" ${TP.origin === 'world' ? 'selected' : ''}>${T('tp_org_world')}</option></select></div>`;
  tpEl.innerHTML = head + ctl + '<div id="tpBody"></div>';
  tpBind(); tpRenderBody();
}
// phần số liệu + đồ thị + bảng; vẽ lại ~6 lần/giây khi mô phỏng chạy (giữ nguyên ô chọn và vị trí cuộn bảng)
function tpRenderBody() {
  const box = document.getElementById('tpBody'); if (!box) return;
  TP.lastR = performance.now();
  const D = TP.data = tpCompute(TP.key); if (!D) { box.innerHTML = ''; return; }
  const R = D.rows, C = D.C, oname = C ? T('tp_o_motor', { n: esc(C.name) }) : T('tp_o_world');
  const tile = (lbl, val, sub) => `<div class="tptile"><span>${lbl}</span><b>${val}</b>${sub ? `<i>${sub}</i>` : ''}</div>`;
  const tiles = `<div class="tptiles">
    ${tile(T('tp_sx'), tpF(D.xHi.x - D.xLo.x) + ' mm', `${tpF(D.xLo.x)} … ${tpF(D.xHi.x)}`)}
    ${tile(T('tp_sy'), tpF(D.yHi.y - D.yLo.y) + ' mm', `${tpF(D.yLo.y)} … ${tpF(D.yHi.y)}`)}
    ${tile(D.full ? T('tp_len') : T('tp_len_r'), tpF(D.len) + ' mm', '')}
    ${tile(T('tp_vmax'), tpF(D.vHi && D.vHi.v) + ' mm/s', D.vHi ? '@ θ ' + tpDeg(D.vHi.th) : '')}
    ${tile(T('tp_vmin'), tpF(D.vLo && D.vLo.v) + ' mm/s', D.vLo ? '@ θ ' + tpDeg(D.vLo.th) : '')}
    ${tile(T('tp_vavg'), tpF(D.vAvg) + ' mm/s', '')}
    ${tile(T('tp_amax'), tpF(D.aHi && D.aHi.a, 0) + ' mm/s²', D.aHi ? '@ θ ' + tpDeg(D.aHi.th) : '')}
  </div><p class="muted tpnote">${T('tp_note', { rpm: D.rpm, o: oname })}</p>`;
  const charts = `<div class="tpread" id="tpRead"></div>` + tpChart('x', 'x', 'mm', R) + tpChart('y', 'y', 'mm', R) + tpChart('v', '|v|', 'mm/s', R);
  const cols = ['θ (°)', 'x', 'y', 'r', 'φ (°)', 'vx', 'vy', '|v|', '|a|'];
  const body = R.filter(r => r.i % TP.step === 0).map(r => `<tr><td>${r.i}°</td><td>${tpF(r.x, 2)}</td><td>${tpF(r.y, 2)}</td><td>${tpF(r.r, 2)}</td><td>${tpF(r.phi)}</td><td>${tpF(r.vx)}</td><td>${tpF(r.vy)}</td><td>${tpF(r.v)}</td><td>${tpF(r.a, 0)}</td></tr>`).join('');
  const sc = box.querySelector('.tpscroll'), top = sc ? sc.scrollTop : 0;
  box.innerHTML = tiles + charts + `<details class="tptable" ${TP.tableOpen ? 'open' : ''}><summary>${T('tp_table')}</summary>
    <div class="tptctl"><label>${T('tp_step')} <select class="sel" id="tpStep">${[1, 5, 10, 30].map(s => `<option value="${s}" ${s === TP.step ? 'selected' : ''}>${s}°</option>`).join('')}</select></label><button class="btn" id="tpCopy">${T('tp_copy')}</button></div>
    <p class="muted">${T('tp_units')}</p>
    <div class="tpscroll"><table><thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div></details>`;
  const sc2 = box.querySelector('.tpscroll'); if (sc2) sc2.scrollTop = top;
  tpBindBody(); tpCursor();
}
function tpPlace() { if (TP.pos) { tpEl.style.left = TP.pos.x + 'px'; tpEl.style.top = TP.pos.y + 'px'; tpEl.style.right = 'auto'; } }
function tpBind() {
  tpPlace();
  const q = id => document.getElementById(id);
  q('tpClose').onclick = () => { TP.open = false; renderTracePanel(); };
  // kéo bảng bằng thanh tiêu đề (để không che cơ cấu)
  tpEl.querySelector('.tphead').onpointerdown = e => {
    if (e.target.closest('button')) return;
    const st = stage.getBoundingClientRect(), b = tpEl.getBoundingClientRect(), dx = e.clientX - b.left, dy = e.clientY - b.top;
    const mv = ev => { TP.pos = { x: Math.max(0, Math.min(st.width - b.width, ev.clientX - st.left - dx)), y: Math.max(0, Math.min(st.height - 40, ev.clientY - st.top - dy)) }; tpPlace(); };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up); e.preventDefault();
  };
  if (!q('tpSrc')) return;
  q('tpSrc').onchange = e => { TP.key = e.target.value; tpRenderBody(); };
  q('tpOrg').onchange = e => { TP.origin = e.target.value; tpRenderBody(); };
}
function tpBindBody() {
  const q = id => document.getElementById(id);
  q('tpStep').onchange = e => { TP.step = +e.target.value; tpRenderBody(); };
  tpEl.querySelector('.tptable').ontoggle = e => { TP.tableOpen = e.target.open; };
  q('tpCopy').onclick = () => {
    const R = TP.data.rows, csv = ['theta_deg,x_mm,y_mm,r_mm,phi_deg,vx_mm_s,vy_mm_s,v_mm_s,a_mm_s2', ...R.map(r => [r.i, r.x, r.y, r.r, r.phi, r.vx, r.vy, r.v, r.a].map(v => isNaN(v) ? '' : +v.toFixed(4)).join(','))].join('\n');
    (navigator.clipboard ? navigator.clipboard.writeText(csv) : Promise.reject()).then(() => toast(T('tp_copied')), () => toast(T('tp_copyfail')));
  };
  tpEl.querySelectorAll('.thit').forEach(r => {
    const binAt = e => { const b = r.getBoundingClientRect(); return Math.max(0, Math.min(359, Math.round((e.clientX - b.left) / b.width * 360))) % 360; };
    r.onpointermove = e => { TP.hover = binAt(e); tpCursor(); };
    r.onpointerleave = () => { TP.hover = null; tpCursor(); };
    // bấm: nhảy tới tư thế đã ghi ở góc đó
    r.onclick = e => { const b = (TP.bins.get(TP.key) || [])[binAt(e)]; if (!b) return; if (S.playing) togglePlay(); S.pos = b.pos; S.theta = b.th; afterMove(); };
  });
}
// vạch θ hiện tại + con trỏ dò + dòng số đọc
function tpCursor() {
  if (!TP.open || !TP.data) return;
  const R = TP.data.rows, cur = tpBin(S.theta), hv = TP.hover, show = hv ?? cur;
  // ô vừa ghi có thể chưa vào bảng tính (tính lại ~6 lần/giây) → lấy ô có dữ liệu gần nhất
  let row = null, bd = TP_GAP + 1; for (const r of R) { const d = Math.min(Math.abs(r.i - show), 360 - Math.abs(r.i - show)); if (d < bd) { bd = d; row = r; } }
  tpEl.querySelectorAll('.tchart').forEach(fig => {
    const k = fig.dataset.k, { Y } = tpYScale(R, k);
    const c = fig.querySelector('.tcur'), h = fig.querySelector('.thov'), d = fig.querySelector('.tdot');
    c.setAttribute('x1', tpX(cur)); c.setAttribute('x2', tpX(cur));
    h.style.display = hv == null ? 'none' : ''; if (hv != null) { h.setAttribute('x1', tpX(hv)); h.setAttribute('x2', tpX(hv)); }
    const ok = row && !isNaN(row[k]); d.style.display = ok ? '' : 'none'; if (ok) { d.setAttribute('cx', tpX(row.i)); d.setAttribute('cy', Y(row[k])); }
  });
  const el = document.getElementById('tpRead'); if (!el) return;
  el.innerHTML = `<b>θ ${show}°</b>${hv == null ? ` <span class="muted">${T('tp_now')}</span>` : ''}` + (row ? ` · x ${tpF(row.x, 2)} · y ${tpF(row.y, 2)} · |v| ${tpF(row.v)} mm/s · |a| ${tpF(row.a, 0)} mm/s²` : ' · —');
}
document.getElementById('tdBtn').onclick = () => { TP.open = !TP.open; renderTracePanel(); };
document.getElementById('rpm').addEventListener('change', () => { if (TP.open) tpRenderBody(); });
