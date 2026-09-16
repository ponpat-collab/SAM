/**
 * ═══════════════════════════════════════════════════════════════
 *  ระบบงานปกครองนักเรียน · Student Affairs Management System (SAM)
 *  File:        06_Behavior.gs — คะแนนความประพฤติสะสม (เริ่ม 0 นับขึ้น) + ฐานความผิด (ตั้งค่าได้)
 *  Version:     1.1.0
 *  Last Update: 2026-09-16
 *  Developer:   ครูวิรัตน์  หาดคำ · www.kruwirat.com
 *  License:     Proprietary · © 2026
 *  Notice:      ห้ามจำหน่าย · แบ่งปันเพื่อการศึกษาและต่อยอดเท่านั้น (ใช้เชิงพาณิชย์ต้องได้รับอนุญาตจากผู้พัฒนา)
 * ═══════════════════════════════════════════════════════════════
 */

// ── คะแนนความประพฤติ = "ยอดถูกหักสะสม" เริ่ม 0 นับขึ้น (มากขึ้น = แย่ลง · ถึง 40/60/80/100 = ระดับเตือน) ──
// คำนวณจากรายการเสมอ (ไม่บวก/ลบสะสม): หัก → +points · ทำความดี → -points · พื้น 0 · ไม่มีเพดาน (เกิน 100 แสดงตามจริง)
// เหตุผล: ยกเลิกรายการใด ๆ คะแนนต้องกลับถูกเสมอ · การบวก/ลบ delta เพี้ยนถาวรเมื่อเคยชนพื้น 0
function _clampScore_(v) { return Math.max(0, Math.round(v)); }
function _behaviorSum_(sid) {                     // ผลรวม points ที่ยังไม่ยกเลิก (หัก = ลบ · ความดี = บวก) — ไม่รวม AUTO เก่า (v1.0.x)
  var sum = 0;
  DB_byLite(SHEETS.BEHAVIOR, 'student_id', String(sid)).forEach(function (r) {
    if (!_yes_(r.canceled) && String(r.offense_code || '') !== 'AUTO') sum += cfg_num_(r.points);
  });
  return sum;
}
function _scoreOf_(sid) { return _clampScore_(-_behaviorSum_(sid)); }
// เรียกภายใน DB_withLock_ เสมอ (อ่านรายการล่าสุด → เขียนคะแนนที่ถูก)
function _recomputeScore_(sid) {
  var sc = _scoreOf_(sid);
  DB_update(SHEETS.STUDENTS, sid, { score: sc });
  return sc;
}

