/**
 * ═══════════════════════════════════════════════════════════════
 *  ระบบงานปกครองนักเรียน · Student Affairs Management System (SAM)
 *  File:        01_DB.gs — Sheet-as-DB · แคช 3 ชั้น (version-keyed) · batch · lock
 *  Version:     1.0.0
 *  Last Update: 2026-07-13
 *  Developer:   ครูวิรัตน์  หาดคำ · www.kruwirat.com
 *  License:     Proprietary · © 2026
 *  Notice:      ห้ามจำหน่าย · แบ่งปันเพื่อการศึกษาและต่อยอดเท่านั้น (ใช้เชิงพาณิชย์ต้องได้รับอนุญาตจากผู้พัฒนา)
 * ═══════════════════════════════════════════════════════════════
 */

// ── in-memory memo (ต่อ execution · reset ทุก request) ─────────
var __L1 = {}, __L1L = {}, __IDX = {}, __IDXL = {}, __GIDX = {};
var __VERMEMO = null, __SCHEMA_OK = {}, __SS = null;
var __BATCH = false, __BATCH_DIRTY = {};

var CACHE_TTL = 1800;
var CACHE_CHUNK_SIZE = 90000, CACHE_MAX_CHUNKS = 30, CACHE_MAX_BYTES = 90000 * 30;

function _resetReq_() {
  __L1 = {}; __L1L = {}; __IDX = {}; __IDXL = {}; __GIDX = {};
  __VERMEMO = null; __SCHEMA_OK = {};
}
function _ss_() { if (!__SS) __SS = SpreadsheetApp.getActiveSpreadsheet(); return __SS; }
function _cache_() { return CacheService.getScriptCache(); }

// ── version keys ───────────────────────────────────────────────
function _ver_(scope) {
  if (!__VERMEMO) __VERMEMO = PropertiesService.getScriptProperties().getProperties() || {};
  return Number(__VERMEMO['ver:' + scope] || '1');
}
function _verAll_(scopes) { return scopes.map(function (s) { return _ver_('sheet:' + s); }).join('.'); }
function _bumpVer_(scope) {
  if (__BATCH) { __BATCH_DIRTY[scope] = true; return; }
  var p = PropertiesService.getScriptProperties();
  var v = Number(p.getProperty('ver:' + scope) || '1') + 1;
  p.setProperty('ver:' + scope, String(v));
  if (__VERMEMO) __VERMEMO['ver:' + scope] = String(v);
  var nm = scope.indexOf('sheet:') === 0 ? scope.substring(6) : '';
  if (nm) { delete __L1[nm]; delete __L1L[nm]; delete __IDX[nm]; delete __IDXL[nm]; delete __GIDX[nm]; }
}

// ── per-sheet TTL ──────────────────────────────────────────────
var __TTLMAP = null;
function _ttlFor_(name) {
  if (!__TTLMAP) {
    var m = {};
    m[SHEETS.SESSIONS] = 60; m[SHEETS.NOTIFY] = 30; m[SHEETS.AUDIT] = 120;
    m[SHEETS.LATE] = 300; m[SHEETS.LEAVE] = 300; m[SHEETS.BEHAVIOR] = 300;
    m[SHEETS.STUDENTS] = 1800; m[SHEETS.USERS] = 1800;
    m[SHEETS.OFFENSES] = 21600; m[SHEETS.SETTINGS] = 21600;
    __TTLMAP = m;
  }
  return __TTLMAP[name] || CACHE_TTL;
}

