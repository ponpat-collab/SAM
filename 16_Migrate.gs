/**
 * ═══════════════════════════════════════════════════════════════
 *  ระบบงานปกครองนักเรียน · Student Affairs Management System (SAM)
 *  File:        16_Migrate.gs — ย้ายข้อมูลครั้งเดียวหลัง deploy (ทำเองอัตโนมัติ · idempotent · ในล็อก)
 *  Version:     1.1.0
 *  Last Update: 2026-09-16
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
  { key: 'v110_score_accum', run: _migrateV110ScoreAccum_ }
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
