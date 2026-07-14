#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  _audit.sh — Pre-deploy Audit Gate · 31 ด่าน (บังคับรันก่อน deploy ทุกครั้ง)
#  Version 1.1.0 · 2026-07-10 · ครูวิรัตน์  หาดคำ · www.kruwirat.com
#  Notice: ห้ามจำหน่าย · แบ่งปันเพื่อการศึกษาและต่อยอดเท่านั้น
# ───────────────────────────────────────────────────────────────
#  ⚙️  เริ่มโปรเจกต์ใหม่ — แก้ 4 จุดนี้เท่านั้น แล้วใช้ได้ทันที
#     1) APP_NAME ด้านล่าง            — ชื่อระบบที่โชว์ตอนรัน
#     2) NS ด้านล่าง                   — namespace ของ IIFE (เช่น PP5 ใน PP5.boot())
#     3) INERT / ALLHTML               — รายชื่อไฟล์ HTML จริงของโปรเจกต์
#     4) ด่าน 30 (CDN allowlist)       — เพิ่ม/ลด host ที่อนุญาต
#  ⚠️  ด่าน 10 · 27 อ้าง $NS · ด่าน 31 อ้าง claude.md + .claude/RULES.md
#      ถ้าโปรเจกต์ไม่มีไฟล์เหล่านั้น ให้ลบด่านนั้นทิ้ง อย่าใส่ exclusion
#      (ดู pitfall "Audit Gate Whitelist Trap" ใน claude.md)
# ═══════════════════════════════════════════════════════════════
cd "$(dirname "$0")" || exit 1
FAIL=0
APP_NAME="ระบบงานปกครองนักเรียน"
NS="SAM"
INERT="ScriptsCore.html ScriptsPages.html ScriptsPages2.html"
ALLHTML="Index.html Styles.html Styles2.html ScriptsCore.html ScriptsPages.html ScriptsPages2.html Scripts.html"

echo "════════ PRE-DEPLOY AUDIT · $APP_NAME ════════"

echo "─1) .gs syntax"
for f in *.gs; do
  cp "$f" /tmp/_pp5_check.js
  if ! node --check /tmp/_pp5_check.js 2>/tmp/_pp5_err; then
    echo "  ✗ $f"; cat /tmp/_pp5_err; FAIL=1
  fi
done
[ $FAIL -eq 0 ] && echo "  ✓ ผ่านทุกไฟล์"

echo "─2) inert JS body syntax"
for f in $INERT Scripts.html; do
  node -e '
    var fs=require("fs"), t=fs.readFileSync(process.argv[1],"utf8");
    var m=t.match(/<script[^>]*>([\s\S]*)<\/script>/);
    if(!m){console.log("  ✗ "+process.argv[1]+": ไม่พบ <script> wrapper");process.exit(2);}
    try{ new Function(m[1]); console.log("  ✓ "+process.argv[1]+" ("+Math.round(m[1].length/1024)+" KB)"); }
    catch(e){ console.log("  ✗ "+process.argv[1]+": "+e.message); process.exit(2); }
  ' "$f" || FAIL=1
done

