#!/bin/bash
# tests/print_pages.sh — พิมพ์เอกสาร 80 แถวด้วย CSS จริงของระบบผ่าน headless Chrome แล้วนับหน้า PDF (ต้อง >= 2)
# จับ pitfall "body เป็น scroll box → พิมพ์ได้หน้าเดียว" (SAM v1.1.3) · ข้ามพร้อม ⚠ ถ้าไม่มี Chrome
cd "$(dirname "$0")/.." || exit 1
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CH" ] || CH="$(command -v google-chrome || command -v chromium || true)"
if [ -z "$CH" ] || [ ! -x "$CH" ]; then echo "SKIP no-chrome"; exit 0; fi
T="${TMPDIR:-/tmp}/sam_print_$$"; mkdir -p "$T"
python3 - "$T" <<'PY'
import re, sys, io
T = sys.argv[1]
css = ''.join(io.open(f, encoding='utf-8').read() for f in ('Styles.html', 'Styles2.html'))
css = re.sub(r'<!--.*?-->', '', css, flags=re.S).replace('<style>', '').replace('</style>', '')
rows = ''.join('<tr><td>08:4%d</td><td>3000%d</td><td>ทดสอบ %d</td><td>ม.1/1</td><td>ครู</td><td>รถติด</td></tr>' % (i % 10, i % 10, i) for i in range(80))
html = ('<!doctype html><html><head><meta charset="utf-8"><style>' + css + '</style></head><body class="prt-on">'
        '<div id="app-root" class="shell"><aside class="sidebar">m</aside><div class="main-area"><div class="page-wrap"><div class="hero">h</div></div></div></div>'
        '<div class="pr-only"><div class="pr-doc"><div class="pr-title"><h2>ทดสอบพิมพ์</h2></div><table class="pr-table"><thead><tr><th>เวลา</th><th>รหัส</th><th>ชื่อ</th><th>ห้อง</th><th>ครู</th><th>สาเหตุ</th></tr></thead><tbody>'
        + rows + '</tbody></table><div class="pr-sign"><div class="s"><div class="line"></div>ครู</div></div></div></div></body></html>')
io.open(T + '/p.html', 'w', encoding='utf-8').write(html)
PY
"$CH" --headless=new --disable-gpu --no-sandbox --no-pdf-header-footer --print-to-pdf="$T/p.pdf" "file://$T/p.html" >/dev/null 2>&1
N=$(python3 -c "import re,sys;d=open(sys.argv[1],'rb').read();m=re.search(rb'/Type\s*/Pages[^>]*?/Count\s+(\d+)',d);print(m.group(1).decode() if m else 0)" "$T/p.pdf" 2>/dev/null)
rm -rf "$T"
echo "PAGES $N"
[ "${N:-0}" -ge 2 ] && exit 0 || exit 2
