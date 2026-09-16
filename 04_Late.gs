/**
 * ═══════════════════════════════════════════════════════════════
 *  ระบบงานปกครองนักเรียน · Student Affairs Management System (SAM)
 *  File:        04_Late.gs — บันทึกการมาสาย + คะแนนมาสายสะสม (แยกก้อน · ต่อภาคเรียน · ตารางหักตามลำดับครั้ง)
 *  Version:     1.1.0
 *  Last Update: 2026-09-16
 *  Developer:   ครูวิรัตน์  หาดคำ · www.kruwirat.com
 *  License:     Proprietary · © 2026
 *  Notice:      ห้ามจำหน่าย · แบ่งปันเพื่อการศึกษาและต่อยอดเท่านั้น (ใช้เชิงพาณิชย์ต้องได้รับอนุญาตจากผู้พัฒนา)
 * ═══════════════════════════════════════════════════════════════
 */

// ── ภาคเรียน ────────────────────────────────────────────────────
// key ของภาคเรียนปัจจุบัน เช่น "2569/1" — รายการมาสายเก็บ term นี้ไว้ · นับครั้งเฉพาะ term ปัจจุบัน
function _termKey_(map) { return String(map.academic_year || '') + '/' + String(map.current_term || '1'); }
// รายการเก่าที่ยังไม่มี term (ก่อน v1.1.0) ถือเป็นภาคเรียนปัจจุบัน
function _lateInTerm_(r, key) { var t = String(r.term || ''); return !t || t === key; }
// เวลาที่ใช้เทียบเกณฑ์ = arrive_time (ครูแก้ได้) · ถ้าไม่มีใช้เวลาที่บันทึก
function _lateArrive_(r) { return cfg_time_(r.arrive_time) || cfg_time_(r.time) || ''; }

// ── ตารางหักคะแนนมาสาย ──────────────────────────────────────────
// ครั้งที่ n (1-based) หักเท่าไร — อ่านจาก late_deduct_table · เกินตาราง = late_deduct_after
function _lateTable_(map) {
  var t = String(map.late_deduct_table || '0,0,5,5,5,5,5,10,10').split(',')
    .map(function (x) { return Math.abs(cfg_num_(x)); });
  return { table: t, after: Math.abs(cfg_num_(map.late_deduct_after)) || 0 };
}
function _lateDeductAt_(n, cfg) { return n <= cfg.table.length ? cfg.table[n - 1] : cfg.after; }

// คำนวณคะแนนมาสายของนักเรียน 1 คน "จากรายการเสมอ" (ไม่บวก/ลบสะสม — ยกเลิกรายการแล้วลำดับขยับเอง)
// คืน { count (ทุกครั้งใน term), counted (ครั้งที่หลังเวลาตัด), score, per: {lateId: {rank, deduct}} }
function _lateScoreDetail_(sid, map) {
  var key = _termKey_(map), cutoff = cfg_time_(map.late_cutoff_time) || '08:35', cfg = _lateTable_(map);
  var rows = DB_byLite(SHEETS.LATE, 'student_id', String(sid)).filter(function (r) { return !_yes_(r.canceled) && _lateInTerm_(r, key); });
  rows.sort(function (a, b) { return (cfg_d10_(a.date) + _lateArrive_(a)).localeCompare(cfg_d10_(b.date) + _lateArrive_(b)); });
  var per = {}, rank = 0, score = 0;
  rows.forEach(function (r) {
    if (_lateArrive_(r) > cutoff) { rank++; var d = _lateDeductAt_(rank, cfg); score += d; per[r.id] = { rank: rank, deduct: d }; }
    else per[r.id] = { rank: 0, deduct: 0 };
  });
  return { count: rows.length, counted: rank, score: score, per: per, next: _lateDeductAt_(rank + 1, cfg) };
}
// เรียกภายใน DB_withLock_ — เขียน late_score ลง Students ให้ตรงกับรายการ
function _recomputeLateScore_(sid, map) {
  var d = _lateScoreDetail_(sid, map);
  DB_update(SHEETS.STUDENTS, sid, { late_score: d.score });
  return d;
}

function Late_save(user, p) {
  Auth_requireCap(user, 'late.create');
  var sid = String((p && p.student_id) || '').trim();
  var stu = DB_get(SHEETS.STUDENTS, sid);
  if (!stu) throw new Error('ไม่พบรหัสนักเรียน ' + sid);
  if (!_canSeeStudent_(user, stu)) throw new Error('นักเรียนคนนี้อยู่นอกห้องที่คุณดูแล');
  var out = _lateCreateCore_(stu, {
    reason: cfg_str_(p && p.reason, 60).trim() || 'ไม่ระบุ',
    note: cfg_str_(p && p.note, 200).trim(),
    date: cfg_dateOnly_((p && p.date) || new Date()) || cfg_today_(),
    arriveTime: cfg_time_(p && p.arrive_time) || cfg_timeNow_(),      // ครูแก้เวลามาถึงได้ (บันทึกย้อนหลัง)
    createdBy: user.id, createdByName: user.full_name
  });
  Audit_log_(user, 'late.create', 'late', out.record.id, { student_id: sid, deduct: out.late.deduct });
  return { ok: true, record: out.record, student_name: _stuName_(stu), late: out.late };
}

