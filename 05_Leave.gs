/**
 * ═══════════════════════════════════════════════════════════════
 *  ระบบงานปกครองนักเรียน · Student Affairs Management System (SAM)
 *  File:        05_Leave.gs — บันทึกขออนุญาตกลับบ้าน (ลากลับ) + รูปผู้มารับ
 *  Version:     1.0.0
 *  Last Update: 2026-07-13
 *  Developer:   ครูวิรัตน์  หาดคำ · www.kruwirat.com
 *  License:     Proprietary · © 2026
 *  Notice:      ห้ามจำหน่าย · แบ่งปันเพื่อการศึกษาและต่อยอดเท่านั้น (ใช้เชิงพาณิชย์ต้องได้รับอนุญาตจากผู้พัฒนา)
 * ═══════════════════════════════════════════════════════════════
 */

function Leave_save(user, p) {
  Auth_requireCap(user, 'leave.create');
  var sid = String((p && p.student_id) || '').trim();
  var stu = DB_get(SHEETS.STUDENTS, sid);
  if (!stu) throw new Error('ไม่พบรหัสนักเรียน ' + sid);
  if (!_canSeeStudent_(user, stu)) throw new Error('นักเรียนคนนี้อยู่นอกห้องที่คุณดูแล');
  var d = {
    reason: cfg_str_(p && p.reason, 60).trim() || 'ไม่ระบุ',
    guardian_name: cfg_str_(p && p.guardian_name, 80).trim(),
    guardian_phone: cfg_str_(p && p.guardian_phone, 20).trim(),
    relation: cfg_str_(p && p.relation, 40).trim(),
    photo_url: cfg_str_(p && p.photo_url, 300).trim(),
    note: cfg_str_(p && p.note, 200).trim()
  };
  if (!d.guardian_name) throw new Error('กรุณากรอกชื่อผู้ปกครองที่มารับ');
  var date = cfg_dateOnly_((p && p.date) || new Date()) || cfg_today_();
  var rec;
  DB_withLock_(function () {
    rec = DB_insert(SHEETS.LEAVE, {
      id: _genSeq_('E', DB_rowCount(SHEETS.LEAVE)), date: date, time: cfg_timeNow_(), student_id: sid,
      reason: d.reason, guardian_name: d.guardian_name, guardian_phone: d.guardian_phone, relation: d.relation,
      photo_url: d.photo_url, note: d.note, created_by: user.id, created_by_name: user.full_name, canceled: 'no'
    });
  });
  Audit_log_(user, 'leave.create', 'leave', rec.id, { student_id: sid });
  // Telegram → admins
  try {
    var map = Settings_map_();
    if (_yes_(map.tg_enabled) && _yes_(map.tg_notify_leave)) {
      Telegram_toAdmins_('🏠 <b>ลากลับบ้าน</b>\n' + _tgEsc_(_stuName_(stu)) + ' (' + _tgEsc_(_stuClassRoom_(stu)) + ')\n' +
        'สาเหตุ: ' + _tgEsc_(d.reason) + '\nผู้รับ: ' + _tgEsc_(d.guardian_name) + ' (' + _tgEsc_(d.relation) + ')\n' +
        'เวลา ' + rec.time + ' น. · โดย ' + _tgEsc_(user.full_name));
    }
  } catch (e) {}
  return { ok: true, record: rec, student_name: _stuName_(stu) };
}

function Leave_list(user, p) {
  Auth_requireCap(user, 'leave.view_own|leave.view_all');
  p = p || {};
  var from = cfg_dateOnly_(p.from) || '', to = cfg_dateOnly_(p.to) || '', sid = String(p.student_id || '');
  var cls = String(p.class_level || ''), room = String(p.room || ''), q = String(p.q || '').trim().toLowerCase();
  var page = Math.max(1, cfg_int_(p.page) || 1), per = Math.min(100, cfg_int_(p.per_page) || 40);
  var stuIx = DB_buildIndexLite(SHEETS.STUDENTS), scope = _studentScope_(user);
  var rows = DB_readLite(SHEETS.LEAVE).filter(function (r) {
    if (_yes_(r.canceled) && !p.include_canceled) return false;
    var d = cfg_d10_(r.date);
    if (from && d < from) return false;
    if (to && d > to) return false;
    if (sid && String(r.student_id) !== sid) return false;
    var s = stuIx[String(r.student_id)];
    if (scope && (!s || !scope(s))) return false;
    if (cls && (!s || String(s.class_level) !== cls)) return false;
    if (room && (!s || String(s.room) !== room)) return false;
    if (q) { var hay = ((s ? _stuName_(s) : '') + ' ' + r.student_id + ' ' + r.guardian_name + ' ' + r.reason).toLowerCase(); if (hay.indexOf(q) < 0) return false; }
    return true;
  });
  rows.sort(function (a, b) { return (cfg_d10_(b.date) + b.time).localeCompare(cfg_d10_(a.date) + a.time); });
  var total = rows.length, start = (page - 1) * per;
  var items = rows.slice(start, start + per).map(function (r) {
    var s = stuIx[String(r.student_id)];
    return { id: r.id, date: cfg_d10_(r.date), time: r.time, student_id: r.student_id, name: s ? _stuName_(s) : '(ไม่พบ)',
      class_room: s ? _stuClassRoom_(s) : '', reason: r.reason, guardian_name: r.guardian_name, relation: r.relation,
      photo_url: r.photo_url, created_by_name: r.created_by_name, canceled: _yes_(r.canceled) };
  });
  return { items: items, total: total, page: page, per_page: per, pages: Math.ceil(total / per) };
}

function Leave_get(user, p) {
  Auth_requireCap(user, 'leave.view_own|leave.view_all');
  var r = DB_get(SHEETS.LEAVE, String((p && p.id) || ''));
  if (!r) throw new Error('ไม่พบรายการ');
  var s = DB_get(SHEETS.STUDENTS, String(r.student_id));
  if (scopeReject_(user, s)) throw new Error('อยู่นอกห้องที่คุณดูแล');
  return { record: r, student: s ? { id: s.id, name: _stuName_(s), class_room: _stuClassRoom_(s), advisor_name: s.advisor_name } : null };
}
function scopeReject_(user, s) { var sc = _studentScope_(user); return sc !== null && (!s || !sc(s)); }

function Leave_cancel(user, p) {
  Auth_requireCap(user, 'leave.create');
  var id = String((p && p.id) || '');
  var r = DB_get(SHEETS.LEAVE, id);
  if (!r) throw new Error('ไม่พบรายการ');
  if (!hasCap_(user.role, 'leave.view_all') && String(r.created_by) !== String(user.id)) throw new Error('ยกเลิกได้เฉพาะรายการที่คุณบันทึกเอง');
  DB_update(SHEETS.LEAVE, id, { canceled: 'yes' });
  Audit_log_(user, 'leave.cancel', 'leave', id, {});
  return { ok: true };
}
