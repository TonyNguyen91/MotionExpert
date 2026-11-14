# Ghép các module trong src/ thành một file HTML duy nhất: xuong-co-cau.html
import os
d = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'src') + os.sep
rd = lambda f: open(d + f, encoding='utf-8').read()
ui = rd('ui5.html')
css = rd('fonts.css') + rd('tokens.css') + rd('layout5.css')  # phông nhúng sẵn: chạy offline, không gọi Google Fonts
app = ''.join(rd(f) + '\n' for f in ['app5_i18n.js', 'sketch_i18n.js', 'app5_model.js', 'app5_view.js', 'sketch_ui.js', 'sketch_xf.js', 'sketch_trace.js', 'mates.js', 'collide.js', 'tracedata.js', 'insight.js', 'freedof.js', 'fea.js', 'align.js', 'exporter.js', 'bgxf.js', 'synth.js', 'pathjoint.js', 'selcopy.js', 'app5_ui_top.js', 'app5_ui_rest.js', 'sk_onshape.js', 'mpart.js', 'npos.js', 'app5_main.js'])
sk = rd('sketch_core.js').replace("if (typeof module !== 'undefined') module.exports = SK;", "") + '\n' + rd('sketch_ops.js')
out = ui.replace('/*STYLE*/', css).replace('/*CORE*/', rd('core.js')).replace('/*SOLVER*/', rd('solver4.js')).replace('/*SKETCH*/', sk).replace('/*APP*/', app)
out = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' + out + '</body></html>'
root = os.path.dirname(d[:-1])
for name in ('MrT-Motion-Gen.html', 'xuong-co-cau.html'):  # tên mới + giữ tên cũ cho lối tắt đã có
    open(os.path.join(root, name), 'w', encoding='utf-8').write(out)
print('OK -> MrT-Motion-Gen.html (+ xuong-co-cau.html)')
