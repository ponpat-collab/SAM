/**
 * ═══════════════════════════════════════════════════════════════
 *  ระบบงานปกครองนักเรียน · Student Affairs Management System (SAM)
 *  File:        00_Config.gs — ค่าคงที่ · Schemas · RBAC · helpers · Security
 *  Version:     1.0.0
 *  Last Update: 2026-07-13
 *  Developer:   ครูวิรัตน์  หาดคำ · www.kruwirat.com
 *  License:     Proprietary · © 2026
 *  Notice:      ห้ามจำหน่าย · แบ่งปันเพื่อการศึกษาและต่อยอดเท่านั้น (ใช้เชิงพาณิชย์ต้องได้รับอนุญาตจากผู้พัฒนา)
 * ═══════════════════════════════════════════════════════════════
 */

// ── App constants ──────────────────────────────────────────────
var APP = Object.freeze({
  NAME: 'ระบบงานปกครองนักเรียน',
  SHORT: 'SAM',
  TITLE: 'ระบบงานปกครองนักเรียน · Student Affairs',
  VERSION: '1.1.0',
  LAST_UPDATED: '2026-09-16',
  ORG: 'โรงเรียนในสังกัด สพฐ.',
  DESCRIPTION: 'ระบบบันทึกมาสาย · ขออนุญาตกลับบ้าน · หักคะแนนความประพฤติ พร้อมรายงานครบวงจร',
  LOGO_ICON: 'shield-check',
  TIMEZONE: 'Asia/Bangkok',
  DEV: Object.freeze({
    NAME: 'ครูวิรัตน์  หาดคำ',
    URL: 'https://www.kruwirat.com',
    LOGO: 'https://mts-ssk3.com/uploads/team/team_1771053860_6990232440dc8.png'
  })
});

// ── Sheet names ────────────────────────────────────────────────
var SHEETS = Object.freeze({
  USERS: 'Users',
  SESSIONS: 'Sessions',
  STUDENTS: 'Students',
  LATE: 'LateRecords',
  LEAVE: 'LeaveRecords',
  BEHAVIOR: 'BehaviorRecords',
  OFFENSES: 'OffenseTypes',
  SETTINGS: 'Settings',
  AUDIT: 'AuditLog',
  NOTIFY: 'Notifications'
});

// ── Column schemas (คอลัมน์แรก = primary key เสมอ) ──────────────
var SCHEMAS = Object.freeze({
  Users: ['id', 'username', 'email', 'full_name', 'password_hash', 'salt', 'role',
          'advisor_class', 'advisor_room', 'phone', 'is_active', 'created_at', 'updated_at'],
  Sessions: ['token', 'user_id', 'created_at', 'expires_at', 'ua'],
  // score = คะแนนความประพฤติ "สะสม" (เริ่ม 0 นับขึ้น) · late_score = คะแนนมาสายสะสม (แยกก้อน · ต่อภาคเรียน)
  Students: ['id', 'prefix', 'first_name', 'last_name', 'class_level', 'room', 'number',
             'score', 'advisor_name', 'status', 'note', 'created_at', 'updated_at', 'late_score'],
  // arrive_time = เวลาที่มาถึงจริง (ครูแก้ได้ · ใช้เทียบเกณฑ์ 08:35) · term = ภาคเรียนที่บันทึก (ปี/เทอม)
  LateRecords: ['id', 'date', 'time', 'student_id', 'reason', 'note',
                'created_by', 'created_by_name', 'canceled', 'created_at', 'rev', 'arrive_time', 'term'],
  LeaveRecords: ['id', 'date', 'time', 'student_id', 'reason', 'guardian_name', 'guardian_phone',
                 'relation', 'photo_url', 'note', 'created_by', 'created_by_name', 'canceled', 'created_at', 'rev'],
  // ★ เพิ่มคอลัมน์ใหม่ "ท้ายตารางเท่านั้น" — DB_ensureSchema_ เขียน header ทับโดยไม่ย้ายข้อมูล
  //   แทรกกลาง = ข้อมูลเดิมทุกแถวเลื่อนคอลัมน์ (ref_id เคยแทรกหลัง photo_url ใน v1.0.6 → ต้อง repair)
  BehaviorRecords: ['id', 'date', 'time', 'student_id', 'kind', 'offense_code', 'offense_name',
                    'category', 'detail', 'points', 'score_after', 'photo_url',
                    'created_by', 'created_by_name', 'canceled', 'created_at', 'rev', 'ref_id'],
  OffenseTypes: ['code', 'name', 'category', 'points', 'icon', 'color', 'is_active', 'sort_order', 'created_at', 'updated_at'],
  Settings: ['key', 'value', 'updated_at'],
  AuditLog: ['id', 'at', 'user_id', 'user_name', 'action', 'entity', 'entity_id', 'detail'],
  Notifications: ['id', 'target', 'ntype', 'title', 'message', 'link', 'is_read', 'created_at']
});

