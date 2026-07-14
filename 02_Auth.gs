/**
 * ═══════════════════════════════════════════════════════════════
 *  ระบบงานปกครองนักเรียน · Student Affairs Management System (SAM)
 *  File:        02_Auth.gs — login · session · bootstrap · lockout · RBAC gate
 *  Version:     1.0.0
 *  Last Update: 2026-07-13
 *  Developer:   ครูวิรัตน์  หาดคำ · www.kruwirat.com
 *  License:     Proprietary · © 2026
 *  Notice:      ห้ามจำหน่าย · แบ่งปันเพื่อการศึกษาและต่อยอดเท่านั้น (ใช้เชิงพาณิชย์ต้องได้รับอนุญาตจากผู้พัฒนา)
 * ═══════════════════════════════════════════════════════════════
 */

var SEC_MAX_ATTEMPTS = 5, SEC_LOCKOUT_SEC = 900, SESSION_HOURS = 12;

function _lockedUntil_(u) { try { var v = _cache_().get('sec:lock:' + u); return v ? Number(v) : 0; } catch (e) { return 0; } }
function _recordFail_(u) {
  try {
    var k = 'sec:fail:' + u, n = (Number(_cache_().get(k)) || 0) + 1;
    _cache_().put(k, String(n), SEC_LOCKOUT_SEC);
    if (n >= SEC_MAX_ATTEMPTS) { _cache_().put('sec:lock:' + u, String(Date.now() + SEC_LOCKOUT_SEC * 1000), SEC_LOCKOUT_SEC); _cache_().remove(k); }
    return n;
  } catch (e) { return 0; }
}
function _clearFail_(u) { try { _cache_().remove('sec:fail:' + u); _cache_().remove('sec:lock:' + u); } catch (e) {} }

function Auth_publicUser_(u) {
  return {
    id: u.id, username: u.username, email: u.email, full_name: u.full_name, role: u.role,
    advisor_class: u.advisor_class, advisor_room: u.advisor_room, phone: u.phone
  };
}

function Auth_verify_(token) {
  if (!token) throw new Error('ต้องเข้าสู่ระบบก่อน');
  var sess = DB_get(SHEETS.SESSIONS, token);
  if (!sess) throw new Error('เซสชันหมดอายุ — กรุณาเข้าสู่ระบบใหม่');
  if (cfg_now_() > String(sess.expires_at)) { DB_delete(SHEETS.SESSIONS, token); throw new Error('เซสชันหมดอายุ — กรุณาเข้าสู่ระบบใหม่'); }
  var u = DB_get(SHEETS.USERS, sess.user_id);
  if (!u || !_yes_(u.is_active)) throw new Error('บัญชีถูกระงับ — โปรดติดต่อผู้ดูแลระบบ');
  return u;
}
function Auth_requireCap(user, cap) {
  if (!hasCap_(user.role, cap)) throw new Error('คุณไม่มีสิทธิ์ใช้งานฟังก์ชันนี้ (' + cap + ')');
}

