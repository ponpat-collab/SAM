/**
 * ═══════════════════════════════════════════════════════════════
 *  ระบบงานปกครองนักเรียน · Student Affairs Management System (SAM)
 *  File:        07_Reports.gs — Dashboard รายวัน · รายบุคคล · รายห้อง · ช่วงเวลา
 *  Version:     1.0.0
 *  Last Update: 2026-07-13
 *  Developer:   ครูวิรัตน์  หาดคำ · www.kruwirat.com
 *  License:     Proprietary · © 2026
 *  Notice:      ห้ามจำหน่าย · แบ่งปันเพื่อการศึกษาและต่อยอดเท่านั้น (ใช้เชิงพาณิชย์ต้องได้รับอนุญาตจากผู้พัฒนา)
 * ═══════════════════════════════════════════════════════════════
 */

function _reportScopeKey_(user) {
  var sc = _studentScope_(user);
  return sc === null ? 'all' : ('a' + user.advisor_class + '_' + user.advisor_room);
}

// ── Daily dashboard ────────────────────────────────────────────
function Reports_dashboard(user, p) {
  Auth_requireCap(user, 'report.view_own|report.view_all');
  var date = cfg_dateOnly_((p && p.date)) || cfg_today_();
  var scope = _studentScope_(user), stuIx = DB_buildIndexLite(SHEETS.STUDENTS), map = Settings_map_();
  function inScope(sid) { var s = stuIx[String(sid)]; return s && (!scope || scope(s)); }
  function mapName(sid) { var s = stuIx[String(sid)]; return { name: s ? _stuName_(s) : '(ไม่พบ)', cr: s ? _stuClassRoom_(s) : '', adv: s ? s.advisor_name : '' }; }

  var late = [], leave = [], behavior = [];
  DB_readLite(SHEETS.LATE).forEach(function (r) {
    if (_yes_(r.canceled) || cfg_d10_(r.date) !== date || !inScope(r.student_id)) return;
    var m = mapName(r.student_id); late.push({ id: r.id, time: r.time, student_id: r.student_id, name: m.name, class_room: m.cr, advisor: m.adv, reason: r.reason, by: r.created_by_name });
  });
  DB_readLite(SHEETS.LEAVE).forEach(function (r) {
    if (_yes_(r.canceled) || cfg_d10_(r.date) !== date || !inScope(r.student_id)) return;
    var m = mapName(r.student_id); leave.push({ id: r.id, time: r.time, student_id: r.student_id, name: m.name, class_room: m.cr, advisor: m.adv, reason: r.reason, guardian: r.guardian_name, relation: r.relation, photo_url: r.photo_url, by: r.created_by_name });
  });
  DB_readLite(SHEETS.BEHAVIOR).forEach(function (r) {
    if (_yes_(r.canceled) || cfg_d10_(r.date) !== date || !inScope(r.student_id)) return;
    var m = mapName(r.student_id); behavior.push({ id: r.id, time: r.time, student_id: r.student_id, name: m.name, class_room: m.cr, kind: r.kind, offense_name: r.offense_name, points: cfg_num_(r.points), score_after: cfg_num_(r.score_after), by: r.created_by_name });
  });
  late.sort(function (a, b) { return String(b.time).localeCompare(String(a.time)); });
  leave.sort(function (a, b) { return String(b.time).localeCompare(String(a.time)); });
  behavior.sort(function (a, b) { return String(b.time).localeCompare(String(a.time)); });

  // 7-day trend of late
  var trend = [];
  for (var i = 6; i >= 0; i--) {
    var dd = new Date(new Date(date + 'T00:00:00').getTime() - i * 86400000);
    var d = Utilities.formatDate(dd, APP.TIMEZONE, 'yyyy-MM-dd');
    trend.push({ date: d, late: 0, leave: 0 });
  }
  var trendIx = {}; trend.forEach(function (t, i) { trendIx[t.date] = i; });
  DB_readLite(SHEETS.LATE).forEach(function (r) { if (!_yes_(r.canceled) && inScope(r.student_id)) { var k = trendIx[cfg_d10_(r.date)]; if (k != null) trend[k].late++; } });
  DB_readLite(SHEETS.LEAVE).forEach(function (r) { if (!_yes_(r.canceled) && inScope(r.student_id)) { var k = trendIx[cfg_d10_(r.date)]; if (k != null) trend[k].leave++; } });

  // at-risk students (low score) within scope
  var atRisk = DB_readLite(SHEETS.STUDENTS).filter(function (s) {
    return (!scope || scope(s)) && String(s.status) === STU_STATUS.ACTIVE && cfg_num_(s.score) <= cfg_num_(map.alert_level_1);
  }).map(function (s) { return { id: s.id, name: _stuName_(s), class_room: _stuClassRoom_(s), score: cfg_num_(s.score), alert: _scoreAlert_(s.score, map) }; })
    .sort(function (a, b) { return a.score - b.score; }).slice(0, 12);

  var deductToday = behavior.filter(function (b) { return b.kind === 'deduct'; }).length;
  return {
    date: date,
    kpi: { late: late.length, leave: leave.length, behavior: behavior.length, deduct: deductToday, at_risk: atRisk.length },
    late: late.slice(0, 30), leave: leave.slice(0, 30), behavior: behavior.slice(0, 30),
    trend: trend, at_risk: atRisk, scope: _reportScopeKey_(user)
  };
}

