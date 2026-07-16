/**
 * ═══════════════════════════════════════════════════════════════
 *  ระบบงานปกครองนักเรียน · Student Affairs Management System (SAM)
 *  File:        04_Late.gs — บันทึกการมาสาย + หักคะแนนอัตโนมัติ (ตั้งค่าได้)
 *  Version:     1.0.0
 *  Last Update: 2026-07-13
 *  Developer:   ครูวิรัตน์  หาดคำ · www.kruwirat.com
 *  License:     Proprietary · © 2026
 *  Notice:      ห้ามจำหน่าย · แบ่งปันเพื่อการศึกษาและต่อยอดเท่านั้น (ใช้เชิงพาณิชย์ต้องได้รับอนุญาตจากผู้พัฒนา)
 * ═══════════════════════════════════════════════════════════════
 */

function Late_save(user, p) {
  Auth_requireCap(user, 'late.create');
  var sid = String((p && p.student_id) || '').trim();
  var stu = DB_get(SHEETS.STUDENTS, sid);
  if (!stu) throw new Error('ไม่พบรหัสนักเรียน ' + sid);
  if (!_canSeeStudent_(user, stu)) throw new Error('นักเรียนคนนี้อยู่นอกห้องที่คุณดูแล');
  var rec = _lateCreateCore_(stu, {
    reason: cfg_str_(p && p.reason, 60).trim() || 'ไม่ระบุ',
    note: cfg_str_(p && p.note, 200).trim(),
    date: cfg_dateOnly_((p && p.date) || new Date()) || cfg_today_(),
    createdBy: user.id, createdByName: user.full_name
  });
  Audit_log_(user, 'late.create', 'late', rec.id, { student_id: sid });
  var map = Settings_map_(), auto = null;
  if (_yes_(map.late_auto_deduct)) auto = _lateAutoDeduct_(user, stu, map, rec.id);
  return { ok: true, record: rec, student_name: _stuName_(stu), auto: auto };
}

// core สร้างบันทึกมาสาย — hard-block ซ้ำวันเดียวกัน + แจ้งเตือนสะสม (ใช้ร่วมทั้ง staff + self-service)
function _lateCreateCore_(stu, opt) {
  var sid = stu.id;
  var date = opt.date || cfg_today_();
  var dup = DB_byLite(SHEETS.LATE, 'student_id', sid).filter(function (r) { return cfg_d10_(r.date) === date && !_yes_(r.canceled); });
  if (dup.length) throw new Error('นักเรียนคนนี้ถูกบันทึกมาสายในวันนี้แล้ว — บันทึกซ้ำในวันเดียวกันไม่ได้');
  var rec;
  DB_withLock_(function () {
    rec = DB_insert(SHEETS.LATE, {
      id: _genSeq_('L', DB_rowCount(SHEETS.LATE)), date: date, time: cfg_timeNow_(), student_id: sid,
      reason: opt.reason || 'ไม่ระบุ', note: opt.note || '',
      created_by: opt.createdBy || '', created_by_name: opt.createdByName || '', canceled: 'no'
    });
  });
  _lateFrequencyAlert_(stu, sid);
  return rec;
}

// แจ้งเตือนเมื่อมาสายสะสมครบเกณฑ์ (ยิงครั้งเดียวตอน "ครบพอดี")
function _lateFrequencyAlert_(stu, sid) {
  try {
    var map = Settings_map_();
    var th = cfg_int_(map.late_alert_count) || 3;
    if (th <= 0) return;
    var cnt = DB_byLite(SHEETS.LATE, 'student_id', sid).filter(function (r) { return !_yes_(r.canceled); }).length;
    if (cnt !== th) return;                       // crossing เท่านั้น กัน spam
    var title = 'มาสายสะสมครบ ' + th + ' ครั้ง';
    var msg = _stuName_(stu) + ' (' + _stuClassRoom_(stu) + ') มาสายสะสม ' + cnt + ' ครั้ง — ควรติดตามดูแล';
    Notify_pushRoles_(['admin', 'teacher'], 'late', title, msg, '#/report/student?id=' + sid);
    if (_yes_(map.tg_enabled)) Telegram_toAdmins_('⏰ <b>' + _tgEsc_(title) + '</b>\n' + _tgEsc_(msg));
  } catch (e) {}
}

