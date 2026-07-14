/**
 * ═══════════════════════════════════════════════════════════════
 *  ระบบงานปกครองนักเรียน · Student Affairs Management System (SAM)
 *  File:        14_Menu.gs — เมนูในชีต · เริ่มใช้งาน · สิทธิ์ · trigger · About
 *  Version:     1.0.0
 *  Last Update: 2026-07-13
 *  Developer:   ครูวิรัตน์  หาดคำ · www.kruwirat.com
 *  License:     Proprietary · © 2026
 *  Notice:      ห้ามจำหน่าย · แบ่งปันเพื่อการศึกษาและต่อยอดเท่านั้น (ใช้เชิงพาณิชย์ต้องได้รับอนุญาตจากผู้พัฒนา)
 * ═══════════════════════════════════════════════════════════════
 */

function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu('🛡️ ' + APP.SHORT)
      .addItem('🚀 เริ่มใช้งานระบบ (Initialize)', 'menu_initSystem')
      .addItem('🔐 ขออนุญาตสิทธิ์', 'menu_grantPermissions')
      .addItem('🔍 ตรวจสถานะสิทธิ์', 'menu_authorize')
      .addSeparator()
      .addItem('🌱 เพิ่มข้อมูลตัวอย่าง', 'menu_seedDemo')
      .addItem('🧹 ล้างข้อมูลตัวอย่าง', 'menu_clearDemo')
      .addSeparator()
      .addItem('⚡ ติดตั้ง Warm + GC Trigger', 'menu_installTriggers')
      .addItem('🔧 ซ่อมค่าตั้งค่า (text)', 'menu_repairSettings')
      .addItem('🔑 รีเซ็ตรหัสผ่านบัญชีทดลอง', 'menu_resetDemoPw')
      .addSeparator()
      .addItem('🔗 เปิด Web App URL', 'menu_openWebApp')
      .addItem('📘 คู่มือการติดตั้งระบบ', 'menu_installGuide')
      .addItem('📖 คู่มือการใช้งาน', 'menu_userManual')
      .addSeparator()
      .addItem('ℹ️ เกี่ยวกับระบบ (About)', 'menu_about')
      .addToUi();
  } catch (e) {}
}