// ── OffenseTypes (configurable master data) ────────────────────
function Offenses_list(user, p) {
  var activeOnly = !(p && p.all);
  var rows = DB_readAll(SHEETS.OFFENSES).slice();
  if (activeOnly) rows = rows.filter(function (r) { return _yes_(r.is_active); });
  rows.sort(function (a, b) { return (cfg_num_(a.sort_order) - cfg_num_(b.sort_order)) || String(a.code).localeCompare(String(b.code)); });
  var usage = {};
  if (p && p.all) DB_readLite(SHEETS.BEHAVIOR).forEach(function (r) { if (r.offense_name) usage[r.offense_name] = (usage[r.offense_name] || 0) + 1; });
  return { items: rows.map(function (r) {
    return { code: r.code, name: r.name, category: r.category, points: cfg_num_(r.points),
      icon: r.icon || 'exclamation-triangle', color: r.color || '#f43f5e',
      is_active: _yes_(r.is_active), sort_order: cfg_num_(r.sort_order), usage: usage[r.name] || 0 };
  }) };
}
function Offenses_save(user, p) {
  Auth_requireCap(user, 'offense.manage');
  var code = String((p && p.code) || '').trim().toUpperCase();
  var isNew = !!(p && p.is_new);
  if (!code || !/^[A-Z0-9_-]{1,10}$/.test(code)) throw new Error('รหัสฐานความผิดต้องเป็น A-Z 0-9 (1-10 ตัว)');
  var d = {
    code: code, name: cfg_str_(p && p.name, 120).trim(), category: cfg_str_(p && p.category, 40).trim() || 'ทั่วไป',
    points: Math.abs(cfg_int_(p && p.points)) || 0, icon: cfg_str_(p && p.icon, 40).trim() || 'exclamation-triangle',
    color: cfg_str_(p && p.color, 20).trim() || '#f43f5e', is_active: _yes_(p && p.is_active) ? 'yes' : 'no',
    sort_order: cfg_int_(p && p.sort_order) || 0
  };
  if (!d.name) throw new Error('กรุณากรอกชื่อฐานความผิด');
  DB_withLock_(function () {
    var exist = DB_getFresh(SHEETS.OFFENSES, code);
    if (isNew) { if (exist) throw new Error('รหัส ' + code + ' มีอยู่แล้ว'); DB_insert(SHEETS.OFFENSES, d); }
    else { if (!exist) throw new Error('ไม่พบฐานความผิด'); DB_update(SHEETS.OFFENSES, code, d); }
  });
  Audit_log_(user, isNew ? 'offense.create' : 'offense.update', 'offense', code, {});
  return { ok: true };
}
function Offenses_delete(user, p) {
  Auth_requireCap(user, 'offense.manage');
  var code = String((p && p.code) || '');
  var o = DB_get(SHEETS.OFFENSES, code);
  if (!o) throw new Error('ไม่พบฐานความผิด');
  var used = DB_readLite(SHEETS.BEHAVIOR).some(function (r) { return String(r.offense_name) === String(o.name); });
  if (used) throw new Error('ฐานความผิดนี้มีการใช้งานแล้ว — แนะนำให้ปิดใช้งานแทนการลบ');
  DB_delete(SHEETS.OFFENSES, code);
  Audit_log_(user, 'offense.delete', 'offense', code, {});
  return { ok: true };
}
function Offenses_toggle(user, p) {
  Auth_requireCap(user, 'offense.manage');
  var code = String((p && p.code) || '');
  var o = DB_get(SHEETS.OFFENSES, code);
  if (!o) throw new Error('ไม่พบฐานความผิด');
  DB_update(SHEETS.OFFENSES, code, { is_active: _yes_(o.is_active) ? 'no' : 'yes' });
  return { ok: true };
}
function Offenses_reorder(user, p) {
  Auth_requireCap(user, 'offense.manage');
  var order = _arr_(p && p.order);
  DB_beginBatch();
  try { order.forEach(function (code, i) { if (DB_get(SHEETS.OFFENSES, String(code))) DB_update(SHEETS.OFFENSES, String(code), { sort_order: i + 1 }); }); }
  finally { DB_endBatch(); }
  return { ok: true };
}

