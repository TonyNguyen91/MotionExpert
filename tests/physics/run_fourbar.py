import random, math, json, sys
from playwright.sync_api import sync_playwright

HTML = 'file:///mnt/user-data/uploads/xuong-co-cau/MrT-Motion-Gen.html'
random.seed(12345)

def gen_crank_rocker(n):
    cases = []
    while len(cases) < n:
        g = random.uniform(40, 120); a = random.uniform(10, 60)
        b = random.uniform(30, 120); c = random.uniform(30, 120)
        L = sorted([('g', g), ('a', a), ('b', b), ('c', c)], key=lambda x: x[1])
        s = L[0][1]; l = L[3][1]; pq = L[1][1] + L[2][1]
        if L[0][0] != 'a' or not (s + l < pq - 1.0): continue  # crank-rocker: a là khâu ngắn nhất, kề giá
        th0 = math.radians(random.uniform(40, 140))
        J1 = (a*math.cos(th0), a*math.sin(th0)); G2 = (g, 0.0)
        dx, dy = G2[0]-J1[0], G2[1]-J1[1]; d = math.hypot(dx, dy)
        if not (abs(b-c) < d < b+c): continue
        # giao hai đường tròn: tâm J1 bán kính b, tâm G2 bán kính c
        A = (b*b - c*c + d*d) / (2*d); h = math.sqrt(max(b*b - A*A, 0))
        ux, uy = dx/d, dy/d; px, py = J1[0]+A*ux, J1[1]+A*uy
        sgn = random.choice([1, -1])
        J2 = (px - sgn*h*uy, py + sgn*h*ux)
        cases.append(dict(g=g, a=a, b=b, c=c, G1=(0.0,0.0), G2=G2, J1=J1, J2=tuple(J2)))
    return cases

def build_geom(g, a, b, c, th0=None):
    th0 = math.radians(70) if th0 is None else th0
    J1 = (a*math.cos(th0), a*math.sin(th0)); G2 = (g, 0.0)
    dx, dy = G2[0]-J1[0], G2[1]-J1[1]; d = math.hypot(dx, dy)
    if not (abs(b-c) < d < b+c): return None
    A = (b*b - c*c + d*d) / (2*d); h = math.sqrt(max(b*b - A*A, 0))
    ux, uy = dx/d, dy/d; px, py = J1[0]+A*ux, J1[1]+A*uy
    J2 = (px - h*uy, py + h*ux)
    return dict(g=g, a=a, b=b, c=c, G1=(0.0,0.0), G2=G2, J1=J1, J2=tuple(J2))

def model_of(cs):
    J = lambda i,x,y,f: dict(id=i,name=i,x=x,y=y,fixed=f,slider=None,slot=None,trace=(i=='J2'),lock={})
    return dict(
        joints=[J('G1',cs['G1'][0],cs['G1'][1],True), J('J1',cs['J1'][0],cs['J1'][1],False),
                J('J2',cs['J2'][0],cs['J2'][1],False), J('G2',cs['G2'][0],cs['G2'][1],True)],
        links=[dict(id='L1',name='L1',joints=['G1','J1'],w=6), dict(id='L2',name='L2',joints=['J1','J2'],w=6),
               dict(id='L3',name='L3',joints=['G2','J2'],w=6)],
        slots=[], motors=[dict(id='M1',joint='G1',link='L1',ratio=1,phase=0)], measures=[], shapes=[],
        drive=dict(reverse=False, limit=None), sketch=dict(pts=[],ents=[],cons=[],dims=[],traces=[]),
        features=[], compounds=[], mates=[], theta0=0, bg=None, joints_meta=None)

JS_RUN = """(m) => {
  loadModel(JSON.parse(JSON.stringify(m)));
  const an = S.an, fr = an.sweep;
  const out = { n: fr.length, full: !!an.full, sweepOK: fr.length > 10 };
  const pts = fr.map(f => ({ th: f.th, J1: f.pos.J1, J2: f.pos.J2, G1: f.pos.G1, G2: f.pos.G2 }));
  out.pts = pts;
  return out;
}"""