function menu_initSystem() {
  var ui = SpreadsheetApp.getUi();
  DB_initAllSchemas(true);
  Settings_ensureDefaults_();
  Seed_ensureUsers_();
  Seed_ensureOffenses_();
  PropertiesService.getScriptProperties().setProperty('sam_init', '1');
  ui.alert('✅ เริ่มใช้งานระบบสำเร็จ', 'สร้างชีต · บัญชีเริ่มต้น · ฐานความผิด เรียบร้อยแล้ว\n\nบัญชีทดลอง (รหัส ' + DEMO_PASSWORD + '):\nadmin · teacher · advisor · director', ui.ButtonSet.OK);
}
function menu_grantPermissions() {
  SpreadsheetApp.getActive().getName();
  DriveApp.getRootFolder().getName();
  Session.getActiveUser().getEmail();
  ScriptApp.getProjectTriggers();
  UrlFetchApp.fetch('https://www.google.com/generate_204', { muteHttpExceptions: true });
  SpreadsheetApp.getUi().alert('✅ พร้อมใช้งาน', 'ระบบได้รับสิทธิ์ครบทุกตัวแล้ว — ใช้อัปโหลดรูป / Telegram ได้', SpreadsheetApp.getUi().ButtonSet.OK);
}
function menu_authorize() {
  var ui = SpreadsheetApp.getUi(), r = [];
  function chk(name, fn) { try { fn(); r.push('✓ ' + name); } catch (e) { r.push('✗ ' + name + ': ' + e.message); } }
  chk('Spreadsheets', function () { SpreadsheetApp.getActive().getName(); });
  chk('Drive', function () { DriveApp.getRootFolder().getName(); });
  chk('External Request', function () { UrlFetchApp.fetch('https://www.google.com/generate_204', { muteHttpExceptions: true }); });
  chk('Triggers', function () { ScriptApp.getProjectTriggers(); });
  ui.alert('สถานะสิทธิ์', r.join('\n') + '\n\nหากมี ✗ ให้กด "🔐 ขออนุญาตสิทธิ์"', ui.ButtonSet.OK);
}
function menu_seedDemo() { var r = Seed_demoData_(); SpreadsheetApp.getUi().alert('🌱 เพิ่มข้อมูลตัวอย่าง', 'เพิ่มนักเรียน ' + r.students + ' คน + ประวัติตัวอย่าง', SpreadsheetApp.getUi().ButtonSet.OK); }
function menu_clearDemo() {
  var ui = SpreadsheetApp.getUi();
  if (ui.alert('ล้างข้อมูลตัวอย่าง', 'ลบนักเรียนตัวอย่าง (รหัส 3xxxx) ทั้งหมด?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  var r = Seed_clearDemo_(); ui.alert('เรียบร้อย', 'ลบ ' + r.removed + ' รายการ', ui.ButtonSet.OK);
}
function menu_repairSettings() { var r = Settings_repair({ role: 'admin' }, {}); SpreadsheetApp.getUi().alert('🔧 ซ่อมค่าตั้งค่า', 'บังคับเป็น text แล้ว ' + r.fixed + ' แถว', SpreadsheetApp.getUi().ButtonSet.OK); }
function menu_resetDemoPw() {
  var ui = SpreadsheetApp.getUi();
  if (ui.alert('รีเซ็ตรหัสผ่านบัญชีทดลอง', 'รีเซ็ต admin/teacher/advisor/director เป็น ' + DEMO_PASSWORD + '?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  var n = Seed_resetDemoPasswords_(); ui.alert('เรียบร้อย', n + ' บัญชีถูกรีเซ็ต', ui.ButtonSet.OK);
}
function menu_installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (/^(_warm_|_gc_)$/.test(t.getHandlerFunction())) ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('_warm_').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('_gc_').timeBased().everyHours(6).create();
  SpreadsheetApp.getUi().alert('⚡ ติดตั้ง Trigger', 'ติดตั้ง Warm (5 นาที) + GC (6 ชม.) แล้ว — ระบบจะโหลดเร็วขึ้น', SpreadsheetApp.getUi().ButtonSet.OK);
}
function menu_openWebApp() {
  var url = ScriptApp.getService().getUrl();
  var html = '<div style="font-family:Kanit,sans-serif;padding:16px"><p>เปิด Web App ที่ลิงก์นี้:</p>' +
    '<p><a href="' + url + '" target="_blank" style="color:#2563eb;word-break:break-all">' + url + '</a></p>' +
    '<button onclick="google.script.host.close()" style="margin-top:12px;padding:8px 16px;border:0;border-radius:8px;background:#2563eb;color:#fff;cursor:pointer">ปิด</button></div>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(460).setHeight(200), 'Web App URL');
}

function menu_about() {
  var h = '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    '<link href="https://fonts.googleapis.com/css2?family=Kanit:wght@400;600;700;800&display=swap" rel="stylesheet">' +
    '<link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" rel="stylesheet">' +
    '<style>body{margin:0;font-family:Kanit,sans-serif;color:#1e293b}.ab{padding:24px}.h{display:flex;gap:14px;align-items:center;padding-bottom:16px;border-bottom:1px solid #e2e8f0;margin-bottom:16px}' +
    '.lg{width:60px;height:60px;border-radius:16px;background:linear-gradient(135deg,#2563eb,#0ea5e9);display:flex;align-items:center;justify-content:center;color:#fff;font-size:30px}' +
    '.t{font-size:20px;font-weight:800}.v{display:inline-block;padding:2px 10px;background:linear-gradient(135deg,#2563eb,#0ea5e9);color:#fff;border-radius:99px;font-size:11px;font-weight:700;margin-top:4px}' +
    '.dev{display:flex;gap:14px;align-items:center;padding:14px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:14px;text-decoration:none;color:inherit;margin:14px 0}' +
    '.dev img{width:56px;height:56px;border-radius:50%;border:3px solid #fff;object-fit:cover}.meta{font-size:12px;color:#64748b;line-height:1.9}' +
    '.btn{padding:8px 16px;border:0;border-radius:10px;background:linear-gradient(135deg,#2563eb,#0ea5e9);color:#fff;cursor:pointer;font-family:inherit;font-weight:600}</style></head><body><div class="ab">' +
    '<div class="h"><div class="lg"><i class="bi bi-shield-check"></i></div><div><div class="t">' + APP.NAME + '</div><span class="v">v' + APP.VERSION + '</span></div></div>' +
    '<div style="font-size:13px;color:#475569;line-height:1.6">' + APP.DESCRIPTION + '</div>' +
    '<div class="meta">📅 อัปเดต: ' + APP.LAST_UPDATED + '<br>🏢 ' + APP.ORG + '</div>' +
    '<a class="dev" href="' + APP.DEV.URL + '" target="_blank"><img src="' + APP.DEV.LOGO + '" referrerpolicy="no-referrer" onerror="this.style.display=\'none\'"><div><div style="font-size:11px;color:#64748b">ผู้พัฒนาระบบ</div><div style="font-weight:700">' + APP.DEV.NAME + '</div><div style="color:#2563eb;font-size:12px">🌐 ' + APP.DEV.URL.replace(/^https?:\/\//, '') + '</div></div></a>' +
    '<div style="text-align:right"><button class="btn" onclick="google.script.host.close()">ปิด</button></div></div></body></html>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(h).setWidth(440).setHeight(520), 'เกี่ยวกับ ' + APP.SHORT);
}

function menu_installGuide() {
  var url = ''; try { url = ScriptApp.getService().getUrl(); } catch (e) {}
  var installed = DB_rowCount(SHEETS.STUDENTS) >= 0 && PropertiesService.getScriptProperties().getProperty('sam_init') === '1';
  var steps = [
    ['1', 'ขออนุญาตสิทธิ์', 'กดเมนู "🔐 ขออนุญาตสิทธิ์" → Continue → Allow'],
    ['2', 'เริ่มใช้งานระบบ', 'กดเมนู "🚀 เริ่มใช้งานระบบ" เพื่อสร้างชีต + บัญชีเริ่มต้น + ฐานความผิด'],
    ['3', 'Deploy Web App', 'Apps Script → Deploy → New deployment → Web app → คัดลอก URL'],
    ['4', 'ติดตั้ง Warm Trigger', 'กดเมนู "⚡ ติดตั้ง Warm + GC Trigger" ให้ระบบโหลดเร็ว'],
    ['5', 'นำเข้าข้อมูลนักเรียน', 'เข้า Web App → เมนู "จัดการนักเรียน" → นำเข้า Excel/CSV'],
    ['6', 'ตั้งค่าระบบ', 'ตั้งชื่อโรงเรียน · เกณฑ์คะแนน · สาเหตุ · Telegram (ถ้าใช้) · ปิดบัญชีทดลองก่อน Production']
  ];
  var body = steps.map(function (s) {
    return '<div class="st"><div class="n">' + s[0] + '</div><div><div class="tt">' + s[1] + '</div><div class="dd">' + s[2] + '</div></div></div>';
  }).join('');
  var h = '<!DOCTYPE html><html><head><meta charset="UTF-8"><link href="https://fonts.googleapis.com/css2?family=Kanit:wght@400;600;700;800&family=Sarabun:wght@400;500&display=swap" rel="stylesheet">' +
    '<link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" rel="stylesheet"><style>' +
    'body{margin:0;font-family:Sarabun,sans-serif;color:#1e293b;background:#f8fafc}.hero{background:linear-gradient(135deg,#2563eb,#0ea5e9);color:#fff;padding:24px}.hero h1{font-family:Kanit;margin:0;font-size:20px}' +
    '.badge{display:inline-block;margin-top:8px;padding:4px 12px;border-radius:99px;font-size:12px;background:rgba(255,255,255,.2)}.wrap{padding:20px}' +
    '.st{display:flex;gap:14px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px;margin-bottom:10px}.n{width:34px;height:34px;flex:none;border-radius:50%;background:linear-gradient(135deg,#2563eb,#0ea5e9);color:#fff;display:flex;align-items:center;justify-content:center;font-family:Kanit;font-weight:700}' +
    '.tt{font-family:Kanit;font-weight:700}.dd{font-size:13px;color:#64748b;margin-top:2px}.chk{background:#ecfdf5;border:1px solid #a7f3d0;border-radius:14px;padding:14px;margin-top:8px;font-size:13px;color:#065f46}' +
    '.url{background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:10px;font-size:12px;word-break:break-all;margin-top:8px}</style></head><body>' +
    '<div class="hero"><h1><i class="bi bi-book"></i> คู่มือการติดตั้งระบบ</h1><span class="badge">' + (installed ? '✅ ติดตั้งแล้ว' : '⚠️ ยังไม่ติดตั้ง') + (url ? ' · 🌐 Web App พร้อม' : '') + '</span></div>' +
    '<div class="wrap">' + body +
    '<div class="chk"><b>✅ ตรวจก่อน Production:</b><br>• เปลี่ยนรหัสผ่าน admin · ปิดบัญชีทดลอง (Settings)<br>• ตั้งชื่อโรงเรียน · ปีการศึกษา · เกณฑ์คะแนน<br>• นำเข้าข้อมูลนักเรียนจริง · ติดตั้ง Warm Trigger<br>• ทดสอบสแกน/รายงานครบทุกบทบาท</div>' +
    (url ? '<div class="url">🔗 ' + url + '</div>' : '') +
    '<div style="text-align:right;margin-top:16px"><button onclick="google.script.host.close()" style="padding:8px 18px;border:0;border-radius:10px;background:#2563eb;color:#fff;font-family:Kanit;cursor:pointer">ปิด</button></div></div></body></html>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(h).setWidth(560).setHeight(640), 'คู่มือการติดตั้ง');
}

function menu_userManual() {
  var secs = [
    ['bi-box-arrow-in-right', 'การเข้าสู่ระบบ', 'เข้าเว็บแอป → กรอกชื่อผู้ใช้/รหัสผ่าน หรือกดการ์ดบัญชีทดลอง · มี 4 บทบาท: ผู้ดูแล · ครูปกครอง · ครูที่ปรึกษา (เห็นเฉพาะห้องตัวเอง) · ผู้บริหาร (ดูอย่างเดียว)'],
    ['bi-upc-scan', 'บันทึกมาสาย', 'เมนู "บันทึกมาสาย" → ยิงบาร์โค้ด/พิมพ์รหัส 5 หลัก → เลือกสาเหตุ → บันทึก · ระบบ stamp เวลา+ครูอัตโนมัติ · ยิงต่อเนื่องได้'],
    ['bi-house-heart', 'ขออนุญาตกลับบ้าน', 'ยิงบาร์โค้ด → กรอกสาเหตุ · ชื่อ/เบอร์/ความสัมพันธ์ผู้ปกครอง → ถ่ายรูปผู้มารับ (กดเปิดกล้อง) → บันทึก · รูปเก็บใน Drive'],
    ['bi-star', 'หักคะแนนความประพฤติ', 'ยิงบาร์โค้ด → เลือกฐานความผิด (คะแนนขึ้นอัตโนมัติ ปรับได้) → บันทึก · รองรับเพิ่มคะแนนทำความดี · แจ้งเตือนเมื่อคะแนนต่ำ'],
    ['bi-graph-up', 'รายงาน', 'แดชบอร์ดรายวัน · รายบุคคล (พิมพ์เชิญผู้ปกครอง) · รายห้อง · สรุปช่วงเวลา + กราฟ · ส่งออกได้'],
    ['bi-gear', 'ตั้งค่า (ผู้ดูแล)', 'จัดการนักเรียน (นำเข้า Excel) · ฐานความผิด · สาเหตุ · เกณฑ์คะแนน · ผู้ใช้ · ธีม · Telegram · รีเซ็ตคะแนนปีใหม่']
  ];
  var body = secs.map(function (s) {
    return '<div class="c"><div class="ic"><i class="bi ' + s[0] + '"></i></div><div><div class="tt">' + s[1] + '</div><div class="dd">' + s[2] + '</div></div></div>';
  }).join('');
  var h = '<!DOCTYPE html><html><head><meta charset="UTF-8"><link href="https://fonts.googleapis.com/css2?family=Kanit:wght@400;600;700&family=Sarabun:wght@400;500&display=swap" rel="stylesheet">' +
    '<link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" rel="stylesheet"><style>' +
    'body{margin:0;font-family:Sarabun,sans-serif;color:#1e293b;background:#f8fafc}.hero{background:linear-gradient(135deg,#2563eb,#0ea5e9);color:#fff;padding:22px}.hero h1{font-family:Kanit;margin:0;font-size:20px}' +
    '.wrap{padding:18px}.c{display:flex;gap:14px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px;margin-bottom:10px}' +
    '.ic{width:44px;height:44px;flex:none;border-radius:12px;background:linear-gradient(135deg,#2563eb,#0ea5e9);color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px}' +
    '.tt{font-family:Kanit;font-weight:700}.dd{font-size:13px;color:#64748b;margin-top:3px;line-height:1.5}</style></head><body>' +
    '<div class="hero"><h1><i class="bi bi-journal-text"></i> คู่มือการใช้งาน</h1></div><div class="wrap">' + body +
    '<div style="text-align:right;margin-top:8px"><button onclick="google.script.host.close()" style="padding:8px 18px;border:0;border-radius:10px;background:#2563eb;color:#fff;font-family:Kanit;cursor:pointer">ปิด</button></div></div></body></html>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(h).setWidth(620).setHeight(680), 'คู่มือการใช้งาน');
}
