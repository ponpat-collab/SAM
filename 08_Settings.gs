/**
 * ═══════════════════════════════════════════════════════════════
 *  ระบบงานปกครองนักเรียน · Student Affairs Management System (SAM)
 *  File:        08_Settings.gs — ตั้งค่าระบบ (EAV) · เกณฑ์คะแนน · สาเหตุ · ธีม
 *  Version:     1.0.0
 *  Last Update: 2026-07-13
 *  Developer:   ครูวิรัตน์  หาดคำ · www.kruwirat.com
 *  License:     Proprietary · © 2026
 *  Notice:      ห้ามจำหน่าย · แบ่งปันเพื่อการศึกษาและต่อยอดเท่านั้น (ใช้เชิงพาณิชย์ต้องได้รับอนุญาตจากผู้พัฒนา)
 * ═══════════════════════════════════════════════════════════════
 */

function Settings_map_() {
  var m = {};
  DB_readAll(SHEETS.SETTINGS).forEach(function (r) { m[String(r.key)] = String(r.value == null ? '' : r.value); });
  return m;
}
function Settings_forceTextValue_(sh) {
  try { sh.getRange(2, 2, Math.max(1, sh.getMaxRows() - 1), 1).setNumberFormat('@'); } catch (e) {}
}
function DB_eavSet(name, patch) {
  var sh = DB_ensureSchema_(name), last = sh.getLastRow();
  var rows = last >= 2 ? sh.getRange(2, 1, last - 1, 3).getValues() : [];
  var idx = {}; for (var i = 0; i < rows.length; i++) idx[String(rows[i][0])] = i;
  var now = cfg_now_(), appends = [];
  Object.keys(patch).forEach(function (k) {
    if (!k) return;
    var v = String(patch[k] == null ? '' : patch[k]);
    if (idx[k] != null) { rows[idx[k]][1] = v; rows[idx[k]][2] = now; }
    else appends.push([k, v, now]);
  });
  Settings_forceTextValue_(sh);
  if (rows.length) sh.getRange(2, 1, rows.length, 3).setValues(rows);
  if (appends.length) sh.getRange(2 + rows.length, 1, appends.length, 3).setValues(appends);
  _flush_(); _bumpVer_('sheet:' + SHEETS.SETTINGS); _bumpVer_('public');
  return Object.keys(patch).length;
}
function Settings_setRaw_(key, value) { DB_eavSet(SHEETS.SETTINGS, _obj_(key, value)); }
function _obj_(k, v) { var o = {}; o[k] = v; return o; }

function Settings_ensureDefaults_() {
  DB_ensureSchema_(SHEETS.SETTINGS);
  var map = Settings_map_(), missing = {};
  Object.keys(SETTINGS_DEFAULTS).forEach(function (k) { if (!(k in map)) missing[k] = SETTINGS_DEFAULTS[k]; });
  if (Object.keys(missing).length) DB_eavSet(SHEETS.SETTINGS, missing);
}

function Settings_get_public_() {
  var all = Settings_map_(), out = {};
  Object.keys(all).forEach(function (k) { if (SETTINGS_SENSITIVE.indexOf(k) < 0) out[k] = all[k]; });
  Object.keys(SETTINGS_DEFAULTS).forEach(function (k) { if (SETTINGS_SENSITIVE.indexOf(k) < 0 && !(k in out)) out[k] = SETTINGS_DEFAULTS[k]; });
  return out;
}

function Settings_get(user, p) {
  Auth_requireCap(user, 'setting.manage');
  var all = Settings_map_();
  Object.keys(SETTINGS_DEFAULTS).forEach(function (k) { if (!(k in all)) all[k] = SETTINGS_DEFAULTS[k]; });
  return { settings: all };
}

function Settings_update(user, p) {
  Auth_requireCap(user, 'setting.manage');
  var patch = (p && p.settings) || {}, clean = {};
  Object.keys(patch).forEach(function (k) {
    if (SETTINGS_DEFAULTS.hasOwnProperty(k)) clean[k] = String(patch[k] == null ? '' : patch[k]).substring(0, 4000);
  });
  if (!Object.keys(clean).length) throw new Error('ไม่มีข้อมูลที่จะบันทึก');
  DB_eavSet(SHEETS.SETTINGS, clean);
  Audit_log_(user, 'setting.update', 'setting', '', { keys: Object.keys(clean) });
  return { ok: true, settings: Settings_map_() };
}

function Settings_repair(user, p) {
  Auth_requireCap(user, 'setting.manage');
  var sh = DB_ensureSchema_(SHEETS.SETTINGS), last = sh.getLastRow();
  if (last >= 2) {
    var rng = sh.getRange(2, 1, last - 1, 3), vals = rng.getValues();
    var fixed = vals.map(function (r) { return [String(r[0] || ''), r[1] === '' || r[1] == null ? '' : String(r[1]), r[2]]; });
    rng.setNumberFormat('@'); rng.setValues(fixed);
    _bumpVer_('sheet:' + SHEETS.SETTINGS); _bumpVer_('public');
  }
  return { ok: true, fixed: Math.max(0, last - 1) };
}

// helper: split comma list setting → array
function _listSetting_(map, key) {
  return String(map[key] || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
}
