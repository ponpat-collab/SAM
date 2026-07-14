// harness.js — mock GAS + รัน backend จริง end-to-end (node tests/harness.js)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..');

// ── in-memory Spreadsheet model ──
function Range(sheet, r, c, nr, nc) { this.sh = sheet; this.r = r; this.c = c; this.nr = nr; this.nc = nc; }
Range.prototype.getValues = function () { var out = []; for (var i = 0; i < this.nr; i++) { var row = []; for (var j = 0; j < this.nc; j++) { var rr = this.sh.data[this.r - 1 + i] || []; row.push(rr[this.c - 1 + j] == null ? '' : rr[this.c - 1 + j]); } out.push(row); } return out; };
Range.prototype.setValues = function (vals) { for (var i = 0; i < vals.length; i++) { if (!this.sh.data[this.r - 1 + i]) this.sh.data[this.r - 1 + i] = []; for (var j = 0; j < vals[i].length; j++) this.sh.data[this.r - 1 + i][this.c - 1 + j] = vals[i][j]; } this.sh.rows = Math.max(this.sh.rows, this.r - 1 + vals.length); return this; };
Range.prototype.setNumberFormat = function () { return this; };
Range.prototype.setValue = function (v) { this.setValues([[v]]); return this; };
function Sheet(name) { this.name = name; this.data = []; this.rows = 0; this.frozen = 0; this.maxRows = 2000; }
Sheet.prototype.getName = function () { return this.name; };
Sheet.prototype.getLastRow = function () { for (var i = this.data.length - 1; i >= 0; i--) { if (this.data[i] && this.data[i].some(function (x) { return x !== '' && x != null; })) return i + 1; } return 0; };
Sheet.prototype.getLastColumn = function () { return this.data[0] ? this.data[0].length : 0; };
Sheet.prototype.getMaxRows = function () { return Math.max(this.maxRows, this.getLastRow() + 1); };
Sheet.prototype.getRange = function (r, c, nr, nc) { return new Range(this, r, c, nr || 1, nc || 1); };
Sheet.prototype.setFrozenRows = function (n) { this.frozen = n; return this; };
Sheet.prototype.deleteRow = function (r) { this.data.splice(r - 1, 1); return this; };
Sheet.prototype.deleteRows = function (r, n) { this.data.splice(r - 1, n); return this; };
Sheet.prototype.insertRowsAfter = function () { return this; };
function SS() { this.sheets = {}; this.name = 'ระบบงานปกครองนักเรียน'; this.id = 'SS_MOCK_ID'; }
SS.prototype.getSheetByName = function (n) { return this.sheets[n] || null; };
SS.prototype.insertSheet = function (n) { return (this.sheets[n] = new Sheet(n)); };
SS.prototype.getName = function () { return this.name; };
SS.prototype.getId = function () { return this.id; };
const _ss = new SS();