// ── Projection schemas (lite — ตัดคอลัมน์หนักที่ list/report ไม่ใช้) ──
var SCHEMAS_LITE = Object.freeze({
  Students: ['id', 'prefix', 'first_name', 'last_name', 'class_level', 'room', 'number', 'score', 'advisor_name', 'status', 'late_score'],
  LateRecords: ['id', 'date', 'time', 'student_id', 'reason', 'created_by', 'created_by_name', 'canceled', 'arrive_time', 'term'],
  LeaveRecords: ['id', 'date', 'time', 'student_id', 'reason', 'guardian_name', 'guardian_phone', 'relation', 'photo_url', 'created_by_name', 'canceled'],
  BehaviorRecords: ['id', 'date', 'time', 'student_id', 'kind', 'offense_code', 'offense_name', 'category', 'points', 'score_after', 'ref_id', 'created_by_name', 'canceled']
});

// ── คอลัมน์ที่ต้องบังคับเป็น TEXT (กัน Sheet auto-coerce) ────────
var TEXT_COLUMNS = Object.freeze([
  'id', 'student_id', 'username', 'phone', 'guardian_phone', 'code', 'offense_code',
  'value', 'number', 'room', 'date', 'time', 'arrive_time', 'term', 'token', 'password_hash', 'salt', 'ua', 'target'
]);
var TIME_COLUMNS = Object.freeze(['time']);
var DATE_COLUMNS = Object.freeze(['date']);

// ── Statuses / labels ──────────────────────────────────────────
var STU_STATUS = Object.freeze({ ACTIVE: 'active', LEFT: 'left' });
var STU_STATUS_LABEL = Object.freeze({ active: 'กำลังศึกษา', left: 'จำหน่ายออก' });

var ROLE_LABEL = Object.freeze({
  admin: 'ผู้ดูแลระบบ',
  teacher: 'ครูฝ่ายปกครอง',
  advisor: 'ครูที่ปรึกษา',
  director: 'ผู้บริหาร'
});
var ROLE_GRAD = Object.freeze({
  admin: '#fde68a,#f59e0b',
  teacher: '#a7f3d0,#34d399',
  advisor: '#bfdbfe,#60a5fa',
  director: '#ddd6fe,#a78bfa'
});