function Auth_login(p) {
  var username = String((p && p.username) || '').trim().toLowerCase();
  var pw = String((p && p.password) || '');
  if (!username || !pw) throw new Error('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');
  if (_lockedUntil_(username) > Date.now()) throw new Error('พยายามเข้าสู่ระบบผิดเกินกำหนด — โปรดลองใหม่ใน 15 นาที');
  var u = DB_findOne(SHEETS.USERS, function (x) { return String(x.username).toLowerCase() === username; });
  var ver = (u && _yes_(u.is_active)) ? cfg_verify_(pw, u.salt, u.password_hash) : { ok: false, upgrade: false };
  if (!ver.ok) {
    var n = _recordFail_(username);
    Audit_log_(u ? u : { id: '', full_name: username }, 'auth.fail', 'user', username, { attempts: n });
    throw new Error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  }
  _clearFail_(username);
  if (ver.upgrade) { try { var salt = cfg_salt_(); DB_update(SHEETS.USERS, u.id, { salt: salt, password_hash: cfg_hash_(pw, salt) }); u.salt = salt; } catch (e) {} }
  var token = cfg_token_();
  var expD = new Date(Date.now() + SESSION_HOURS * 3600000);
  var exp = Utilities.formatDate(expD, APP.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
  DB_insert(SHEETS.SESSIONS, { token: token, user_id: u.id, created_at: cfg_now_(), expires_at: exp, ua: cfg_str_(p && p.ua, 120) });
  Audit_log_(u, 'auth.login', 'user', u.id, {});
  return { token: token, user: Auth_publicUser_(u), caps: CAPS[u.role] || [] };
}

function Auth_logout(user, token) {
  try { if (token) DB_delete(SHEETS.SESSIONS, token); } catch (e) {}
  return { ok: true };
}

function Auth_bootstrap(token) {
  var pub = App_publicBundle_();
  var out = { app: pub.app, settings: pub.settings, roles: ROLE_LABEL, role_grad: ROLE_GRAD,
    stu_status: STU_STATUS_LABEL, demo: pub.demo, has_users: pub.has_users, me: null, caps: [] };
  if (token) {
    try { var u = Auth_verify_(token); out.me = Auth_publicUser_(u); out.caps = CAPS[u.role] || []; } catch (e) {}
  }
  return out;
}

function App_publicBundle_() {
  Settings_ensureDefaults_();
  var s = Settings_get_public_();
  var demo = [];
  if (String(s.show_demo_users || 'yes').toLowerCase() === 'yes') {
    demo = DEMO_USERS.map(function (d) { return { username: d.username, role: d.role, full_name: d.full_name }; });
  }
  return {
    app: { name: APP.NAME, short: APP.SHORT, version: APP.VERSION, org: s.org_name || APP.ORG,
           logo: s.logo_image || '', dev: APP.DEV, last_updated: APP.LAST_UPDATED },
    settings: s,
    has_users: DB_rowCount(SHEETS.USERS) > 0,
    demo: demo
  };
}

// ── session GC ─────────────────────────────────────────────────
function Auth_gc_() {
  var now = cfg_now_(), all = DB_readAll(SHEETS.SESSIONS), del = 0;
  for (var i = 0; i < all.length && del < 50; i++) if (now > String(all[i].expires_at)) { DB_delete(SHEETS.SESSIONS, all[i].token); del++; }
  return del;
}
function _revokeUserSessions_(uid) {
  try { DB_deleteBy(SHEETS.SESSIONS, 'user_id', uid); } catch (e) {}
}

// ── change own password ────────────────────────────────────────
function Auth_changePassword(user, p) {
  var oldpw = String((p && p.old_password) || ''), newpw = String((p && p.new_password) || '');
  var u = DB_get(SHEETS.USERS, user.id);
  if (!u) throw new Error('ไม่พบบัญชี');
  if (!cfg_verify_(oldpw, u.salt, u.password_hash).ok) throw new Error('รหัสผ่านเดิมไม่ถูกต้อง');
  var err = Sec_passwordPolicy_(newpw); if (err) throw new Error(err);
  var salt = cfg_salt_();
  DB_update(SHEETS.USERS, u.id, { salt: salt, password_hash: cfg_hash_(newpw, salt) });
  _revokeUserSessions_(u.id);
  Audit_log_(user, 'auth.change_password', 'user', u.id, {});
  return { ok: true };
}

// ── update own profile ─────────────────────────────────────────
function Profile_update(user, p) {
  var patch = {
    full_name: cfg_str_(p && p.full_name, 80).trim(),
    email: cfg_str_(p && p.email, 120).trim(),
    phone: cfg_str_(p && p.phone, 20).trim()
  };
  if (!patch.full_name) throw new Error('กรุณากรอกชื่อ-สกุล');
  DB_update(SHEETS.USERS, user.id, patch);
  Audit_log_(user, 'profile.update', 'user', user.id, {});
  var u = DB_getFresh(SHEETS.USERS, user.id);
  return { user: Auth_publicUser_(u) };
}
