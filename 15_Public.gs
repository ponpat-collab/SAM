/**
 * ═══════════════════════════════════════════════════════════════
 *  ระบบงานปกครองนักเรียน · Student Affairs Management System (SAM)
 *  File:        15_Public.gs — self-service สาธารณะ (นักเรียนบันทึกเอง · ไม่ต้องล็อกอิน)
 *  Version:     1.0.3
 *  Last Update: 2026-07-14
 *  Developer:   ครูวิรัตน์  หาดคำ · www.kruwirat.com
 *  License:     Proprietary · © 2026
 *  Notice:      ห้ามจำหน่าย · แบ่งปันเพื่อการศึกษาและต่อยอดเท่านั้น (ใช้เชิงพาณิชย์ต้องได้รับอนุญาตจากผู้พัฒนา)
 * ═══════════════════════════════════════════════════════════════
 */

var PUBLIC_SELF = Object.freeze({ id: 'self', full_name: 'นักเรียนบันทึกเอง', role: 'self' });

function _publicGate_() {
  Settings_ensureDefaults_();
  if (String(Settings_map_().self_service || 'yes').toLowerCase() !== 'yes') {
    throw new Error('ระบบบันทึกด้วยตนเองปิดใช้งานอยู่ — กรุณาติดต่อครูเวร');
  }
}

// ค้นหานักเรียนแบบสาธารณะ — คืนเฉพาะข้อมูลจำเป็น (ไม่เปิดคะแนน/ข้อมูลอ่อนไหว)
function Public_studentLookup(p) {
  _publicGate_();
  var id = String((p && p.id) || '').trim();
  if (!id) throw new Error('กรุณากรอกรหัสนักเรียน');
  var s = DB_get(SHEETS.STUDENTS, id);
  if (!s) throw new Error('ไม่พบรหัสนักเรียน ' + id + ' — ตรวจสอบอีกครั้ง');
  if (String(s.status || 'active') !== 'active') throw new Error('นักเรียนคนนี้ไม่อยู่ในสถานะปกติ — ติดต่อครูเวร');
  var today = cfg_today_();
  return {
    student: { id: s.id, name: _stuName_(s), class_level: s.class_level, room: s.room, number: s.number },
    late_today: DB_byLite(SHEETS.LATE, 'student_id', id).filter(function (r) { return cfg_d10_(r.date) === today && !_yes_(r.canceled); }).length,
    leave_today: DB_byLite(SHEETS.LEAVE, 'student_id', id).filter(function (r) { return cfg_d10_(r.date) === today && !_yes_(r.canceled); }).length
  };
}

// นักเรียนบันทึกมาสายเอง — hard-block ซ้ำวันเดียวกัน (ใช้ core เดียวกับ staff)
function Public_lateSubmit(p) {
  _publicGate_();
  var id = String((p && p.student_id) || '').trim();
  var stu = DB_get(SHEETS.STUDENTS, id);
  if (!stu) throw new Error('ไม่พบรหัสนักเรียน');
  if (String(stu.status || 'active') !== 'active') throw new Error('นักเรียนคนนี้ไม่อยู่ในสถานะปกติ');
  var rec = _lateCreateCore_(stu, {
    reason: cfg_str_(p && p.reason, 60).trim() || 'นักเรียนบันทึกเอง',
    note: '', date: cfg_today_(), createdBy: 'self', createdByName: PUBLIC_SELF.full_name
  });
  Audit_log_(PUBLIC_SELF, 'late.self', 'late', rec.id, { student_id: id });
  return { ok: true, student_name: _stuName_(stu), time: String(rec.time || '').slice(0, 5) };
}

// นักเรียนยื่นขออนุญาตกลับบ้านเอง — จำกัด 2 ครั้ง/วัน · แจ้งครูให้ตรวจสอบ
function Public_leaveSubmit(p) {
  _publicGate_();
  var id = String((p && p.student_id) || '').trim();
  var stu = DB_get(SHEETS.STUDENTS, id);
  if (!stu) throw new Error('ไม่พบรหัสนักเรียน');
  if (String(stu.status || 'active') !== 'active') throw new Error('นักเรียนคนนี้ไม่อยู่ในสถานะปกติ');
  var guardian = cfg_str_(p && p.guardian_name, 80).trim();
  if (!guardian) throw new Error('กรุณากรอกชื่อผู้ปกครองที่มารับ');
  var today = cfg_today_();
  var todayCnt = DB_byLite(SHEETS.LEAVE, 'student_id', id).filter(function (r) { return cfg_d10_(r.date) === today && !_yes_(r.canceled); }).length;
  if (todayCnt >= 2) throw new Error('วันนี้ยื่นขอกลับบ้านครบจำนวนแล้ว — ติดต่อครูเวร');
  var rec;
  DB_withLock_(function () {
    rec = DB_insert(SHEETS.LEAVE, {
      id: _genSeq_('E', DB_rowCount(SHEETS.LEAVE)), date: today, time: cfg_timeNow_(), student_id: id,
      reason: cfg_str_(p && p.reason, 60).trim() || 'ไม่ระบุ', guardian_name: guardian,
      guardian_phone: cfg_str_(p && p.guardian_phone, 20).trim(), relation: cfg_str_(p && p.relation, 40).trim(),
      photo_url: '', note: 'ยื่นผ่านนักเรียน — รอครูตรวจสอบผู้ปกครอง',
      created_by: 'self', created_by_name: PUBLIC_SELF.full_name, canceled: 'no'
    });
  });
  Audit_log_(PUBLIC_SELF, 'leave.self', 'leave', rec.id, { student_id: id });
  try {
    var map = Settings_map_();
    Notify_pushRoles_(['admin', 'teacher'], 'leave', 'นักเรียนยื่นขอกลับบ้าน',
      _stuName_(stu) + ' (' + _stuClassRoom_(stu) + ') ยื่นขออนุญาตกลับบ้านด้วยตนเอง — โปรดตรวจสอบผู้ปกครอง', '#/board');
    if (_yes_(map.tg_enabled) && _yes_(map.tg_notify_leave)) {
      Telegram_toAdmins_('🏠 <b>นักเรียนยื่นขอกลับบ้าน</b>\n' + _tgEsc_(_stuName_(stu)) + ' (' + _tgEsc_(_stuClassRoom_(stu)) + ')\nผู้ปกครอง: ' + _tgEsc_(guardian) + ' · โปรดตรวจสอบ');
    }
  } catch (e) {}
  return { ok: true, student_name: _stuName_(stu), time: String(rec.time || '').slice(0, 5) };
}