// ── globals ──
const _props = {}; const _cache = {};
global.SpreadsheetApp = { getActiveSpreadsheet: function () { return _ss; }, getActive: function () { return _ss; }, flush: function () {}, getUi: function () { return { createMenu: function () { return { addItem: function () { return this; }, addSeparator: function () { return this; }, addToUi: function () {} }; }, alert: function () {}, showModalDialog: function () {}, ButtonSet: { OK: 0, YES_NO: 1 }, Button: { YES: 1 } }; } };
global.PropertiesService = { getScriptProperties: function () { return { getProperty: function (k) { return _props[k] == null ? null : _props[k]; }, setProperty: function (k, v) { _props[k] = String(v); }, getProperties: function () { var o = {}; Object.keys(_props).forEach(function (k) { o[k] = _props[k]; }); return o; }, setProperties: function (m) { Object.keys(m).forEach(function (k) { _props[k] = String(m[k]); }); } }; } };
global.CacheService = { getScriptCache: function () { return { get: function (k) { return _cache[k] == null ? null : _cache[k]; }, getAll: function (ks) { var o = {}; ks.forEach(function (k) { if (_cache[k] != null) o[k] = _cache[k]; }); return o; }, put: function (k, v) { _cache[k] = v; }, putAll: function (m) { Object.keys(m).forEach(function (k) { _cache[k] = m[k]; }); }, remove: function (k) { delete _cache[k]; } }; } };
global.LockService = { getScriptLock: function () { return { tryLock: function () { return true; }, releaseLock: function () {} }; } };
global.Utilities = {
  getUuid: function () { return crypto.randomUUID(); },
  sleep: function () {},
  formatDate: function (d, tz, fmt) {
    // approximate Asia/Bangkok (+7). d is a Date.
    var t = new Date(d.getTime() + 7 * 3600000);
    var Y = t.getUTCFullYear(), M = ('0' + (t.getUTCMonth() + 1)).slice(-2), D = ('0' + t.getUTCDate()).slice(-2);
    var h = ('0' + t.getUTCHours()).slice(-2), m = ('0' + t.getUTCMinutes()).slice(-2), s = ('0' + t.getUTCSeconds()).slice(-2);
    return fmt.replace("yyyy-MM-dd'T'HH:mm:ssXXX", Y + '-' + M + '-' + D + 'T' + h + ':' + m + ':' + s + '+07:00')
      .replace('yyyy-MM-dd', Y + '-' + M + '-' + D).replace('yyyy-MM', Y + '-' + M).replace('yyMM', String(Y).slice(-2) + M)
      .replace('HH:mm:ss', h + ':' + m + ':' + s).replace('HH:mm', h + ':' + m).replace('yyyy', Y).replace('MM', M).replace('dd', D);
  },
  computeDigest: function (algo, val) { return Array.from(crypto.createHash('sha256').update(String(val)).digest()); },
  computeHmacSha256Signature: function (data, key) { var d = Buffer.isBuffer(data) ? data : Buffer.from(data); var k = Buffer.isBuffer(key) ? key : Buffer.from(key); return Array.from(crypto.createHmac('sha256', k).update(d).digest()); },
  base64Encode: function (b) { return Buffer.from(b).toString('base64'); },
  base64EncodeWebSafe: function (b) { return Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'); },
  base64Decode: function (s) { return Array.from(Buffer.from(s, 'base64')); },
  newBlob: function (data) { var buf = Buffer.isBuffer(data) ? data : Buffer.from(String(data)); return { getBytes: function () { return Array.from(buf); }, getBlob: function () { return this; } }; },
  DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' }
};
global.Session = { getActiveUser: function () { return { getEmail: function () { return 'test@example.com'; } }; } };
global.DriveApp = { getFileById: function () { return { getParents: function () { return { hasNext: function () { return false; }, next: function () {} }; } }; }, getRootFolder: function () { return { getName: function () { return 'root'; }, getFoldersByName: function () { return { hasNext: function () { return false; } }; }, createFolder: function () { return this; } }; }, Access: {}, Permission: {} };
global.UrlFetchApp = { fetch: function () { return { getResponseCode: function () { return 200; }, getContentText: function () { return '{"ok":true}'; } }; } };
global.ScriptApp = { getService: function () { return { getUrl: function () { return 'https://script.google.com/exec'; } }; }, getProjectTriggers: function () { return []; }, newTrigger: function () { return { timeBased: function () { return this; }, everyMinutes: function () { return this; }, everyHours: function () { return this; }, create: function () {} }; } };
global.HtmlService = { createTemplateFromFile: function () { return { evaluate: function () { return { setTitle: function () { return this; }, setXFrameOptionsMode: function () { return this; }, addMetaTag: function () { return this; } }; } }; } };
global.console = console;

// ── load all .gs (concat) ──
var files = fs.readdirSync(ROOT).filter(function (f) { return /\.gs$/.test(f); }).sort();
var src = files.map(function (f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }).join('\n');
var indirectEval = eval;
try { indirectEval(src); } catch (e) { console.error('LOAD FAIL:', e.message); process.exit(1); }
var G = (function () { return this; })() || globalThis;
['DB_initAllSchemas', 'Settings_ensureDefaults_', 'Seed_ensureUsers_', 'Seed_ensureOffenses_', 'DB_rowCount', 'SHEETS', 'Auth_login', '_dispatch_', 'DB_get'].forEach(function (n) { if (typeof G[n] !== 'undefined') global[n] = G[n]; });

// ── run scenario ──
var pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + msg); } }
function api(action, token, payload) { return _dispatch_({ action: action, token: token, payload: payload }); }

