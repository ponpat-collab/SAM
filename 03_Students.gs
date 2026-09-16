/**
 * ═══════════════════════════════════════════════════════════════
 *  ระบบงานปกครองนักเรียน · Student Affairs Management System (SAM)
 *  File:        03_Students.gs — ข้อมูลนักเรียน · lookup บาร์โค้ด · CRUD · import
 *  Version:     1.1.0
 *  Last Update: 2026-09-16
 *  Developer:   ครูวิรัตน์  หาดคำ · www.kruwirat.com
 *  License:     Proprietary · © 2026
 *  Notice:      ห้ามจำหน่าย · แบ่งปันเพื่อการศึกษาและต่อยอดเท่านั้น (ใช้เชิงพาณิชย์ต้องได้รับอนุญาตจากผู้พัฒนา)
 * ═══════════════════════════════════════════════════════════════
 */

/** scope ของข้อมูลนักเรียน · null = เห็นทั้งหมด · function = advisor เห็นเฉพาะห้องตัวเอง */
function _studentScope_(user) {
  if (hasCap_(user.role, 'student.view_all') || hasCap_(user.role, 'report.view_all')) return null;
  var cls = String(user.advisor_class || ''), room = String(user.advisor_room || '');
  return function (stu) { return String(stu.class_level) === cls && String(stu.room) === room; };
}
function _canSeeStudent_(user, stu) { var sc = _studentScope_(user); return sc === null || sc(stu); }

function _stuName_(s) { return s ? (String(s.prefix || '') + String(s.first_name || '') + ' ' + String(s.last_name || '')).trim() : ''; }
function _stuClassRoom_(s) { return s ? ('ม.' + s.class_level + '/' + s.room) : ''; }

// ระดับเตือนคะแนนความประพฤติสะสม (เรียงจากน้อยไปมาก) — ตั้งค่าได้ · label ตายตัวตามระเบียบ
function _alertLevels_(map) {
  return [
    { level: 1, at: cfg_num_(map.alert_level_1) || 40,  label: 'แจ้งผู้ปกครอง',       tone: 'warn' },
    { level: 2, at: cfg_num_(map.alert_level_2) || 60,  label: 'เชิญผู้ปกครอง',       tone: 'warn' },
    { level: 3, at: cfg_num_(map.alert_level_3) || 80,  label: 'พบรองผู้อำนวยการ',    tone: 'danger' },
    { level: 4, at: cfg_num_(map.alert_level_4) || 100, label: 'พบผู้อำนวยการ',       tone: 'danger' }
  ];
}
// คะแนนสะสม "ถึง" เกณฑ์ไหนสูงสุด → ระดับนั้น (0 = ปกติ)
function _scoreAlert_(score, map) {
  var s = cfg_num_(score), hit = { level: 0, label: 'ปกติ', tone: 'ok', at: 0 };
  _alertLevels_(map).forEach(function (L) { if (s >= L.at) hit = L; });
  return hit;
}

// ── lookup by barcode/id ───────────────────────────────────────
function Students_lookup(user, p) {
  Auth_requireCap(user, 'student.view_own|student.view_all');
  var id = String((p && p.id) || '').trim();
  if (!id) throw new Error('ไม่พบรหัสนักเรียน');
  var s = DB_get(SHEETS.STUDENTS, id);
  if (!s) throw new Error('ไม่พบรหัสนักเรียน ' + id + ' ในระบบ');
  if (!_canSeeStudent_(user, s)) throw new Error('นักเรียนคนนี้อยู่นอกห้องที่คุณดูแล');
  var map = Settings_map_();
  var today = cfg_today_();
  var lateToday = DB_byLite(SHEETS.LATE, 'student_id', id).filter(function (r) { return cfg_d10_(r.date) === today && !_yes_(r.canceled); }).length;
  var leaveToday = DB_byLite(SHEETS.LEAVE, 'student_id', id).filter(function (r) { return cfg_d10_(r.date) === today && !_yes_(r.canceled); }).length;
  return {
    student: {
      id: s.id, name: _stuName_(s), prefix: s.prefix, first_name: s.first_name, last_name: s.last_name,
      class_level: s.class_level, room: s.room, number: s.number, score: cfg_num_(s.score), late_score: cfg_num_(s.late_score),
      advisor_name: s.advisor_name, status: s.status
    },
    alert: _scoreAlert_(s.score, map),
    late: _lateLookupInfo_(id, map),
    late_today: lateToday, leave_today: leaveToday
  };
}