// ── Behavior records ───────────────────────────────────────────
function Behavior_save(user, p) {
  Auth_requireCap(user, 'behavior.create');
  var sid = String((p && p.student_id) || '').trim();
  var stu = DB_get(SHEETS.STUDENTS, sid);
  if (!stu) throw new Error('ไม่พบรหัสนักเรียน ' + sid);
  if (!_canSeeStudent_(user, stu)) throw new Error('นักเรียนคนนี้อยู่นอกห้องที่คุณดูแล');
  var kind = String((p && p.kind) || 'deduct') === 'add' ? 'add' : 'deduct';
  var offenseCode = '', offenseName = '', category = '';
  var pts = Math.abs(cfg_int_(p && p.points));
  if (kind === 'deduct') {
    offenseCode = String((p && p.offense_code) || '').trim().toUpperCase();
    var o = offenseCode ? DB_get(SHEETS.OFFENSES, offenseCode) : null;
    if (o) { offenseName = o.name; category = o.category; if (!(p && p.points_override) && !pts) pts = cfg_num_(o.points); }
    else { offenseName = cfg_str_(p && p.offense_name, 120).trim() || 'อื่นๆ'; category = 'ทั่วไป'; }
    if (!pts) throw new Error('กรุณาระบุคะแนนที่หัก');
  } else {
    offenseName = cfg_str_(p && p.offense_name, 120).trim() || 'ทำความดี/บำเพ็ญประโยชน์';
    category = 'ความดี';
    if (!pts) throw new Error('กรุณาระบุคะแนนที่เพิ่ม');
  }
  var detail = cfg_str_(p && p.detail, 300).trim();
  var photoUrl = cfg_str_(p && p.photo_url, 300).trim();
  var date = cfg_dateOnly_((p && p.date) || new Date()) || cfg_today_();
  var map = Settings_map_(), signed = kind === 'add' ? pts : -pts, rec, scoreAfter, scoreBefore, alert;
  DB_withLock_(function () {
    _freshVer_();                                                  // เห็นรายการที่ execution อื่นเพิ่งเขียน
    var fresh = DB_getFresh(SHEETS.STUDENTS, sid);
    if (!fresh) throw new Error('ไม่พบนักเรียน');
    var sum = _behaviorSum_(sid);                                  // รายการที่ยังไม่ยกเลิก (ยังไม่รวมรายการนี้)
    scoreBefore = _clampScore_(-sum);
    scoreAfter = _clampScore_(-(sum + signed));                    // หัก (signed<0) → สะสมเพิ่ม · ความดี → สะสมลด
    rec = DB_insert(SHEETS.BEHAVIOR, {
      id: _genSeq_('B', DB_rowCount(SHEETS.BEHAVIOR)), date: date, time: cfg_timeNow_(), student_id: sid, kind: kind,
      offense_code: offenseCode, offense_name: offenseName, category: category, detail: detail, points: signed,
      score_after: scoreAfter, photo_url: photoUrl, ref_id: '', created_by: user.id, created_by_name: user.full_name, canceled: 'no'
    });
    DB_update(SHEETS.STUDENTS, sid, { score: scoreAfter });
  });
  alert = _scoreAlert_(scoreAfter, map);
  Audit_log_(user, kind === 'add' ? 'behavior.add' : 'behavior.deduct', 'behavior', rec.id, { student_id: sid, points: signed });
  try {
    if (_yes_(map.tg_enabled) && _yes_(map.tg_notify_behavior)) {
      Telegram_toAdmins_((kind === 'add' ? '➕ <b>เพิ่มคะแนน</b>' : '➖ <b>หักคะแนน</b>') + '\n' + _tgEsc_(_stuName_(stu)) + ' (' + _tgEsc_(_stuClassRoom_(stu)) + ')\n' +
        _tgEsc_(offenseName) + ' · ' + (signed > 0 ? '+' : '') + signed + ' คะแนน\nสะสม ' + scoreAfter + ' คะแนน' + (alert.level ? ' · ' + _tgEsc_(alert.label) : '') + ' · โดย ' + _tgEsc_(user.full_name));
    }
  } catch (e) {}
  _behaviorDeductAlert_(stu, scoreAfter, scoreBefore, map);
  return { ok: true, record: rec, student_name: _stuName_(stu), score_after: scoreAfter, alert: alert };
}

// แจ้งเตือนเมื่อคะแนนสะสม "ข้ามเกณฑ์" 40/60/80/100 (ยิงครั้งเดียวต่อการข้ามเกณฑ์ · ระดับสูงสุดที่ข้าม)
function _behaviorDeductAlert_(stu, scoreAfter, scoreBefore, map) {
  try {
    if (scoreAfter <= scoreBefore) return;        // คะแนนไม่ได้เพิ่ม (ทำความดี/เท่าเดิม)
    var crossed = null;
    _alertLevels_(map).forEach(function (L) { if (scoreBefore < L.at && scoreAfter >= L.at) crossed = L; });
    if (!crossed) return;
    var title = 'คะแนนความประพฤติถึง ' + crossed.at + ' — ' + crossed.label;
    var msg = _stuName_(stu) + ' (' + _stuClassRoom_(stu) + ') คะแนนสะสม ' + scoreAfter + ' คะแนน — ' + crossed.label + 'ตามระเบียบ';
    Notify_pushRoles_(['admin', 'teacher'], 'behavior', title, msg, '#/report/student?id=' + stu.id);
    if (_yes_(map.tg_enabled)) Telegram_toAdmins_('⚠️ <b>' + _tgEsc_(title) + '</b>\n' + _tgEsc_(msg));
  } catch (e) {}
}