// ── chunked cache ──────────────────────────────────────────────
function _cacheGet_(key) {
  try {
    var raw = _cache_().get(key);
    if (!raw) return null;
    if (raw.indexOf('CHUNK:') === 0) {
      var n = Number(raw.substring(6)), ks = [];
      for (var i = 0; i < n; i++) ks.push(key + ':' + i);
      var bag = _cache_().getAll(ks), out = '';
      for (var j = 0; j < n; j++) { var c = bag[key + ':' + j]; if (c == null) return null; out += c; }
      return JSON.parse(out);
    }
    return JSON.parse(raw);
  } catch (e) { return null; }
}
function _cachePut_(key, val, ttl) {
  ttl = ttl || CACHE_TTL;
  var json;
  try { json = JSON.stringify(val); } catch (e) { return false; }
  if (json.length > CACHE_MAX_BYTES) { console.warn('cache: ' + key + ' ' + Math.round(json.length / 1024) + 'KB เกินเพดาน → ข้าม'); return false; }
  try {
    if (json.length < 95000) { _cache_().put(key, json, ttl); }
    else {
      var n = Math.ceil(json.length / CACHE_CHUNK_SIZE), bag = {};
      for (var i = 0; i < n; i++) bag[key + ':' + i] = json.substr(i * CACHE_CHUNK_SIZE, CACHE_CHUNK_SIZE);
      _cache_().putAll(bag, ttl);
      _cache_().put(key, 'CHUNK:' + n, ttl);
    }
    return true;
  } catch (e) { console.warn('cache put ล้มเหลว (' + key + '): ' + e.message); return false; }
}
function Cache_compute_(key, ttl, fn) {
  var c = _cacheGet_(key);
  if (c !== null && c !== undefined) return c;
  var v = fn();
  if (v !== null && v !== undefined) _cachePut_(key, v, ttl || CACHE_TTL);
  return v;
}

// ── schema ─────────────────────────────────────────────────────
function DB_ensureSchema_(name) {
  if (__SCHEMA_OK[name]) return __SCHEMA_OK[name];
  var cols = SCHEMAS[name];
  var sh = _ss_().getSheetByName(name);
  if (!sh) sh = _ss_().insertSheet(name);
  var lastCol = sh.getLastColumn();
  var need = lastCol < cols.length;
  if (lastCol > 0) {
    var hdr = sh.getRange(1, 1, 1, Math.max(lastCol, cols.length)).getValues()[0];
    for (var i = 0; i < cols.length; i++) if (String(hdr[i] || '') !== cols[i]) { need = true; break; }
  } else { need = true; }
  if (need) {
    sh.getRange(1, 1, 1, cols.length).setValues([cols]);
    sh.setFrozenRows(1);
    var maxR = Math.max(1, sh.getMaxRows() - 1);
    for (var k = 0; k < cols.length; k++) {
      if (TEXT_COLUMNS.indexOf(cols[k]) >= 0) {
        try { sh.getRange(2, k + 1, maxR, 1).setNumberFormat('@'); } catch (e) {}
      }
    }
  }
  __SCHEMA_OK[name] = sh;
  return sh;
}
function DB_initAllSchemas(force) {
  var sig = Object.keys(SCHEMAS).map(function (k) { return k + ':' + SCHEMAS[k].length; }).join('|');
  var props = PropertiesService.getScriptProperties();
  if (!force && props.getProperty('schema_sig') === sig) return;
  Object.keys(SCHEMAS).forEach(function (n) { __SCHEMA_OK[n] = null; DB_ensureSchema_(n); });
  props.setProperty('schema_sig', sig);
}
function DB_rowCount(name) { return Math.max(0, DB_ensureSchema_(name).getLastRow() - 1); }

// ── read (full) ────────────────────────────────────────────────
function _mapRow_(cols, row) {
  var o = {};
  for (var i = 0; i < cols.length; i++) {
    var c = cols[i], v = row[i];
    if (v instanceof Date) {
      if (TIME_COLUMNS.indexOf(c) >= 0) v = Utilities.formatDate(v, APP.TIMEZONE, 'HH:mm');
      else if (DATE_COLUMNS.indexOf(c) >= 0) v = Utilities.formatDate(v, APP.TIMEZONE, 'yyyy-MM-dd');
      else v = cfg_iso_(v);
    }
    o[c] = (v == null) ? '' : v;
  }
  return o;
}
function DB_readAll(name) {
  var ver = _ver_('sheet:' + name);
  var l1 = __L1[name]; if (l1 && l1.ver === ver) return l1.data;
  var key = 'sheet:' + name + ':v' + ver;
  var cached = _cacheGet_(key);
  if (cached) { __L1[name] = { ver: ver, data: cached }; return cached; }
  var sh = DB_ensureSchema_(name), cols = SCHEMAS[name], last = sh.getLastRow();
  var result = [];
  if (last >= 2) {
    var vals = sh.getRange(2, 1, last - 1, cols.length).getValues();
    var kIdx = cols.indexOf('id'); if (kIdx < 0) kIdx = 0;
    for (var r = 0; r < vals.length; r++) {
      if (String(vals[r][kIdx] || '').trim() === '') continue;
      result.push(_mapRow_(cols, vals[r]));
    }
  }
  _cachePut_(key, result, _ttlFor_(name));
  __L1[name] = { ver: ver, data: result };
  return result;
}
function DB_filter(name, pred) { return DB_readAll(name).filter(pred); }
function DB_by(name, col, value) { var t = String(value); return DB_readAll(name).filter(function (r) { return String(r[col]) === t; }); }
function DB_findOne(name, pred) { var a = DB_readAll(name); for (var i = 0; i < a.length; i++) if (pred(a[i])) return a[i]; return null; }