function _weekKey_(dateStr) {
  var d = new Date(dateStr + 'T00:00:00');
  var day = (d.getDay() + 6) % 7; // Mon=0
  var monday = new Date(d.getTime() - day * 86400000);
  return Utilities.formatDate(monday, APP.TIMEZONE, 'yyyy-MM-dd');
}
// หักคะแนนอัตโนมัติเมื่อมาสายครบเกณฑ์/สัปดาห์ — ผูก ref_id กับรายการมาสายที่ทำให้ครบ
// (ยกเลิกรายการมาสายนั้น → รายการหักถูกยกเลิกและคะแนนคืนอัตโนมัติ)
function _lateAutoDeduct_(user, stu, map, lateId) {
  var thr = cfg_int_(map.late_auto_threshold) || 3, pts = cfg_num_(map.late_auto_points) || 5;
  var today = cfg_today_(), wk = _weekKey_(today);
  var cnt = DB_byLite(SHEETS.LATE, 'student_id', stu.id).filter(function (r) {
    return !_yes_(r.canceled) && _weekKey_(cfg_d10_(r.date)) === wk;
  }).length;
  if (cnt > 0 && cnt % thr === 0) {
    try {
      var b = Behavior_autoDeduct_(user, stu.id, pts, 'มาสายครบ ' + cnt + ' ครั้ง/สัปดาห์ (หักอัตโนมัติ)', lateId);
      return { deducted: true, points: pts, count: cnt, score_after: b.score_after };
    } catch (e) { return { deducted: false, error: e.message }; }
  }
  return { deducted: false, count: cnt, threshold: thr };
}

function Late_list(user, p) {
  Auth_requireCap(user, 'late.view_own|late.view_all');
  p = p || {};
  var from = cfg_dateOnly_(p.from) || '', to = cfg_dateOnly_(p.to) || '', sid = String(p.student_id || '');
  var cls = String(p.class_level || ''), room = String(p.room || ''), q = String(p.q || '').trim().toLowerCase();
  var page = Math.max(1, cfg_int_(p.page) || 1), per = Math.min(100, cfg_int_(p.per_page) || 40);
  var stuIx = DB_buildIndexLite(SHEETS.STUDENTS), scope = _studentScope_(user);
  var rows = DB_readLite(SHEETS.LATE).filter(function (r) {
    if (_yes_(r.canceled) && !p.include_canceled) return false;
    var d = cfg_d10_(r.date);
    if (from && d < from) return false;
    if (to && d > to) return false;
    if (sid && String(r.student_id) !== sid) return false;
    var s = stuIx[String(r.student_id)];
    if (scope && (!s || !scope(s))) return false;
    if (cls && (!s || String(s.class_level) !== cls)) return false;
    if (room && (!s || String(s.room) !== room)) return false;
    if (q) { var hay = ((s ? _stuName_(s) : '') + ' ' + r.student_id + ' ' + r.reason).toLowerCase(); if (hay.indexOf(q) < 0) return false; }
    return true;
  });
  rows.sort(function (a, b) { return (cfg_d10_(b.date) + b.time).localeCompare(cfg_d10_(a.date) + a.time); });
  var total = rows.length, start = (page - 1) * per;
  var items = rows.slice(start, start + per).map(function (r) {
    var s = stuIx[String(r.student_id)];
    return { id: r.id, date: cfg_d10_(r.date), time: r.time, student_id: r.student_id, name: s ? _stuName_(s) : '(ไม่พบ)',
      class_room: s ? _stuClassRoom_(s) : '', advisor: s ? s.advisor_name : '', reason: r.reason,
      created_by_name: r.created_by_name, canceled: _yes_(r.canceled) };
  });
  return { items: items, total: total, page: page, per_page: per, pages: Math.ceil(total / per) };
}

function Late_cancel(user, p) {
  Auth_requireCap(user, 'late.create');
  var id = String((p && p.id) || '');
  var r = DB_get(SHEETS.LATE, id);
  if (!r) throw new Error('ไม่พบรายการ');
  if (!hasCap_(user.role, 'late.view_all') && String(r.created_by) !== String(user.id)) throw new Error('ยกเลิกได้เฉพาะรายการที่คุณบันทึกเอง');
  DB_update(SHEETS.LATE, id, { canceled: 'yes' });
  // คืนคะแนนที่หักอัตโนมัติจากรายการมาสายนี้ (ถ้ามี)
  var restored = null;
  try { restored = Behavior_cancelByRef_(String(r.student_id), id, Settings_map_()); } catch (e) {}
  Audit_log_(user, 'late.cancel', 'late', id, { auto_restored: restored ? restored.canceled : 0 });
  return { ok: true, restored: restored };
}
