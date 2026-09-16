/**
 * ═══════════════════════════════════════════════════════════════
 *  ระบบงานปกครองนักเรียน · Student Affairs Management System (SAM)
 *  File:        Code.gs — doGet · api router · warm/gc triggers
 *  Version:     1.0.0
 *  Last Update: 2026-07-13
 *  Developer:   ครูวิรัตน์  หาดคำ · www.kruwirat.com
 *  License:     Proprietary · © 2026
 *  Notice:      ห้ามจำหน่าย · แบ่งปันเพื่อการศึกษาและต่อยอดเท่านั้น (ใช้เชิงพาณิชย์ต้องได้รับอนุญาตจากผู้พัฒนา)
 * ═══════════════════════════════════════════════════════════════
 */

function doGet(e) {
  _resetReq_();
  _ensureInit_();
  var t = HtmlService.createTemplateFromFile('Index');
  t.BOOT_JSON = JSON.stringify({ boot: App_publicBundle_() }).replace(/<\/script/gi, '<\\/script');
  return t.evaluate()
    .setTitle(APP.TITLE)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(name) { return HtmlService.createHtmlOutputFromFile(name).getContent(); }

// ── JSON API (GitHub Pages / fetch) — ใช้ router เดียวกับ doGet · CORS-safe (GAS ตอบ ACAO:* + text/plain ไม่มี preflight) ──
function doPost(e) {
  var out;
  try {
    var req = {};
    if (e && e.postData && e.postData.contents) req = JSON.parse(e.postData.contents);
    out = api(req);
  } catch (err) { out = { ok: false, error: (err && err.message) ? err.message : String(err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function _ensureInit_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('sam_init') === '1') return;
  DB_initAllSchemas();
  Settings_ensureDefaults_();
  Seed_ensureUsers_();
  Seed_ensureOffenses_();
  props.setProperty('sam_init', '1');
}

// ── API router (google.script.run → call) ──────────────────────
function api(req) {
  try {
    _resetReq_();
    var data = _dispatch_(req || {});
    return { ok: true, data: data };
  } catch (e) {
    return { ok: false, error: (e && e.message) ? e.message : String(e) };
  }
}

function _dispatch_(req) {
  var action = String(req.action || '');
  var token = String(req.token || '');
  var payload = req.payload || {};

  if (action === 'app.bootstrap') return Auth_bootstrap(token);
  if (action === 'auth.login') return Auth_login(payload);

  // ── public self-service (นักเรียนบันทึกเอง · ไม่ต้องล็อกอิน) ──
  if (action === 'public.student_lookup') return Public_studentLookup(payload);
  if (action === 'public.late_submit') return Public_lateSubmit(payload);
  if (action === 'public.leave_submit') return Public_leaveSubmit(payload);

  var user = Auth_verify_(token);
  switch (action) {
    case 'auth.logout': return Auth_logout(user, token);
    case 'auth.change_password': return Auth_changePassword(user, payload);
    case 'profile.update': return Profile_update(user, payload);

    case 'student.lookup': return Students_lookup(user, payload);
    case 'student.list': return Students_list(user, payload);
    case 'student.classrooms': return Students_classrooms(user, payload);
    case 'student.save': return Students_save(user, payload);
    case 'student.delete': return Students_delete(user, payload);
    case 'student.import': return Students_import(user, payload);
    case 'student.reset_scores': return Students_resetScores(user, payload);
    case 'term.next': return Term_next(user, payload);

    case 'late.save': return Late_save(user, payload);
    case 'late.list': return Late_list(user, payload);
    case 'late.cancel': return Late_cancel(user, payload);

    case 'leave.save': return Leave_save(user, payload);
    case 'leave.list': return Leave_list(user, payload);
    case 'leave.cancel': return Leave_cancel(user, payload);

    case 'behavior.save': return Behavior_save(user, payload);
    case 'behavior.list': return Behavior_list(user, payload);
    case 'behavior.cancel': return Behavior_cancel(user, payload);
    case 'behavior.recompute': return Behavior_recomputeAll(user, payload);

    case 'offense.list': return Offenses_list(user, payload);
    case 'offense.save': return Offenses_save(user, payload);
    case 'offense.delete': return Offenses_delete(user, payload);
    case 'offense.toggle': return Offenses_toggle(user, payload);

    case 'report.dashboard': return Reports_dashboard(user, payload);
    case 'report.student': return Reports_student(user, payload);
    case 'report.room': return Reports_room(user, payload);
    case 'report.period': return Reports_period(user, payload);
    case 'board.today': return Board_today(user, payload);
    case 'nav.counts': return Nav_counts(user, payload);

    case 'setting.get': return Settings_get(user, payload);
    case 'setting.update': return Settings_update(user, payload);
    case 'setting.repair': return Settings_repair(user, payload);

    case 'user.list': return Users_list(user, payload);
    case 'user.save': return Users_save(user, payload);
    case 'user.delete': return Users_delete(user, payload);
    case 'user.reset_password': return Users_reset_password(user, payload);
    case 'user.set_active': return Users_set_active(user, payload);

    case 'audit.list': return Audit_list(user, payload);
    case 'file.upload': return Files_upload(user, payload);

    case 'notify.list': return Notify_list(user, payload);
    case 'notify.mark_read': return Notify_markRead(user, payload);
    case 'notify.mark_all_read': return Notify_markAllRead(user, payload);

    case 'tg.test': return Telegram_test(user, payload);
    case 'tg.get_me': return Telegram_getMe(user, payload);
    case 'tg.get_updates': return Telegram_getUpdates(user, payload);
  }
  throw new Error('ไม่รู้จัก action: ' + action);
}

// ── triggers (warm + gc) ───────────────────────────────────────
function _warm_() {
  _resetReq_();
  try { DB_readAll(SHEETS.SETTINGS); DB_readLite(SHEETS.STUDENTS); DB_readAll(SHEETS.OFFENSES); App_publicBundle_(); } catch (e) {}
  return (new Date()).toISOString();
}
function _gc_() { _resetReq_(); try { Auth_gc_(); Notify_gc_(); } catch (e) {} }
