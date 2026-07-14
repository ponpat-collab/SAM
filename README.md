# 🛡️ ระบบงานปกครองนักเรียน · Student Affairs Management System (SAM)

ระบบสารสนเทศงานปกครองแบบครบวงจรสำหรับโรงเรียนในสังกัด สพฐ. — **บันทึกมาสาย · ขออนุญาตกลับบ้าน (ลากลับ) · หักคะแนนความประพฤติ** พร้อมรายงานครบวงจร รองรับเครื่องยิงบาร์โค้ด USB/Bluetooth
สร้างด้วย Google Apps Script (V8) + Google Sheets (ฐานข้อมูล) + Google Drive (รูปหลักฐาน) · UI สไตล์ macOS สดใส · Responsive 100%

---

## 🔗 ลิงก์สำคัญ

| รายการ | ลิงก์ |
|---|---|
| 🌐 **เว็บแอป (Production)** | https://script.google.com/macros/s/AKfycbwHPVbFjqNnFnodwdXpxnZvpHREkzN6br3PZQZNq9BwHFutv-e7-kQt68pYe9nGGoU7/exec |
| 📊 **Google Sheet (ฐานข้อมูล)** | https://docs.google.com/spreadsheets/d/1avbaJf6juYY1ASVVKYy1S31YFv4i1Rqd1AkNKAZ4eFk |
| ⚙️ **Apps Script Editor** | https://script.google.com/d/1VkZNuKayu7SY6U8iPPMfDdh6SVYtnOJrnJS0clslSlly2022aypgDDv1/edit |
| 📁 **โฟลเดอร์ไฟล์แนบ (Drive)** | สร้างอัตโนมัติชื่อเดียวกับ Sheet เมื่ออัปโหลดรูปครั้งแรก |

---

## 🚀 การติดตั้งครั้งแรก (สำคัญ — ทำครั้งเดียว)

> ⚠️ เว็บแอปจะขึ้น **403** จนกว่าเจ้าของสคริปต์จะ**อนุญาตสิทธิ์ OAuth** ก่อน (เป็นขั้นตอนปกติของ Google Apps Script)

1. เปิด **Google Sheet** (ลิงก์ด้านบน) → รอเมนู **"🛡️ SAM"** ปรากฏบนแถบเมนู
2. เมนู **"🛡️ SAM" → "🔐 ขออนุญาตสิทธิ์"** → กด **Continue** → เลือกบัญชี → **Advanced → Go to … (unsafe)** → **Allow**
   *(อนุญาต Spreadsheets, Drive, External Request, Triggers)*
3. เมนู **"🛡️ SAM" → "🚀 เริ่มใช้งานระบบ"** → สร้างชีต + บัญชีเริ่มต้น + ฐานความผิด 7 รายการ
4. เมนู **"🛡️ SAM" → "⚡ ติดตั้ง Warm + GC Trigger"** → ให้ระบบโหลดเร็ว (กัน cold start)
5. เปิด **เว็บแอป (Production)** → เข้าสู่ระบบด้วยบัญชีทดลอง (ด้านล่าง) → ระบบพร้อมใช้งาน 🎉

*(ตัวเลือก)* เมนู **"🌱 เพิ่มข้อมูลตัวอย่าง"** เพื่อทดสอบด้วยนักเรียน 96 คน + ประวัติตัวอย่าง

---

## 👤 บัญชีทดลอง (รหัสผ่านเดียวกัน: `123456`)

| บทบาท | ชื่อผู้ใช้ | สิทธิ์ |
|---|---|---|
| ผู้ดูแลระบบ | `admin` | ทุกอย่าง + ตั้งค่า + จัดการผู้ใช้/นักเรียน |
| ครูฝ่ายปกครอง | `teacher` | บันทึกมาสาย/ลากลับ/หักคะแนน + ดูรายงานทั้งหมด |
| ครูที่ปรึกษา | `advisor` | บันทึกได้ + ดูเฉพาะห้องที่ดูแล (ม.3/1) |
| ผู้บริหาร | `director` | ดูรายงานอย่างเดียว |