JS_GRASHOF = """(m) => {
  loadModel(JSON.parse(JSON.stringify(m)));
  const fb = fourBars();
  if (!fb.length) return { kind: null };
  return { kind: grashof(fb[0]).kind, L: fb[0].L };
}"""

def indep_sim(g, a, b, c, phis_solver, Jsolver):
    G2 = (g, 0.0)
    def cands(phi):
        J1 = (a*math.cos(phi), a*math.sin(phi))
        dx, dy = G2[0]-J1[0], G2[1]-J1[1]; d = math.hypot(dx, dy)
        if not (abs(b-c) <= d <= b+c): return None
        A = (b*b - c*c + d*d) / (2*d); h = math.sqrt(max(b*b - A*A, 0))
        ux, uy = dx/d, dy/d; px, py = J1[0]+A*ux, J1[1]+A*uy
        return [(px - h*uy, py + h*ux), (px + h*uy, py - h*ux)]
    # hành trình khâu lắc từ mô phỏng tay quay chi tiết, nhánh liên tục
    N = 3600; prev = None; rock = []
    for k in range(N+1):
        phi = math.radians(70) + 2*math.pi*k/N
        cs = cands(phi)
        if cs is None: continue
        pick = cs[0] if prev is None else min(cs, key=lambda p: math.hypot(p[0]-prev[0], p[1]-prev[1]))
        prev = pick; rock.append(math.atan2(pick[1], pick[0]-g))
    unw = [rock[0]]
    for x in rock[1:]:
        dd = (x - unw[-1] + math.pi) % (2*math.pi) - math.pi; unw.append(unw[-1] + dd)
    swing = math.degrees(max(unw) - min(unw))
    # kiểm từng điểm: J2 của solver phải trùng nghiệm hình học gần nhất tại cùng góc tay quay
    perr = 0.0
    for phi, J2 in zip(phis_solver, Jsolver):
        cs = cands(phi)
        if cs is None: perr = float('inf'); break
        perr = max(perr, min(math.hypot(J2[0]-p[0], J2[1]-p[1]) for p in cs))
    return [swing], perr

def analytic_swing(g, a, b, c):
    # Vị trí biên khâu lắc: khâu nối và khâu lắc thẳng hàng → |G2J1| = b+c hoặc |b-c|.
    # Góc tại G2 của G2→J1 so với G2→G1 (định lý cosin tam giác G1G2J1): γ(d)=acos((g²+d²-a²)/(2gd))
    # Biên độ = |γ(b+c) - γ(|b-c|)|
    def gam(d):
        return math.acos(max(-1, min(1, (g*g + d*d - a*a) / (2*g*d))))
    return [abs(gam(b + c) - gam(abs(b - c)))]

def build_geom(g, a, b, c, th0=None):
    th0 = math.radians(70) if th0 is None else th0
    J1 = (a*math.cos(th0), a*math.sin(th0)); G2 = (g, 0.0)
    dx, dy = G2[0]-J1[0], G2[1]-J1[1]; d = math.hypot(dx, dy)
    if not (abs(b-c) < d < b+c): return None
    A = (b*b - c*c + d*d) / (2*d); h = math.sqrt(max(b*b - A*A, 0))
    ux, uy = dx/d, dy/d; px, py = J1[0]+A*ux, J1[1]+A*uy
    J2 = (px - h*uy, py + h*ux)
    return dict(g=g, a=a, b=b, c=c, G1=(0.0,0.0), G2=G2, J1=J1, J2=tuple(J2))

def model_of(cs):
    J = lambda i,x,y,f: dict(id=i,name=i,x=x,y=y,fixed=f,slider=None,slot=None,trace=(i=='J2'),lock={})
    return dict(
        joints=[J('G1',cs['G1'][0],cs['G1'][1],True), J('J1',cs['J1'][0],cs['J1'][1],False),
                J('J2',cs['J2'][0],cs['J2'][1],False), J('G2',cs['G2'][0],cs['G2'][1],True)],
        links=[dict(id='L1',name='L1',joints=['G1','J1'],w=6), dict(id='L2',name='L2',joints=['J1','J2'],w=6),
               dict(id='L3',name='L3',joints=['G2','J2'],w=6)],
        slots=[], motors=[dict(id='M1',joint='G1',link='L1',ratio=1,phase=0)], measures=[], shapes=[],
        drive=dict(reverse=False, limit=None), sketch=dict(pts=[],ents=[],cons=[],dims=[],traces=[]),
        features=[], compounds=[], mates=[], theta0=0, bg=None, joints_meta=None)