// ── Per-student report ─────────────────────────────────────────
function Reports_student(user, p) {
  Auth_requireCap(user, 'report.view_own|report.view_all');
  var sid = String((p && p.id) || '').trim();
  var s = DB_get(SHEETS.STUDENTS, sid);
  if (!s) throw new Error('ไม่พบนักเรียน ' + sid);
  if (!_canSeeStudent_(user, s)) throw new Error('อยู่นอกห้องที่คุณดูแล');
  var map = Settings_map_();
  var late = DB_byLite(SHEETS.LATE, 'student_id', sid).filter(function (r) { return !_yes_(r.canceled); })
    .map(function (r) { return { id: r.id, date: cfg_d10_(r.date), time: r.time, reason: r.reason, by: r.created_by_name }; });
  var leave = DB_byLite(SHEETS.LEAVE, 'student_id', sid).filter(function (r) { return !_yes_(r.canceled); })
    .map(function (r) { return { id: r.id, date: cfg_d10_(r.date), time: r.time, reason: r.reason, guardian_name: r.guardian_name, relation: r.relation, photo_url: r.photo_url, by: r.created_by_name }; });
  var behavior = DB_byLite(SHEETS.BEHAVIOR, 'student_id', sid).filter(function (r) { return !_yes_(r.canceled); })
    .map(function (r) { return { id: r.id, date: cfg_d10_(r.date), time: r.time, kind: r.kind, offense_name: r.offense_name, category: r.category, points: cfg_num_(r.points), score_after: cfg_num_(r.score_after), by: r.created_by_name }; });
  [late, leave, behavior].forEach(function (a) { a.sort(function (x, y) { return (y.date + y.time).localeCompare(x.date + x.time); }); });
  // score trend (from behavior, chronological)
  var chron = behavior.slice().sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); });
  var scoreTrend = chron.map(function (r) { return { date: r.date, score: r.score_after }; });
  return {
    student: { id: s.id, name: _stuName_(s), prefix: s.prefix, first_name: s.first_name, last_name: s.last_name,
      class_level: s.class_level, room: s.room, number: s.number, score: cfg_num_(s.score),
      advisor_name: s.advisor_name, status: s.status },
    alert: _scoreAlert_(s.score, map),
    org: map.org_name, academic_year: map.academic_year, start_score: cfg_num_(map.start_score),
    summary: { late: late.length, leave: leave.length, deduct: behavior.filter(function (b) { return b.kind === 'deduct'; }).length,
      add: behavior.filter(function (b) { return b.kind === 'add'; }).length,
      points_lost: behavior.reduce(function (a, b) { return a + (b.points < 0 ? -b.points : 0); }, 0) },
    late: late, leave: leave, behavior: behavior, score_trend: scoreTrend
  };
}

// ── Per-room / class report ────────────────────────────────────
function Reports_room(user, p) {
  Auth_requireCap(user, 'report.view_own|report.view_all');
  p = p || {};
  var from = cfg_dateOnly_(p.from) || '', to = cfg_dateOnly_(p.to) || '';
  var scope = _studentScope_(user), stuIx = DB_buildIndexLite(SHEETS.STUDENTS);
  function inRange(d) { d = cfg_d10_(d); return (!from || d >= from) && (!to || d <= to); }
  var rooms = {};
  DB_readLite(SHEETS.STUDENTS).forEach(function (s) {
    if (scope && !scope(s)) return;
    if (String(s.status) !== STU_STATUS.ACTIVE) return;
    var k = s.class_level + '/' + s.room;
    if (!rooms[k]) rooms[k] = { class_level: s.class_level, room: s.room, students: 0, late: 0, leave: 0, deduct: 0, points: 0, advisor: s.advisor_name };
    rooms[k].students++;
  });
  function bump(sid, field, pts) {
    var s = stuIx[String(sid)]; if (!s || (scope && !scope(s))) return;
    var k = s.class_level + '/' + s.room; if (!rooms[k]) return;
    rooms[k][field]++; if (pts) rooms[k].points += pts;
  }
  DB_readLite(SHEETS.LATE).forEach(function (r) { if (!_yes_(r.canceled) && inRange(r.date)) bump(r.student_id, 'late'); });
  DB_readLite(SHEETS.LEAVE).forEach(function (r) { if (!_yes_(r.canceled) && inRange(r.date)) bump(r.student_id, 'leave'); });
  DB_readLite(SHEETS.BEHAVIOR).forEach(function (r) { if (!_yes_(r.canceled) && r.kind === 'deduct' && inRange(r.date)) bump(r.student_id, 'deduct', -cfg_num_(r.points)); });
  var list = Object.keys(rooms).map(function (k) { return rooms[k]; })
    .sort(function (a, b) { return (cfg_num_(a.class_level) - cfg_num_(b.class_level)) || (cfg_num_(a.room) - cfg_num_(b.room)); });
  return { rooms: list, from: from, to: to,
    totals: list.reduce(function (t, r) { t.students += r.students; t.late += r.late; t.leave += r.leave; t.deduct += r.deduct; t.points += r.points; return t; }, { students: 0, late: 0, leave: 0, deduct: 0, points: 0 }) };
}