echo "─3) div-balance per render function (★ จับ grid/panel ลืมปิด)"
node -e '
  var fs=require("fs"), bad=0;
  ["ScriptsCore.html","ScriptsPages.html","ScriptsPages2.html"].forEach(function(f){
    var src=fs.readFileSync(f,"utf8");
    src.split(/(?=function [A-Za-z_$][\w$]*\s*\(|P\.route\()/).forEach(function(p){
      var o=(p.match(/<div/g)||[]).length, c=(p.match(/<\/div>/g)||[]).length;
      if(o!==c){
        var nm=(p.match(/^(function [A-Za-z_$][\w$]*|P\.route\([^)]*)/)||["?"])[0];
        console.log("  ✗ "+f+" · "+nm.substring(0,52)+" · diff="+(o-c)); bad++;
      }
    });
  });
  if(!bad) console.log("  ✓ สมดุลทุกฟังก์ชัน");
  process.exit(bad?2:0);
' || FAIL=1

echo "─4) semantic container tags balance"
BAD4=0
for f in $INERT Index.html; do
  for tag in header aside nav main section article form select table thead tbody details; do
    o=$(grep -oE "<$tag( |>)" "$f" 2>/dev/null | wc -l | tr -d ' ')
    c=$(grep -oE "</$tag>" "$f" 2>/dev/null | wc -l | tr -d ' ')
    if [ "$o" != "$c" ]; then echo "  ✗ $f: <$tag> open=$o close=$c"; BAD4=1; FAIL=1; fi
  done
done
[ $BAD4 -eq 0 ] && echo "  ✓ สมดุลทุก tag"

echo "─5) \$() trap (single-element selector + Array method)"
if grep -nE '(^|[^$])\$\([^)]*\)\.(forEach|map|filter|reduce|some|every)' $INERT >/dev/null 2>&1; then
  grep -nE '(^|[^$])\$\([^)]*\)\.(forEach|map|filter|reduce|some|every)' $INERT; FAIL=1
else echo "  ✓ ไม่มี"; fi

echo "─6) inline event handler ใน SPA (CSP block)"
if grep -nE '\son(click|error|load|submit|change|input)=' $INERT Index.html \
  | grep -vE 'google\.script\.host\.close|onclick="window\.(print|close)\(\)"' >/dev/null 2>&1; then
  grep -nE '\son(click|error|load|submit|change|input)=' $INERT Index.html \
    | grep -vE 'google\.script\.host\.close|onclick="window\.(print|close)\(\)"'
  FAIL=1
else echo "  ✓ ไม่มี"; fi

echo "─7) '+ return' leak (string-concat closure)"
if grep -nE '^\s+\+\s+(return|if|for|while|var|let|const|throw)\b' $ALLHTML >/dev/null 2>&1; then
  grep -nE '^\s+\+\s+(return|if|for|while|var|let|const|throw)\b' $ALLHTML; FAIL=1
else echo "  ✓ ไม่มี"; fi

echo "─8) scriptlet leak ใน partial (ห้ามมี <?= นอก Index.html)"
BAD8=0
for f in Styles.html Styles2.html ScriptsCore.html ScriptsPages.html ScriptsPages2.html Scripts.html; do
  if grep -qE '<\?!?=|<\?[^?]' "$f"; then echo "  ✗ $f: พบ scriptlet (จะไม่ถูก evaluate)"; BAD8=1; FAIL=1; fi
done
[ $BAD8 -eq 0 ] && echo "  ✓ ไม่มี"

echo "─9) literal </script inside inert blocks"
BAD9=0
for f in $INERT; do
  n=$(grep -c '</script' "$f")
  if [ "$n" != "1" ]; then echo "  ✗ $f: พบ </script $n ครั้ง (ต้อง = 1 ตัวปิดท้ายเท่านั้น)"; BAD9=1; FAIL=1; fi
done
[ $BAD9 -eq 0 ] && echo "  ✓ ผ่าน"

echo "─10) cross-IIFE public surface ($NS.xxx read ↔ write)"
NS="$NS" node -e '
  var fs=require("fs");
  var NS=process.env.NS || "PP5";
  var core=fs.readFileSync("ScriptsCore.html","utf8");
  var p1=fs.readFileSync("ScriptsPages.html","utf8");
  var p2=fs.readFileSync("ScriptsPages2.html","utf8");
  var all=core+p1+p2;
  var writes=new Set(["boot","wireGlobal"]);
  var m, wre=new RegExp("(?:"+NS+"|P)\\.([A-Za-z_$][\\w$]*)\\s*=","g");
  while((m=wre.exec(all))) writes.add(m[1]);
  var reads={}, rre=/\bP\.([A-Za-z_$][\w$]*)/g;
  var pages=p1+p2;
  while((m=rre.exec(pages))){ var after=pages.substr(m.index+m[0].length,3); if(!/^\s*=[^=]/.test(after)) reads[m[1]]=1; }
  var miss=Object.keys(reads).filter(function(k){return !writes.has(k);});
  if(miss.length){ console.log("  ✗ อ่านแต่ไม่ได้ expose: "+miss.join(", ")); process.exit(2); }
  console.log("  ✓ public surface ครบ");
' || FAIL=1

echo "─11) router ↔ handler (ทุก case มีฟังก์ชันจริง)"
cat *.gs > /tmp/_pp5_all.gs
node -e '
  var fs=require("fs");
  var code=fs.readFileSync("Code.gs","utf8"), all=fs.readFileSync("/tmp/_pp5_all.gs","utf8");
  var m, bad=0, re=/return\s+([A-Za-z_][\w]*)\s*\(/g;
  while((m=re.exec(code))){
    var fn=m[1];
    if(["api","JSON","String","Number","Object"].indexOf(fn)>=0) continue;
    if(!new RegExp("function\\s+"+fn+"\\s*\\(").test(all)){ console.log("  ✗ ไม่พบฟังก์ชัน: "+fn); bad++; }
  }
  if(!bad) console.log("  ✓ ครบทุก handler");
  process.exit(bad?2:0);
' || FAIL=1

echo "─12) client call() ↔ router case"
node -e '
  var fs=require("fs");
  var code=fs.readFileSync("Code.gs","utf8");
  var cl=fs.readFileSync("ScriptsCore.html","utf8")+fs.readFileSync("ScriptsPages.html","utf8")+fs.readFileSync("ScriptsPages2.html","utf8");
  var routes={}, m, r1=/case\s+["\x27]([a-z_]+\.[a-z_]+)["\x27]/g;
  while((m=r1.exec(code))) routes[m[1]]=1;
  ["app.bootstrap","auth.login","auth.logout"].forEach(function(a){routes[a]=1;});
  var calls={}, r2=/call\(\s*["\x27]([a-z_]+\.[a-z_]+)["\x27]/g;
  while((m=r2.exec(cl))) calls[m[1]]=1;
  var broken=Object.keys(calls).filter(function(a){return !routes[a];});
  if(broken.length){ console.log("  ✗ client เรียก action ที่ไม่มี route: "+broken.join(", ")); process.exit(2); }
  console.log("  ✓ ตรงกันทุก action ("+Object.keys(calls).length+" ตัว)");
' || FAIL=1

echo "─13) data-action ↔ handler (กัน dead button)"
node -e '
  var fs=require("fs");
  var h=fs.readFileSync("ScriptsCore.html","utf8")+fs.readFileSync("ScriptsPages.html","utf8")+fs.readFileSync("ScriptsPages2.html","utf8");
  var used={}, m, re=/data-action="([a-z-]+)"/g;
  while((m=re.exec(h))) used[m[1]]=1;
  var ok={}, hr=/act === ["\x27]([a-z-]+)["\x27]/g;
  while((m=hr.exec(h))) ok[m[1]]=1;
  var dead=Object.keys(used).filter(function(a){return !ok[a];});
  if(dead.length){ console.log("  ✗ ปุ่มไม่มี handler: "+dead.join(", ")); process.exit(2); }
  console.log("  ✓ ครบทุก data-action");
' || FAIL=1

echo "─14) mojibake (UTF-8-as-Latin1) · เฉพาะ source ของระบบ"
node -e '
  var fs=require("fs"), bad=0;
  var files=fs.readdirSync(".").filter(function(f){ return /\.gs$/.test(f) || /^(Index|Styles|Styles2|ScriptsCore|ScriptsPages|ScriptsPages2|Scripts)\.html$/.test(f); });
  files.forEach(function(f){
    fs.readFileSync(f,"utf8").split("\n").forEach(function(l,i){
      if(/à¸|à¹|Ã¡|Ã¢/.test(l)){ console.log("  ✗ "+f+":"+(i+1)); bad++; }
    });
  });
  if(!bad) console.log("  ✓ ไม่มี ("+files.length+" ไฟล์)");
  process.exit(bad?2:0);
' || FAIL=1

echo "─15) file header (7 ฟิลด์ + Notice)"
BAD15=0
for f in *.gs; do
  head -12 "$f" | grep -q "Developer:" || { echo "  ⚠ $f: ไม่มี Developer:"; BAD15=1; FAIL=1; }
  head -12 "$f" | grep -q "Notice:" || { echo "  ⚠ $f: ไม่มี Notice:"; BAD15=1; FAIL=1; }
done
for f in $ALLHTML; do
  head -8 "$f" | grep -q "Notice:" || { echo "  ⚠ $f: ไม่มี Notice:"; BAD15=1; FAIL=1; }
done
[ $BAD15 -eq 0 ] && echo "  ✓ ครบทุกไฟล์"

echo "─16) appsscript.json (timeZone + oauthScopes + webapp)"
BAD16=0
grep -q '"timeZone": *"Asia/Bangkok"' appsscript.json || { echo "  ✗ timeZone ไม่ใช่ Asia/Bangkok"; BAD16=1; FAIL=1; }
grep -q 'script.external_request' appsscript.json || { echo "  ✗ ขาด oauthScope: script.external_request"; BAD16=1; FAIL=1; }
grep -q 'auth/drive' appsscript.json || { echo "  ✗ ขาด oauthScope: drive"; BAD16=1; FAIL=1; }
grep -q '"webapp"' appsscript.json || { echo "  ✗ ขาด webapp block"; BAD16=1; FAIL=1; }
[ $BAD16 -eq 0 ] && echo "  ✓ ผ่าน"

echo "─17) hardcoded timezone (ต้องใช้ APP.TIMEZONE · strip comment ก่อน match)"
node -e '
  var fs=require("fs"), bad=0;
  fs.readdirSync(".").filter(function(f){return /\.gs$/.test(f);}).forEach(function(f){
    var src=fs.readFileSync(f,"utf8")
      .replace(/\/\*[\s\S]*?\*\//g,"")       // block comment
      .replace(/(^|[^:])\/\/.*$/gm,"$1");    // line + trailing comment
    src.split("\n").forEach(function(l,i){
      if(/Session\.getScriptTimeZone\s*\(/.test(l)){ console.log("  ✗ "+f+":"+(i+1)+" ใช้ getScriptTimeZone"); bad++; }
      if(/Utilities\.formatDate\([^,)]+\)/.test(l)){ console.log("  ✗ "+f+":"+(i+1)+" formatDate ไม่ส่ง timezone"); bad++; }
    });
  });
  if(!bad) console.log("  ✓ ใช้ APP.TIMEZONE ทุกที่ · formatDate ส่ง timezone ครบ");
  process.exit(bad?2:0);
' || FAIL=1

echo "─18) P1: N+1 (DB_get/findById ใน loop)"
if grep -nE "(DB_get|DB_findById)\(" *.gs | grep -iE "forEach|\.map\(|for \(|while \(" | grep -v "^.*function " >/dev/null 2>&1; then
  grep -nE "(DB_get|DB_findById)\(" *.gs | grep -iE "forEach|\.map\(|for \(|while \("
  echo "  ⚠ ตรวจว่า index ถูก memoize แล้ว (DB_buildIndex มี L1 memo)"
else echo "  ✓ ไม่มี"; fi

echo "─19) P2: chained .filter().filter()"
if grep -nE "\.filter\([^)]*\)\.filter\(" *.gs >/dev/null 2>&1; then
  grep -nE "\.filter\([^)]*\)\.filter\(" *.gs; FAIL=1
else echo "  ✓ ไม่มี"; fi

echo "─20) P3: write ใน loop (ต้องอยู่ใน batch/bulk)"
if grep -nE "(DB_update|DB_insert)\(SHEETS" *.gs | grep -iE "forEach|\.map\(" >/dev/null 2>&1; then
  grep -nE "(DB_update|DB_insert)\(SHEETS" *.gs | grep -iE "forEach|\.map\("
  echo "  ⚠ ตรวจว่าอยู่ใน DB_beginBatch/DB_bulkInsert"
else echo "  ✓ ไม่มี"; fi

echo "─21) P4: setNumberFormat ใน hot-path (ensureSchema ต้องอยู่ใน guard)"
node -e '
  var fs=require("fs"), src=fs.readFileSync("01_DB.gs","utf8");
  var m=src.match(/function DB_ensureSchema_[\s\S]*?\n}/);
  if(!m){ console.log("  ⚠ ไม่พบ DB_ensureSchema_"); process.exit(0); }
  var body=m[0];
  var idx=body.indexOf("setNumberFormat");
  if(idx<0){ console.log("  ✓ ไม่มี setNumberFormat ใน ensureSchema"); process.exit(0); }
  var guard=body.indexOf("if (need)");
  if(guard>=0 && idx>guard){ console.log("  ✓ setNumberFormat อยู่ใน guard (if need)"); process.exit(0); }
  console.log("  ✗ setNumberFormat อยู่นอก guard → hot-path ช้า/timeout"); process.exit(2);
' || FAIL=1

echo "─22) hasCap mirror (client ↔ server ต้องมี split(\"|\") ทั้งคู่)"
SC=$(grep -A 14 "function hasCap_" 00_Config.gs | grep -c "split")
CC=$(grep -A 14 "function hasCap(" ScriptsCore.html | grep -c "split")
if [ "$SC" -ge 1 ] && [ "$CC" -ge 1 ]; then echo "  ✓ mirror ตรงกัน (รองรับ pipe multi-cap)"
else echo "  ✗ hasCap client/server ไม่ mirror (server=$SC client=$CC)"; FAIL=1; fi

echo "─23) overlay default display (ต้องอยู่นอก @media)"
node -e '
  var fs=require("fs"), css=fs.readFileSync("Styles.html","utf8");
  var need=["#modal-host","#spin-host","#lf-manual",".pop",".sb-backdrop",".bottom-nav",".mobile-only"];
  var bad=[];
  need.forEach(function(sel){
    var esc=sel.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
    var re=new RegExp(esc+"\\s*\\{[^}]*display\\s*:\\s*(none|flex|block|grid)","");
    if(!re.test(css)) bad.push(sel);
  });
  if(bad.length){ console.log("  ✗ ไม่มี base display rule: "+bad.join(", ")); process.exit(2); }
  console.log("  ✓ ทุก overlay มี base display นอก @media");
' || FAIL=1

echo "─24) visibility utility ห้ามตั้ง display เป็น base"
if grep -nE '^\.(desktop|mobile)-only\s*\{[^}]*display\s*:\s*(block|grid|flex)' Styles.html >/dev/null 2>&1; then
  grep -nE '^\.(desktop|mobile)-only\s*\{[^}]*display\s*:\s*(block|grid|flex)' Styles.html; FAIL=1
else echo "  ✓ hide-only pattern"; fi

echo "─25) shell ใช้ flex (ไม่ใช้ grid ใน GAS iframe)"
if grep -qE '\.shell\s*\{[^}]*display\s*:\s*flex' Styles.html; then echo "  ✓ .shell = flex"
else echo "  ✗ .shell ต้องเป็น display:flex"; FAIL=1; fi

echo "─26) hash interceptor (capture phase + data-action ก่อน)"
if grep -q "addEventListener('click'" ScriptsCore.html && grep -q ", true)" ScriptsCore.html; then
  ACT=$(grep -n "closest('\[data-action\]')" ScriptsCore.html | head -1 | cut -d: -f1)
  HREF=$(grep -n "closest('a\[href\]')" ScriptsCore.html | head -1 | cut -d: -f1)
  if [ -n "$ACT" ] && [ -n "$HREF" ] && [ "$ACT" -lt "$HREF" ]; then echo "  ✓ data-action มาก่อน a[href] (บรรทัด $ACT < $HREF)"
  else echo "  ✗ ลำดับ delegation ผิด (data-action ต้องมาก่อน a[href])"; FAIL=1; fi
else echo "  ✗ ไม่พบ click delegation แบบ capture phase"; FAIL=1; fi

echo "─27) wireGlobal ถูกเรียกก่อน boot"
WG=$(grep -n "$NS.wireGlobal()" Scripts.html | head -1 | cut -d: -f1)
BT=$(grep -n "$NS.boot()" Scripts.html | head -1 | cut -d: -f1)
if [ -n "$WG" ] && [ -n "$BT" ] && [ "$WG" -lt "$BT" ]; then echo "  ✓ wireGlobal ($WG) < boot ($BT)"
else echo "  ✗ wireGlobal ต้องถูกเรียกก่อน boot"; FAIL=1; fi

echo "─28) lh3 image ต้องใช้ <img referrerpolicy> ไม่ใช่ CSS background"
if grep -nE "background-image:url\([^)]*(logo_image|hero_image|avatar_url|photo_url)" $ALLHTML >/dev/null 2>&1; then
  grep -nE "background-image:url\([^)]*(logo_image|hero_image|avatar)" $ALLHTML; FAIL=1
else echo "  ✓ ใช้ <img referrerpolicy=\"no-referrer\">"; fi

echo "─29) orphan endpoint + CRUD completeness (server มี แต่ UI ไม่เรียก)"
node -e '
  var fs=require("fs");
  var code=fs.readFileSync("Code.gs","utf8");
  var cl=fs.readFileSync("ScriptsCore.html","utf8")+fs.readFileSync("ScriptsPages.html","utf8")+fs.readFileSync("ScriptsPages2.html","utf8");
  var routes=[],m,r1=/case\s+["\x27]([a-z_]+\.[a-z_]+)["\x27]/g;
  while((m=r1.exec(code))) routes.push(m[1]);
  var calls={};
  // ★ รองรับทั้ง call(action,...) และ cachedCall(key,ttl,action,...)
  var r2=/\bcall\(\s*["\x27]([a-z_]+\.[a-z_]+)["\x27]/g;
  while((m=r2.exec(cl))) calls[m[1]]=1;
  var r3=/cachedCall\(\s*["\x27][^"\x27]*["\x27]\s*,\s*\d+\s*,\s*["\x27]([a-z_]+\.[a-z_]+)["\x27]/g;
  while((m=r3.exec(cl))) calls[m[1]]=1;
  var pub=["app.bootstrap","auth.login","auth.logout"];
  var orphan=routes.filter(function(a){return !calls[a] && pub.indexOf(a)<0;});
  var broken=Object.keys(calls).filter(function(a){return routes.indexOf(a)<0 && pub.indexOf(a)<0;});
  var bad=0;
  if(broken.length){ console.log("  ✗ client เรียก action ที่ไม่มี route: "+broken.join(", ")); bad++; }
  if(orphan.length){ console.log("  ✗ orphan endpoint (ไม่มี UI เรียก): "+orphan.join(", ")); bad++; }
  // ★ mutation endpoint ทุกตัวต้องมี UI caller
  var muts=routes.filter(function(a){return /\.(save|delete|submit|review|import|update|reset_password|set_active|read_all|upload)$/.test(a);});
  var deadMut=muts.filter(function(a){return !calls[a];});
  if(deadMut.length){ console.log("  ✗ mutation ไม่มี UI: "+deadMut.join(", ")); bad++; }
  if(!bad) console.log("  ✓ routes="+routes.length+" · calls="+Object.keys(calls).length+" · CRUD ครบ ไม่มี orphan");
  process.exit(bad?2:0);
' || FAIL=1

echo "─30) stack purity (ห้าม React/Tailwind/jQuery/Laravel/MySQL หลุดเข้ามา + CDN allowlist)"
node -e '
  var fs=require("fs"), bad=0;
  var banned=[[/\breact\b/i,"React"],[/tailwind/i,"Tailwind"],[/jquery/i,"jQuery"],
              [/\blaravel\b|\beloquent\b/i,"Laravel/Eloquent"],[/\bmysql\b|new PDO/i,"MySQL/PDO"]];
  process.argv.slice(1).forEach(function(f){
    var t=fs.readFileSync(f,"utf8");
    banned.forEach(function(b){
      var m=t.match(b[0]);
      if(m){ console.log("  ✗ "+f+": พบ "+b[1]+" → \""+m[0].slice(0,30)+"\""); bad++; }
    });
  });
  var idx=fs.readFileSync("Index.html","utf8");
  var ok=/^(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)$/;
  (idx.match(/https:\/\/[^\s">]+/g)||[]).forEach(function(u){
    var h=u.split("/")[2];
    if(!ok.test(h)){ console.log("  ✗ Index.html: CDN นอก allowlist → "+h); bad++; }
  });
  if(!bad) console.log("  ✓ vanilla stack สะอาด · CDN ตรง allowlist");
  process.exit(bad?2:0);
' *.gs $ALLHTML || FAIL=1

echo "─31) claude.md guard (ข้ออ้างที่ลบแล้วห้ามกลับมา + RULES.md ต้องมี)"
node -e '
  var fs=require("fs"), bad=0;
  if(!fs.existsSync(".claude/RULES.md")){ console.log("  ✗ ไม่มี .claude/RULES.md (การ์ดกฎที่ SessionStart hook inject)"); bad++; }
  var t=fs.readFileSync("claude.md","utf8"), L=t.split("\n");
  var dead=[[/สเกลระดับ Facebook/,"เป้า Facebook scale"],
            [/\*\*Backend Core:\*\*/,"Tech Stack ปลอม (PHP/Laravel)"],
            [/\*\*Frontend Core:\*\* React/,"Tech Stack ปลอม (React)"],
            [/^## สรุปจุดเด่นด้าน Performance/m,"section สรุปจุดเด่นที่ลบแล้ว"]];
  dead.forEach(function(d){ if(d[0].test(t)){ console.log("  ✗ claude.md: "+d[1]+" กลับมาแล้ว"); bad++; } });
  // ★ ข้ออ้างที่พิสูจน์แล้วว่าผิด ยอมให้อยู่ได้เฉพาะในบรรทัดขีดฆ่า (~~) ที่อธิบายว่าผิดยังไง
  ["SHA-256 Password Hashing","Indexed Lookup O(1)","Cache Chunking"].forEach(function(k){
    L.forEach(function(ln,i){
      if(ln.indexOf(k)>=0 && ln.indexOf("~~")<0){ console.log("  ✗ claude.md:"+(i+1)+" \""+k+"\" อยู่นอกบล็อกขีดฆ่า"); bad++; }
    });
  });
  if(L.length>20000) console.log("  ⚠ claude.md "+L.length+" บรรทัด — เกิน 20,000 ควรแยกเป็น docs/ (ยังไม่ FAIL)");
  if(!bad) console.log("  ✓ claude.md ไม่มีข้ออ้างที่ถูกลบ · RULES.md พร้อม inject ("+L.length+" บรรทัด)");
  process.exit(bad?2:0);
' || FAIL=1

echo "─32) UI: ทุกคลาสใน markup มีนิยาม CSS (S9 · จับ class-name mismatch เช่น search-box)"
if [ -f tests/css_class_lint.py ]; then
  if python3 tests/css_class_lint.py >/dev/null 2>&1; then echo "  ✓ ทุกคลาสใน markup มีนิยาม CSS (หรืออยู่ allowlist)"
  else echo "  ✗ มีคลาสใน markup ที่ขาดนิยาม CSS — รัน: python3 tests/css_class_lint.py"; FAIL=1; fi
else echo "  ⚠ ไม่มี tests/css_class_lint.py — ก๊อปจาก Claude.Md/tests/ มาวาง (S9)"; fi

echo "─33) RBAC/correctness rollup (S7/S8) — ต้องมี regression test (logic · static grep ไม่พอ)"
if ls tests/*scope*regression* tests/*regression*scope* >/dev/null 2>&1 || grep -rq "ครู A" tests/ 2>/dev/null; then
  echo "  ✓ มี scope-regression test (ครู A ไม่เห็นห้อง B + งานค้างกรองรอบเวลา)"
else echo "  ⚠ ยังไม่มี regression test สำหรับ aggregation-scope (S7) / year-window (S8) — ควรเพิ่ม"; fi

echo "════════════════════════════════════════"
if [ $FAIL -eq 0 ]; then
  echo "✅ AUDIT ผ่านครบทุกด่าน — พร้อม deploy"
  exit 0
else
  echo "❌ AUDIT ไม่ผ่าน — แก้ไขก่อน deploy"
  exit 1
fi