// สรุปมาสายในภาคเรียนสำหรับ preview ตอนสแกน — ครั้งที่ผ่านมา + ครั้งถัดไปจะหักเท่าไร
function _lateLookupInfo_(sid, map) {
  var d = _lateScoreDetail_(sid, map);
  return { count: d.count, counted: d.counted, score: d.score, next_deduct: d.next, cutoff: cfg_time_(map.late_cutoff_time) || '08:35', term: _termKey_(map) };
}

// ── list (paginated, scoped, single-pass filter) ───────────────
function Students_list(user, p) {
  Auth_requireCap(user, 'student.view_own|student.view_all');
  p = p || {};
  var q = String(p.q || '').trim().toLowerCase();
  var cls = String(p.class_level || ''), room = String(p.room || ''), status = String(p.status || '');
  var sort = String(p.sort || 'class');
  var page = Math.max(1, cfg_int_(p.page) || 1), per = Math.min(100, cfg_int_(p.per_page) || 50);
  var scope = _studentScope_(user);
  var map = Settings_map_();
  var rows = DB_readLite(SHEETS.STUDENTS).filter(function (s) {
    if (scope && !scope(s)) return false;
    if (cls && String(s.class_level) !== cls) return false;
    if (room && String(s.room) !== room) return false;
    if (status && String(s.status) !== status) return false;
    if (q) { var hay = (s.id + ' ' + _stuName_(s) + ' ' + s.advisor_name).toLowerCase(); if (hay.indexOf(q) < 0) return false; }
    return true;
  });
  rows.sort(function (a, b) {
    if (sort === 'score') return cfg_num_(b.score) - cfg_num_(a.score);          // คะแนนสะสมมากสุดก่อน (เสี่ยงสุด)
    if (sort === 'name') return _stuName_(a).localeCompare(_stuName_(b), 'th');
    var ka = String(a.class_level).padStart(2, '0') + String(a.room).padStart(2, '0') + String(a.number).padStart(3, '0');
    var kb = String(b.class_level).padStart(2, '0') + String(b.room).padStart(2, '0') + String(b.number).padStart(3, '0');
    return ka.localeCompare(kb);
  });
  var total = rows.length, start = (page - 1) * per;
  var items = rows.slice(start, start + per).map(function (s) {
    return { id: s.id, name: _stuName_(s), class_level: s.class_level, room: s.room, number: s.number,
      score: cfg_num_(s.score), late_score: cfg_num_(s.late_score), advisor_name: s.advisor_name, status: s.status, alert: _scoreAlert_(s.score, map) };
  });
  return { items: items, total: total, page: page, per_page: per, pages: Math.ceil(total / per) };
}

// ── classroom options ──────────────────────────────────────────
function Students_classrooms(user, p) {
  Auth_requireCap(user, 'student.view_own|student.view_all');
  var scope = _studentScope_(user);
  var byClass = {}, rooms = {};
  DB_readLite(SHEETS.STUDENTS).forEach(function (s) {
    if (scope && !scope(s)) return;
    if (String(s.status) !== STU_STATUS.ACTIVE) return;
    byClass[s.class_level] = (byClass[s.class_level] || 0) + 1;
    rooms[s.class_level + '/' + s.room] = 1;
  });
  var classes = Object.keys(byClass).sort(function (a, b) { return cfg_num_(a) - cfg_num_(b); });
  var roomList = Object.keys(rooms).map(function (k) { var p2 = k.split('/'); return { class_level: p2[0], room: p2[1] }; })
    .sort(function (a, b) { return (cfg_num_(a.class_level) - cfg_num_(b.class_level)) || (cfg_num_(a.room) - cfg_num_(b.room)); });
  return { classes: classes, rooms: roomList };
}

function Students_get(user, p) {
  Auth_requireCap(user, 'student.view_own|student.view_all');
  var s = DB_get(SHEETS.STUDENTS, String((p && p.id) || ''));
  if (!s) throw new Error('ไม่พบนักเรียน');
  if (!_canSeeStudent_(user, s)) throw new Error('อยู่นอกห้องที่คุณดูแล');
  return { student: s, name: _stuName_(s) };
}

