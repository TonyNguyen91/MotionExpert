// ===== Lõi động học / Kinematics core (pure functions) =====
const TAU = Math.PI * 2;
const D2R = Math.PI / 180, R2D = 180 / Math.PI;

function dist(a, b) { return Math.hypot(b.x - a.x, b.y - a.y); }

// Giao hai đường tròn: tâm A bán kính l1, tâm B bán kính l2, chọn nhánh s
function circleCircle(A, B, l1, l2, s) {
  const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy);
  if (d < 1e-9 || d > l1 + l2 + 1e-9 || d < Math.abs(l1 - l2) - 1e-9) return null;
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const bx = A.x + a * dx / d, by = A.y + a * dy / d;
  return { x: bx - s * h * dy / d, y: by + s * h * dx / d };
}
function dyadSign(A, B, P) {
  const c = (B.x - A.x) * (P.y - A.y) - (B.y - A.y) * (P.x - A.x);
  return c >= 0 ? 1 : -1;
}
// Con trượt: điểm trên đường dẫn qua G hướng ang, cách A một đoạn l
function lineCircle(A, G, ang, l, s) {
  const ux = Math.cos(ang), uy = Math.sin(ang);
  const dx = A.x - G.x, dy = A.y - G.y;
  const proj = dx * ux + dy * uy;
  const perp2 = dx * dx + dy * dy - proj * proj;
  const disc = l * l - perp2;
  if (disc < -1e-9) return null;
  const t = proj + s * Math.sqrt(Math.max(0, disc));
  return { x: G.x + t * ux, y: G.y + t * uy };
}
function sliderSign(A, G, ang, P) {
  const ux = Math.cos(ang), uy = Math.sin(ang);
  const proj = (A.x - G.x) * ux + (A.y - G.y) * uy;
  const t = (P.x - G.x) * ux + (P.y - G.y) * uy;
  return t - proj >= 0 ? 1 : -1;
}
function pointFromLocal(A, B, u, v) {
  const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1;
  const ex = dx / d, ey = dy / d;
  return { x: A.x + u * ex - v * ey, y: A.y + u * ey + v * ex };
}
function localFromPoint(A, B, P) {
  const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1;
  const ex = dx / d, ey = dy / d;
  const px = P.x - A.x, py = P.y - A.y;
  return { u: px * ex + py * ey, v: -px * ey + py * ex };
}

// Giải toàn bộ cơ cấu tại góc vào theta (rad). Trả về map id -> {x,y} hoặc null nếu kẹt.
function solveAll(model, theta) {
  const pos = {};
  for (const j of model.joints) {
    let P = null;
    if (j.type === 'ground') P = { x: j.x0, y: j.y0 };
    else if (j.type === 'crank') {
      const G = pos[j.p[0]];
      if (G) { const a = j.phase + j.ratio * theta; P = { x: G.x + j.r * Math.cos(a), y: G.y + j.r * Math.sin(a) }; }
    } else if (j.type === 'dyad') {
      const A = pos[j.p[0]], B = pos[j.p[1]];
      if (A && B) P = circleCircle(A, B, j.l1, j.l2, j.s);
    } else if (j.type === 'slider') {
      const A = pos[j.p[0]], G = pos[j.p[1]];
      if (A && G) P = lineCircle(A, G, j.ang, j.l, j.s);
    } else if (j.type === 'point') {
      const A = pos[j.p[0]], B = pos[j.p[1]];
      if (A && B) P = pointFromLocal(A, B, j.u, j.v);
    }
    if (!P) return null;
    pos[j.id] = P;
  }
  return pos;
}

// Phân tích một vòng quay: khả năng quay toàn vòng, quỹ đạo, góc truyền nhỏ nhất
function analyze(model, steps = 360) {
  const okArr = [], frames = [];
  for (let i = 0; i <= steps; i++) {
    const th = i / steps * TAU;
    const pos = solveAll(model, th);
    okArr.push(!!pos); frames.push(pos);
  }
  const full = okArr.every(Boolean);
  // khoảng làm việc liên tục chứa theta=0 (cho cơ cấu lắc)
  let range = null;
  if (!full && okArr[0]) {
    let lo = 0, hi = 0;
    while (hi + 1 <= steps && okArr[hi + 1]) hi++;
    while (lo - 1 >= -steps && okArr[(lo - 1 + steps) % steps]) lo--;
    range = [lo / steps * 360, hi / steps * 360];
  }
  // góc truyền nhỏ nhất ở các khớp dyad
  let minTA = 180, minTAJoint = null;
  for (const j of model.joints) {
    if (j.type !== 'dyad') continue;
    for (const f of frames) {
      if (!f) continue;
      const A = f[j.p[0]], B = f[j.p[1]], P = f[j.id];
      const ax = A.x - P.x, ay = A.y - P.y, bx = B.x - P.x, by = B.y - P.y;
      const c = (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by) || 1);
      let mu = Math.acos(Math.max(-1, Math.min(1, c))) * R2D;
      mu = Math.min(mu, 180 - mu);
      if (mu < minTA) { minTA = mu; minTAJoint = j.id; }
    }
  }
  const traces = {};
  for (const j of model.joints) {
    if (!j.trace) continue;
    const pts = frames.map(f => f ? f[j.id] : null);
    let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
    for (const p of pts) if (p) { xmin = Math.min(xmin, p.x); xmax = Math.max(xmax, p.x); ymin = Math.min(ymin, p.y); ymax = Math.max(ymax, p.y); }
    traces[j.id] = { pts, w: xmax - xmin, h: ymax - ymin };
  }
  return { full, startOk: okArr[0], range, minTA: minTAJoint ? minTA : null, minTAJoint, traces };
}

