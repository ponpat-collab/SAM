/**
 * ═══════════════════════════════════════════════════════════════
 *  ระบบงานปกครองนักเรียน · Student Affairs Management System (SAM)
 *  File:        16_Migrate.gs — ย้ายข้อมูลครั้งเดียวหลัง deploy (ทำเองอัตโนมัติ · idempotent · ในล็อก)
 *  Version:     1.1.2
 *  Last Update: 2026-11-06
 *  Developer:   ครูวิรัตน์  หาดคำ · www.kruwirat.com
 *  License:     Proprietary · © 2026
 *  Notice:      ห้ามจำหน่าย · แบ่งปันเพื่อการศึกษาและต่อยอดเท่านั้น (ใช้เชิงพาณิชย์ต้องได้รับอนุญาตจากผู้พัฒนา)
 * ═══════════════════════════════════════════════════════════════
 */

// ทำไมต้องมี: v1.1.0 "กลับความหมาย" ของข้อมูลที่อยู่ในชีตแล้ว
//   · Students.score   คงเหลือ (เริ่ม 100 หักลง)  →  สะสม (เริ่ม 0 นับขึ้น)
//   · alert_level_1..3 เกณฑ์คงเหลือ 60/40/20     →  เกณฑ์สะสม 40/60/80/100
//   · Settings_ensureDefaults_ เติมเฉพาะคีย์ที่ "ยังไม่มี" → ค่าเดิมในชีตไม่ถูกแก้ = ระดับเตือนกลับหัว
// ลำดับ: รันก่อน dispatch ทุก request (doGet · api · warm) · เช็ค flag จาก properties memo (ไม่มี round-trip เพิ่ม)
var MIGRATIONS = [
  { key: 'v110_score_accum', run: _migrateV110ScoreAccum_ },
  { key: 'v111_dedupe_seed', run: _migrateV111DedupeSeed_ }
];

function _migrate_() {
  var memo = _propsMemo_();
  var pending = MIGRATIONS.filter(function (m) { return memo['migr:' + m.key] !== 'done'; });
  if (!pending.length) return;
  try {
    DB_withLock_(function () {
      var props = PropertiesService.getScriptProperties();
      pending.forEach(function (m) {
        if (props.getProperty('migr:' + m.key) === 'done') return;   // execution อื่นทำไปแล้วระหว่างรอล็อก
        _freshVer_();
        m.run();
        props.setProperty('migr:' + m.key, 'done');
      });
    }, 20000);   // ★ ไม่เกิน timeout ฝั่ง client (25s) — ล็อกไม่ว่าง = ข้ามไปก่อน request ถัดไปลองใหม่ (งานเขียนทุกตัวรอล็อกเดียวกันอยู่แล้ว)
  } catch (e) {
    console.warn('migration ยังไม่สำเร็จ (จะลองใหม่ request ถัดไป): ' + e.message);
  }
  __VERMEMO = null;                              // request นี้ต้องเห็นค่าตั้งค่า/คะแนนหลังย้ายข้อมูล
}

function _migrateV110ScoreAccum_() {
  DB_initAllSchemas();                           // คอลัมน์ใหม่ late_score · arrive_time · term
  Settings_ensureDefaults_();                    // current_term · late_cutoff_time · late_deduct_* · alert_level_4
  DB_eavSet(SHEETS.SETTINGS, { alert_level_1: '40', alert_level_2: '60', alert_level_3: '80', alert_level_4: '100' });
  var r = _recomputeAllScores_();                // AUTO เก่า → ยกเลิก · score / late_score คำนวณจากรายการ
  Audit_log_({ id: 'system', full_name: 'ระบบ (ย้ายข้อมูล v1.1.0)' }, 'migrate.v110', 'student', '', r);
  return r;
}

// v1.1.2 — ชีตที่ seed ยุค v1.0.x รันซ้อนกัน 2 ครั้ง → แถวซ้ำ: OffenseTypes (code เดียวกัน 2 แถว) · Users (username เดียวกัน 2 แถว)
//   · OffenseTypes: เก็บแถวแรก (บนสุด = สร้างก่อน) ลบที่เหลือ — ประวัติอ้างด้วย code จึงไม่กำพร้า
//   · Users: แถวหลังที่ "ไม่มีประวัติอ้างถึง id" → ลบ · ที่มีประวัติ → ปิดใช้งาน (is_active=no · ย้อนกลับได้)
function _migrateV111DedupeSeed_() {
  var r = { offenses: 0, users_deleted: 0, users_deactivated: 0 };
  // ── OffenseTypes ──
  var seen = {}, total = {};
  DB_readAll(SHEETS.OFFENSES).forEach(function (o) { var k = String(o.code); total[k] = (total[k] || 0) + 1; });
  var dupCodes = Object.keys(total).filter(function (k) { return total[k] > 1; });
  if (dupCodes.length) {
    // DB_deleteWhere_ ไล่จากล่างขึ้นบน → ลบ (total-1) ครั้งแรกที่เจอ = แถวล่าง ๆ · แถวบนสุดรอด
    r.offenses = DB_deleteWhere_(SHEETS.OFFENSES, 'code', function (v) {
      var k = String(v); if (!(total[k] > 1)) return false;
      seen[k] = (seen[k] || 0) + 1;
      return seen[k] < total[k];
    });
  }
  // ── Users ──
  var users = DB_readAll(SHEETS.USERS), byName = {};
  users.forEach(function (u) { var k = String(u.username || '').toLowerCase(); (byName[k] = byName[k] || []).push(u); });
  var dupIds = [];
  Object.keys(byName).forEach(function (k) { if (byName[k].length > 1) byName[k].slice(1).forEach(function (u) { dupIds.push(String(u.id)); }); });
  if (dupIds.length) {
    var refd = {};
    [SHEETS.LATE, SHEETS.LEAVE, SHEETS.BEHAVIOR].forEach(function (sh) { DB_readAll(sh).forEach(function (x) { refd[String(x.created_by)] = 1; }); });   // readAll: lite ของ Leave/Behavior ไม่มี created_by
    DB_readAll(SHEETS.AUDIT).forEach(function (a) { refd[String(a.user_id)] = 1; });
    var del = {}, deact = {};
    dupIds.forEach(function (id) { if (refd[id]) deact[id] = 'no'; else del[id] = 1; });
    if (Object.keys(del).length) r.users_deleted = DB_deleteWhere_(SHEETS.USERS, 'id', function (v) { return !!del[String(v)]; });
    if (Object.keys(deact).length) r.users_deactivated = DB_setColumnById_(SHEETS.USERS, 'is_active', deact);
    DB_deleteWhere_(SHEETS.SESSIONS, 'user_id', function (v) { return !!del[String(v)] || !!deact[String(v)]; });
  }
  if (r.offenses || r.users_deleted || r.users_deactivated) {
    Audit_log_({ id: 'system', full_name: 'ระบบ (ย้ายข้อมูล v1.1.2)' }, 'migrate.v111', 'system', '', r);
  }
  return r;
}
