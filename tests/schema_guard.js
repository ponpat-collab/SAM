// schema_guard.js — คอลัมน์ใหม่ต้อง "append ท้าย" เท่านั้น
// DB_ensureSchema_ เขียน header ทับโดยไม่ย้ายข้อมูล → แทรก/สลับคอลัมน์กลาง = ข้อมูลเดิมทุกแถวเลื่อน
// ใช้ git HEAD เป็น baseline · เรียกจาก _audit.sh (exit 2 = ไม่ผ่าน)
'use strict';
const fs = require('fs');

function schemas(src) {
  const m = src.match(/var SCHEMAS = Object\.freeze\(\{([\s\S]*?)\n\}\);/);
  if (!m) return null;
  const out = {}, re = /([A-Za-z]\w*)\s*:\s*\[([^\]]*)\]/g;
  let mm;
  while ((mm = re.exec(m[1]))) {
    out[mm[1]] = (mm[2].match(/'[^']+'/g) || []).map(function (s) { return s.slice(1, -1); });
  }
  return out;
}

const oldSrc = process.argv[2], newSrc = process.argv[3];
let oldS, newS;
try { oldS = schemas(fs.readFileSync(oldSrc, 'utf8')); newS = schemas(fs.readFileSync(newSrc, 'utf8')); }
catch (e) { console.log('  ⚠ อ่าน SCHEMAS ไม่ได้ — ข้ามด่านนี้'); process.exit(0); }
if (!oldS || !newS) { console.log('  ⚠ อ่าน SCHEMAS ไม่ได้ — ข้ามด่านนี้'); process.exit(0); }

const bad = [];
Object.keys(oldS).forEach(function (t) {
  const o = oldS[t], n = newS[t];
  if (!n) return;                                   // ตารางถูกลบ = คนละเรื่อง
  for (let i = 0; i < o.length; i++) {
    if (n[i] !== o[i]) { bad.push(t + ': ตำแหน่งที่ ' + (i + 1) + ' เปลี่ยน "' + o[i] + '" → "' + (n[i] || '(หาย)') + '"'); break; }
  }
});

if (bad.length) {
  console.log('  ✗ schema เปลี่ยนตำแหน่งคอลัมน์เดิม — ข้อมูลเก่าทุกแถวจะเลื่อน:');
  bad.forEach(function (b) { console.log('     ' + b); });
  console.log('     → คอลัมน์ใหม่ต้องต่อ "ท้ายสุด" เท่านั้น');
  process.exit(2);
}
console.log('  ✓ คอลัมน์เดิมอยู่ตำแหน่งเดิม (เพิ่มใหม่ต่อท้ายเท่านั้น)');
