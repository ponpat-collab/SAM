/**
 * ═══════════════════════════════════════════════════════════════
 *  ระบบงานปกครองนักเรียน · Student Affairs Management System (SAM)
 *  File:        13_Seed.gs — บัญชีเริ่มต้น · ฐานความผิด · ข้อมูลตัวอย่าง
 *  Version:     1.1.0
 *  Last Update: 2026-09-16
 *  Developer:   ครูวิรัตน์  หาดคำ · www.kruwirat.com
 *  License:     Proprietary · © 2026
 *  Notice:      ห้ามจำหน่าย · แบ่งปันเพื่อการศึกษาและต่อยอดเท่านั้น (ใช้เชิงพาณิชย์ต้องได้รับอนุญาตจากผู้พัฒนา)
 * ═══════════════════════════════════════════════════════════════
 */

var DEMO_PASSWORD = '123456';
var DEMO_USERS = Object.freeze([
  { username: 'admin', role: 'admin', full_name: 'นายผู้ดูแล ระบบ', advisor_class: '', advisor_room: '' },
  { username: 'teacher', role: 'teacher', full_name: 'นางสาวครูปกครอง เวรประจำวัน', advisor_class: '', advisor_room: '' },
  { username: 'advisor', role: 'advisor', full_name: 'นายครูที่ปรึกษา ม.3/1', advisor_class: '3', advisor_room: '1' },
  { username: 'director', role: 'director', full_name: 'นายผู้อำนวยการ โรงเรียน', advisor_class: '', advisor_room: '' }
]);

function Seed_ensureUsers_() {
  var created = 0;
  DEMO_USERS.forEach(function (u) {
    if (DB_findOne(SHEETS.USERS, function (x) { return String(x.username).toLowerCase() === u.username; })) return;
    var salt = cfg_salt_();
    DB_insert(SHEETS.USERS, {
      id: cfg_uuid_(), username: u.username, email: u.username + '@example.com', full_name: u.full_name,
      password_hash: cfg_hash_(DEMO_PASSWORD, salt), salt: salt, role: u.role,
      advisor_class: u.advisor_class, advisor_room: u.advisor_room, phone: '', is_active: 'yes'
    });
    created++;
  });
  return created;
}
function Seed_resetDemoPasswords_() {
  var n = 0;
  DEMO_USERS.forEach(function (du) {
    var u = DB_findOne(SHEETS.USERS, function (x) { return String(x.username).toLowerCase() === du.username; });
    if (!u) return;
    var salt = cfg_salt_();
    DB_update(SHEETS.USERS, u.id, { salt: salt, password_hash: cfg_hash_(DEMO_PASSWORD, salt), is_active: 'yes' });
    n++;
  });
  return n;
}

var DEFAULT_OFFENSES = Object.freeze([
  { code: 'B01', name: 'ไม่ติดโบว์ / เครื่องแต่งกายผิดระเบียบ', category: 'เครื่องแต่งกาย', points: 5, icon: 'person-badge', color: '#0ea5e9' },
  { code: 'B02', name: 'ทรงผมผิดระเบียบ', category: 'เครื่องแต่งกาย', points: 5, icon: 'scissors', color: '#06b6d4' },
  { code: 'B03', name: 'มาสายเกินกำหนด', category: 'การมาเรียน', points: 5, icon: 'clock-history', color: '#f59e0b' },
  { code: 'B04', name: 'หนีเรียน / โดดเรียน', category: 'การมาเรียน', points: 10, icon: 'door-open', color: '#f97316' },
  { code: 'B05', name: 'ทะเลาะวิวาท', category: 'ความรุนแรง', points: 20, icon: 'fire', color: '#ef4444' },
  { code: 'B06', name: 'บุหรี่ / บุหรี่ไฟฟ้า', category: 'สิ่งเสพติด', points: 40, icon: 'ban', color: '#dc2626' },
  { code: 'B07', name: 'การพนัน', category: 'ร้ายแรง', points: 30, icon: 'dice-5', color: '#be123c' }
]);
function Seed_ensureOffenses_() {
  var created = 0;
  DEFAULT_OFFENSES.forEach(function (o, i) {
    if (DB_get(SHEETS.OFFENSES, o.code)) return;
    DB_insert(SHEETS.OFFENSES, { code: o.code, name: o.name, category: o.category, points: o.points,
      icon: o.icon, color: o.color, is_active: 'yes', sort_order: i + 1 });
    created++;
  });
  return created;
}

