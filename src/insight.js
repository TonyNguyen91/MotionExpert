// ===== Phân tích bổ sung: B9 Grashof · vị trí biên · điểm chết, B10 vùng quét, B11 tâm quay tức thời =====

// khung quét; quay đủ vòng thì bỏ khung cuối (θ0 + 360°) trùng khung đầu
function sweepFrames() { const fr = S.an.sweep; return S.an.full && fr.length > 2 && Math.abs((fr[fr.length - 1].th - fr[0].th) * R2D - 360) < 1e-6 ? fr.slice(0, -1) : fr; }
// ----- B9: tìm cơ cấu 4 khâu (nền G1–G2, khâu a: G1–J1, khâu truyền b: J1–J2, khâu c: J2–G2) -----
function fourBars() {
  const m = S.model, D = designMap(m), fx = id => (getJ(id) || {}).fixed, out = [], seen = new Set();
  const bars = m.links.filter(L => L.kind !== 'cyl' && L.kind !== 'body');
  const len = (a, b) => Math.hypot(D[b].x - D[a].x, D[b].y - D[a].y);
  for (const a of bars) for (const g1 of a.joints.filter(fx)) for (const j1 of a.joints.filter(id => !fx(id))) {
    for (const b of bars) {
      if (b === a || !b.joints.includes(j1)) continue;
      for (const j2 of b.joints.filter(id => id !== j1 && !fx(id))) for (const c of bars) {
        if (c === a || c === b || !c.joints.includes(j2)) continue;
        for (const g2 of c.joints.filter(id => fx(id) && id !== g1)) {
          const key = [a.id, b.id, c.id].sort().join('|'); if (seen.has(key)) continue; seen.add(key);
          out.push({ a, b, c, g1, g2, j1, j2, L: { g: len(g1, g2), a: len(g1, j1), b: len(j1, j2), c: len(j2, g2) } });
        }
      }
    }
  }
  return out;
}
function grashof(fb) {
  const L = fb.L, arr = [['g', L.g], ['a', L.a], ['b', L.b], ['c', L.c]].sort((x, y) => x[1] - y[1]);
  const s = arr[0][1], l = arr[3][1], pq = arr[1][1] + arr[2][1], sh = arr[0][0], eps = 1e-6 * l;
  const motorOn = id => S.model.motors.some(mo => mo.link === id);
  let kind;
  if (Math.abs(s + l - pq) < eps) kind = 'gr_change';
  else if (s + l > pq) kind = 'gr_none';
  else kind = sh === 'g' ? 'gr_dcrank' : sh === 'b' ? 'gr_drock' : 'gr_crock';
  const crank = kind === 'gr_crock' ? fb[sh] : null;
  return { kind, s, l, pq, crank, warn: kind === 'gr_crock' && S.model.motors.length && !motorOn(crank.id) && (motorOn(fb.a.id) || motorOn(fb.c.id)) };
}
// vị trí biên của các khâu lắc (khâu quay quanh gối cố định, không gắn motor) trên quét phân tích
function limitPositions() {
  const an = S.an; if (!an || an.sweep.length < 5) return [];
  const out = [], fr = sweepFrames(), fx = id => (getJ(id) || {}).fixed;
  for (const L of S.model.links) {
    if (L.kind === 'cyl' || S.model.motors.some(mo => mo.link === L.id)) continue;
    const g = L.joints.find(fx), o = g && L.joints.find(id => !fx(id)); if (!o || fr.some(f => !f.pos[o] || !f.pos[g])) continue; // khung quét cũ chưa có khớp mới
    let prev = null, ang = fr.map(f => { let a = Math.atan2(f.pos[o].y - f.pos[g].y, f.pos[o].x - f.pos[g].x) * R2D; if (prev != null) a = prev + ((a - prev + 540) % 360 - 180); return prev = a; });
    const n = ang.length, ext = [];
    for (let i = 0; i < n; i++) {
      const pa = ang[an.full ? (i - 1 + n) % n : Math.max(0, i - 1)], pb = ang[an.full ? (i + 1) % n : Math.min(n - 1, i + 1)];
      if ((ang[i] >= pa && ang[i] > pb) || (ang[i] <= pa && ang[i] < pb)) if (i > 0 && i < n - 1 || an.full) ext.push(i);
    }
    if (!ext.length || ext.length > 6) continue; // quay toàn vòng hoặc nhiễu → không phải khâu lắc
    const amp = Math.max(...ang) - Math.min(...ang);
    if (amp > 359) continue;
    const r = { link: L, idx: ext, th: ext.map(i => fr[i].th * R2D), amp };
    // tỉ số thời gian (hồi nhanh) khi motor quay đều: góc motor đi / về giữa hai vị trí biên
    if (an.full && ext.length === 2) { let d = (r.th[1] - r.th[0] + 720) % 360; r.qr = Math.max(d, 360 - d) / Math.min(d, 360 - d); }
    out.push(r);
  }
  return out;
}
// điểm chết: hai khâu nối ở một khớp thẳng hàng (góc truyền ≈ 0° hoặc 180°)
function deadPoints() {
  const an = S.an; if (!an || !an.sweep.length) return [];
  const out = [], fx = id => (getJ(id) || {}).fixed;
  for (const j of S.model.joints) {
    if (fx(j.id)) continue;
    const ls = S.model.links.filter(L => L.joints.includes(j.id) && L.kind !== 'cyl' && L.kind !== 'body'); if (ls.length !== 2) continue;
    const o1 = ls[0].joints.find(x => x !== j.id), o2 = ls[1].joints.find(x => x !== j.id), hits = [];
    sweepFrames().forEach((f, i) => {
      const P = f.pos[j.id], A = f.pos[o1], B = f.pos[o2], ax = A.x - P.x, ay = A.y - P.y, bx = B.x - P.x, by = B.y - P.y;
      const mu = Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / ((Math.hypot(ax, ay) * Math.hypot(bx, by)) || 1)))) * R2D;
      if (Math.min(mu, 180 - mu) < 2.5 && !(hits.length && hits[hits.length - 1].i === i - 1)) hits.push({ i, th: f.th * R2D });
      else if (Math.min(mu, 180 - mu) < 2.5) hits[hits.length - 1].i = i;
    });
    if (hits.length) out.push({ joint: j, th: hits.map(h => h.th) });
  }
  return out;
}
const degS = d => { const v = S.an && S.an.full ? ((d % 360) + 360) % 360 : d; return v.toFixed(0) + '°'; };
function insightRows() {
  let rows = '';
  for (const fb of fourBars()) {
    const g = grashof(fb), nm = `${esc(fb.a.name)}·${esc(fb.b.name)}·${esc(fb.c.name)}`;
    rows += `<dt>${T('a_grashof')} (${nm})</dt><dd class="${g.kind === 'gr_none' || g.kind === 'gr_change' || g.warn ? 'warn' : 'ok'}" title="s + l = ${(g.s + g.l).toFixed(1)} · p + q = ${g.pq.toFixed(1)}">${T(g.kind, { c: g.crank ? esc(g.crank.name) : '' })}${g.warn ? ' · ' + T('gr_warn') : ''}</dd>`;
  }
  for (const r of limitPositions()) rows += `<dt>${T('a_limitpos')} ${esc(r.link.name)}</dt><dd>${r.th.map(degS).join(' / ')} · ${r.amp.toFixed(1)}°${r.qr ? ` · Q ${r.qr.toFixed(2)}` : ''}</dd>`;
  const jams = (S.an && S.an.jams) || [], seen = new Set();
  for (const j of jams) { const key = j.k + j.b + Math.round(j.th); if (seen.has(key)) continue; seen.add(key); rows += j.drawer ? `<dt>${T('a_djam')} ${esc(j.b)} → ${esc(j.k)}</dt><dd class="bad" title="${esc(j.drawer.g)}: h = ${j.drawer.h.toFixed(1)} mm">θ ${degS(j.th)} · Lđ ${j.drawer.L.toFixed(1)} ≤ 2μr·h ${j.drawer.Lmin.toFixed(1)} mm</dd>` : `<dt>${T('a_jam')} ${esc(j.b)} → ${esc(j.k)}</dt><dd class="bad" title="α = ${j.alpha.toFixed(1)}° < φ = ${j.phi.toFixed(1)}°">θ ${degS(j.th)} · α ${j.alpha.toFixed(1)}°</dd>`; }
  for (const d of deadPoints()) rows += `<dt>${T('a_dead')} ${esc(d.joint.name)}</dt><dd class="warn">${d.th.map(degS).join(', ')}</dd>`;
  for (const L of S.model.links) if (L.sweep) { const sw = sweptArea(L); if (sw) rows += `<dt>${T('a_swept')} ${esc(L.name)}</dt><dd>${sw.area.toFixed(0)} mm² · ${sw.w.toFixed(1)} × ${sw.h.toFixed(1)} mm</dd>`; }
  return rows;
}
// vạch đánh dấu vị trí biên / điểm chết trên thanh θ
function renderThetaMarks() {
  let box = document.getElementById('rmarks'); if (!box) { box = document.createElement('div'); box.id = 'rmarks'; rangeEl.insertBefore(box, rangeEl.querySelector('.knob')); }
  if (!S.an || !S.model.motors.length) { box.innerHTML = ''; return; }
  const [d0, d1] = domain(), put = (d, cls, tip) => { let v = d; if (S.an.full) v = ((v - d0) % 360 + 360) % 360 + d0; return v >= d0 - .01 && v <= d1 + .01 ? `<i class="${cls}" style="left:${d2x(v)}px" title="${esc(tip)}"></i>` : ''; };
  let h = '';
  if (S.opt.mklim !== false) for (const r of limitPositions()) r.th.forEach(t => h += put(t, 'mk-lim', T('a_limitpos') + ' ' + r.link.name + ' · ' + degS(t)));
  if (S.opt.mkdead !== false) for (const d of deadPoints()) d.th.forEach(t => h += put(t, 'mk-dead', T('a_dead') + ' ' + d.joint.name + ' · ' + degS(t)));
  box.innerHTML = h;
}

