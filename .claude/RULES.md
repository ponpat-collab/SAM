# 🧭 __APP_NAME__ — กฎเหล็ก (ย้ำเตือนทุก session)

> ไฟล์นี้ถูก inject เข้า context อัตโนมัติทุกครั้งที่เปิด/resume/clear/compact
> รายละเอียดเต็ม + บทเรียน 244 ข้ออยู่ใน `claude.md` (~15,600 บรรทัด) — **ห้าม `Read` ทั้งไฟล์** ใช้ `grep -n` หาหัวข้อที่ต้องใช้แล้วอ่านเฉพาะช่วงนั้น
>
> 🔧 **เริ่มโปรเจกต์ใหม่:** แทน `__APP_NAME__` ด้วยชื่อระบบ · ปรับ "รายชื่อไฟล์" ด้านล่างให้ตรงของจริง · ดู `README.md` ของชุดนี้

## 1. Stack จริง (ห้ามเดา)
GAS V8 + Google Sheets (Sheet-as-DB) + **vanilla JS** · ไม่มี build step · ไม่มี npm

**ห้ามเสนอ React · JSX · Tailwind · Laravel · Eloquent · SQL** — ไม่มีในโปรเจกต์นี้
lib ที่มี: Bootstrap Icons · SweetAlert2 · Animate.css · ฟอนต์ Kanit/Sarabun · chart เป็น SVG เขียนเอง (`A.svgLineChart` · `A.svgDonut` · `A.svgHorizBar`)

ไฟล์: `00_Config` → `NN_*` (.gs) · `Code.gs` = doGet + router · `ScriptsCore.html` (design system `A.*`) · `ScriptsPages*.html` (หน้าจอ) · `Styles*.html`

## 2. สเกลจริง
โรงเรียนเดียว · ผู้ใช้หลักร้อย-พัน · concurrent หลักสิบ
เพดาน GAS: **30 executions พร้อมกัน · 6 นาที/run · CacheService ~100KB/key · Sheets 10M เซลล์**
→ **ห้าม over-engineer เผื่อ "หลักล้าน user"** · หน่วยวัด performance = **จำนวนเซลล์ที่อ่าน/เขียน** ไม่ใช่ Big-O

## 3. กฎที่ละเมิดบ่อยที่สุด (ผิดข้อไหน = งานยังไม่เสร็จ)

| # | กฎ | เหตุผล |
|---|---|---|
| 1 | **ห้าม inline `onclick=`** ใช้ `addEventListener` หลัง render หรือ `data-action` delegation | GAS HtmlService CSP block เงียบ |
| 2 | **ห้าม `alert/confirm/prompt`** ของ browser | ใช้ SweetAlert2 / toast ของ design system |
| 3 | **`Utilities.formatDate` ต้องส่ง `APP.TIMEZONE` เสมอ** ห้าม `Session.getScriptTimeZone()` | manifest ถูก `clasp create`/GAS editor ทับ → เวลาเพี้ยน 11 ชม. |
| 4 | **ทุก mutation ต้อง `Auth_requireCap`** · payload ดิบห้ามเข้า DB ตรง | privilege escalation |
| 5 | **client `hasCap` ↔ server `hasCap_` ต้อง mirror เป๊ะ** (`view_own` ไม่ inherit) | สิทธิ์รั่ว |
| 6 | **ห้าม `DB_get`/`findById` ใน loop** · ห้าม `.filter().filter()` · ห้าม write ใน loop นอก batch | N+1 → timeout |
| 7 | **ห้าม `catch (e) {}` เปล่า** (ยกเว้น `releaseLock` · `sleep` · `setNumberFormat`) | ซ่อนบั๊ก |
| 8 | **แสดงผลเป็นไทยเสมอ** — พ.ศ. · เดือนไทย · `" น."` · `A.TH.period()` ห้ามโชว์ `"2026-04"` / `"paid"` / `"admin"` ดิบ | |
| 9 | **render function ของ dynamic form ต้อง pure write** (state→DOM) ห้ามมี capture (DOM→state) ปน | capture-on-render clobber |
| 10 | **แก้ไฟล์ไทยด้วย Edit/Write tool** ห้าม `sed`/`perl` | mojibake |
| 11 | **fallback ที่ไม่ได้ล็อกอินทุกทางลง Landing** ไม่ใช่ Login | ผู้ชมสาธารณะโดนเด้ง |
| 12 | **ทุก element จาก `innerHTML` ต้อง wire listener ทันที** (re-render = re-wire) | ปุ่มกดไม่ติด ไม่มี error |

## 4. ก่อนบอก "เสร็จ" ทุกครั้ง
```
□ รัน  bash _audit.sh  ผ่านครบทุกด่าน (31 ด่าน)   ← บังคับ ไม่มีข้อยกเว้น
□ ถ้าเจอ/แก้ bug → เขียน pitfall เข้า claude.md ใน commit เดียวกัน (ก่อนหรือพร้อม fix)
□ UI ครบ: hero+KPI · filter · card grid · detail modal · empty/loading/error state
□ mobile: card stack · modal เป็น bottom-sheet · touch ≥ 44px
```

## 5. ลำดับ deploy (ห้ามสลับ)
```
clasp create  →  กู้ appsscript.json  →  bash _audit.sh  →  clasp push -f  →  clasp deploy -i <id เดิม>
```
`clasp create` **ทับ** `appsscript.json` ทุกครั้ง (timeZone กลับเป็น America/New_York · oauthScopes หาย) — ห้าม push ทันทีหลัง create

## 6. แหล่งอ้างอิงเดียวด้าน perf/security
หัวข้อ **"⚡ มาตรฐาน Performance & Security 100/100"** ท้าย `claude.md` (§P1-P10 · §S1-S6) — วัดจากโค้ดจริง
ข้อความเก่าที่ถูก **ลบแล้วเพราะพิสูจน์ว่าผิด**: ~~SHA-256 รอบเดียว~~ (ใช้ PBKDF2) · ~~cache chunking รองรับ payload ใหญ่~~ (ต้องทำ projection cache §P4) · ~~index O(1) คุ้มเสมอ~~ (opt-in เท่านั้น §P6)