function DB_buildIndex(name) {
  var ver = _ver_('sheet:' + name), ix = __IDX[name];
  if (ix && ix.ver === ver) return ix.map;
  var cols = SCHEMAS[name], k = cols.indexOf('id'); if (k < 0) k = 0;
  var map = {};
  DB_readAll(name).forEach(function (r) { map[String(r[cols[k]])] = r; });
  __IDX[name] = { ver: ver, map: map };
  return map;
}
function DB_get(name, id) { return DB_buildIndex(name)[String(id)] || null; }
function DB_findById(name, id) { return DB_get(name, id); }

// ── read (lite / projection) ───────────────────────────────────
function _liteBlocks_(cols, want) {
  var idxs = want.map(function (c) { return cols.indexOf(c); }).filter(function (i) { return i >= 0; }).sort(function (a, b) { return a - b; });
  var blocks = [], i = 0;
  while (i < idxs.length) {
    var start = idxs[i], len = 1;
    while (i + 1 < idxs.length && idxs[i + 1] === idxs[i] + 1) { i++; len++; }
    blocks.push([start, len]); i++;
  }
  return blocks;
}
function DB_readLite(name) {
  var want = SCHEMAS_LITE[name];
  if (!want) return DB_readAll(name);
  var ver = _ver_('sheet:' + name), l1 = __L1L[name];
  if (l1 && l1.ver === ver) return l1.data;
  var key = 'lite:' + name + ':v' + ver;
  var cached = _cacheGet_(key);
  if (cached) { __L1L[name] = { ver: ver, data: cached }; return cached; }
  var sh = DB_ensureSchema_(name), cols = SCHEMAS[name], last = sh.getLastRow();
  var result = [];
  if (last >= 2) {
    var blocks = _liteBlocks_(cols, want);
    var buckets = blocks.map(function (b) { return sh.getRange(2, b[0] + 1, last - 1, b[1]).getValues(); });
    var kIdx = cols.indexOf('id'); if (kIdx < 0) kIdx = 0;
    for (var r = 0; r < last - 1; r++) {
      var o = {};
      for (var bi = 0; bi < blocks.length; bi++) {
        var st = blocks[bi][0], ln = blocks[bi][1];
        for (var ci = 0; ci < ln; ci++) {
          var col = cols[st + ci], v = buckets[bi][r][ci];
          if (v instanceof Date) {
            if (TIME_COLUMNS.indexOf(col) >= 0) v = Utilities.formatDate(v, APP.TIMEZONE, 'HH:mm');
            else if (DATE_COLUMNS.indexOf(col) >= 0) v = Utilities.formatDate(v, APP.TIMEZONE, 'yyyy-MM-dd');
            else v = cfg_iso_(v);
          }
          o[col] = (v == null) ? '' : v;
        }
      }
      if (String(o[cols[kIdx]] || '').trim() === '') continue;
      result.push(o);
    }
  }
  _cachePut_(key, result, _ttlFor_(name));
  __L1L[name] = { ver: ver, data: result };
  return result;
}
function DB_filterLite(name, pred) { return DB_readLite(name).filter(pred); }
function DB_byLite(name, col, value) { var t = String(value); return DB_readLite(name).filter(function (r) { return String(r[col]) === t; }); }
function DB_buildIndexLite(name) {
  var ver = _ver_('sheet:' + name), ix = __IDXL[name];
  if (ix && ix.ver === ver) return ix.map;
  var cols = SCHEMAS[name], k = cols.indexOf('id'); if (k < 0) k = 0;
  var map = {};
  DB_readLite(name).forEach(function (r) { map[String(r[cols[k]])] = r; });
  __IDXL[name] = { ver: ver, map: map };
  return map;
}
function DB_findByIdLite(name, id) { return DB_buildIndexLite(name)[String(id)] || null; }