// ยกเลิกรายการหักอัตโนมัติ (AUTO) ที่เหลือจาก v1.0.x — คะแนนมาสายแยกก้อนแล้ว ห้ามนับซ้ำในความประพฤติ
// ★ เรียกภายใน DB_withLock_ · เขียนคอลัมน์ canceled ครั้งเดียว (ไม่ DB_update ทีละรายการ)
function Behavior_retireAuto_() {
  var want = {};
  DB_readLite(SHEETS.BEHAVIOR).forEach(function (r) { if (String(r.offense_code || '') === 'AUTO' && !_yes_(r.canceled)) want[String(r.id)] = 'yes'; });
  return Object.keys(want).length ? DB_setColumnById_(SHEETS.BEHAVIOR, 'canceled', want) : 0;
}

// ── ซ่อมแถวที่เขียนช่วง v1.0.6–1.0.7 (ตอนนั้น ref_id ถูกแทรก "กลาง" schema → คอลัมน์เลื่อน) ──
// แถวผิด layout: [... photo_url, ref_id, created_by, created_by_name, canceled, created_at, rev]
// layout ถูก:    [... photo_url, created_by, created_by_name, canceled, created_at, rev, ref_id]
// จับได้จาก canceled ที่ไม่ใช่ yes/no (เพราะโดนค่าอื่นเลื่อนมาทับ)
function Behavior_repairShift_() {
  var name = SHEETS.BEHAVIOR, cols = SCHEMAS[name], sh = DB_ensureSchema_(name);
  var last = sh.getLastRow(); if (last < 2) return { fixed: 0, total: 0 };
  var iPhoto = cols.indexOf('photo_url'), iCanceled = cols.indexOf('canceled'), iRef = cols.indexOf('ref_id');
  if (iPhoto < 0 || iCanceled < 0 || iRef < 0) return { fixed: 0, total: 0 };
  var rng = sh.getRange(2, 1, last - 1, cols.length), vals = rng.getValues(), fixed = 0;
  vals.forEach(function (row) {
    var c = String(row[iCanceled] == null ? '' : row[iCanceled]).trim().toLowerCase();
    if (c === 'yes' || c === 'no' || c === '') return;            // แถวปกติ
    var refv = row[iPhoto + 1];                                    // ค่า ref_id ที่อยู่ผิดที่
    for (var i = iPhoto + 1; i < iRef; i++) row[i] = row[i + 1];   // เลื่อนกลับ
    row[iRef] = refv == null ? '' : refv;
    fixed++;
  });
  if (fixed) { rng.setValues(vals); _flush_(); _bumpVer_('sheet:' + name); }
  return { fixed: fixed, total: vals.length };
}

// คำนวณคะแนนใหม่ทั้งระบบจากรายการจริง (ความประพฤติ + มาสาย)
// อ่านแต่ละชีตครั้งเดียว + เขียนคอลัมน์ score / late_score ครั้งเดียว — รองรับนักเรียนหลักพันโดยไม่หมดเวลา
// ★ เรียกภายใน DB_withLock_ เสมอ (ใช้ทั้งปุ่ม/เมนูคำนวณใหม่ และ migration v1.1.0)
function _recomputeAllScores_() {
  _freshVer_();
  var shift = Behavior_repairShift_();          // ซ่อมคอลัมน์ที่เลื่อนก่อน (ถ้ามี) แล้วค่อยคำนวณคะแนน
  var retired = Behavior_retireAuto_();          // AUTO เก่า → ยกเลิก (มาสายแยกก้อนแล้ว)
  var sums = {};
  DB_readLite(SHEETS.BEHAVIOR).forEach(function (r) {
    if (_yes_(r.canceled) || String(r.offense_code || '') === 'AUTO') return;
    var k = String(r.student_id);
    sums[k] = (sums[k] || 0) + cfg_num_(r.points);
  });
  var stus = DB_readLite(SHEETS.STUDENTS), want = {};
  stus.forEach(function (s) { want[String(s.id)] = _clampScore_(-(sums[String(s.id)] || 0)); });
  var fixed = DB_setColumnById_(SHEETS.STUDENTS, 'score', want);
  var late = Late_recomputeAll_();
  return { fixed: fixed, late_fixed: late.fixed, total: stus.length, shift_fixed: shift.fixed, auto_retired: retired };
}
function Behavior_recomputeAll(user, p) {
  Auth_requireCap(user, 'student.manage');
  var r;
  DB_withLock_(function () { r = _recomputeAllScores_(); }, 60000);
  Audit_log_(user, 'score.recompute', 'student', '', r);
  r.ok = true;
  return r;
}