console.log('════ HARNESS: end-to-end backend ════');
// init
DB_initAllSchemas(true); Settings_ensureDefaults_(); Seed_ensureUsers_(); Seed_ensureOffenses_();
ok(DB_rowCount(SHEETS.USERS) === 4, 'seed 4 users');
ok(DB_rowCount(SHEETS.OFFENSES) === 7, 'seed 7 offenses');

// login
var lg = Auth_login({ username: 'admin', password: '123456' });
ok(lg.token && lg.user.role === 'admin', 'admin login ok');
var adminTok = lg.token;
var tLg = Auth_login({ username: 'teacher', password: '123456' });
var teacherTok = tLg.token;
ok(!!teacherTok, 'teacher login ok');
try { Auth_login({ username: 'admin', password: 'wrong' }); ok(false, 'wrong pw should fail'); } catch (e) { ok(/ไม่ถูกต้อง/.test(e.message), 'wrong pw rejected'); }

// bootstrap
var boot = api('app.bootstrap', adminTok, {});
ok(boot.me && boot.caps.length > 0, 'bootstrap has me+caps');

// add students
var s1 = api('student.save', adminTok, { is_new: true, id: '40001', prefix: 'เด็กชาย', first_name: 'ทดสอบ', last_name: 'ระบบ', class_level: '3', room: '1', number: '1', advisor_name: 'ครูเอ' });
ok(s1.ok && s1.student.score === 100, 'add student score=100');
api('student.save', adminTok, { is_new: true, id: '40002', first_name: 'สอง', last_name: 'สาม', class_level: '3', room: '2', number: '2', advisor_name: 'ครูบี' });
// import
var imp = api('student.import', adminTok, { rows: [{ id: '40003', first_name: 'นำเข้า', last_name: 'หนึ่ง', class_level: '4', room: '1', number: '3' }, { id: '40001', first_name: 'ทดสอบแก้', last_name: 'ระบบ', class_level: '3', room: '1', number: '1' }] });
ok(imp.created === 1 && imp.updated === 1, 'import 1 new 1 update');

// lookup
var lk = api('student.lookup', adminTok, { id: '40001' });
ok(lk.student.name.indexOf('ทดสอบแก้') >= 0, 'lookup updated name');

// late
var lt = api('late.save', adminTok, { student_id: '40001', reason: 'รถติด' });
ok(lt.ok, 'late saved');
try { api('late.save', adminTok, { student_id: '40001', reason: 'ตื่นสาย' }); ok(false, 'late dup should hard-block'); } catch (e) { ok(/ซ้ำในวันเดียวกัน/.test(e.message), 'late dup hard-blocked (ห้ามซ้ำวันเดียวกัน)'); }
var lateList = api('late.list', adminTok, {});
ok(lateList.total >= 1, 'late list total>=1');

// leave
var lv = api('leave.save', adminTok, { student_id: '40002', reason: 'ป่วย', guardian_name: 'นายพ่อ ดี', relation: 'บิดา', guardian_phone: '0812345678' });
ok(lv.ok, 'leave saved');
try { api('leave.save', adminTok, { student_id: '40002', reason: 'ป่วย', guardian_name: '' }); ok(false, 'leave no guardian should fail'); } catch (e) { ok(/ผู้ปกครอง/.test(e.message), 'leave requires guardian'); }