// Dựng mô hình từ đặc tả mẫu (vị trí gợi ý tại theta = 0)
function buildPreset(spec) {
  const model = { joints: [] };
  const pos = {};
  for (const s of spec) {
    const j = { id: s.id, name: s.name || s.id, type: s.type, p: s.p || [], trace: !!s.trace, lock: Object.assign({}, s.lock) };
    if (s.type === 'ground') { j.x0 = s.x; j.y0 = s.y; pos[j.id] = { x: s.x, y: s.y }; }
    else if (s.type === 'crank') {
      j.r = s.r; j.phase = s.phase * D2R; j.ratio = s.ratio || 1;
      const G = pos[j.p[0]]; pos[j.id] = { x: G.x + j.r * Math.cos(j.phase), y: G.y + j.r * Math.sin(j.phase) };
    } else if (s.type === 'dyad') {
      const A = pos[j.p[0]], B = pos[j.p[1]], H = { x: s.x, y: s.y };
      if (s.l1 != null) {
        j.l1 = s.l1; j.l2 = s.l2;
        const p1 = circleCircle(A, B, j.l1, j.l2, 1), p2 = circleCircle(A, B, j.l1, j.l2, -1);
        if (!p1) throw new Error('preset unsolvable ' + s.id);
        j.s = dist(p1, H) <= dist(p2, H) ? 1 : -1;
      } else { j.l1 = dist(A, H); j.l2 = dist(B, H); j.s = dyadSign(A, B, H); }
      pos[j.id] = circleCircle(A, B, j.l1, j.l2, j.s);
    } else if (s.type === 'slider') {
      const A = pos[j.p[0]], G = pos[j.p[1]], H = { x: s.x, y: s.y };
      j.ang = (s.ang || 0) * D2R; j.l = s.l != null ? s.l : dist(A, H);
      j.s = sliderSign(A, G, j.ang, H);
      pos[j.id] = lineCircle(A, G, j.ang, j.l, j.s);
    } else if (s.type === 'point') {
      const A = pos[j.p[0]], B = pos[j.p[1]];
      if (s.u != null) { j.u = s.u; j.v = s.v; } else { const L = localFromPoint(A, B, { x: s.x, y: s.y }); j.u = L.u; j.v = L.v; }
      pos[j.id] = pointFromLocal(A, B, j.u, j.v);
    }
    model.joints.push(j);
  }
  return model;
}

const PRESETS = {
  fourbar: [
    { id: 'O', type: 'ground', x: 0, y: 0 },
    { id: 'Q', type: 'ground', x: 40, y: 0 },
    { id: 'A', type: 'crank', p: ['O'], r: 12, phase: 90 },
    { id: 'B', type: 'dyad', p: ['A', 'Q'], l1: 40, l2: 30, x: 36, y: 28 },
    { id: 'T', type: 'point', p: ['A', 'B'], u: 18, v: 22, trace: true },
  ],
  slider: [
    { id: 'O', type: 'ground', x: 0, y: 0 },
    { id: 'A', type: 'crank', p: ['O'], r: 15, phase: 90 },
    { id: 'S', type: 'slider', p: ['A', 'O'], ang: 0, l: 50, x: 48, y: 0 },
    { id: 'T', type: 'point', p: ['A', 'S'], u: 25, v: 0, trace: true },
  ],
  wings: [
    { id: 'O', type: 'ground', x: 0, y: 0 },
    { id: 'L', type: 'ground', x: -15, y: 30 },
    { id: 'R', type: 'ground', x: 15, y: 30 },
    { id: 'A', type: 'crank', p: ['O'], r: 6, phase: 90 },
    { id: 'B', type: 'dyad', p: ['A', 'L'], x: -3, y: 34 },
    { id: 'C', type: 'dyad', p: ['A', 'R'], x: 3, y: 34 },
    { id: 'WL', type: 'point', p: ['L', 'B'], u: -45, v: 0, trace: true },
    { id: 'WR', type: 'point', p: ['R', 'C'], u: -45, v: 0, trace: true },
  ],
  jansen: [
    { id: 'O', type: 'ground', x: 0, y: 0, lock: { pos: 1 } },
    { id: 'Q', type: 'ground', x: -38, y: -7.8, lock: { pos: 1 } },
    { id: 'M', type: 'crank', p: ['O'], r: 15, phase: 0, lock: { r: 1 } },
    { id: 'J', type: 'dyad', p: ['M', 'Q'], l1: 50, l2: 41.5, x: -15, y: 35, lock: { l1: 1, l2: 1 } },
    { id: 'K', type: 'dyad', p: ['M', 'Q'], l1: 61.9, l2: 39.3, x: -20, y: -40, lock: { l1: 1, l2: 1 } },
    { id: 'E', type: 'dyad', p: ['J', 'Q'], l1: 55.8, l2: 40.1, x: -75, y: 10, lock: { l1: 1, l2: 1 } },
    { id: 'F', type: 'dyad', p: ['E', 'K'], l1: 39.4, l2: 36.7, x: -75, y: -30, lock: { l1: 1, l2: 1 } },
    { id: 'P', type: 'dyad', p: ['F', 'K'], l1: 65.7, l2: 49, x: -45, y: -85, trace: true, lock: { l1: 1, l2: 1 } },
  ],
};

if (typeof module !== 'undefined') module.exports = { solveAll, analyze, buildPreset, PRESETS };