JS_RUN = """(m) => {
  loadModel(JSON.parse(JSON.stringify(m)));
  const an = S.an, fr = an.sweep;
  const out = { n: fr.length, full: !!an.full, sweepOK: fr.length > 10 };
  const pts = fr.map(f => ({ th: f.th, J1: f.pos.J1, J2: f.pos.J2, G1: f.pos.G1, G2: f.pos.G2 }));
  out.pts = pts;
  return out;
}"""

JS_GRASHOF = """(m) => {
  loadModel(JSON.parse(JSON.stringify(m)));
  const fb = fourBars();
  if (!fb.length) return { kind: null };
  return { kind: grashof(fb[0]).kind, L: fb[0].L };
}"""

def indep_sim(g, a, b, c, phis_solver, Jsolver):
    G2 = (g, 0.0)
    def cands(phi):
        J1 = (a*math.cos(phi), a*math.sin(phi))
        dx, dy = G2[0]-J1[0], G2[1]-J1[1]; d = math.hypot(dx, dy)
        if not (abs(b-c) <= d <= b+c): return None
        A = (b*b - c*c + d*d) / (2*d); h = math.sqrt(max(b*b - A*A, 0))
        ux, uy = dx/d, dy/d; px, py = J1[0]+A*ux, J1[1]+A*uy
        return [(px - h*uy, py + h*ux), (px + h*uy, py - h*ux)]
    # hành trình khâu lắc từ mô phỏng tay quay chi tiết, nhánh liên tục
    N = 3600; prev = None; rock = []
    for k in range(N+1):
        phi = math.radians(70) + 2*math.pi*k/N
        cs = cands(phi)
        if cs is None: continue
        pick = cs[0] if prev is None else min(cs, key=lambda p: math.hypot(p[0]-prev[0], p[1]-prev[1]))
        prev = pick; rock.append(math.atan2(pick[1], pick[0]-g))
    unw = [rock[0]]
    for x in rock[1:]:
        dd = (x - unw[-1] + math.pi) % (2*math.pi) - math.pi; unw.append(unw[-1] + dd)
    swing = math.degrees(max(unw) - min(unw))
    # kiểm từng điểm: J2 của solver phải trùng nghiệm hình học gần nhất tại cùng góc tay quay
    perr = 0.0
    for phi, J2 in zip(phis_solver, Jsolver):
        cs = cands(phi)
        if cs is None: perr = float('inf'); break
        perr = max(perr, min(math.hypot(J2[0]-p[0], J2[1]-p[1]) for p in cs))
    return [swing], perr

def analytic_swing(g, a, b, c):
    # ψ(d) = γ(d) ± δ(d); γ: góc tại G2 giữa G2→G1 và G2→J1 (định lý cosin tam giác G1G2J1)
    # δ: góc tại G2 giữa G2→J1 và G2→J2 (định lý cosin tam giác G2J1J2). Biên độ = |ψ(g+a) - ψ(|g-a|)|
    res = []
    for sgn in (1, -1):
        psi = []
        for d in (g + a, abs(g - a)):
            gam = math.acos(max(-1, min(1, (g*g + d*d - a*a) / (2*g*d))))
            dl = math.acos(max(-1, min(1, (c*c + d*d - b*b) / (2*c*d))))
            psi.append(gam + sgn*dl)
        res.append(abs(psi[0] - psi[1]))
    return res