// ----- B10: vùng quét của khâu qua cả vùng làm việc (lưới thế giới, tô bằng ảnh) -----
const swCache = new Map();
function sweptArea(L) {
  const an = S.an, cd = collData(), sh = cd.shapes[L.id]; if (!an || an.sweep.length < 2 || !sh) return null;
  const key = an; const c = swCache.get(L.id); if (c && c.key === key && c.sh === sh) return c;
  // khung mỗi bước quét, chèn thêm khung nội suy để điểm xa không để lại lỗ
  const fr = an.sweep.map(f => frameOf(L, f.pos)).filter(Boolean); if (fr.length < 2) return null;
  const R = Math.max(Math.abs(sh.box[0]), Math.abs(sh.box[2]), Math.abs(sh.box[1]), Math.abs(sh.box[3])) + 1;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const f of fr) { const b = collWorldBox(sh, f); x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]); }
  const res = Math.max(0.2, Math.sqrt((x1 - x0) * (y1 - y0) / 400000)), nx = Math.ceil((x1 - x0) / res) + 1, ny = Math.ceil((y1 - y0) / res) + 1, grid = new Uint8Array(nx * ny);
  const step = Math.max(1, Math.floor(res * .7 / sh.h)), cells = [];
  for (let j = 0; j < sh.ny; j += step) for (let i = 0; i < sh.nx; i += step) if (sh.g[j * sh.nx + i]) cells.push(sh.u0 + (i + .5) * sh.h, sh.v0 + (j + .5) * sh.h);
  for (let j = 0; j < sh.ny; j++) for (let i = 0; i < sh.nx; i++) if (sh.g[j * sh.nx + i] === 1) cells.push(sh.u0 + (i + .5) * sh.h, sh.v0 + (j + .5) * sh.h);
  const stamp = f => { for (let k = 0; k < cells.length; k += 2) { const u = cells[k], v = cells[k + 1], x = f.ox + u * f.ex - v * f.ey, y = f.oy + u * f.ey + v * f.ex; grid[Math.floor((y - y0) / res) * nx + Math.floor((x - x0) / res)] = 1; } };
  const loops = an.full ? fr.length : fr.length - 1;
  for (let i = 0; i < loops; i++) {
    const a = fr[i], b = fr[(i + 1) % fr.length], aa = Math.atan2(a.ey, a.ex), ab = Math.atan2(b.ey, b.ex), da = ((ab - aa + 3 * Math.PI) % TAU) - Math.PI;
    const n = Math.max(1, Math.ceil((Math.hypot(b.ox - a.ox, b.oy - a.oy) + Math.abs(da) * R) / (res * .7)));
    for (let k = 0; k < n; k++) { const t = k / n, ang = aa + da * t; stamp({ ox: a.ox + (b.ox - a.ox) * t, oy: a.oy + (b.oy - a.oy) * t, ex: Math.cos(ang), ey: Math.sin(ang) }); }
  }
  if (!an.full) stamp(fr[fr.length - 1]);
  let cnt = 0, gx0 = nx, gx1 = 0, gy0 = ny, gy1 = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (grid[j * nx + i]) { cnt++; gx0 = Math.min(gx0, i); gx1 = Math.max(gx1, i); gy0 = Math.min(gy0, j); gy1 = Math.max(gy1, j); }
  const out = { key, sh, x0, y0, res, nx, ny, grid, area: cnt * res * res, w: (gx1 - gx0 + 1) * res, h: (gy1 - gy0 + 1) * res, img: null, col: null };
  swCache.set(L.id, out); return out;
}
function drawSwept() {
  for (const L of S.model.links) {
    if (!L.sweep) continue; const sw = sweptArea(L); if (!sw) continue;
    const col = linkColor(L);
    if (!sw.img || sw.col !== col) { // ảnh: vùng quét nhạt + viền đậm
      const c = document.createElement('canvas'); c.width = sw.nx; c.height = sw.ny; const g = c.getContext('2d'), im = g.createImageData(sw.nx, sw.ny);
      const t = document.createElement('canvas').getContext('2d'); t.fillStyle = col; t.fillRect(0, 0, 1, 1); const [r, gg, b] = t.getImageData(0, 0, 1, 1).data;
      const at = (i, j) => i >= 0 && j >= 0 && i < sw.nx && j < sw.ny && sw.grid[j * sw.nx + i];
      for (let j = 0; j < sw.ny; j++) for (let i = 0; i < sw.nx; i++) {
        if (!sw.grid[j * sw.nx + i]) continue; const edge = !at(i - 1, j) || !at(i + 1, j) || !at(i, j - 1) || !at(i, j + 1), o = ((sw.ny - 1 - j) * sw.nx + i) * 4;
        im.data[o] = r; im.data[o + 1] = gg; im.data[o + 2] = b; im.data[o + 3] = edge ? 200 : 46;
      }
      g.putImageData(im, 0, 0); sw.img = c; sw.col = col;
    }
    const tl = w2s({ x: sw.x0, y: sw.y0 + sw.ny * sw.res });
    ctx.imageSmoothingEnabled = false; ctx.drawImage(sw.img, tl.x, tl.y, sw.nx * sw.res * S.view.s, sw.ny * sw.res * S.view.s); ctx.imageSmoothingEnabled = true;
  }
}

