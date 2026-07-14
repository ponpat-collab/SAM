// harness_backend.js — mock GAS + load .gs + seed → global.__dispatch (ใช้โดย client_harness)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..');

function Range(sheet, r, c, nr, nc) { this.sh = sheet; this.r = r; this.c = c; this.nr = nr; this.nc = nc; }
Range.prototype.getValues = function () { var out = []; for (var i = 0; i < this.nr; i++) { var row = []; for (var j = 0; j < this.nc; j++) { var rr = this.sh.data[this.r - 1 + i] || []; row.push(rr[this.c - 1 + j] == null ? '' : rr[this.c - 1 + j]); } out.push(row); } return out; };
Range.prototype.setValues = function (vals) { for (var i = 0; i < vals.length; i++) { if (!this.sh.data[this.r - 1 + i]) this.sh.data[this.r - 1 + i] = []; for (var j = 0; j < vals[i].length; j++) this.sh.data[this.r - 1 + i][this.c - 1 + j] = vals[i][j]; } return this; };
Range.prototype.setNumberFormat = function () { return this; };
Range.prototype.setValue = function (v) { this.setValues([[v]]); return this; };
function Sheet(name) { this.name = name; this.data = []; this.maxRows = 2000; }
Sheet.prototype.getName = function () { return this.name; };
Sheet.prototype.getLastRow = function () { for (var i = this.data.length - 1; i >= 0; i--) { if (this.data[i] && this.data[i].some(function (x) { return x !== '' && x != null; })) return i + 1; } return 0; };
Sheet.prototype.getLastColumn = function () { return this.data[0] ? this.data[0].length : 0; };
Sheet.prototype.getMaxRows = function () { return Math.max(this.maxRows, this.getLastRow() + 1); };
Sheet.prototype.getRange = function (r, c, nr, nc) { return new Range(this, r, c, nr || 1, nc || 1); };
Sheet.prototype.setFrozenRows = function () { return this; };
Sheet.prototype.deleteRow = function (r) { this.data.splice(r - 1, 1); return this; };
Sheet.prototype.deleteRows = function (r, n) { this.data.splice(r - 1, n); return this; };
function SS() { this.sheets = {}; this.name = 'ระบบงานปกครองนักเรียน'; this.id = 'SS_MOCK'; }
SS.prototype.getSheetByName = function (n) { return this.sheets[n] || null; };
SS.prototype.insertSheet = function (n) { return (this.sheets[n] = new Sheet(n)); };
SS.prototype.getName = function () { return this.name; };
SS.prototype.getId = function () { return this.id; };
const _ss = new SS(), _props = {}, _cache = {};
global.SpreadsheetApp = { getActiveSpreadsheet: function () { return _ss; }, getActive: function () { return _ss; }, flush: function () {}, getUi: function () { return { createMenu: function () { return { addItem: function () { return this; }, addSeparator: function () { return this; }, addToUi: function () {} }; }, alert: function () {}, showModalDialog: function () {}, ButtonSet: {}, Button: {} }; } };
global.PropertiesService = { getScriptProperties: function () { return { getProperty: function (k) { return _props[k] == null ? null : _props[k]; }, setProperty: function (k, v) { _props[k] = String(v); }, getProperties: function () { var o = {}; Object.keys(_props).forEach(function (k) { o[k] = _props[k]; }); return o; }, setProperties: function (m) { Object.keys(m).forEach(function (k) { _props[k] = String(m[k]); }); } }; } };
global.CacheService = { getScriptCache: function () { return { get: function (k) { return _cache[k] == null ? null : _cache[k]; }, getAll: function (ks) { var o = {}; ks.forEach(function (k) { if (_cache[k] != null) o[k] = _cache[k]; }); return o; }, put: function (k, v) { _cache[k] = v; }, putAll: function (m) { Object.keys(m).forEach(function (k) { _cache[k] = m[k]; }); }, remove: function (k) { delete _cache[k]; } }; } };
global.LockService = { getScriptLock: function () { return { tryLock: function () { return true; }, releaseLock: function () {} }; } };
global.Utilities = { getUuid: function () { return crypto.randomUUID(); }, sleep: function () {},
  formatDate: function (d, tz, fmt) { var t = new Date(d.getTime() + 7 * 3600000); var Y = t.getUTCFullYear(), M = ('0' + (t.getUTCMonth() + 1)).slice(-2), D = ('0' + t.getUTCDate()).slice(-2), h = ('0' + t.getUTCHours()).slice(-2), m = ('0' + t.getUTCMinutes()).slice(-2), s = ('0' + t.getUTCSeconds()).slice(-2); return fmt.replace("yyyy-MM-dd'T'HH:mm:ssXXX", Y + '-' + M + '-' + D + 'T' + h + ':' + m + ':' + s + '+07:00').replace('yyyy-MM-dd', Y + '-' + M + '-' + D).replace('yyyy-MM', Y + '-' + M).replace('yyMM', String(Y).slice(-2) + M).replace('HH:mm:ss', h + ':' + m + ':' + s).replace('HH:mm', h + ':' + m).replace('yyyy', Y).replace('MM', M).replace('dd', D); },
  computeDigest: function (a, v) { return Array.from(crypto.createHash('sha256').update(String(v)).digest()); },
  computeHmacSha256Signature: function (data, key) { var d = Buffer.isBuffer(data) ? data : Buffer.from(data); var k = Buffer.isBuffer(key) ? key : Buffer.from(key); return Array.from(crypto.createHmac('sha256', k).update(d).digest()); },
  base64Encode: function (b) { return Buffer.from(b).toString('base64'); }, base64EncodeWebSafe: function (b) { return Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'); }, base64Decode: function (s) { return Array.from(Buffer.from(s, 'base64')); },
  newBlob: function (data) { var buf = Buffer.isBuffer(data) ? data : Buffer.from(String(data)); return { getBytes: function () { return Array.from(buf); } }; }, DigestAlgorithm: { SHA_256: 'x' }, Charset: { UTF_8: 'x' } };
global.Session = { getActiveUser: function () { return { getEmail: function () { return 't@e.com'; } }; } };
global.DriveApp = { getFileById: function () { return { getParents: function () { return { hasNext: function () { return false; } }; } }; }, getRootFolder: function () { return { getFoldersByName: function () { return { hasNext: function () { return false; } }; }, createFolder: function () { return this; }, getName: function () { return 'r'; } }; }, Access: {}, Permission: {} };
global.UrlFetchApp = { fetch: function () { return { getResponseCode: function () { return 200; }, getContentText: function () { return '{"ok":true}'; } }; } };
global.ScriptApp = { getService: function () { return { getUrl: function () { return 'https://x/exec'; } }; }, getProjectTriggers: function () { return []; }, newTrigger: function () { return { timeBased: function () { return this; }, everyMinutes: function () { return this; }, everyHours: function () { return this; }, create: function () {} }; } };
global.HtmlService = { createTemplateFromFile: function () { return { evaluate: function () { return { setTitle: function () { return this; }, setXFrameOptionsMode: function () { return this; }, addMetaTag: function () { return this; } }; } }; } };

var files = fs.readdirSync(ROOT).filter(function (f) { return /\.gs$/.test(f); }).sort();
var src = files.map(function (f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }).join('\n');
var indirectEval = eval; indirectEval(src);
var G = (function () { return this; })() || globalThis;
G.DB_initAllSchemas(true); G.Settings_ensureDefaults_(); G.Seed_ensureUsers_(); G.Seed_ensureOffenses_();
// small demo dataset
G.Students_save({ role: 'admin' }, { is_new: true, id: '30001', prefix: 'เด็กชาย', first_name: 'ทดสอบ', last_name: 'ระบบ', class_level: '3', room: '1', number: '1', advisor_name: 'ครูเอ' });
global.__dispatch = G._dispatch_;