def main(n_motion=300, n_class=300):
    report = dict(motion=[], classify=[])
    with sync_playwright() as p:
        br = p.chromium.launch()
        pg = br.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(HTML); pg.wait_for_timeout(800)
        assert not errs or True
        # --- Nhóm 1: động học, đối chiếu giải tích ---
        for i, cs in enumerate(gen_crank_rocker(n_motion)):
            r = pg.evaluate(JS_RUN, model_of(cs))
            pts = r['pts']; g, a, b, c = cs['g'], cs['a'], cs['b'], cs['c']
            # 1) đóng vòng: |J1-G1|=a, |J2-J1|=b, |J2-G2|=c
            res = 0.0; ds = []; rocker = []
            for q in pts:
                J1, J2 = q['J1'], q['J2']
                res = max(res, abs(math.hypot(J1['x'],J1['y']) - a), abs(math.hypot(J2['x']-J1['x'],J2['y']-J1['y']) - b), abs(math.hypot(J2['x']-cs['G2'][0],J2['y']) - c))
                ds.append(math.hypot(J1['x']-cs['G2'][0], J1['y']))
                rocker.append(math.atan2(J2['y'], J2['x']-cs['G2'][0]))
            dmin, dmax = min(ds), max(ds)
            # 2) biên độ hành trình khâu lắc (unwrap)
            unw = [rocker[0]]
            for x in rocker[1:]:
                d = x - unw[-1]; d = (d + math.pi) % (2*math.pi) - math.pi; unw.append(unw[-1] + d)
            swing_num = math.degrees(max(unw) - min(unw))
            phis = [math.atan2(q['J1']['y'], q['J1']['x']) for q in pts]
            Jsol = [(q['J2']['x'], q['J2']['y']) for q in pts]
            swings, perr = indep_sim(g, a, b, c, phis, Jsol)
            swings = [s for s in swings]
            ok_swing = abs(swing_num - swings[0]) < 0.05
            ok_point = perr < 1e-3
            ok_d = abs(dmin - abs(g-a)) < 1e-3 and abs(dmax - (g+a)) < 1e-3
            ok_close = res < 1e-4
            report['motion'].append(dict(i=i, g=g, a=a, b=b, c=c, full=r['full'], res=res,
                dmin=dmin, dmax=dmax, exp_dmin=abs(g-a), exp_dmax=g+a,
                swing_num=swing_num, swing_exp=swings, perr=perr,
                ok=bool(ok_close and ok_d and ok_swing and ok_point and r['full'])))
        # --- Nhóm 2: phân loại Grashof, không chuyển động ---
        for i in range(n_class*3):
            if len(report['classify']) >= n_class: break
            g = random.uniform(20, 150); a = random.uniform(20, 150); b = random.uniform(20, 150); c = random.uniform(20, 150)
            if build_geom(g, a, b, c) is None: continue
            L = dict(g=g, a=a, b=b, c=c)
            srt = sorted(L.items(), key=lambda x: x[1]); s = srt[0][1]; l = srt[3][1]; pq = srt[1][1]+srt[2][1]
            if abs(s + l - pq) < 1e-3*l: continue
            if srt[0][0] == 'g': exp = 'gr_dcrank'
            elif srt[0][0] == 'b': exp = 'gr_drock'
            elif srt[0][0] in ('a','c'):
                exp = 'gr_crock' if s + l < pq else 'gr_none'
            else: exp = 'gr_none'
            if s + l > pq: exp = 'gr_none'
            # dựng cơ cấu có các chiều dài này (đặt trước, không cần đúng tư thế, chỉ phân loại)
            cs = build_geom(g, a, b, c)
            if cs is None: continue
            got = pg.evaluate(JS_GRASHOF, model_of(cs))
            report['classify'].append(dict(i=i, L=L, exp=exp, got=got.get('kind'), ok=(got.get('kind') == exp)))
        br.close()
    report['page_errors'] = errs
    json.dump(report, open(sys.argv[1], 'w'), ensure_ascii=False, indent=1)
    m = report['motion']; c = report['classify']
    print('MOTION  total', len(m), 'pass', sum(x['ok'] for x in m))
    print('CLASSIFY total', len(c), 'pass', sum(x['ok'] for x in c))
    print('PAGE ERRORS', len(errs), errs[:3])
    bad = [x for x in m if not x['ok']][:5]
    for x in bad: print('FAIL motion', {k: x[k] for k in ('i','g','a','b','c','full','res','dmin','dmax','swing_num','swing_exp')})
    badc = [x for x in c if not x['ok']][:5]
    for x in badc: print('FAIL class', x)

if __name__ == '__main__':
    main()
