#!/usr/bin/env python3
# ─────────────────────────────────────────────────────────────
#  css_class_lint — จับ "คลาสใน markup ที่ไม่มีนิยาม CSS"
#  (บทเรียน v4.2.1: search-box มี markup แต่ไม่มี CSS → ไอคอนหลุดนอก input)
#
#  ตัด false-positive 3 แบบ:
#   1) dynamic prefix — คลาสที่ต่อสตริง ('medal-' + x) จับได้เป็นหางลงท้าย '-'
#      หรือมี "'+"/'"+' ตามหลังทันที → ข้าม
#   2) bootstrap-icons (bi, bi-*) — ฟอนต์ไอคอนภายนอก
#   3) ALLOW — wrapper เชิงความหมาย/JS-hook/คอลัมน์เดียว ที่ตั้งใจไม่มี CSS
#  exit 1 ถ้าพบคลาสที่ "ใช้จริงแต่ไม่มีนิยามและไม่อยู่ allowlist"
# ─────────────────────────────────────────────────────────────
import re, glob, sys, os

os.chdir(os.path.join(os.path.dirname(__file__), '..'))

# wrapper/hook ที่ตั้งใจไม่มี CSS (ทบทวนแล้ว v4.2.1) — เพิ่มใหม่ต้องมีเหตุผล
ALLOW = {
    # ── ใส่คลาสที่ "ตั้งใจไม่มี CSS" ของระบบคุณที่นี่ พร้อมเหตุผลกำกับ ──
    # ตัวอย่างประเภทที่ allowlist ได้ (ต้องมีเหตุผล ห้ามใส่เพื่อกลบบั๊กจริง):
    #   'form-grid',      # wrapper เชิงความหมาย — ลูก .fg-2/3/4 มีสไตล์
    #   'fg-1',           # กริดคอลัมน์เดียว = block ปกติ
    #   'nav-bell-wrap',  # JS hook สำหรับ .closest() — ไม่ต้องสไตล์
    #   'lp-count',       # <span data-to> นับเลขด้วย JS
}

def strip_noise(css):
    return re.sub(r'/\*.*?\*/', '', css, flags=re.S)

# 1) คลาสที่ "นิยาม" ใน CSS (ทุก <style> ในทุก .html)
defined = set()
for f in glob.glob('*.html'):
    for sm in re.finditer(r'<style[^>]*>(.*?)</style>', open(f, encoding='utf-8').read(), re.S):
        for cm in re.finditer(r'\.([A-Za-z][\w-]*)', strip_noise(sm.group(1))):
            defined.add(cm.group(1))

# 2) คลาสที่ "ใช้" ใน markup — เก็บบริบทหลัง match เพื่อดูว่าเป็น dynamic prefix ไหม
used = {}
for f in glob.glob('*.html'):
    txt = open(f, encoding='utf-8').read()
    for m in re.finditer(r'class=\\?["\']([^"\'\\]+)', txt):
        frag = m.group(1)
        after = txt[m.end():m.end()+3]          # อักขระถัดไปหลังปิด group
        toks = frag.split()
        for i, c in enumerate(toks):
            if not c:
                continue
            is_last = (i == len(toks) - 1)
            # dynamic: token สุดท้ายที่ตามด้วย '+ หรือ "+ (สตริงต่อ) หรือ ลงท้าย '-'
            dyn = is_last and (c.endswith('-') or after[:1] in ('', ' ') and after.lstrip()[:1] in ("+",))
            dyn = dyn or (is_last and (after.startswith("'+") or after.startswith('"+') or after.startswith("' +") or after.startswith('" +')))
            if dyn:
                continue
            used.setdefault(c, set()).add(f)

BI = re.compile(r'^bi(-.*)?$')
undef = {c: v for c, v in used.items()
         if c not in defined and not BI.match(c) and c not in ALLOW}

if undef:
    print("CSS-LINT: พบคลาสใน markup ที่ไม่มีนิยาม CSS (ไม่อยู่ใน allowlist):")
    for c in sorted(undef):
        print("  • .%s  <- %s" % (c, ",".join(sorted(undef[c]))))
    print("แก้: เพิ่ม CSS ให้คลาสนั้น หรือถ้าตั้งใจไม่มีสไตล์ ใส่ใน ALLOW พร้อมเหตุผล")
    sys.exit(1)

print("CSS-LINT ผ่าน: ทุกคลาสใน markup มีนิยาม CSS (หรืออยู่ allowlist %d ตัว)" % len(ALLOW))
sys.exit(0)