// ── Default settings ───────────────────────────────────────────
var SETTINGS_DEFAULTS = Object.freeze({
  org_name: 'โรงเรียนในสังกัด สพฐ.',
  academic_year: '2569',
  current_term: '1',                   // ภาคเรียนปัจจุบัน (1/2) — คะแนนมาสายนับใหม่ทุกภาคเรียน
  // คะแนนความประพฤติ "สะสม" เริ่ม 0 → ถึงเกณฑ์ (มากขึ้น = แย่ลง)
  alert_level_1: '40',                 // แจ้งผู้ปกครอง
  alert_level_2: '60',                 // เชิญผู้ปกครอง
  alert_level_3: '80',                 // พบรองผู้อำนวยการ
  alert_level_4: '100',                // พบผู้อำนวยการ
  // คะแนนมาสาย (แยกก้อน) — นับเฉพาะที่มาถึง "หลัง" เวลาตัด · หักตามลำดับครั้งในภาคเรียน
  late_cutoff_time: '08:35',           // มาถึง 08:36 ขึ้นไปจึงนับเป็นครั้งที่ถูกหัก
  late_deduct_table: '0,0,5,5,5,5,5,10,10',   // ครั้งที่ 1..9
  late_deduct_after: '10',             // ครั้งที่ 10 ขึ้นไป หักครั้งละ
  late_reasons: 'ตื่นสาย,รถติด,ธุระส่วนตัว,ตื่นสาย/นอนดึก,ป่วยเล็กน้อย,อื่นๆ',
  leave_reasons: 'ป่วย,ธุระครอบครัว,พบแพทย์,ผู้ปกครองมารับ,อื่นๆ',
  relations: 'บิดา,มารดา,ผู้ปกครอง,ญาติ,อื่นๆ',
  theme: 'blue',
  logo_image: '',
  show_demo_users: 'yes',
  show_user_manual: 'yes',
  tg_enabled: 'no',
  tg_token: '',
  tg_admin_chat_ids: '',
  tg_notify_leave: 'yes',
  tg_notify_behavior: 'yes',
  self_service: 'yes',                 // นักเรียนบันทึกมาสาย/ลากลับเองจากหน้าล็อกอิน
  late_alert_count: '3'                // แจ้งเตือนเมื่อมาสายสะสมครบ N ครั้ง
});
// setting ที่ห้ามส่งให้ client ที่ยังไม่ login (sensitive)
var SETTINGS_SENSITIVE = Object.freeze(['tg_token', 'tg_admin_chat_ids']);

// ── RBAC ───────────────────────────────────────────────────────
var CAPS = Object.freeze({
  admin: ['student.manage', 'student.view_all', 'late.create', 'late.view_all', 'leave.create', 'leave.view_all',
          'behavior.create', 'behavior.view_all', 'offense.manage', 'report.view_all',
          'setting.manage', 'user.manage', 'audit.view', 'file.upload', 'notify.send', 'score.reset'],
  teacher: ['student.view_all', 'late.create', 'late.view_all', 'leave.create', 'leave.view_all',
            'behavior.create', 'behavior.view_all', 'report.view_all', 'file.upload'],
  advisor: ['student.view_own', 'late.create', 'late.view_own', 'leave.create', 'leave.view_own',
            'behavior.create', 'behavior.view_own', 'report.view_own', 'file.upload'],
  director: ['student.view_all', 'late.view_all', 'leave.view_all', 'behavior.view_all', 'report.view_all', 'audit.view']
});

/** hasCap_ — server side · mirror กับ client hasCap เป๊ะ (exact → wildcard → hierarchical · view_own ไม่ inherit) */
function hasCap_(role, cap) {
  if (!cap || cap === '*') return true;
  var arr = CAPS[role];
  if (!Array.isArray(arr)) return false;
  return String(cap).split('|').some(function (c) {
    c = String(c || '').trim();
    if (!c) return false;
    if (c === '*') return true;
    if (arr.indexOf(c) >= 0) return true;
    if (/\.(view_own|edit_own|view_self|create_own|cancel_own)$/.test(c)) return false;
    var dot = c.indexOf('.');
    if (dot > 0 && arr.indexOf(c.substring(0, dot) + '.manage') >= 0) return true;
    return false;
  });
}

// ── Timezone-safe date helpers (ใช้ APP.TIMEZONE เสมอ) ─────────
function cfg_now_() { var d = new Date(); return Utilities.formatDate(d, APP.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX"); }
function cfg_iso_(d) { return Utilities.formatDate(d, APP.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX"); }
function cfg_dateOnly_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, APP.TIMEZONE, 'yyyy-MM-dd');
  var s = String(v == null ? '' : v).trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  try { var d = new Date(s); if (!isNaN(d.getTime())) return Utilities.formatDate(d, APP.TIMEZONE, 'yyyy-MM-dd'); } catch (e) {}
  return s;
}
function cfg_time_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) return Utilities.formatDate(v, APP.TIMEZONE, 'HH:mm');
  var s = String(v == null ? '' : v).trim();
  if (!s) return '';
  if (/^\d{1,2}:\d{2}/.test(s)) { var p = s.split(':'); return _p2_(p[0]) + ':' + _p2_(p[1]); }
  var iso = s.match(/T(\d{2}):(\d{2})/); if (iso) return iso[1] + ':' + iso[2];
  var js = s.match(/\s(\d{2}):(\d{2}):\d{2}\s/); if (js) return js[1] + ':' + js[2];
  try { var d = new Date(s); if (!isNaN(d.getTime())) return Utilities.formatDate(d, APP.TIMEZONE, 'HH:mm'); } catch (e) {}
  return s;
}
function cfg_today_() { var d = new Date(); return Utilities.formatDate(d, APP.TIMEZONE, 'yyyy-MM-dd'); }
function cfg_timeNow_() { var d = new Date(); return Utilities.formatDate(d, APP.TIMEZONE, 'HH:mm'); }
function cfg_yymm_() { var d = new Date(); return Utilities.formatDate(d, APP.TIMEZONE, 'yyMM'); }
function _p2_(n) { var s = String(n); return s.length < 2 ? '0' + s : s; }

