/**
 * ═══════════════════════════════════════════════════════════════
 *  ระบบงานปกครองนักเรียน · Student Affairs Management System (SAM)
 *  File:        06_Behavior.gs — หัก/เพิ่มคะแนนความประพฤติ + ฐานความผิด (ตั้งค่าได้)
 *  Version:     1.0.0
 *  Last Update: 2026-07-13
 *  Developer:   ครูวิรัตน์  หาดคำ · www.kruwirat.com
 *  License:     Proprietary · © 2026
 *  Notice:      ห้ามจำหน่าย · แบ่งปันเพื่อการศึกษาและต่อยอดเท่านั้น (ใช้เชิงพาณิชย์ต้องได้รับอนุญาตจากผู้พัฒนา)
 * ═══════════════════════════════════════════════════════════════
 */

function _clampScore_(v, map) {
  var start = cfg_num_(map.start_score) || 100;
  return Math.max(0, Math.min(start, Math.round(v)));
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
  var map = Settings_map_(), signed = kind === 'add' ? pts : -pts, rec, scoreAfter, alert;
  DB_withLock_(function () {
    var fresh = DB_getFresh(SHEETS.STUDENTS, sid);
    if (!fresh) throw new Error('ไม่พบนักเรียน');
    scoreAfter = _clampScore_(cfg_num_(fresh.score) + signed, map);
    rec = DB_insert(SHEETS.BEHAVIOR, {
      id: _genSeq_('B', DB_rowCount(SHEETS.BEHAVIOR)), date: date, time: cfg_timeNow_(), student_id: sid, kind: kind,
      offense_code: offenseCode, offense_name: offenseName, category: category, detail: detail, points: signed,
      score_after: scoreAfter, photo_url: photoUrl, created_by: user.id, created_by_name: user.full_name, canceled: 'no'
    });
    DB_update(SHEETS.STUDENTS, sid, { score: scoreAfter });
  });
  alert = _scoreAlert_(scoreAfter, map);
  Audit_log_(user, kind === 'add' ? 'behavior.add' : 'behavior.deduct', 'behavior', rec.id, { student_id: sid, points: signed });
  try {
    if (_yes_(map.tg_enabled) && _yes_(map.tg_notify_behavior)) {
      Telegram_toAdmins_((kind === 'add' ? '➕ <b>เพิ่มคะแนน</b>' : '➖ <b>หักคะแนน</b>') + '\n' + _tgEsc_(_stuName_(stu)) + ' (' + _tgEsc_(_stuClassRoom_(stu)) + ')\n' +
        _tgEsc_(offenseName) + ' · ' + (signed > 0 ? '+' : '') + signed + ' คะแนน\nคงเหลือ ' + scoreAfter + ' คะแนน · โดย ' + _tgEsc_(user.full_name));
    }
  } catch (e) {}
  _behaviorDeductAlert_(stu, scoreAfter, scoreAfter - signed, map);
  return { ok: true, record: rec, student_name: _stuName_(stu), score_after: scoreAfter, alert: alert };
}

// แจ้งเตือนเมื่อคะแนนถูกหักสะสม "ข้ามเกณฑ์" 30/50/60 (ยิงครั้งเดียวต่อการข้ามเกณฑ์)
function _behaviorDeductAlert_(stu, scoreAfter, scoreBefore, map) {
  try {
    var start = cfg_num_(map.start_score) || 100;
    var dedAfter = start - scoreAfter, dedBefore = start - scoreBefore;
    if (dedAfter <= dedBefore) return;            // คะแนนไม่ได้ลด (เพิ่ม/เท่าเดิม)
    var ths = String(map.behavior_alert_deducted || '30,50,60').split(',')
      .map(function (x) { return cfg_num_(x); }).filter(function (x) { return x > 0; }).sort(function (a, b) { return a - b; });
    var crossed = null;
    ths.forEach(function (T) { if (dedBefore < T && dedAfter >= T) crossed = T; });   // เกณฑ์สูงสุดที่ข้าม
    if (crossed == null) return;
    var title = 'คะแนนพฤติกรรมถูกหักเกิน ' + crossed + ' คะแนน';
    var msg = _stuName_(stu) + ' (' + _stuClassRoom_(stu) + ') ถูกหักสะสม ' + dedAfter + ' คะแนน (คงเหลือ ' + scoreAfter + ') — ควรดำเนินการตามระเบียบ';
    Notify_pushRoles_(['admin', 'teacher'], 'behavior', title, msg, '#/report/student?id=' + stu.id);
    if (_yes_(map.tg_enabled)) Telegram_toAdmins_('⚠️ <b>' + _tgEsc_(title) + '</b>\n' + _tgEsc_(msg));
  } catch (e) {}
}

function Behavior_autoDeduct_(user, sid, pts, detail) {
  var map = Settings_map_(), scoreAfter, rec;
  DB_withLock_(function () {
    var fresh = DB_getFresh(SHEETS.STUDENTS, sid);
    if (!fresh) throw new Error('ไม่พบนักเรียน');
    scoreAfter = _clampScore_(cfg_num_(fresh.score) - Math.abs(pts), map);
    rec = DB_insert(SHEETS.BEHAVIOR, {
      id: _genSeq_('B', DB_rowCount(SHEETS.BEHAVIOR)), date: cfg_today_(), time: cfg_timeNow_(), student_id: sid, kind: 'deduct',
      offense_code: 'AUTO', offense_name: 'มาสายเกินกำหนด', category: 'การมาเรียน', detail: detail, points: -Math.abs(pts),
      score_after: scoreAfter, photo_url: '', created_by: user.id, created_by_name: user.full_name + ' (อัตโนมัติ)', canceled: 'no'
    });
    DB_update(SHEETS.STUDENTS, sid, { score: scoreAfter });
  });
  return { record: rec, score_after: scoreAfter };
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
      points: cfg_num_(r.points), score_after: cfg_num_(r.score_after), created_by_name: r.created_by_name, canceled: _yes_(r.canceled) };
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
  var map = Settings_map_(), signed = cfg_num_(r.points), sid = String(r.student_id);
  DB_withLock_(function () {
    var fresh = DB_getFresh(SHEETS.STUDENTS, sid);
    if (fresh) DB_update(SHEETS.STUDENTS, sid, { score: _clampScore_(cfg_num_(fresh.score) - signed, map) });
    DB_update(SHEETS.BEHAVIOR, id, { canceled: 'yes' });
  });
  Audit_log_(user, 'behavior.cancel', 'behavior', id, { restore: -signed });
  return { ok: true };
}