> ⚠️ **ก่อนใช้งานจริง (Production):** เปลี่ยนรหัสผ่าน `admin` · ปิด "แสดงบัญชีทดลอง" ใน **ตั้งค่าระบบ** · นำเข้าข้อมูลนักเรียนจริง

---

## ✨ ฟีเจอร์หลัก

- **สแกนบาร์โค้ด 5 หลัก** ยิงต่อเนื่อง → ดึงข้อมูล + คะแนนคงเหลืออัตโนมัติ (มาสาย/ลากลับ/หักคะแนน)
- **ถ่ายรูปผู้มารับ** ผ่านกล้องอุปกรณ์ (ใช้ `<input capture>` — รองรับมือถือ/แท็บเล็ต) → อัปโหลด Drive อัตโนมัติ
- **หักคะแนนความประพฤติ** เริ่ม 100 คะแนน · ฐานความผิดตั้งค่าได้ · หักอัตโนมัติเมื่อมาสายครบเกณฑ์ · เพิ่มคะแนนทำความดี
- **แจ้งเตือนคะแนนต่ำ** 3 ระดับ (เชิญผู้ปกครอง / ติดตาม / ทำทัณฑ์บน) ตั้งเกณฑ์ได้
- **รายงาน:** แดชบอร์ดรายวัน · รายบุคคล (พิมพ์เชิญผู้ปกครอง) · รายห้อง · สรุปช่วงเวลา + กราฟ (SVG)
- **นำเข้า Excel/CSV** พร้อม auto-mapping คอลัมน์ + preview
- **แจ้งเตือนในระบบ (bell)** + Telegram (เปิด/ปิดได้)
- **RBAC 4 บทบาท** · ครูที่ปรึกษาเห็นเฉพาะห้องตัวเอง · ผู้บริหารดูอย่างเดียว
- **6 ธีมสี** · macOS style · mobile app-style + bottom nav

## 🔐 ความปลอดภัย (PDPA-ready)

- รหัสผ่าน **PBKDF2** (iterated HMAC-SHA256) + salt ต่อบัญชี · timing-safe compare · lockout 5 ครั้ง/15 นาที
- Session token 32-byte · หมดอายุ 12 ชม. · ลบทันทีเมื่อ logout/ปิดบัญชี
- Audit log ทุกการเข้าใช้/แก้ไข/ลบ · ป้องกันแก้ payload ดิบ · last-admin protection
- ข้อมูลนักเรียน/รูปเป็นข้อมูลส่วนบุคคล — เข้าระบบก่อนเสมอ ไม่มีหน้า public

## 🛠 เทคโนโลยี

Google Apps Script (V8) · Google Sheets (Sheet-as-DB · แคช 3 ชั้น version-keyed) · Vanilla JS SPA · SVG charts (ไม่มี dependency)

---

## 📦 Deploy (สำหรับผู้พัฒนา)

- Version: **1.0.0** · Last deploy: **2026-07-13**
- Script ID: `1VkZNuKayu7SY6U8iPPMfDdh6SVYtnOJrnJS0clslSlly2022aypgDDv1`
- Deployment ID: `AKfycbwHPVbFjqNnFnodwdXpxnZvpHREkzN6br3PZQZNq9BwHFutv-e7-kQt68pYe9nGGoU7`

```bash
bash _audit.sh                 # 33 ด่าน ต้องผ่านก่อน push ทุกครั้ง
node tests/harness.js          # 39 e2e tests
clasp push -f
clasp deploy -i AKfycbwHPVbFjqNnFnodwdXpxnZvpHREkzN6br3PZQZNq9BwHFutv-e7-kQt68pYe9nGGoU7 --description "vX.Y.Z"
```

> `clasp create` และ GAS editor จะทับ `appsscript.json` เสมอ (timeZone → America/New_York, ลบ scopes) — **ต้องกู้คืน + รัน `_audit.sh` ก่อน push ทุกครั้ง**

---

© 2026 ครูวิรัตน์  หาดคำ · [www.kruwirat.com](https://www.kruwirat.com) · ห้ามจำหน่าย · แบ่งปันเพื่อการศึกษาและต่อยอดเท่านั้น (ใช้เชิงพาณิชย์ต้องได้รับอนุญาตจากผู้พัฒนา)