// ── demo students + records ────────────────────────────────────
// รหัสนักเรียนตัวอย่าง = ช่วงคงที่ 30000–30095 (ม.1–6 × 2 ห้อง × 8 คน) — ใช้ร่วมกันทั้ง "สร้าง" และ "ล้าง"
// ★ ห้ามใช้รูปแบบกว้าง (เช่น /^3\d{4}$/) — ชนรหัสนักเรียนจริงที่ขึ้นต้นด้วย 3 แล้วลบทั้งคนพร้อมประวัติ
var DEMO_STUDENT_FIRST = 30000, DEMO_STUDENT_COUNT = 6 * 2 * 8;
function _isDemoStudentId_(v) {
  var s = String(v == null ? '' : v).trim();
  if (!/^\d{5}$/.test(s)) return false;
  var n = Number(s);
  return n >= DEMO_STUDENT_FIRST && n < DEMO_STUDENT_FIRST + DEMO_STUDENT_COUNT;
}
var _FN = ['สมชาย', 'สมหญิง', 'ณัฐพล', 'ปิยะดา', 'ธนกร', 'กมลชนก', 'ภูริพัฒน์', 'ศิริพร', 'อนุชา', 'จิราภรณ์',
  'ธีรภัทร', 'พิมพ์ชนก', 'วีรภัทร', 'ณัฐธิดา', 'กิตติศักดิ์', 'อริสรา', 'ชนาธิป', 'มนัสนันท์', 'ปรเมศวร์', 'สุพิชญา',
  'ก้องภพ', 'ธัญชนก', 'พีรพล', 'ณิชกานต์', 'จักรพงษ์', 'วรรณิดา', 'ศุภกร', 'ปาริชาต', 'นราวิชญ์', 'อัจฉรา'];
var _LN = ['ใจดี', 'รักเรียน', 'ศรีสุข', 'ทองคำ', 'แสงทอง', 'บุญมี', 'พงษ์ไพร', 'จันทร์เพ็ญ', 'วงศ์ทอง', 'มณีรัตน์',
  'สุขสันต์', 'เจริญพร', 'ภูผา', 'ดวงแก้ว', 'ไชยวงศ์', 'พัฒนากิจ', 'ธนโชติ', 'อินทรีย์', 'ปานทอง', 'กมลเดช'];