// ── Period summary + charts ────────────────────────────────────
function Reports_period(user, p) {
  Auth_requireCap(user, 'report.view_own|report.view_all');
  p = p || {};
  var to = cfg_dateOnly_(p.to) || cfg_today_();
  var fromD = new Date(new Date(to + 'T00:00:00').getTime() - 29 * 86400000);
  var from = cfg_dateOnly_(p.from) || Utilities.formatDate(fromD, APP.TIMEZONE, 'yyyy-MM-dd');
  var scope = _studentScope_(user), stuIx = DB_buildIndexLite(SHEETS.STUDENTS);
  function ok(sid, d) { d = cfg_d10_(d); if (d < from || d > to) return false; var s = stuIx[String(sid)]; return s && (!scope || scope(s)); }
  // build day buckets
  var days = [], dayIx = {};
  var cur = new Date(from + 'T00:00:00'), end = new Date(to + 'T00:00:00');
  while (cur <= end && days.length < 400) { var ds = Utilities.formatDate(cur, APP.TIMEZONE, 'yyyy-MM-dd'); dayIx[ds] = days.length; days.push({ date: ds, late: 0, leave: 0, deduct: 0 }); cur = new Date(cur.getTime() + 86400000); }
  var lateReasons = {}, leaveReasons = {}, offenses = {}, byStudent = {};
  var totLate = 0, totLeave = 0, totDeduct = 0, totPoints = 0;
  DB_readLite(SHEETS.LATE).forEach(function (r) {
    if (_yes_(r.canceled) || !ok(r.student_id, r.date)) return;
    totLate++; var k = dayIx[cfg_d10_(r.date)]; if (k != null) days[k].late++;
    lateReasons[r.reason] = (lateReasons[r.reason] || 0) + 1;
    byStudent[r.student_id] = byStudent[r.student_id] || { late: 0, leave: 0, deduct: 0, points: 0 }; byStudent[r.student_id].late++;
  });
  DB_readLite(SHEETS.LEAVE).forEach(function (r) {
    if (_yes_(r.canceled) || !ok(r.student_id, r.date)) return;
    totLeave++; var k = dayIx[cfg_d10_(r.date)]; if (k != null) days[k].leave++;
    leaveReasons[r.reason] = (leaveReasons[r.reason] || 0) + 1;
    byStudent[r.student_id] = byStudent[r.student_id] || { late: 0, leave: 0, deduct: 0, points: 0 }; byStudent[r.student_id].leave++;
  });
  DB_readLite(SHEETS.BEHAVIOR).forEach(function (r) {
    if (_yes_(r.canceled) || r.kind !== 'deduct' || !ok(r.student_id, r.date)) return;
    totDeduct++; totPoints += -cfg_num_(r.points); var k = dayIx[cfg_d10_(r.date)]; if (k != null) days[k].deduct++;
    offenses[r.offense_name] = (offenses[r.offense_name] || 0) + 1;
    byStudent[r.student_id] = byStudent[r.student_id] || { late: 0, leave: 0, deduct: 0, points: 0 }; byStudent[r.student_id].deduct++; byStudent[r.student_id].points += -cfg_num_(r.points);
  });
  function topN(obj, n) { return Object.keys(obj).map(function (k) { return { label: k, value: obj[k] }; }).sort(function (a, b) { return b.value - a.value; }).slice(0, n); }
  var topStudents = Object.keys(byStudent).map(function (sid) {
    var s = stuIx[String(sid)], v = byStudent[sid];
    return { id: sid, name: s ? _stuName_(s) : sid, class_room: s ? _stuClassRoom_(s) : '', late: v.late, leave: v.leave, deduct: v.deduct, points: v.points, total: v.late + v.leave + v.deduct };
  }).sort(function (a, b) { return b.total - a.total; }).slice(0, 15);
  return {
    from: from, to: to,
    kpi: { late: totLate, leave: totLeave, deduct: totDeduct, points: totPoints, days: days.length },
    days: days, late_reasons: topN(lateReasons, 8), leave_reasons: topN(leaveReasons, 8),
    offenses: topN(offenses, 8), top_students: topStudents
  };
}