// ── single-row fresh read (สำหรับ lock / conflict) ─────────────
function _rowOf_(sh, cols, id) {
  var kIdx = cols.indexOf('id'); if (kIdx < 0) kIdx = 0;
  var last = sh.getLastRow(); if (last < 2) return 0;
  var keys = sh.getRange(2, kIdx + 1, last - 1, 1).getValues();
  for (var i = 0; i < keys.length; i++) if (String(keys[i][0]) === String(id)) return i + 2;
  return 0;
}
function DB_getFresh(name, id) {
  var sh = DB_ensureSchema_(name), cols = SCHEMAS[name], rn = _rowOf_(sh, cols, id);
  if (!rn) return null;
  return _mapRow_(cols, sh.getRange(rn, 1, 1, cols.length).getValues()[0]);
}

// ── write ──────────────────────────────────────────────────────
function _flush_() { if (!__BATCH) SpreadsheetApp.flush(); }
function _setTextFormats_(sh, cols, rowNum) {
  for (var k = 0; k < cols.length; k++) if (TEXT_COLUMNS.indexOf(cols[k]) >= 0) {
    try { sh.getRange(rowNum, k + 1).setNumberFormat('@'); } catch (e) {}
  }
}
function DB_insert(name, data) {
  var sh = DB_ensureSchema_(name), cols = SCHEMAS[name], obj = {}, now = cfg_now_();
  cols.forEach(function (c) { obj[c] = data[c] != null ? data[c] : ''; });
  if (obj.id === '' && cols[0] === 'id') obj.id = cfg_uuid_();
  if ('created_at' in obj && !obj.created_at) obj.created_at = now;
  if ('updated_at' in obj && !obj.updated_at) obj.updated_at = now;
  if ('rev' in obj) obj.rev = 1;
  var newRow = sh.getLastRow() + 1;
  var range = sh.getRange(newRow, 1, 1, cols.length);
  _setTextFormats_(sh, cols, newRow);
  range.setValues([cols.map(function (c) { return obj[c]; })]);
  _flush_(); _bumpVer_('sheet:' + name);
  return obj;
}
function DB_bulkInsert(name, rows) {
  if (!rows.length) return [];
  var sh = DB_ensureSchema_(name), cols = SCHEMAS[name], now = cfg_now_();
  var start = sh.getLastRow() + 1, out = [];
  var mat = rows.map(function (data) {
    var obj = {}; cols.forEach(function (c) { obj[c] = data[c] != null ? data[c] : ''; });
    if (obj.id === '' && cols[0] === 'id') obj.id = cfg_uuid_();
    if ('created_at' in obj && !obj.created_at) obj.created_at = now;
    if ('updated_at' in obj && !obj.updated_at) obj.updated_at = now;
    if ('rev' in obj) obj.rev = 1;
    out.push(obj);
    return cols.map(function (c) { return obj[c]; });
  });
  for (var k = 0; k < cols.length; k++) if (TEXT_COLUMNS.indexOf(cols[k]) >= 0) {
    try { sh.getRange(start, k + 1, rows.length, 1).setNumberFormat('@'); } catch (e) {}
  }
  sh.getRange(start, 1, rows.length, cols.length).setValues(mat);
  _flush_(); _bumpVer_('sheet:' + name);
  return out;
}
function DB_update(name, id, patch) {
  var sh = DB_ensureSchema_(name), cols = SCHEMAS[name], rn = _rowOf_(sh, cols, id);
  if (!rn) throw new Error('ไม่พบข้อมูล id=' + id);
  var cur = sh.getRange(rn, 1, 1, cols.length).getValues()[0], obj = _mapRow_(cols, cur);
  Object.keys(patch).forEach(function (k) { if (cols.indexOf(k) >= 0 && k !== 'id' && k !== 'created_at') obj[k] = patch[k]; });
  if ('updated_at' in obj) obj.updated_at = cfg_now_();
  if ('rev' in obj) obj.rev = (Number(cur[cols.indexOf('rev')]) || 0) + 1;
  var range = sh.getRange(rn, 1, 1, cols.length);
  _setTextFormats_(sh, cols, rn);
  range.setValues([cols.map(function (c) { return obj[c]; })]);
  _flush_(); _bumpVer_('sheet:' + name);
  return obj;
}
function DB_delete(name, id) {
  var sh = DB_ensureSchema_(name), cols = SCHEMAS[name], rn = _rowOf_(sh, cols, id);
  if (!rn) return false;
  sh.deleteRow(rn);
  _flush_(); _bumpVer_('sheet:' + name);
  return true;
}
function DB_deleteBy(name, col, value) {
  var sh = DB_ensureSchema_(name), cols = SCHEMAS[name], ci = cols.indexOf(col);
  if (ci < 0) return 0;
  var last = sh.getLastRow(); if (last < 2) return 0;
  var keys = sh.getRange(2, ci + 1, last - 1, 1).getValues(), t = String(value), rows = [];
  for (var i = keys.length - 1; i >= 0; i--) if (String(keys[i][0]) === t) rows.push(i + 2);
  var n = 0;
  for (var j = 0; j < rows.length;) {
    var end = rows[j], start = end, cnt = 1;
    while (j + 1 < rows.length && rows[j + 1] === start - 1) { start = rows[j + 1]; cnt++; j++; }
    sh.deleteRows(start, cnt); n += cnt; j++;
  }
  if (n) { _flush_(); _bumpVer_('sheet:' + name); }
  return n;
}