// core สร้างบันทึกมาสาย — hard-block ซ้ำวันเดียวกัน + คำนวณคะแนนมาสาย + แจ้งเตือน (ใช้ร่วมทั้ง staff + self-service)
// คืน { record, late: { count, counted, score, deduct (ครั้งนี้), rank, cutoff } }
function _lateCreateCore_(stu, opt) {
  var sid = stu.id;
  var date = opt.date || cfg_today_();
  var dup = DB_byLite(SHEETS.LATE, 'student_id', sid).filter(function (r) { return cfg_d10_(r.date) === date && !_yes_(r.canceled); });
  if (dup.length) throw new Error('นักเรียนคนนี้ถูกบันทึกมาสายในวันนี้แล้ว — บันทึกซ้ำในวันเดียวกันไม่ได้');
  var map = Settings_map_(), rec, detail;
  DB_withLock_(function () {
    rec = DB_insert(SHEETS.LATE, {
      id: _genSeq_('L', DB_rowCount(SHEETS.LATE)), date: date, time: cfg_timeNow_(), student_id: sid,
      reason: opt.reason || 'ไม่ระบุ', note: opt.note || '',
      created_by: opt.createdBy || '', created_by_name: opt.createdByName || '', canceled: 'no',
      arrive_time: opt.arriveTime || cfg_timeNow_(), term: _termKey_(map)
    });
    detail = _recomputeLateScore_(sid, map);
  });
  var mine = detail.per[rec.id] || { rank: 0, deduct: 0 };
  var late = { count: detail.count, counted: detail.counted, score: detail.score, deduct: mine.deduct, rank: mine.rank,
    cutoff: cfg_time_(map.late_cutoff_time) || '08:35', counted_this: mine.rank > 0 };
  _lateFrequencyAlert_(stu, detail.count, map);
  if (mine.deduct > 0) _lateDeductAlert_(stu, mine, detail.score, map);
  return { record: rec, late: late };
}

// แจ้งเตือนเมื่อมาสายสะสมครบเกณฑ์ (ยิงครั้งเดียวตอน "ครบพอดี")
function _lateFrequencyAlert_(stu, cnt, map) {
  try {
    var th = cfg_int_(map.late_alert_count) || 3;
    if (th <= 0 || cnt !== th) return;            // crossing เท่านั้น กัน spam
    var title = 'มาสายสะสมครบ ' + th + ' ครั้ง';
    var msg = _stuName_(stu) + ' (' + _stuClassRoom_(stu) + ') มาสายสะสม ' + cnt + ' ครั้งในภาคเรียนนี้ — ควรติดตามดูแล';
    Notify_pushRoles_(['admin', 'teacher'], 'late', title, msg, '#/report/student?id=' + stu.id);
    if (_yes_(map.tg_enabled)) Telegram_toAdmins_('⏰ <b>' + _tgEsc_(title) + '</b>\n' + _tgEsc_(msg));
  } catch (e) {}
}
// แจ้งครูทุกครั้งที่คะแนนมาสายเพิ่มขึ้น (ลูกค้าต้องการรู้ทันที)
function _lateDeductAlert_(stu, mine, total, map) {
  try {
    var title = 'หักคะแนนมาสาย ' + mine.deduct + ' คะแนน (ครั้งที่ ' + mine.rank + ')';
    var msg = _stuName_(stu) + ' (' + _stuClassRoom_(stu) + ') มาสายหลังเวลาตัดครั้งที่ ' + mine.rank + ' — คะแนนมาสายสะสม ' + total + ' คะแนน';
    Notify_pushRoles_(['admin', 'teacher'], 'late', title, msg, '#/report/student?id=' + stu.id);
    if (_yes_(map.tg_enabled)) Telegram_toAdmins_('⏰ <b>' + _tgEsc_(title) + '</b>\n' + _tgEsc_(msg));
  } catch (e) {}
}

