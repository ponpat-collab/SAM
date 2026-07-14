#!/bin/bash
# build_pages.sh — ประกอบ docs/app.html (GitHub Pages Edition) จาก partials เดิม
# ใช้ split/join เท่านั้น (ห้าม String.replace — $$/$&/$1 ใน content จะเพี้ยน)
# ไม่กระทบการรันบน GAS Web App: Index.html/partials ไม่ถูกแก้ · แค่ประกอบใหม่เป็น static
cd "$(dirname "$0")" || exit 1

EXEC="https://script.google.com/macros/s/AKfycbwHPVbFjqNnFnodwdXpxnZvpHREkzN6br3PZQZNq9BwHFutv-e7-kQt68pYe9nGGoU7/exec"

node -e '
var fs = require("fs");
var EXEC = process.argv[1];
var STAMP = new Date().toISOString();
var html = fs.readFileSync("Index.html", "utf8");

function inject(marker, file) {
  var body = fs.readFileSync(file, "utf8");
  if (html.indexOf(marker) < 0) { console.error("✗ ไม่พบ marker: " + marker); process.exit(2); }
  html = html.split(marker).join(body);          // ★ split/join — ปลอดภัยกับ $ ใน content
}

// 1) ตัด <base target="_top"> (ใช้เฉพาะ GAS iframe · Pages ไม่ต้อง)
html = html.split("<base target=\"_top\">").join("");

// 2) inject partials (เหมือน HtmlService include)
inject("<?!= include(\x27Styles\x27); ?>", "Styles.html");
inject("<?!= include(\x27Styles2\x27); ?>", "Styles2.html");
inject("<?!= include(\x27ScriptsCore\x27); ?>", "ScriptsCore.html");
inject("<?!= include(\x27ScriptsPages\x27); ?>", "ScriptsPages.html");
inject("<?!= include(\x27ScriptsPages2\x27); ?>", "ScriptsPages2.html");
inject("<?!= include(\x27Scripts\x27); ?>", "Scripts.html");

// 3) แทน inline boot ด้วย API base (ต้องอยู่ก่อน ScriptsCore — ตำแหน่งเดิมของ sam-boot ถูกต้องอยู่แล้ว)
var bootMarker = "<script id=\"sam-boot\" type=\"application/json\"><?!= BOOT_JSON ?></script>";
if (html.indexOf(bootMarker) < 0) { console.error("✗ ไม่พบ sam-boot marker"); process.exit(2); }
html = html.split(bootMarker).join("<script>window.__SAM_API_BASE__=" + JSON.stringify(EXEC) + ";</script>");

// 4) cache-busting (GitHub Pages cache ~10 นาที) + build stamp
var cacheMeta = "<meta http-equiv=\"Cache-Control\" content=\"no-cache, no-store, must-revalidate\">\n  <meta http-equiv=\"Pragma\" content=\"no-cache\">\n  <meta http-equiv=\"Expires\" content=\"0\">";
html = html.split("<meta charset=\"UTF-8\">").join("<meta charset=\"UTF-8\">\n  " + cacheMeta);
html = html.split("</body>").join("  <!-- build:" + STAMP + " -->\n</body>");

// 5) guard: ห้ามเหลือ scriptlet <?= / <?!= (จะโชว์เป็นข้อความ)
if (/<\?!?=|<\?[^?]/.test(html)) { console.error("✗ เหลือ scriptlet ใน output — ประกอบไม่ครบ"); process.exit(2); }

fs.mkdirSync("docs", { recursive: true });
fs.writeFileSync("docs/app.html", html);
fs.writeFileSync("docs/index.html", html);       // เปิด github.io/repo/ ได้เลย
console.log("✓ docs/app.html + index.html (" + Math.round(html.length/1024) + " KB · build " + STAMP + ")");
' "$EXEC" || exit 1

# guard: $$ (querySelectorAll) ต้องไม่ถูกยุบเป็น $ (ถ้าใช้ String.replace แทน split/join จะยุบ)
if grep -q 'function \$\$(' docs/app.html; then echo "✓ \$\$ คงอยู่ (split/join ไม่ยุบ)"; else echo "✗ \$\$ หาย — build เพี้ยน"; exit 1; fi
echo "✓ build เสร็จ — docs/ พร้อม push ขึ้น GitHub Pages"