// ── batch mode ─────────────────────────────────────────────────
function DB_beginBatch() { __BATCH = true; __BATCH_DIRTY = {}; }
function DB_endBatch() {
  if (!__BATCH) return;
  __BATCH = false;
  SpreadsheetApp.flush();
  var scopes = Object.keys(__BATCH_DIRTY); __BATCH_DIRTY = {};
  if (scopes.length) {
    var props = PropertiesService.getScriptProperties(), cur = props.getProperties() || {}, toSet = {};
    scopes.forEach(function (s) { toSet['ver:' + s] = String(Number(cur['ver:' + s] || '1') + 1); });
    props.setProperties(toSet);
    __VERMEMO = null;
    scopes.forEach(function (s) {
      var nm = s.indexOf('sheet:') === 0 ? s.substring(6) : '';
      if (nm) { delete __L1[nm]; delete __L1L[nm]; delete __IDX[nm]; delete __IDXL[nm]; delete __GIDX[nm]; }
    });
  }
}

// ── lock (retry + jittered backoff) ────────────────────────────
function DB_withLock_(fn, budgetMs) {
  budgetMs = budgetMs || 20000;
  var lock = LockService.getScriptLock(), got = false, waited = 0, SLICE = 2000;
  while (!got && waited < budgetMs) {
    got = lock.tryLock(Math.min(SLICE, budgetMs - waited)); waited += SLICE;
    if (!got) { var j = 120 + Math.floor(Math.random() * 380); Utilities.sleep(j); waited += j; }
  }
  if (!got) throw new Error('ระบบกำลังบันทึกพร้อมกันจำนวนมาก — ข้อมูลของคุณยังอยู่ครบ กรุณากดบันทึกอีกครั้ง');
  try { return fn(); } finally { try { lock.releaseLock(); } catch (e) {} }
}
function _guardConflict_(existing, clientRow, what) {
  var curRev = String((existing && existing.rev) || ''), cliRev = String((clientRow && clientRow.rev) || '');
  if (!curRev || !cliRev) return;
  if (curRev !== cliRev) throw new Error('CONFLICT:มีผู้ใช้อื่นแก้ไข' + what + 'ไปแล้ว — โปรดโหลดใหม่');
}

// ── running sequence code ──────────────────────────────────────
function _genSeq_(prefix, floor) {
  var key = 'seq:' + prefix + ':' + cfg_yymm_();
  var props = PropertiesService.getScriptProperties();
  var next = Math.max(Number(props.getProperty(key)) || 0, Number(floor) || 0) + 1;
  props.setProperty(key, String(next));
  return prefix + cfg_yymm_() + String(next).padStart(4, '0');
}
