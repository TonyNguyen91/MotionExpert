// ===== Xuất ảnh PNG / video / GIF (D15) và mô hình 3D STEP theo lớp (D17) =====

// ----- lưu file: chạy độc lập dùng <a download>; trong artifact claude.ai chỉ cho .zip → gói lại -----
async function saveBlob(name, blob) {
  await dlReady;
  if (dlCap) {
    try { await dlCap.save({ filename: name + '.zip', data: zipOne(name, new Uint8Array(await blob.arrayBuffer())) }); toast(T('toast_saved')); }
    catch (e) { toast(e && e.code === 'declined' ? T('toast_declined') : T('toast_savefail')); }
    return;
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast(T('toast_saved'));
}

// ----- hộp thoại -----
const XP = { fmt: 'video', scale: 1, fps: 30, clean: false, t: 3, gap: 0.5, hole: 3, zmode: 'order', pins: true, busy: false, cancel: false };
function openExportDialog(kind) {
  closeExportDialog();
  const el = document.createElement('div'); el.className = 'xdlg-back'; el.id = 'xdlg';
  const opt = (v, cur, label) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${label}</option>`;
  const media = `<h3>${T('xp_media')}</h3>
    <div class="props">
      <label>${T('xp_fmt')}</label><select class="sel span2" id="xpFmt">${opt('png', XP.fmt, 'PNG – ' + T('xp_png'))}${opt('video', XP.fmt, T('xp_video') + ' (MP4/WebM)')}${opt('gif', XP.fmt, 'GIF')}</select>
      <label>${T('xp_size')}</label><select class="sel span2" id="xpScale">${opt(1, XP.scale, '100%')}${opt(0.75, XP.scale, '75%')}${opt(0.5, XP.scale, '50%')}</select>
      <label>${T('xp_fps')}</label><select class="sel span2" id="xpFps">${opt(15, XP.fps, '15')}${opt(20, XP.fps, '20')}${opt(30, XP.fps, '30')}${opt(60, XP.fps, '60')}</select>
    </div>
    <label class="toggle"><input type="checkbox" id="xpClean" ${XP.clean ? 'checked' : ''}><span>${T('xp_clean')}</span></label>
    <p class="muted" id="xpInfo"></p>`;
  const step = `<h3>${T('xp_step')}</h3>
    <div class="props">
      <label>${T('xp_t')}</label><span class="unit span2" data-u="mm"><input type="number" id="xpT" step="0.5" value="${XP.t}"></span>
      <label>${T('xp_gap')}</label><span class="unit span2" data-u="mm"><input type="number" id="xpGap" step="0.1" value="${XP.gap}"></span>
      <label>${T('xp_hole')}</label><span class="unit span2" data-u="mm"><input type="number" id="xpHole" step="0.5" value="${XP.hole}"></span>
      <label>${T('xp_z')}</label><select class="sel span2" id="xpZ">${opt('order', XP.zmode, T('xp_z_order'))}${opt('layer', XP.zmode, T('xp_z_layer'))}</select>
    </div>
    <label class="toggle"><input type="checkbox" id="xpPins" ${XP.pins ? 'checked' : ''}><span>${T('xp_pins')}</span></label>
    <p class="muted">${T('xp_step_note')}</p>`;
  el.innerHTML = `<div class="xdlg" role="dialog" aria-modal="true">${kind === 'step' ? step : media}
    <div class="xprog" id="xpProg" hidden><i id="xpBar"></i><span id="xpTxt"></span></div>
    <div class="btnrow"><button class="btn" id="xpCancel">${T('xp_cancel')}</button><button class="btn primary" id="xpGo">${T('xp_go')}</button></div></div>`;
  document.body.appendChild(el);
  const q = id => document.getElementById(id);
  const info = () => { const a = animPlan(); const i = q('xpInfo'); if (i) i.textContent = XP.fmt === 'png' ? T('xp_info_png') : T('xp_info', { n: a.n, s: (a.n / XP.fps).toFixed(1), r: a.desc }); };
  if (kind !== 'step') {
    q('xpFmt').onchange = e => { XP.fmt = e.target.value; if (XP.fmt === 'gif' && XP.fps > 20) { XP.fps = 20; q('xpFps').value = 20; } if (XP.fmt === 'gif' && XP.scale > .75) { XP.scale = .75; q('xpScale').value = .75; } info(); };
    q('xpScale').onchange = e => { XP.scale = +e.target.value; }; q('xpFps').onchange = e => { XP.fps = +e.target.value; info(); }; q('xpClean').onchange = e => { XP.clean = e.target.checked; };
    info();
  } else {
    q('xpT').onchange = e => { XP.t = Math.max(0.2, +e.target.value || 3); }; q('xpGap').onchange = e => { XP.gap = Math.max(0, +e.target.value || 0); };
    q('xpHole').onchange = e => { XP.hole = Math.max(0, +e.target.value || 0); }; q('xpZ').onchange = e => { XP.zmode = e.target.value; }; q('xpPins').onchange = e => { XP.pins = e.target.checked; };
  }
  q('xpCancel').onclick = () => { if (XP.busy) XP.cancel = true; else closeExportDialog(); };
  q('xpGo').onclick = async () => {
    if (XP.busy) return; XP.busy = true; XP.cancel = false; q('xpGo').disabled = true; q('xpProg').hidden = false;
    try { if (kind === 'step') await exportSTEP(); else await exportMedia(); }
    catch (err) { console.error(err); toast(T('xp_fail') + ': ' + (err && err.message || err)); }
    XP.busy = false; closeExportDialog();
  };
}
function closeExportDialog() { const el = document.getElementById('xdlg'); if (el) el.remove(); }
function xpProgress(f, txt) { const b = document.getElementById('xpBar'), t = document.getElementById('xpTxt'); if (b) b.style.width = (f * 100).toFixed(1) + '%'; if (t) t.textContent = txt || ''; }
const nextFrame = () => new Promise(r => setTimeout(r, 0));

// ----- kế hoạch hoạt ảnh: các góc motor cho từng khung -----
function animPlan() {
  const m = S.model, lim = m.drive.limit, an = S.an, rpm = +document.getElementById('rpm').value || 20, dps = rpm * 6;
  if (!m.motors.length || !an) return { th: [S.theta], n: 1, desc: '—' };
  let path;
  if (an.full && !lim.on) { const a = S.theta * R2D; path = [a, a + (m.drive.reverse ? -360 : 360)]; }
  else { const lo = lim.on ? lim.min : an.range[0], hi = lim.on ? lim.max : an.range[1]; const base = S.theta * R2D - thetaDeg(); path = [base + lo, base + hi, base + lo]; }
  let total = 0; for (let i = 1; i < path.length; i++) total += Math.abs(path[i] - path[i - 1]);
  const n = Math.max(2, Math.round(total / dps * XP.fps)), th = [];
  for (let k = 0; k < n; k++) { let d = total * k / n, i = 1; while (i < path.length - 1 && d > Math.abs(path[i] - path[i - 1])) { d -= Math.abs(path[i] - path[i - 1]); i++; } th.push((path[i - 1] + Math.sign(path[i] - path[i - 1]) * d) * D2R); }
  return { th, n, desc: path.length === 2 ? T('xp_rev') : T('xp_rock', { a: path[0].toFixed(0), b: path[1].toFixed(0) }) };
}
// dựng tư thế tại một góc (đi tiếp từ tư thế trước để part vật lý đúng lịch sử) rồi vẽ
function renderAt(st, th) {
  const r = stepTo(S.model, S.cons, st.P, st.th, th, 2 * D2R); if (!r) return false;
  st.P = r; st.th = th; S.pos = r; S.theta = th; draw(); return true;
}
async function exportMedia() {
  const keep = { sel: S.sel, msel: S.msel, hover: S.hover, pos: S.pos, theta: S.theta, playing: S.playing };
  if (S.playing) togglePlay(); S.sel = null; S.msel = []; S.hover = null; S.exportClean = XP.clean;
  const name = projectName();
  try {
    if (XP.fmt === 'png') { draw(); const blob = await new Promise(r => cv.toBlob(r, 'image/png')); await saveBlob(name + '.png', blob); return; }
    const plan = animPlan(), W = Math.round(cv.width * XP.scale / 2) * 2, H = Math.round(cv.height * XP.scale / 2) * 2;
    const ec = document.createElement('canvas'); ec.width = W; ec.height = H; const ex = ec.getContext('2d', { willReadFrequently: XP.fmt === 'gif' });
    const st = { P: S.pos, th: S.theta };
    if (!renderAt(st, plan.th[0])) throw new Error(T('xp_nopose'));
    const grab = () => { ex.drawImage(cv, 0, 0, W, H); };
    if (XP.fmt === 'video') {
      const types = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'], type = types.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
      if (!type) throw new Error(T('xp_novideo'));
      const stream = ec.captureStream(0), track = stream.getVideoTracks()[0], rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 10e6 }), parts = [];
      rec.ondataavailable = e => { if (e.data.size) parts.push(e.data); };
      const done = new Promise(r => rec.onstop = r); rec.start();
      for (let i = 0; i < plan.n && !XP.cancel; i++) {
        if (!renderAt(st, plan.th[i])) break; grab(); track.requestFrame ? track.requestFrame() : null;
        xpProgress(i / plan.n, `${i + 1}/${plan.n}`); await new Promise(r => setTimeout(r, 1000 / XP.fps));
      }
      rec.stop(); await done; if (XP.cancel) return;
      await saveBlob(name + (type.startsWith('video/mp4') ? '.mp4' : '.webm'), new Blob(parts, { type: type.split(';')[0] }));
    } else {
      // GIF: bảng màu từ vài khung mẫu, rồi mã hóa từng khung
      const hist = new Uint32Array(32768), probe = Math.max(1, Math.floor(plan.n / 8));
      for (let i = 0; i < plan.n; i += probe) { renderAt(st, plan.th[i]); grab(); const d = ex.getImageData(0, 0, W, H).data; for (let k = 0; k < d.length; k += 4) hist[((d[k] >> 3) << 10) | ((d[k + 1] >> 3) << 5) | (d[k + 2] >> 3)]++; await nextFrame(); if (XP.cancel) return; }
      const pal = gifPalette(hist), gif = gifEncoder(W, H, pal.rgb, Math.round(100 / XP.fps));
      st.P = keep.pos; st.th = keep.theta; renderAt(st, plan.th[0]);
      for (let i = 0; i < plan.n && !XP.cancel; i++) {
        if (!renderAt(st, plan.th[i])) break; grab();
        const d = ex.getImageData(0, 0, W, H).data, idx = new Uint8Array(W * H);
        for (let k = 0, p = 0; k < d.length; k += 4, p++) idx[p] = pal.lut[((d[k] >> 3) << 10) | ((d[k + 1] >> 3) << 5) | (d[k + 2] >> 3)];
        gif.frame(idx); xpProgress(i / plan.n, `${i + 1}/${plan.n}`); await nextFrame();
      }
      if (XP.cancel) return;
      await saveBlob(name + '.gif', new Blob([gif.end()], { type: 'image/gif' }));
    }
  } finally {
    S.exportClean = false; S.sel = keep.sel; S.msel = keep.msel; S.hover = keep.hover; S.pos = keep.pos; S.theta = keep.theta; afterMove();
  }
}
// bảng màu GIF: 255 màu thường gặp nhất (lượng tử 15 bit) + bảng tra màu gần nhất
function gifPalette(hist) {
  const cand = []; for (let c = 0; c < 32768; c++) if (hist[c]) cand.push(c);
  cand.sort((a, b) => hist[b] - hist[a]); const top = cand.slice(0, 255), rgb = new Uint8Array(256 * 3);
  const ex = c => [((c >> 10) & 31) * 255 / 31, ((c >> 5) & 31) * 255 / 31, (c & 31) * 255 / 31];
  top.forEach((c, i) => { const [r, g, b] = ex(c); rgb[i * 3] = r; rgb[i * 3 + 1] = g; rgb[i * 3 + 2] = b; });
  const lut = new Uint8Array(32768), pr = top.map(ex);
  for (let c = 0; c < 32768; c++) {
    const [r, g, b] = ex(c); let best = 0, bd = Infinity;
    for (let i = 0; i < pr.length; i++) { const dr = r - pr[i][0], dg = g - pr[i][1], db = b - pr[i][2], d = 2 * dr * dr + 4 * dg * dg + 3 * db * db; if (d < bd) { bd = d; best = i; if (!d) break; } }
    lut[c] = best;
  }
  return { rgb, lut };
}
// bộ mã hóa GIF89a (bảng màu chung 256, lặp vô hạn, nén LZW)
function gifEncoder(w, h, rgb, delayCs) {
  const out = []; let buf = [];
  const b = v => buf.push(v & 255), w16 = v => { b(v); b(v >> 8); }, flush = () => { out.push(Uint8Array.from(buf)); buf = []; };
  for (const c of 'GIF89a') b(c.charCodeAt(0));
  w16(w); w16(h); b(0xF7); b(0); b(0); for (let i = 0; i < 768; i++) b(rgb[i]);
  b(0x21); b(0xFF); b(11); for (const c of 'NETSCAPE2.0') b(c.charCodeAt(0)); b(3); b(1); w16(0); b(0);
  flush();
  function lzw(idx) {
    const minBits = 8, clear = 256, eoi = 257, bytes = []; let cur = 0, nbits = 0, size = minBits + 1, next = 258, dict = new Map();
    const emit = code => { cur |= code << nbits; nbits += size; while (nbits >= 8) { bytes.push(cur & 255); cur >>>= 8; nbits -= 8; } };
    emit(clear); let prefix = idx[0];
    for (let i = 1; i < idx.length; i++) {
      const k = idx[i], key = prefix * 256 + k, hit = dict.get(key);
      if (hit !== undefined) { prefix = hit; continue; }
      emit(prefix);
      if (next < 4096) { dict.set(key, next++); if (next > (1 << size) && size < 12) size++; }
      else { emit(clear); dict = new Map(); next = 258; size = minBits + 1; }
      prefix = k;
    }
    emit(prefix); emit(eoi); if (nbits > 0) bytes.push(cur & 255);
    return bytes;
  }
  return {
    frame(idx) {
      b(0x21); b(0xF9); b(4); b(0x04); w16(delayCs); b(0); b(0); // điều khiển đồ họa: giữ khung, độ trễ
      b(0x2C); w16(0); w16(0); w16(w); w16(h); b(0); b(8);
      const data = lzw(idx); for (let i = 0; i < data.length; i += 255) { const n = Math.min(255, data.length - i); b(n); for (let k = 0; k < n; k++) buf.push(data[i + k]); }
      b(0); flush();
    },
    end() { b(0x3B); flush(); return new Blob(out, { type: 'image/gif' }); },
  };
}

// ===== D17: STEP 3D =====
// biên dạng chính xác của khâu trong hệ cục bộ: lưới đỉnh → marching squares → chia đôi tìm điểm biên → vòng kín
function linkOutline(L, holeD) {
  const D = designMap(S.model), fD = frameOf(L, D), body = bodyInside(L, D), sh = collData().shapes[L.id]; if (!fD || !sh) return [];
  const holes = holeD > 0 ? L.joints.filter(id => !getJ(id).hidden).map(id => toLocal(fD, D[id])) : [], hr = holeD / 2;
  const inside = (u, v) => { for (const c of holes) if (Math.hypot(u - c.u, v - c.v) < hr) return false; return body(toWorld(fD, { u, v })); };
  const [u0, v0, u1, v1] = sh.box, h = 0.2, nx = Math.ceil((u1 - u0) / h) + 2, ny = Math.ceil((v1 - v0) / h) + 2, U = i => u0 - h + i * h, V = j => v0 - h + j * h;
  const node = new Uint8Array((nx + 1) * (ny + 1)); for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) node[j * (nx + 1) + i] = inside(U(i), V(j)) ? 1 : 0;
  const at = (i, j) => node[j * (nx + 1) + i], pts = new Map();
  const cross = key => { // điểm biên trên cạnh lưới, chia đôi 16 lần (sai số ~3e-6 mm)
    let p = pts.get(key); if (p) return p;
    const [t, i, j] = [key[0], ...key.slice(1).split(',').map(Number)];
    let a = { u: U(i), v: V(j) }, b = t === 'h' ? { u: U(i + 1), v: V(j) } : { u: U(i), v: V(j + 1) }, ia = inside(a.u, a.v);
    for (let k = 0; k < 16; k++) { const m = { u: (a.u + b.u) / 2, v: (a.v + b.v) / 2 }; if (inside(m.u, m.v) === ia) a = m; else b = m; }
    p = { u: (a.u + b.u) / 2, v: (a.v + b.v) / 2 }; pts.set(key, p); return p;
  };
  const adj = new Map(), link = (a, b) => { (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const c0 = at(i, j), c1 = at(i + 1, j), c2 = at(i + 1, j + 1), c3 = at(i, j + 1), cs = c0 | c1 << 1 | c2 << 2 | c3 << 3; if (!cs || cs === 15) continue;
    const e = ['h' + i + ',' + j, 'v' + (i + 1) + ',' + j, 'h' + i + ',' + (j + 1), 'v' + i + ',' + j], E = [c0 !== c1, c1 !== c2, c2 !== c3, c3 !== c0];
    if (cs === 5 || cs === 10) { // ô yên ngựa: lấy mẫu tâm ô
      const mid = inside(U(i) + h / 2, V(j) + h / 2) ? 1 : 0;
      if ((cs === 5) === !!mid) { link(e[0], e[1]); link(e[2], e[3]); } else { link(e[3], e[0]); link(e[1], e[2]); }
    } else { const k = E.map((x, n) => x ? n : -1).filter(n => n >= 0); link(e[k[0]], e[k[1]]); }
  }
  const loops = [], used = new Set();
  for (const start of adj.keys()) {
    if (used.has(start)) continue; const loop = []; let prev = null, cur = start;
    while (cur && !used.has(cur)) { used.add(cur); loop.push(cross(cur)); const nb = adj.get(cur), nx2 = nb[0] !== prev ? nb[0] : nb[1]; prev = cur; cur = nx2; }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}
const polyArea = P => { let a = 0; for (let i = 0, k = P.length - 1; i < P.length; k = i++) a += (P[k].u * P[i].v - P[i].u * P[k].v); return a / 2; };
const inPolyUV = (p, P) => { let c = false; for (let i = 0, k = P.length - 1; i < P.length; k = i++) { const a = P[i], b = P[k]; if ((a.v > p.v) !== (b.v > p.v) && p.u < (b.u - a.u) * (p.v - a.v) / (b.v - a.v) + a.u) c = !c; } return c; };
// nhóm vòng thành mặt: vòng ngoài (ngược chiều kim đồng hồ) + các lỗ (cùng chiều)
function groupLoops(loops) {
  const depth = loops.map((L, i) => loops.reduce((d, M, k) => d + (k !== i && inPolyUV(L[0], M) ? 1 : 0), 0));
  const faces = [];
  loops.forEach((L, i) => { if (depth[i] % 2 === 0) { if (polyArea(L) < 0) L.reverse(); faces.push({ outer: L, holes: [], i }); } });
  loops.forEach((L, i) => {
    if (depth[i] % 2 === 0) return; if (polyArea(L) > 0) L.reverse();
    let best = null; for (const f of faces) if (depth[f.i] === depth[i] - 1 && inPolyUV(L[0], f.outer) && (!best || Math.abs(polyArea(f.outer)) < Math.abs(polyArea(best.outer)))) best = f;
    if (best) best.holes.push(L);
  });
  return faces;
}
// khớp đoạn thẳng / cung tròn cho vòng kín (dung sai tol mm). Kết quả: [{ t:'line'|'arc', a, b, c?, ccw? }] hoặc [{ t:'circle', c, r }]
// dung sai: đoạn thẳng 0.01 mm; cung tỉ lệ bán kính (đường tròn phác thảo là đa giác 96 cạnh, lệch ≈ 0.0005·r) để cung không “nuốt” điểm của đoạn thẳng kề
function fitLoop(P) {
  const n = P.length, tolL = 0.01, tolA = r => Math.min(0.03, Math.max(0.004, 0.0007 * r));
  // cả vòng là đường tròn?
  { let su = 0, sv = 0; for (const p of P) { su += p.u; sv += p.v; } const cu = su / n, cv = sv / n; let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0;
    for (const p of P) { const x = p.u - cu, y = p.v - cv, z = x * x + y * y; a11 += x * x; a12 += x * y; a22 += y * y; b1 += x * z / 2; b2 += y * z / 2; }
    const det = a11 * a22 - a12 * a12; if (Math.abs(det) > 1e-12) { const x = (b1 * a22 - b2 * a12) / det, y = (a11 * b2 - a12 * b1) / det, c = { u: cu + x, v: cv + y }; let r = 0; for (const p of P) r += Math.hypot(p.u - c.u, p.v - c.v); r /= n;
      if (P.every(p => Math.abs(Math.hypot(p.u - c.u, p.v - c.v) - r) < tolA(r))) return [{ t: 'circle', c, r }]; } }
  // bắt đầu tại góc gãy rõ nhất (lsCircle: đường tròn bình phương tối thiểu, định nghĩa bên dưới)
  let s0 = 0, bestTurn = -1;
  for (let i = 0; i < n; i++) { const a = P[(i - 3 + n) % n], b = P[i], c = P[(i + 3) % n], t = Math.abs(Math.atan2((b.u - a.u) * (c.v - b.v) - (b.v - a.v) * (c.u - b.u), (b.u - a.u) * (c.u - b.u) + (b.v - a.v) * (c.v - b.v))); if (t > bestTurn) { bestTurn = t; s0 = i; } }
  const Q = []; for (let i = 0; i <= n; i++) Q.push(P[(s0 + i) % n]); // Q[n] = Q[0]
  const lineOk = (i, j) => { const a = Q[i], b = Q[j], dx = b.u - a.u, dy = b.v - a.v, L = Math.hypot(dx, dy); if (L < 1e-9) return false; for (let k = i + 1; k < j; k++) if (Math.abs((Q[k].u - a.u) * dy - (Q[k].v - a.v) * dx) / L > tolL) return false; return true; };
  const circ3 = (a, b, c) => { const d = 2 * (a.u * (b.v - c.v) + b.u * (c.v - a.v) + c.u * (a.v - b.v)); if (Math.abs(d) < 1e-12) return null; const a2 = a.u * a.u + a.v * a.v, b2 = b.u * b.u + b.v * b.v, c2 = c.u * c.u + c.v * c.v; return { u: (a2 * (b.v - c.v) + b2 * (c.v - a.v) + c2 * (a.v - b.v)) / d, v: (a2 * (c.u - b.u) + b2 * (a.u - c.u) + c2 * (b.u - a.u)) / d }; };
  const arcFit = (i, j) => {
    if (j - i < 4) return null; const c = circ3(Q[i], Q[(i + j) >> 1], Q[j]); if (!c) return null; const r = Math.hypot(Q[i].u - c.u, Q[i].v - c.v), ta = tolA(r); if (r > 2000) return null;
    let sgn = 0;
    for (let k = i; k < j; k++) {
      if (k > i && Math.abs(Math.hypot(Q[k].u - c.u, Q[k].v - c.v) - r) > ta) return null;
      const cr = (Q[k].u - c.u) * (Q[k + 1].v - c.v) - (Q[k].v - c.v) * (Q[k + 1].u - c.u); if (Math.abs(cr) < 1e-12) continue; const s = Math.sign(cr); if (sgn && s !== sgn) return null; sgn = s;
    }
    // gần như thẳng (độ võng so với dây cung < 2·tolL) → để đoạn thẳng đảm nhận
    const ch = Math.hypot(Q[j].u - Q[i].u, Q[j].v - Q[i].v), sag = r - Math.sqrt(Math.max(0, r * r - ch * ch / 4));
    if (sag < 2 * tolL && sag < r) return null;
    return { c, r, ccw: sgn > 0 };
  };
  const segs = []; let i = 0;
  while (i < n) {
    let jl = i + 1, ja = -1, arc = null;
    for (let j = i + 2; j <= n; j++) { const l = lineOk(i, j), a = arcFit(i, j); if (l) jl = j; if (a) { ja = j; arc = a; } if (!l && !a && j - Math.max(jl, ja) > 3) break; }
    if (ja > jl && arc) { const a = arcFit(i, ja); segs.push({ t: 'arc', a: Q[i], b: Q[ja], c: a.c, ccw: a.ccw, i, j: ja }); i = ja; }
    else { segs.push({ t: 'line', a: Q[i], b: Q[jl] }); i = jl; }
  }
  // gộp đoạn thẳng liên tiếp cùng phương
  for (let k = segs.length - 1; k > 0; k--) { const p = segs[k - 1], q = segs[k]; if (p.t === 'line' && q.t === 'line') { const dx = q.b.u - p.a.u, dy = q.b.v - p.a.v, L = Math.hypot(dx, dy); if (L > 1e-9 && Math.abs((p.b.u - p.a.u) * dy - (p.b.v - p.a.v) * dx) / L < tolL) { segs.splice(k - 1, 2, { t: 'line', a: p.a, b: q.b }); } } }
  // khớp lại mỗi cung bằng bình phương tối thiểu (tâm, bán kính chính xác) rồi đặt đỉnh nối nằm đúng trên đường tròn:
  // thẳng–cung: chiếu điểm tiếp xúc (chân đường vuông góc từ tâm) lên đường tròn · cung–cung: giao điểm hai đường tròn
  for (const g of segs) if (g.t === 'arc') { const f = lsCircle(Q.slice(g.i, g.j + 1)); if (f) { g.c = f.c; g.r = f.r; } else g.r = Math.hypot(g.a.u - g.c.u, g.a.v - g.c.v); }
  const onC = (g, X) => { const d = Math.hypot(X.u - g.c.u, X.v - g.c.v) || 1; return { u: g.c.u + g.r * (X.u - g.c.u) / d, v: g.c.v + g.r * (X.v - g.c.v) / d }; };
  for (let k = 0; k < segs.length && segs.length > 1; k++) {
    const p = segs[k], q = segs[(k + 1) % segs.length], X = p.b; let N = null;
    if (p.t === 'arc' && q.t === 'arc') {
      const dx = q.c.u - p.c.u, dy = q.c.v - p.c.v, d = Math.hypot(dx, dy), a = (p.r * p.r - q.r * q.r + d * d) / (2 * d), h2 = p.r * p.r - a * a;
      if (d > 1e-9 && h2 >= 0) { const h = Math.sqrt(h2), mx = p.c.u + a * dx / d, my = p.c.v + a * dy / d, c1 = { u: mx - h * dy / d, v: my + h * dx / d }, c2 = { u: mx + h * dy / d, v: my - h * dx / d };
        N = Math.hypot(c1.u - X.u, c1.v - X.v) < Math.hypot(c2.u - X.u, c2.v - X.v) ? c1 : c2; if (Math.hypot(N.u - X.u, N.v - X.v) > 0.1) N = onC(p, X); }
      else N = onC(p, X);
    } else if (p.t !== q.t) {
      const ln = p.t === 'line' ? p : q, arc = p.t === 'arc' ? p : q, dx = ln.b.u - ln.a.u, dy = ln.b.v - ln.a.v, L2 = dx * dx + dy * dy;
      let Y = X; if (L2 > 1e-12) { const t = ((arc.c.u - ln.a.u) * dx + (arc.c.v - ln.a.v) * dy) / L2, F = { u: ln.a.u + t * dx, v: ln.a.v + t * dy }; if (Math.abs(Math.hypot(F.u - arc.c.u, F.v - arc.c.v) - arc.r) < 0.02 && Math.hypot(F.u - X.u, F.v - X.v) < 0.5) Y = F; }
      N = onC(arc, Y);
    }
    if (N) { p.b = N; q.a = N; }
  }
  return segs;
}
// đường tròn bình phương tối thiểu (Kåsa) qua tập điểm
function lsCircle(P) {
  const n = P.length; if (n < 3) return null; let su = 0, sv = 0; for (const p of P) { su += p.u; sv += p.v; } const cu = su / n, cv = sv / n;
  let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0; for (const p of P) { const x = p.u - cu, y = p.v - cv, z = x * x + y * y; a11 += x * x; a12 += x * y; a22 += y * y; b1 += x * z / 2; b2 += y * z / 2; }
  const det = a11 * a22 - a12 * a12; if (Math.abs(det) < 1e-14) return null;
  const c = { u: cu + (b1 * a22 - b2 * a12) / det, v: cv + (a11 * b2 - a12 * b1) / det }; let r = 0; for (const p of P) r += Math.hypot(p.u - c.u, p.v - c.v); return { c, r: r / n };
}
// ----- ghi STEP AP214 (B-rep khối đùn) -----
function stepWriter() {
  const L = []; let id = 0; const e = s => { L.push(`#${++id}=${s};`); return '#' + id; };
  const f = x => { const v = Math.abs(x) < 1e-12 ? 0 : x; const s = v.toPrecision(12); return (/[.eE]/.test(s) ? s.replace(/(\.\d*?)0+(e|E|$)/, '$1$2').replace(/\.(e|E|$)/, '.$1') : s + '.').toUpperCase(); };
  const P3 = (x, y, z) => e(`CARTESIAN_POINT('',(${f(x)},${f(y)},${f(z)}))`), D3 = (x, y, z) => e(`DIRECTION('',(${f(x)},${f(y)},${f(z)}))`);
  const ax = (p, z, x) => e(`AXIS2_PLACEMENT_3D('',${p},${z},${x})`);
  const ctx = (() => {
    const mm = e(`(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.))`), rad = e(`(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.))`), sr = e(`(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT())`);
    const unc = e(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-05),${mm},'distance_accuracy_value','confusion accuracy')`);
    return e(`(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((${unc}))GLOBAL_UNIT_ASSIGNED_CONTEXT((${mm},${rad},${sr}))REPRESENTATION_CONTEXT('Context #1','3D Context with UNIT and UNCERTAINTY'))`);
  })();
  const Z = D3(0, 0, 1), X = D3(1, 0, 0), solids = [];
  // khối đùn từ mặt (vòng ngoài CCW + lỗ CW) giữa z0, z1; mỗi vòng = danh sách đoạn (line/arc/circle) trong hệ thế giới (x, y)
  function prism(name, loops, z0, z1) {
    const faces = [], bottomLoops = [], topLoops = [];
    for (const segs of loops) {
      const n = segs.length, vb = [], vt = [], eb = [], et = [], ev = [];
      const start = s => s.t === 'circle' ? { x: s.c.x + s.r, y: s.c.y } : s.a;
      for (const s of segs) { const p = start(s); vb.push(e(`VERTEX_POINT('',${P3(p.x, p.y, z0)})`)); vt.push(e(`VERTEX_POINT('',${P3(p.x, p.y, z1)})`)); }
      const curve = (s, z) => {
        if (s.t === 'line') { const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, l = Math.hypot(dx, dy); return e(`LINE('',${P3(s.a.x, s.a.y, z)},${e(`VECTOR('',${D3(dx / l, dy / l, 0)},${f(l)})`)})`); }
        return e(`CIRCLE('',${ax(P3(s.c.x, s.c.y, z), Z, X)},${f(s.r ?? Math.hypot(s.a.x - s.c.x, s.a.y - s.c.y))})`);
      };
      const sense = s => s.t === 'line' ? '.T.' : (s.t === 'circle' ? s.ccw !== false : s.ccw) ? '.T.' : '.F.';
      for (let i = 0; i < n; i++) {
        const s = segs[i], k = (i + 1) % n;
        eb.push(e(`EDGE_CURVE('',${vb[i]},${vb[k]},${curve(s, z0)},${sense(s)})`));
        et.push(e(`EDGE_CURVE('',${vt[i]},${vt[k]},${curve(s, z1)},${sense(s)})`));
        const p = start(s); ev.push(e(`EDGE_CURVE('',${vb[i]},${vt[i]},${e(`LINE('',${P3(p.x, p.y, z0)},${e(`VECTOR('',${Z},${f(z1 - z0)})`)})`)},.T.)`));
      }
      for (let i = 0; i < n; i++) { // mặt bên: pháp tuyến hướng ra = bên phải chiều đi
        const s = segs[i], k = (i + 1) % n;
        const loop = e(`EDGE_LOOP('',(${e(`ORIENTED_EDGE('',*,*,${eb[i]},.T.)`)},${e(`ORIENTED_EDGE('',*,*,${ev[k]},.T.)`)},${e(`ORIENTED_EDGE('',*,*,${et[i]},.F.)`)},${e(`ORIENTED_EDGE('',*,*,${ev[i]},.F.)`)}))`);
        let surf, same = '.T.';
        if (s.t === 'line') { const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, l = Math.hypot(dx, dy); surf = e(`PLANE('',${ax(P3(s.a.x, s.a.y, z0), D3(dy / l, -dx / l, 0), D3(dx / l, dy / l, 0))})`); }
        else { const ccw = s.t === 'circle' ? s.ccw !== false : s.ccw; surf = e(`CYLINDRICAL_SURFACE('',${ax(P3(s.c.x, s.c.y, z0), Z, X)},${f(s.r ?? Math.hypot(s.a.x - s.c.x, s.a.y - s.c.y))})`); same = ccw ? '.T.' : '.F.'; }
        faces.push(e(`ADVANCED_FACE('',(${e(`FACE_OUTER_BOUND('',${loop},.T.)`)}),${surf},${same})`));
      }
      bottomLoops.push(e(`EDGE_LOOP('',(${eb.map(x => e(`ORIENTED_EDGE('',*,*,${x},.T.)`)).join(',')}))`));
      topLoops.push(e(`EDGE_LOOP('',(${et.map(x => e(`ORIENTED_EDGE('',*,*,${x},.T.)`)).join(',')}))`));
    }
    const bnd = (lp, i, flip) => e(`${i ? 'FACE_BOUND' : 'FACE_OUTER_BOUND'}('',${lp},${flip ? '.F.' : '.T.'})`);
    faces.push(e(`ADVANCED_FACE('',(${bottomLoops.map((lp, i) => bnd(lp, i, true)).join(',')}),${e(`PLANE('',${ax(P3(0, 0, z0), Z, X)})`)},.F.)`));
    faces.push(e(`ADVANCED_FACE('',(${topLoops.map((lp, i) => bnd(lp, i, false)).join(',')}),${e(`PLANE('',${ax(P3(0, 0, z1), Z, X)})`)},.T.)`));
    solids.push(e(`MANIFOLD_SOLID_BREP('${name.replace(/'/g, '')}',${e(`CLOSED_SHELL('',(${faces.join(',')}))`)})`));
  }
  function finish(product) {
    const appc = e(`APPLICATION_CONTEXT('core data for automotive mechanical design processes')`);
    e(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,${appc})`);
    const pc = e(`PRODUCT_CONTEXT('',${appc},'mechanical')`), pr = e(`PRODUCT('${product}','${product}','',(${pc}))`);
    e(`PRODUCT_RELATED_PRODUCT_CATEGORY('part',$,(${pr}))`);
    const pdf = e(`PRODUCT_DEFINITION_FORMATION('','',${pr})`), pdc = e(`PRODUCT_DEFINITION_CONTEXT('part definition',${appc},'design')`);
    const pd = e(`PRODUCT_DEFINITION('design','',${pdf},${pdc})`), pds = e(`PRODUCT_DEFINITION_SHAPE('','',${pd})`);
    const rep = e(`ADVANCED_BREP_SHAPE_REPRESENTATION('',(${ax(P3(0, 0, 0), Z, X)},${solids.join(',')}),${ctx})`);
    e(`SHAPE_DEFINITION_REPRESENTATION(${pds},${rep})`);
    const now = new Date().toISOString().slice(0, 19);
    return `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('MrT Motion Gen mechanism export'),'2;1');\nFILE_NAME('${product}.stp','${now}',(''),(''),'MrT Motion Gen','MrT Motion Gen','');\nFILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));\nENDSEC;\nDATA;\n${L.join('\n')}\nENDSEC;\nEND-ISO-10303-21;\n`;
  }
  return { prism, finish, count: () => solids.length };
}
// xuất cả cơ cấu ở tư thế hiện tại; mỗi khâu một khối, xếp tầng theo thứ tự khâu hoặc theo Lớp
async function exportSTEP() {
  const m = S.model, links = m.links.filter(L => L.kind !== 'cyl' && L.joints.length >= 2), t = XP.t, pitch = t + XP.gap;
  if (!links.length) { toast(T('xp_nolinks')); return; }
  const order = links.slice().sort((a, b) => (a.layer || 0) - (b.layer || 0) || m.links.indexOf(a) - m.links.indexOf(b));
  const level = new Map(order.map((L, i) => [L.id, XP.zmode === 'layer' ? (L.layer || 0) : i]));
  const W = stepWriter(), zr = new Map(), D = designMap(m);
  for (let k = 0; k < order.length; k++) {
    if (XP.cancel) return; const L = order[k]; xpProgress(k / (order.length + 1), L.name); await nextFrame();
    const fD = frameOf(L, D), fN = frameOf(L, S.pos), toW = p => toWorld(fN, p); // hệ cục bộ → thế giới ở tư thế hiện tại
    const faces = groupLoops(linkOutline(L, XP.hole)), z0 = level.get(L.id) * pitch, z1 = z0 + t; zr.set(L.id, [z0, z1]);
    faces.forEach((fc, n) => {
      const conv = segs => segs.map(s => s.t === 'circle' ? { t: 'circle', c: toW(s.c), r: s.r, ccw: s.ccw } : { t: s.t, a: toW(s.a), b: toW(s.b), c: s.c && toW(s.c), r: s.r, ccw: s.ccw });
      const outer = fitLoop(fc.outer), holes = fc.holes.map(h => fitLoop(h));
      if (outer[0].t === 'circle') outer[0].ccw = true; holes.forEach(h => { if (h[0].t === 'circle') h[0].ccw = false; });
      W.prism(L.name + (faces.length > 1 ? '_' + (n + 1) : ''), [conv(outer), ...holes.map(conv)], z0, z1);
    });
  }
  // chốt: trụ Ø lỗ qua các tầng của các khâu chung khớp
  if (XP.pins && XP.hole > 0) for (const j of m.joints) {
    if (j.hidden) continue; const ls = links.filter(L => L.joints.includes(j.id)); if (ls.length < 2 && !(j.fixed && ls.length)) continue;
    const zs = ls.map(L => zr.get(L.id)).filter(Boolean); if (!zs.length) continue;
    const z0 = Math.min(...zs.map(z => z[0])) - (j.fixed ? t : 0), z1 = Math.max(...zs.map(z => z[1])), p = S.pos[j.id];
    W.prism('PIN_' + j.name, [[{ t: 'circle', c: { x: p.x, y: p.y }, r: XP.hole / 2 * 0.98, ccw: true }]], z0, z1);
  }
  xpProgress(1, '');
  const name = projectName(); await saveBlob(name + '.stp', new Blob([W.finish(name.replace(/'/g, ''))], { type: 'application/step' }));
  toast(T('xp_step_done', { n: W.count() }));
}