// behavior deduct + score
var bh = api('behavior.save', adminTok, { student_id: '40001', kind: 'deduct', offense_code: 'B06', points_override: false });
ok(bh.score_after === 60, 'behavior deduct B06(-40) → 60');
ok(bh.alert.level === 1, 'alert level1 at 60');
var stu = DB_get(SHEETS.STUDENTS, '40001');
ok(Number(stu.score) === 60, 'student score persisted 60');
// add good deed
var bg = api('behavior.save', adminTok, { student_id: '40001', kind: 'add', offense_name: 'ทำความดี', points: 10 });
ok(bg.score_after === 70, 'add 10 → 70');
// cancel behavior restores
var behList = api('behavior.list', adminTok, {});
var firstBeh = behList.items.filter(function (r) { return r.kind === 'deduct'; })[0];
api('behavior.cancel', adminTok, { id: firstBeh.id });
var stu2 = DB_get(SHEETS.STUDENTS, '40001');
ok(Number(stu2.score) === 110 || Number(stu2.score) === 100, 'cancel deduct restores (clamped): ' + stu2.score);

// เพิ่มมาสายอีกคน (วันนี้) ให้ยอดวันนี้ >= 2 (40001 + 40008) — 40002 เว้นไว้ให้ public test
api('student.save', adminTok, { is_new: true, id: '40008', prefix: 'เด็กหญิง', first_name: 'สอง', last_name: 'คน', class_level: '3', room: '1', number: '8', advisor_name: 'ครูเอ' });
api('late.save', adminTok, { student_id: '40008', reason: 'รถติด' });

// dashboard
var dash = api('report.dashboard', adminTok, {});
ok(dash.kpi.late >= 2, 'dashboard late count');
ok(Array.isArray(dash.trend) && dash.trend.length === 7, 'dashboard 7-day trend');

// reports
var rpt = api('report.student', adminTok, { id: '40001' });
ok(rpt.student.id === '40001' && rpt.behavior.length >= 1, 'student report');
var room = api('report.room', adminTok, {});
ok(room.rooms.length >= 1, 'room report');
var period = api('report.period', adminTok, {});
ok(period.kpi.late >= 2, 'period report');

// RBAC: teacher cannot manage users
try { api('user.list', teacherTok, {}); ok(false, 'teacher should not list users'); } catch (e) { ok(/สิทธิ์/.test(e.message), 'teacher blocked from user.manage'); }
// director view-only cannot create late
var dLg = Auth_login({ username: 'director', password: '123456' });
try { api('late.save', dLg.token, { student_id: '40001', reason: 'x' }); ok(false, 'director should not create late'); } catch (e) { ok(/สิทธิ์/.test(e.message), 'director blocked from late.create'); }

// advisor scope: advisor sees only ม.3/1
var advLg = Auth_login({ username: 'advisor', password: '123456' });
var advList = api('student.list', advLg.token, {});
var outOfRoom = advList.items.filter(function (s) { return !(s.class_level === '3' && s.room === '1'); });
ok(outOfRoom.length === 0, 'advisor sees only own room (S7 scope)');
try { api('student.lookup', advLg.token, { id: '40002' }); ok(false, 'advisor should not lookup other room'); } catch (e) { ok(/นอกห้อง/.test(e.message), 'advisor blocked from other room student'); }
// ครู A (advisor 3/1) ไม่เห็นห้อง B (3/2) — S7 regression
var advDash = api('report.dashboard', advLg.token, {});
ok(advDash.scope !== 'all', 'advisor dashboard scoped');

// offense mgmt
var of = api('offense.save', adminTok, { is_new: true, code: 'B99', name: 'ทดสอบ', category: 'ทดสอบ', points: 15, is_active: true });
ok(of.ok, 'offense create');
api('offense.toggle', adminTok, { code: 'B99' });
var offList = api('offense.list', adminTok, { all: 1 });
ok(offList.items.some(function (o) { return o.code === 'B99' && !o.is_active; }), 'offense toggle off');
api('offense.delete', adminTok, { code: 'B99' });
ok(!DB_get(SHEETS.OFFENSES, 'B99'), 'offense delete');

// settings
var setUp = api('setting.update', adminTok, { settings: { org_name: 'โรงเรียนทดสอบ', alert_level_1: '70' } });
ok(setUp.settings.org_name === 'โรงเรียนทดสอบ', 'setting update');