// ── Value helpers ──────────────────────────────────────────────
function cfg_str_(v, max) { var s = String(v == null ? '' : v); return max ? s.substring(0, max) : s; }
function cfg_num_(v) { var n = Number(String(v == null ? '' : v).replace(/[, ]/g, '')); return isNaN(n) ? 0 : n; }
function cfg_int_(v) { return Math.round(cfg_num_(v)); }
function _yes_(v) { var s = String(v == null ? '' : v).toLowerCase(); return s === 'yes' || s === 'true' || s === '1' || v === true || v === 1; }
function cfg_uuid_() { return Utilities.getUuid(); }
function cfg_salt_() { return Utilities.getUuid().replace(/-/g, '').substring(0, 16); }
function cfg_d10_(v) { if (v instanceof Date) return cfg_dateOnly_(v); return String(v == null ? '' : v).substring(0, 10); }
function _arr_(v) { return Array.isArray(v) ? v : []; }

// ── Token generator (crypto-strength 32 bytes) ─────────────────
function cfg_token_() {
  var raw = Utilities.getUuid() + ':' + Utilities.getUuid() + ':' + Date.now();
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

// ── Security: PBKDF2 (iterated HMAC-SHA256) + timing-safe compare ──
function cfg_pbkdf2_(pw, salt, iter) {
  iter = iter || 1000;
  var saltKey = Utilities.newBlob('sam:' + String(salt)).getBytes();
  var acc = Utilities.computeHmacSha256Signature(Utilities.newBlob(String(pw)).getBytes(), saltKey);
  for (var i = 1; i < iter; i++) acc = Utilities.computeHmacSha256Signature(acc, saltKey);
  return Utilities.base64EncodeWebSafe(acc).replace(/=+$/, '');
}
function _pbkdf2Iter_() {
  var v = Number(PropertiesService.getScriptProperties().getProperty('pbkdf2_iter') || '1000');
  return (v >= 1000 && v <= 600000) ? v : 1000;
}
function cfg_hash_(pw, salt) { var it = _pbkdf2Iter_(); return 'p2$' + it + '$' + cfg_pbkdf2_(pw, salt, it); }
function cfg_verify_(pw, salt, stored) {
  stored = String(stored || '');
  if (stored.indexOf('p2$') === 0) {
    var parts = stored.split('$'), it = Number(parts[1]) || 1000;
    return { ok: cfg_timingEq_('p2$' + it + '$' + cfg_pbkdf2_(pw, salt, it), stored), upgrade: it < _pbkdf2Iter_() };
  }
  // legacy SHA-256 (salt:pw) → verify + upgrade
  var legacy = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + pw, Utilities.Charset.UTF_8)).replace(/=+$/, '');
  return { ok: cfg_timingEq_(legacy, stored), upgrade: true };
}
function cfg_timingEq_(a, b) {
  a = String(a); b = String(b);
  var diff = a.length ^ b.length, n = Math.max(a.length, b.length);
  for (var i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
function Sec_passwordPolicy_(pw) {
  pw = String(pw || '');
  if (pw.length < 6) return 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร';
  return '';
}
function Sec_tempPassword_() {
  var s = Utilities.getUuid().replace(/[^a-zA-Z0-9]/g, '');
  return (s.substring(0, 8) + '99').substring(0, 10);
}

// ── XSS escape (server) ────────────────────────────────────────
function esc_(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
