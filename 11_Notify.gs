/**
 * ═══════════════════════════════════════════════════════════════
 *  ระบบงานปกครองนักเรียน · Student Affairs Management System (SAM)
 *  File:        11_Notify.gs — ศูนย์แจ้งเตือนในระบบ (bell) + Telegram push
 *  Version:     1.0.0
 *  Last Update: 2026-07-13
 *  Developer:   ครูวิรัตน์  หาดคำ · www.kruwirat.com
 *  License:     Proprietary · © 2026
 *  Notice:      ห้ามจำหน่าย · แบ่งปันเพื่อการศึกษาและต่อยอดเท่านั้น (ใช้เชิงพาณิชย์ต้องได้รับอนุญาตจากผู้พัฒนา)
 * ═══════════════════════════════════════════════════════════════
 */

// ── In-app notification (per-user rows) ────────────────────────
function Notify_pushRoles_(roles, ntype, title, message, link) {
  try {
    var users = DB_readAll(SHEETS.USERS).filter(function (u) { return _yes_(u.is_active) && roles.indexOf(u.role) >= 0; });
    if (!users.length) return;
    var now = cfg_now_();
    var rows = users.map(function (u) {
      return { id: cfg_uuid_(), target: u.id, ntype: ntype, title: cfg_str_(title, 120),
        message: cfg_str_(message, 400), link: cfg_str_(link, 120), is_read: 'no', created_at: now };
    });
    DB_bulkInsert(SHEETS.NOTIFY, rows);
  } catch (e) {}
}

function Notify_list(user, p) {
  var rows = DB_by(SHEETS.NOTIFY, 'target', user.id).slice();
  rows.sort(function (a, b) { return String(b.created_at).localeCompare(String(a.created_at)); });
  rows = rows.slice(0, 40);
  var unread = rows.filter(function (r) { return !_yes_(r.is_read); }).length;
  return { items: rows, unread: unread, latest: rows.length ? rows[0].created_at : '' };
}
function Notify_markRead(user, p) {
  var id = String((p && p.id) || '');
  var n = DB_get(SHEETS.NOTIFY, id);
  if (n && String(n.target) === String(user.id)) DB_update(SHEETS.NOTIFY, id, { is_read: 'yes' });
  return { ok: true };
}
function Notify_markAllRead(user, p) {
  var rows = DB_by(SHEETS.NOTIFY, 'target', user.id).filter(function (r) { return !_yes_(r.is_read); });
  DB_beginBatch();
  try { rows.forEach(function (r) { DB_update(SHEETS.NOTIFY, r.id, { is_read: 'yes' }); }); }
  finally { DB_endBatch(); }
  return { ok: true, n: rows.length };
}
function Notify_gc_() {
  var cutD = new Date(Date.now() - 30 * 86400000);
  var cut = Utilities.formatDate(cutD, APP.TIMEZONE, 'yyyy-MM-dd');
  var old = DB_readAll(SHEETS.NOTIFY).filter(function (r) { return String(r.created_at).substring(0, 10) < cut; });
  var del = 0;
  for (var i = 0; i < old.length && del < 200; i++) { DB_delete(SHEETS.NOTIFY, old[i].id); del++; }
  return del;
}

// ── Telegram ───────────────────────────────────────────────────
function _tgEsc_(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function Telegram_send_(chatId, text) {
  var s = Settings_map_();
  if (!_yes_(s.tg_enabled) || !s.tg_token || !chatId) return { ok: false };
  try {
    var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + s.tg_token + '/sendMessage', {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify({ chat_id: String(chatId), text: String(text).substring(0, 4096), parse_mode: 'HTML', disable_web_page_preview: true }),
      muteHttpExceptions: true
    });
    return { ok: res.getResponseCode() < 300 };
  } catch (e) { return { ok: false, error: String(e) }; }
}
function _tgAdminIds_() {
  return String(Settings_map_().tg_admin_chat_ids || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
}
function Telegram_toAdmins_(text) {
  _tgAdminIds_().forEach(function (id) { Telegram_send_(id, text); });
}

function Telegram_test(user, p) {
  Auth_requireCap(user, 'notify.send');
  var ids = _tgAdminIds_();
  if (!ids.length) throw new Error('ยังไม่ได้ตั้งค่า Chat ID ของผู้ดูแล');
  var ok = 0;
  ids.forEach(function (id) { if (Telegram_send_(id, '✅ <b>' + _tgEsc_(APP.NAME) + '</b>\nทดสอบการเชื่อมต่อสำเร็จ · ' + cfg_dateOnly_(new Date())).ok) ok++; });
  return { ok: true, sent: ok, total: ids.length };
}
function Telegram_getMe(user, p) {
  Auth_requireCap(user, 'notify.send');
  var s = Settings_map_();
  if (!s.tg_token) throw new Error('ยังไม่ได้ตั้งค่า Token');
  try {
    var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + s.tg_token + '/getMe', { muteHttpExceptions: true });
    var d = JSON.parse(res.getContentText());
    if (!d.ok) throw new Error('Token ไม่ถูกต้อง');
    return { username: d.result.username, name: d.result.first_name, link: 'https://t.me/' + d.result.username };
  } catch (e) { throw new Error('ตรวจสอบ Token ไม่สำเร็จ: ' + e.message); }
}
function Telegram_getUpdates(user, p) {
  Auth_requireCap(user, 'notify.send');
  var s = Settings_map_();
  if (!s.tg_token) throw new Error('ยังไม่ได้ตั้งค่า Token');
  try {
    var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + s.tg_token + '/getUpdates', { muteHttpExceptions: true });
    var d = JSON.parse(res.getContentText()), seen = {}, chats = [];
    (d.result || []).forEach(function (u) {
      var c = (u.message && u.message.chat) || (u.channel_post && u.channel_post.chat);
      if (c && !seen[c.id]) { seen[c.id] = 1; chats.push({ id: String(c.id), name: c.title || ((c.first_name || '') + ' ' + (c.last_name || '')).trim() || c.username || '' }); }
    });
    return { chats: chats };
  } catch (e) { throw new Error('ดึงข้อมูลไม่สำเร็จ: ' + e.message); }
}