function Behavior_list(user, p) {
  Auth_requireCap(user, 'behavior.view_own|behavior.view_all');
  p = p || {};
  var from = cfg_dateOnly_(p.from) || '', to = cfg_dateOnly_(p.to) || '', sid = String(p.student_id || '');
  var cls = String(p.class_level || ''), room = String(p.room || ''), kind = String(p.kind || ''), q = String(p.q || '').trim().toLowerCase();
  var page = Math.max(1, cfg_int_(p.page) || 1), per = Math.min(100, cfg_int_(p.per_page) || 40);
  var stuIx = DB_buildIndexLite(SHEETS.STUDENTS), scope = _studentScope_(user);
  var rows = DB_readLite(SHEETS.BEHAVIOR).filter(function (r) {
    if (_yes_(r.canceled) && !p.include_canceled) return false;
    var d = cfg_d10_(r.date);
    if (from && d < from) return false;
    if (to && d > to) return false;
    if (sid && String(r.student_id) !== sid) return false;
    if (kind && String(r.kind) !== kind) return false;
    var s = stuIx[String(r.student_id)];
    if (scope && (!s || !scope(s))) return false;
    if (cls && (!s || String(s.class_level) !== cls)) return false;
    if (room && (!s || String(s.room) !== room)) return false;
    if (q) { var hay = ((s ? _stuName_(s) : '') + ' ' + r.student_id + ' ' + r.offense_name).toLowerCase(); if (hay.indexOf(q) < 0) return false; }
    return true;
  });
  rows.sort(function (a, b) { return (cfg_d10_(b.date) + b.time).localeCompare(cfg_d10_(a.date) + a.time); });
  var total = rows.length, start = (page - 1) * per;
  var items = rows.slice(start, start + per).map(function (r) {
    var s = stuIx[String(r.student_id)];
    return { id: r.id, date: cfg_d10_(r.date), time: r.time, student_id: r.student_id, name: s ? _stuName_(s) : '(ไม่พบ)',
      class_room: s ? _stuClassRoom_(s) : '', kind: r.kind, offense_name: r.offense_name, category: r.category,
      auto: String(r.offense_code || '') === 'AUTO', points: cfg_num_(r.points), score_after: cfg_num_(r.score_after),
      created_by_name: r.created_by_name, canceled: _yes_(r.canceled) };
  });
  return { items: items, total: total, page: page, per_page: per, pages: Math.ceil(total / per) };
}

function Behavior_cancel(user, p) {
  Auth_requireCap(user, 'behavior.create');
  var id = String((p && p.id) || '');
  var r = DB_get(SHEETS.BEHAVIOR, id);
  if (!r) throw new Error('ไม่พบรายการ');
  if (_yes_(r.canceled)) throw new Error('รายการนี้ถูกยกเลิกแล้ว');
  if (!hasCap_(user.role, 'behavior.view_all') && String(r.created_by) !== String(user.id)) throw new Error('ยกเลิกได้เฉพาะรายการที่คุณบันทึกเอง');
  var map = Settings_map_(), signed = cfg_num_(r.points), sid = String(r.student_id), score = null;
  DB_withLock_(function () {
    _freshVer_();
    DB_update(SHEETS.BEHAVIOR, id, { canceled: 'yes' });
    score = _recomputeScore_(sid);                // คำนวณใหม่จากรายการที่เหลือ — คืนคะแนนถูกเสมอ
  });
  Audit_log_(user, 'behavior.cancel', 'behavior', id, { restore: -signed, score_after: score });
  return { ok: true, score_after: score };
}