// ── save (create/update) ───────────────────────────────────────
function _sanitizeStudent_(p) {
  return {
    id: String((p && p.id) || '').trim(),
    prefix: cfg_str_(p && p.prefix, 20).trim(),
    first_name: cfg_str_(p && p.first_name, 60).trim(),
    last_name: cfg_str_(p && p.last_name, 60).trim(),
    class_level: cfg_str_(p && p.class_level, 6).trim(),
    room: cfg_str_(p && p.room, 6).trim(),
    number: cfg_str_(p && p.number, 6).trim(),
    advisor_name: cfg_str_(p && p.advisor_name, 80).trim(),
    status: (String((p && p.status) || 'active') === 'left') ? 'left' : 'active',
    note: cfg_str_(p && p.note, 200).trim()
  };
}
function Students_save(user, p) {
  Auth_requireCap(user, 'student.manage');
  var d = _sanitizeStudent_(p), isNew = !!(p && p.is_new);
  if (!d.id) throw new Error('กรุณาระบุรหัสนักเรียน');
  if (!/^\d{5}$/.test(d.id)) throw new Error('รหัสนักเรียนต้องเป็นตัวเลข 5 หลัก');
  if (!d.first_name) throw new Error('กรุณากรอกชื่อ');
  if (!d.class_level || !d.room) throw new Error('กรุณาระบุชั้นและห้อง');
  var out;
  DB_withLock_(function () {
    var exist = DB_getFresh(SHEETS.STUDENTS, d.id);
    if (isNew) {
      if (exist) throw new Error('รหัสนักเรียน ' + d.id + ' มีอยู่แล้ว');
      d.score = 0; d.late_score = 0;                                       // เริ่มสะสมจาก 0
      out = DB_insert(SHEETS.STUDENTS, d);
    } else {
      if (!exist) throw new Error('ไม่พบนักเรียนที่จะแก้ไข');
      out = DB_update(SHEETS.STUDENTS, d.id, {
        prefix: d.prefix, first_name: d.first_name, last_name: d.last_name, class_level: d.class_level,
        room: d.room, number: d.number, advisor_name: d.advisor_name, status: d.status, note: d.note
      });
    }
  });
  Audit_log_(user, isNew ? 'student.create' : 'student.update', 'student', d.id, {});
  return { ok: true, student: out };
}
function Students_delete(user, p) {
  Auth_requireCap(user, 'student.manage');
  var id = String((p && p.id) || '');
  var s = DB_get(SHEETS.STUDENTS, id);
  if (!s) throw new Error('ไม่พบนักเรียน');
  DB_update(SHEETS.STUDENTS, id, { status: 'left' });
  Audit_log_(user, 'student.delete', 'student', id, { name: _stuName_(s) });
  return { ok: true };
}

// ── import (Excel/CSV rows) ────────────────────────────────────
function Students_import(user, p) {
  Auth_requireCap(user, 'student.manage');
  var list = _arr_(p && p.rows);
  if (!list.length) throw new Error('ไม่มีข้อมูลนำเข้า');
  if (list.length > 3500) throw new Error('นำเข้าได้สูงสุด 3,500 รายการต่อครั้ง');
  var existing = DB_buildIndex(SHEETS.STUDENTS);
  var created = 0, updated = 0, skipped = 0, inserts = [];
  DB_beginBatch();
  try {
    list.forEach(function (r) {
      var id = String((r && r.id) || '').trim();
      if (!id || !/^\d{5}$/.test(id)) { skipped++; return; }        // รหัส 5 หลักเท่านั้น (ตามระเบียบ · ค้นหาอัตโนมัติเมื่อครบ 5)
      var d = _sanitizeStudent_(r);
      if (!d.first_name) { skipped++; return; }
      if (existing[id]) {
        DB_update(SHEETS.STUDENTS, id, { prefix: d.prefix, first_name: d.first_name, last_name: d.last_name,
          class_level: d.class_level, room: d.room, number: d.number, advisor_name: d.advisor_name });
        updated++;
      } else {
        d.score = 0; d.late_score = 0;
        inserts.push(d);
        existing[id] = d;
        created++;
      }
    });
    if (inserts.length) DB_bulkInsert(SHEETS.STUDENTS, inserts);
  } finally { DB_endBatch(); }
  Audit_log_(user, 'student.import', 'student', '', { created: created, updated: updated, skipped: skipped });
  return { ok: true, created: created, updated: updated, skipped: skipped };
}

// ── reset scores (ขึ้นปีการศึกษาใหม่) — คะแนนความประพฤติ + มาสาย กลับเป็น 0 ทุกคน (ประวัติเก่ายังอยู่) ──
// เขียน 2 คอลัมน์ครั้งเดียว (ไม่ DB_update ทีละคน)
function Students_resetScores(user, p) {
  Auth_requireCap(user, 'score.reset');
  var count = 0;
  DB_withLock_(function () {
    _freshVer_();
    var zero = {};
    DB_readLite(SHEETS.STUDENTS).forEach(function (s) { if (String(s.status) === STU_STATUS.ACTIVE) zero[String(s.id)] = 0; });
    count = Object.keys(zero).length;
    DB_setColumnById_(SHEETS.STUDENTS, 'score', zero);
    DB_setColumnById_(SHEETS.STUDENTS, 'late_score', zero);
  }, 60000);
  Audit_log_(user, 'score.reset', 'student', '', { count: count });
  return { ok: true, count: count };
}