function Late_list(user, p) {
  Auth_requireCap(user, 'late.view_own|late.view_all');
  p = p || {};
  var from = cfg_dateOnly_(p.from) || '', to = cfg_dateOnly_(p.to) || '', sid = String(p.student_id || '');
  var cls = String(p.class_level || ''), room = String(p.room || ''), q = String(p.q || '').trim().toLowerCase();
  var page = Math.max(1, cfg_int_(p.page) || 1), per = Math.min(100, cfg_int_(p.per_page) || 40);
  var stuIx = DB_buildIndexLite(SHEETS.STUDENTS), scope = _studentScope_(user), map = Settings_map_();
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
  var slice = rows.slice(start, start + per);
  // ยอดหักต่อรายการ — คำนวณเฉพาะนักเรียนที่อยู่ในหน้านี้ (memo ต่อคน · ไม่ N+1 ทั้งตาราง)
  var detailMemo = {};
  function perOf(r) {
    var k = String(r.student_id);
    if (!detailMemo[k]) detailMemo[k] = _lateScoreDetail_(k, map).per;
    return detailMemo[k][r.id] || { rank: 0, deduct: 0 };
  }
  var items = slice.map(function (r) {
    var s = stuIx[String(r.student_id)], d = perOf(r);
    return { id: r.id, date: cfg_d10_(r.date), time: r.time, arrive_time: _lateArrive_(r), student_id: r.student_id, name: s ? _stuName_(s) : '(ไม่พบ)',
      class_room: s ? _stuClassRoom_(s) : '', advisor: s ? s.advisor_name : '', reason: r.reason,
      created_by_name: r.created_by_name, canceled: _yes_(r.canceled), rank: d.rank, deduct: d.deduct, term: r.term || '' };
  });
  return { items: items, total: total, page: page, per_page: per, pages: Math.ceil(total / per) };
}

function Late_cancel(user, p) {
  Auth_requireCap(user, 'late.create');
  var id = String((p && p.id) || '');
  var r = DB_get(SHEETS.LATE, id);
  if (!r) throw new Error('ไม่พบรายการ');
  if (!hasCap_(user.role, 'late.view_all') && String(r.created_by) !== String(user.id)) throw new Error('ยกเลิกได้เฉพาะรายการที่คุณบันทึกเอง');
  var map = Settings_map_(), detail;
  DB_withLock_(function () {
    DB_update(SHEETS.LATE, id, { canceled: 'yes' });
    detail = _recomputeLateScore_(String(r.student_id), map);   // ลำดับครั้ง/ยอดหักคำนวณใหม่จากรายการที่เหลือ
  });
  Audit_log_(user, 'late.cancel', 'late', id, { late_score: detail.score });
  return { ok: true, late_score: detail.score };
}

// คำนวณคะแนนมาสายใหม่ทั้งระบบ (single scan + batch) — ใช้หลังเปลี่ยนภาคเรียน/ตาราง/เวลาตัด หรือซ่อมข้อมูล
function Late_recomputeAll_(map) {
  map = map || Settings_map_();
  var key = _termKey_(map), cutoff = cfg_time_(map.late_cutoff_time) || '08:35', cfg = _lateTable_(map);
  var byStu = {};
  DB_readLite(SHEETS.LATE).forEach(function (r) {
    if (_yes_(r.canceled) || !_lateInTerm_(r, key)) return;
    var k = String(r.student_id); (byStu[k] = byStu[k] || []).push(r);
  });
  var scores = {};
  Object.keys(byStu).forEach(function (k) {
    var rows = byStu[k].sort(function (a, b) { return (cfg_d10_(a.date) + _lateArrive_(a)).localeCompare(cfg_d10_(b.date) + _lateArrive_(b)); });
    var rank = 0, sum = 0;
    rows.forEach(function (r) { if (_lateArrive_(r) > cutoff) { rank++; sum += _lateDeductAt_(rank, cfg); } });
    scores[k] = sum;
  });
  var stus = DB_readLite(SHEETS.STUDENTS), fixed = 0;
  DB_beginBatch();
  try {
    stus.forEach(function (s) {
      var want = scores[String(s.id)] || 0;
      if (cfg_num_(s.late_score) !== want) { DB_update(SHEETS.STUDENTS, s.id, { late_score: want }); fixed++; }
    });
  } finally { DB_endBatch(); }
  return { fixed: fixed, total: stus.length };
}

// ขึ้นภาคเรียนใหม่ — 1→2 · 2→1 ของปีถัดไป · คะแนนมาสายทุกคนเริ่มนับใหม่ (รายการเก่ายังอยู่ · term เดิม)
function Term_next(user, p) {
  Auth_requireCap(user, 'setting.manage');
  var map = Settings_map_(), term = cfg_int_(map.current_term) || 1, year = cfg_int_(map.academic_year) || 0;
  var patch = term >= 2 ? { current_term: '1', academic_year: String(year + 1) } : { current_term: '2' };
  DB_eavSet(SHEETS.SETTINGS, patch);
  var map2 = Settings_map_(), r = Late_recomputeAll_(map2);
  Audit_log_(user, 'term.next', 'setting', '', { term: _termKey_(map2), late_fixed: r.fixed });
  return { ok: true, term: _termKey_(map2), academic_year: map2.academic_year, current_term: map2.current_term, late_fixed: r.fixed };
}
