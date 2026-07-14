/**
 * ═══════════════════════════════════════════════════════════════
 *  ระบบงานปกครองนักเรียน · Student Affairs Management System (SAM)
 *  File:        12_Users.gs — จัดการผู้ใช้ระบบ · สิทธิ์ · รีเซ็ตรหัสผ่าน
 *  Version:     1.0.0
 *  Last Update: 2026-07-13
 *  Developer:   ครูวิรัตน์  หาดคำ · www.kruwirat.com
 *  License:     Proprietary · © 2026
 *  Notice:      ห้ามจำหน่าย · แบ่งปันเพื่อการศึกษาและต่อยอดเท่านั้น (ใช้เชิงพาณิชย์ต้องได้รับอนุญาตจากผู้พัฒนา)
 * ═══════════════════════════════════════════════════════════════
 */

function _userPublic_(u) {
  return { id: u.id, username: u.username, email: u.email, full_name: u.full_name, role: u.role,
    advisor_class: u.advisor_class, advisor_room: u.advisor_room, phone: u.phone, is_active: _yes_(u.is_active) };
}
function _activeAdminCount_() {
  return DB_readAll(SHEETS.USERS).filter(function (u) { return u.role === 'admin' && _yes_(u.is_active); }).length;
}

function Users_list(user, p) {
  Auth_requireCap(user, 'user.manage');
  var q = String((p && p.q) || '').trim().toLowerCase();
  var rows = DB_readAll(SHEETS.USERS).map(_userPublic_);
  if (q) rows = rows.filter(function (u) { return (u.username + ' ' + u.full_name + ' ' + u.email + ' ' + ROLE_LABEL[u.role]).toLowerCase().indexOf(q) >= 0; });
  rows.sort(function (a, b) { return String(a.role).localeCompare(String(b.role)) || String(a.full_name).localeCompare(String(b.full_name), 'th'); });
  return { items: rows };
}

function Users_save(user, p) {
  Auth_requireCap(user, 'user.manage');
  var isNew = !!(p && p.is_new);
  var username = String((p && p.username) || '').trim().toLowerCase();
  var role = String((p && p.role) || 'teacher');
  if (['admin', 'teacher', 'advisor', 'director'].indexOf(role) < 0) role = 'teacher';
  var d = {
    username: username, full_name: cfg_str_(p && p.full_name, 80).trim(), email: cfg_str_(p && p.email, 120).trim(),
    role: role, advisor_class: cfg_str_(p && p.advisor_class, 6).trim(), advisor_room: cfg_str_(p && p.advisor_room, 6).trim(),
    phone: cfg_str_(p && p.phone, 20).trim(), is_active: _yes_(p && p.is_active) ? 'yes' : 'no'
  };
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) throw new Error('ชื่อผู้ใช้ต้องเป็น a-z 0-9 . _ - (3-30 ตัว)');
  if (!d.full_name) throw new Error('กรุณากรอกชื่อ-สกุล');
  if (role === 'advisor' && (!d.advisor_class || !d.advisor_room)) throw new Error('ครูที่ปรึกษาต้องระบุชั้นและห้องที่ดูแล');
  var tempPw = '';
  DB_withLock_(function () {
    var exist = DB_findOne(SHEETS.USERS, function (x) { return String(x.username).toLowerCase() === username; });
    if (isNew) {
      if (exist) throw new Error('ชื่อผู้ใช้ ' + username + ' มีอยู่แล้ว');
      var pw = String((p && p.password) || '').trim() || Sec_tempPassword_();
      var err = Sec_passwordPolicy_(pw); if (err) throw new Error(err);
      if (!(p && p.password)) tempPw = pw;
      var salt = cfg_salt_();
      d.id = cfg_uuid_(); d.password_hash = cfg_hash_(pw, salt); d.salt = salt;
      DB_insert(SHEETS.USERS, d);
    } else {
      if (!exist) throw new Error('ไม่พบผู้ใช้');
      // last-admin + self-protection
      if (exist.role === 'admin' && role !== 'admin' && _activeAdminCount_() <= 1) throw new Error('ไม่สามารถลดสิทธิ์ผู้ดูแลระบบคนสุดท้ายได้');
      if (String(exist.id) === String(user.id) && (role !== 'admin' || !_yes_(d.is_active))) throw new Error('ไม่สามารถเปลี่ยนบทบาท/ปิดบัญชีของตัวเองได้');
      DB_update(SHEETS.USERS, exist.id, { full_name: d.full_name, email: d.email, role: d.role,
        advisor_class: d.advisor_class, advisor_room: d.advisor_room, phone: d.phone, is_active: d.is_active });
      if (!_yes_(d.is_active)) _revokeUserSessions_(exist.id);
    }
  });
  Audit_log_(user, isNew ? 'user.create' : 'user.update', 'user', username, { role: role });
  return { ok: true, temp_password: tempPw };
}

function Users_delete(user, p) {
  Auth_requireCap(user, 'user.manage');
  var id = String((p && p.id) || '');
  var u = DB_get(SHEETS.USERS, id);
  if (!u) throw new Error('ไม่พบผู้ใช้');
  if (String(id) === String(user.id)) throw new Error('ไม่สามารถลบบัญชีของตัวเองได้');
  if (u.role === 'admin' && _activeAdminCount_() <= 1) throw new Error('ไม่สามารถลบผู้ดูแลระบบคนสุดท้ายได้');
  DB_delete(SHEETS.USERS, id);
  _revokeUserSessions_(id);
  Audit_log_(user, 'user.delete', 'user', u.username, {});
  return { ok: true };
}

function Users_reset_password(user, p) {
  Auth_requireCap(user, 'user.manage');
  var id = String((p && p.id) || '');
  var u = DB_get(SHEETS.USERS, id);
  if (!u) throw new Error('ไม่พบผู้ใช้');
  var pw = Sec_tempPassword_(), salt = cfg_salt_();
  DB_update(SHEETS.USERS, id, { salt: salt, password_hash: cfg_hash_(pw, salt) });
  _revokeUserSessions_(id);
  Audit_log_(user, 'user.reset_password', 'user', u.username, {});
  return { ok: true, temp_password: pw, username: u.username };
}

function Users_set_active(user, p) {
  Auth_requireCap(user, 'user.manage');
  var id = String((p && p.id) || '');
  var u = DB_get(SHEETS.USERS, id);
  if (!u) throw new Error('ไม่พบผู้ใช้');
  if (String(id) === String(user.id)) throw new Error('ไม่สามารถปิดบัญชีของตัวเองได้');
  var on = _yes_(u.is_active);
  if (on && u.role === 'admin' && _activeAdminCount_() <= 1) throw new Error('ต้องมีผู้ดูแลระบบที่ใช้งานได้อย่างน้อย 1 คน');
  DB_update(SHEETS.USERS, id, { is_active: on ? 'no' : 'yes' });
  if (on) _revokeUserSessions_(id);
  return { ok: true };
}