// ----- B11: tâm quay tức thời (IC) của mỗi khâu chuyển động + polode cố định của khâu đang chọn -----
S.opt.ic = false;
let icCache = null;
function icOf(A, B, vA, vB) {
  const na = Math.hypot(vA.x, vA.y), nb = Math.hypot(vB.x, vB.y), sc = na * nb, det = vA.x * vB.y - vA.y * vB.x;
  if (Math.max(na, nb) < 1e-9) return null; // khâu đứng yên
  if (na < 1e-6 * nb) return { x: A.x, y: A.y }; if (nb < 1e-6 * na) return { x: B.x, y: B.y }; // một điểm đứng yên (gối) → IC tại đó
  if (Math.abs(det) < 1e-6 * sc) return { inf: true };
  const c1 = A.x * vA.x + A.y * vA.y, c2 = B.x * vB.x + B.y * vB.y;
  return { x: (c1 * vB.y - c2 * vA.y) / det, y: (vA.x * c2 - vB.x * c1) / det };
}
function icNow() {
  if (icCache && icCache.pos === S.pos && icCache.th === S.theta) return icCache.list;
  // vận tốc bằng sai phân trung tâm (±δ); ở đầu vùng làm việc thì một phía
  const d = 0.25 * D2R, mv = S.model.motors.length, Qp = mv ? stepTo(S.model, S.cons, S.pos, S.theta, S.theta + d, d) : null, Qm = mv ? stepTo(S.model, S.cons, S.pos, S.theta, S.theta - d, d) : null;
  const hi = Qp || S.pos, lo = Qm || S.pos, list = [];
  if (Qp || Qm) for (const L of S.model.links) {
    if (L.kind === 'cyl' || L.joints.length < 2) continue;
    const a = L.joints[0], b = L.joints[1], A = S.pos[a], B = S.pos[b];
    const vA = { x: hi[a].x - lo[a].x, y: hi[a].y - lo[a].y }, vB = { x: hi[b].x - lo[b].x, y: hi[b].y - lo[b].y };
    const I = icOf(A, B, vA, vB); if (I && !I.inf) list.push({ L, I });
  }
  icCache = { pos: S.pos, th: S.theta, list }; return list;
}
function drawIC() {
  if (!S.opt.ic || !S.model.motors.length) return;
  const span = sizeOf(S.pos) * 6, P0 = Object.values(S.pos)[0] || { x: 0, y: 0 };
  ctx.font = '600 10.5px ' + monoFont(); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  for (const { L, I } of icNow()) {
    if (Math.hypot(I.x - P0.x, I.y - P0.y) > span) continue;
    const q = w2s(I), col = linkColor(L); ctx.strokeStyle = col; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(q.x, q.y, 5, 0, TAU); ctx.moveTo(q.x - 8, q.y); ctx.lineTo(q.x + 8, q.y); ctx.moveTo(q.x, q.y - 8); ctx.lineTo(q.x, q.y + 8); ctx.stroke();
    ctx.fillStyle = colors.ink; ctx.fillText('I·' + L.name, q.x + 9, q.y - 8);
  }
  // polode cố định (quỹ tích tâm quay tức thời trên nền) của khâu đang chọn
  const L = S.sel && S.sel.k === 'l' && getL(S.sel.id), an = S.an; if (!L || L.kind === 'cyl' || !an || an.sweep.length < 3) return;
  const fr = an.sweep, n = fr.length, a = L.joints[0], b = L.joints[1];
  ctx.strokeStyle = linkColor(L); ctx.lineWidth = 1.4; ctx.setLineDash([5, 4]); ctx.beginPath(); let pen = false;
  for (let i = 0; i < n; i++) {
    const p = fr[an.full ? (i - 1 + n) % n : Math.max(0, i - 1)].pos, q = fr[an.full ? (i + 1) % n : Math.min(n - 1, i + 1)].pos, c = fr[i].pos;
    const I = icOf(c[a], c[b], { x: q[a].x - p[a].x, y: q[a].y - p[a].y }, { x: q[b].x - p[b].x, y: q[b].y - p[b].y });
    if (!I || I.inf || Math.hypot(I.x - P0.x, I.y - P0.y) > span) { pen = false; continue; }
    const s = w2s(I); pen ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y); pen = true;
  }
  ctx.stroke(); ctx.setLineDash([]);
}

// ----- thuộc tính khâu: bỏ qua va chạm / vật lý, hiện vùng quét -----
function setLinkFlag(lid, key, on) { const L = getL(lid); if (!L) return; commitPose(); if (on) L[key] = true; else delete L[key]; if (key === 'sweep') { renderAll(); markDirty(); pushUndo(); return; } rebuild(); }
