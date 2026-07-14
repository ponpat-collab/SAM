/**
 * ═══════════════════════════════════════════════════════════════
 *  ระบบงานปกครองนักเรียน · Student Affairs Management System (SAM)
 *  File:        10_Audit.gs — บันทึกประวัติการใช้งาน (append-only)
 *  Version:     1.0.0
 *  Last Update: 2026-07-13
 *  Developer:   ครูวิรัตน์  หาดคำ · www.kruwirat.com
 *  License:     Proprietary · © 2026
 *  Notice:      ห้ามจำหน่าย · แบ่งปันเพื่อการศึกษาและต่อยอดเท่านั้น (ใช้เชิงพาณิชย์ต้องได้รับอนุญาตจากผู้พัฒนา)
 * ═══════════════════════════════════════════════════════════════
 */

function Audit_log_(user, action, entity, entityId, detail) {
  try {
    var meta = detail ? JSON.stringify(detail).substring(0, 500) : '';
    DB_insert(SHEETS.AUDIT, {
      id: cfg_uuid_(), at: cfg_now_(),
      user_id: (user && user.id) || '', user_name: (user && user.full_name) || '',
      action: action, entity: entity, entity_id: String(entityId || ''), detail: meta
    });
  } catch (e) {}
}

function Audit_list(user, p) {
  Auth_requireCap(user, 'audit.view');
  var limit = Math.min(500, cfg_int_((p && p.limit) || 200) || 200);
  var q = String((p && p.q) || '').trim().toLowerCase();
  var rows = DB_readAll(SHEETS.AUDIT).slice();
  rows.sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
  if (q) rows = rows.filter(function (r) {
    return (String(r.user_name) + ' ' + r.action + ' ' + r.entity + ' ' + r.detail).toLowerCase().indexOf(q) >= 0;
  });
  return { items: rows.slice(0, limit), total: rows.length };
}