// user mgmt
var uNew = api('user.save', adminTok, { is_new: true, username: 'testuser', full_name: 'ครูทดสอบ', role: 'teacher', is_active: true });
ok(uNew.ok && uNew.temp_password, 'user create + temp pw');
// last-admin protection
try { var adminUser = DB_findOne(SHEETS.USERS, function (x) { return x.username === 'admin'; });
  api('user.save', adminTok, { username: 'admin', full_name: 'x', role: 'teacher', is_active: true }); ok(false, 'demote self should fail'); } catch (e) { ok(true, 'self role-change blocked'); }

// audit log has entries
var au = api('audit.list', adminTok, { limit: 50 });
ok(au.items.length > 5, 'audit log recorded (' + au.total + ')');

// notify: leave triggered notif to admin? (tg off, but in-app pushRoles not called in leave — skip). test notify list works
var nf = api('notify.list', adminTok, {});
ok(Array.isArray(nf.items), 'notify list ok');

// ── NEW: self-service สาธารณะ (ไม่ต้องล็อกอิน) ──
var pl = api('public.student_lookup', '', { id: '40002' });
ok(pl.student && pl.student.name && pl.student.class_level, 'public lookup works (ไม่ต้องล็อกอิน)');
var ps = api('public.late_submit', '', { student_id: '40002', reason: 'ตื่นสาย' });
ok(ps.ok && ps.student_name, 'public late submit (นักเรียนบันทึกเอง)');
try { api('public.late_submit', '', { student_id: '40002' }); ok(false, 'public late dup should block'); } catch (e) { ok(/ซ้ำ/.test(e.message), 'public late dup hard-blocked'); }
var pv2 = api('public.leave_submit', '', { student_id: '40002', guardian_name: 'นายพ่อ ดี', reason: 'ป่วย' });
ok(pv2.ok, 'public leave submit');
try { api('public.leave_submit', '', { student_id: '40002', guardian_name: '' }); ok(false, 'public leave needs guardian'); } catch (e) { ok(/ผู้ปกครอง/.test(e.message), 'public leave requires guardian'); }

// ── NEW: board.today (เฉพาะวันนี้) ──
var bd = api('board.today', adminTok, {});
ok(Array.isArray(bd.late) && Array.isArray(bd.leave) && bd.date, 'board.today returns lists + date');
ok(bd.late_count >= 1 && bd.leave_count >= 1, 'board shows today records (late=' + bd.late_count + ' leave=' + bd.leave_count + ')');
ok(bd.late.some(function (r) { return r.self === true; }), 'board marks self-reported records');

// ── NEW: มาสายสะสมครบเกณฑ์ → แจ้งเตือน (คนละวัน) ──
api('student.save', adminTok, { is_new: true, id: '40009', prefix: 'เด็กชาย', first_name: 'บ่อย', last_name: 'สาย', class_level: '3', room: '1', number: '9', advisor_name: 'ครูเอ' });
api('late.save', adminTok, { student_id: '40009', reason: 'x', date: '2026-07-10' });
api('late.save', adminTok, { student_id: '40009', reason: 'x', date: '2026-07-11' });
var beforeN = api('notify.list', adminTok, {}).items.length;
api('late.save', adminTok, { student_id: '40009', reason: 'x', date: '2026-07-12' });   // ครั้งที่ 3 → crossing
var lateAlert = api('notify.list', adminTok, {}).items;
ok(lateAlert.length > beforeN && lateAlert.some(function (n) { return /มาสายสะสมครบ/.test(n.title); }), 'late frequency alert (ครบ 3) แจ้งเตือน');

// ── NEW: หักคะแนนสะสมข้ามเกณฑ์ 30 → แจ้งเตือน (40001 ถูกหัก 40 → คงเหลือ 60) ──
ok(api('notify.list', adminTok, {}).items.some(function (n) { return /หักเกิน 30/.test(n.title); }), 'behavior deduct alert (เกิน 30) แจ้งเตือน');

// logout
api('auth.logout', adminTok, {});
try { api('student.list', adminTok, {}); ok(false, 'token should be invalid after logout'); } catch (e) { ok(/เซสชัน|เข้าสู่ระบบ/.test(e.message), 'session invalidated after logout'); }

console.log('════════════════════════════════════════');
console.log((fail === 0 ? '✅' : '❌') + ' PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail === 0 ? 0 : 1);