function Seed_demoData_() {
  DB_initAllSchemas();
  Settings_ensureDefaults_();
  Seed_ensureUsers_();
  Seed_ensureOffenses_();
  var map = Settings_map_();
  // students: ม.1-6, ห้อง 1-2, 8 คน/ห้อง
  var advisors = { '3/1': 'นายครูที่ปรึกษา ม.3/1' };
  var students = [], idSeq = DEMO_STUDENT_FIRST;
  for (var cls = 1; cls <= 6; cls++) {
    for (var room = 1; room <= 2; room++) {
      for (var no = 1; no <= 8; no++) {
        var id = String(idSeq++);
        students.push({
          id: id, prefix: (no % 2 === 0 ? 'นางสาว' : (cls <= 3 ? 'เด็กชาย' : 'นาย')),
          first_name: _FN[(idSeq + no) % _FN.length], last_name: _LN[(idSeq * 2 + no) % _LN.length],
          class_level: String(cls), room: String(room), number: String(no),
          score: 0, late_score: 0, advisor_name: advisors[cls + '/' + room] || ('ครูที่ปรึกษา ม.' + cls + '/' + room),
          status: 'active', note: ''
        });
      }
    }
  }
  var existIx = DB_buildIndex(SHEETS.STUDENTS);
  var toAdd = students.filter(function (s) { return !existIx[s.id]; });
  var admin = DB_findOne(SHEETS.USERS, function (x) { return x.username === 'admin'; });
  var teacher = DB_findOne(SHEETS.USERS, function (x) { return x.username === 'teacher'; }) || admin;
  DB_beginBatch();
  try {
    if (toAdd.length) DB_bulkInsert(SHEETS.STUDENTS, toAdd);
    // records over past 7 days
    var lateReasons = _listSetting_(map, 'late_reasons');
    var leaveReasons = _listSetting_(map, 'leave_reasons');
    var relations = _listSetting_(map, 'relations');
    var lateRows = [], leaveRows = [], behRows = [];
    var samp = students.slice(0, 40);
    for (var d = 6; d >= 0; d--) {
      var dayD = new Date(Date.now() - d * 86400000);
      var date = Utilities.formatDate(dayD, APP.TIMEZONE, 'yyyy-MM-dd');
      for (var i = 0; i < samp.length; i++) {
        var s = samp[i];
        // สลับก่อน/หลังเวลาตัด 08:35 เพื่อให้ตัวอย่างมีทั้งครั้งที่นับหักและไม่นับ
        if ((i + d) % 4 === 0) { var at = (i % 3 === 0) ? '08:' + _p2_(20 + (i % 15)) : '08:' + _p2_(36 + (i % 20));
          lateRows.push({ id: _genSeq_('L', 0), date: date, time: at, arrive_time: at, term: _termKey_(map),
          student_id: s.id, reason: lateReasons[i % lateReasons.length], note: '', created_by: teacher.id,
          created_by_name: teacher.full_name, canceled: 'no' }); }
        if ((i + d) % 9 === 0) leaveRows.push({ id: _genSeq_('E', 0), date: date, time: '13:' + _p2_(i % 55),
          student_id: s.id, reason: leaveReasons[i % leaveReasons.length], guardian_name: 'นาง' + _LN[i % _LN.length] + ' ' + _FN[i % _FN.length],
          guardian_phone: '08' + (10000000 + i * 137 % 89999999), relation: relations[i % relations.length], photo_url: '',
          note: '', created_by: teacher.id, created_by_name: teacher.full_name, canceled: 'no' });
      }
    }
    if (lateRows.length) DB_bulkInsert(SHEETS.LATE, lateRows);
    if (leaveRows.length) DB_bulkInsert(SHEETS.LEAVE, leaveRows);
  } finally { DB_endBatch(); }
  // behavior with score updates (small set, sequential to keep score correct)
  var offs = DB_readAll(SHEETS.OFFENSES);
  for (var b = 0; b < 24; b++) {
    var st = students[(b * 3) % students.length];
    var of = offs[b % offs.length];
    var bDate = new Date(Date.now() - (b % 7) * 86400000);
    var bDateStr = Utilities.formatDate(bDate, APP.TIMEZONE, 'yyyy-MM-dd');
    try { Behavior_save(teacher, { student_id: st.id, kind: 'deduct', offense_code: of.code, detail: 'ตัวอย่างข้อมูล', date: bDateStr }); } catch (e) {}
  }
  DB_withLock_(function () { Late_recomputeAll_(); }, 60000);   // คะแนนมาสายของตัวอย่างที่ bulk insert (ไม่ผ่าน core)
  return { students: toAdd.length, message: 'เพิ่มข้อมูลตัวอย่างเรียบร้อย' };
}

// ลบข้อมูลตัวอย่าง = นักเรียนรหัส 30000–30095 "พร้อมประวัติของนักเรียนเหล่านั้น" (มาสาย/ลากลับ/คะแนน)
// v1.0.x ลบแค่แถวนักเรียน → ประวัติค้างเป็นแถวกำพร้า แล้วกลับมาผูกเมื่อเพิ่มตัวอย่างใหม่ (รหัสเดิม) → คะแนนเพี้ยน
function Seed_clearDemo_() {
  var demo = _isDemoStudentId_;
  var out = { students: 0, late: 0, leave: 0, behavior: 0 };
  DB_withLock_(function () {
    out.late = DB_deleteWhere_(SHEETS.LATE, 'student_id', demo);
    out.leave = DB_deleteWhere_(SHEETS.LEAVE, 'student_id', demo);
    out.behavior = DB_deleteWhere_(SHEETS.BEHAVIOR, 'student_id', demo);
    out.students = DB_deleteWhere_(SHEETS.STUDENTS, 'id', demo);
  }, 60000);
  out.removed = out.students;
  return out;
}
