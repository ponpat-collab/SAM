// client_harness.js — render client SPA ใน jsdom + route google.script.run → backend จริง
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { JSDOM } = require('/tmp/samjsdom/node_modules/jsdom');
const ROOT = path.join(__dirname, '..');

// ── backend (mock GAS) — reuse minimal from harness ──
require('./harness_backend.js'); // sets global backend via _dispatch_
const _dispatch_ = global.__dispatch;

// ── jsdom ──
const dom = new JSDOM('<!DOCTYPE html><html><head></head><body>' +
  '<div id="boot-loader"><div id="boot-text"></div></div>' +
  '<div id="app-root"></div><div id="modal-host"></div><div id="spin-host"></div>' +
  '<script id="sam-boot" type="application/json"></script>' +
  '</body></html>', { url: 'https://script.google.com/exec', pretendToBeVisual: true, runScripts: 'dangerously' });
const win = dom.window, doc = win.document;
if (!win.requestAnimationFrame) win.requestAnimationFrame = function (fn) { return setTimeout(fn, 0); };
win.Swal = { fire: function () { return Promise.resolve({ isConfirmed: true }); } };

// mock google.script.run → backend
win.google = { script: { run: (function () {
  var sh = null, fh = null;
  var obj = {
    withSuccessHandler: function (f) { sh = f; return obj; },
    withFailureHandler: function (f) { fh = f; return obj; },
    api: function (req) { setTimeout(function () { try { var out = { ok: true, data: _dispatch_(req) }; if (sh) sh(out); } catch (e) { if (sh) sh({ ok: false, error: e.message }); } sh = fh = null; }, 0); }
  };
  return obj;
})() } };

// boot data = public bundle
var pub = _dispatch_({ action: 'app.bootstrap', token: '', payload: {} });
doc.getElementById('sam-boot').textContent = JSON.stringify({ boot: pub });

// ── load client bundle ──
function inertBody(file) { var t = fs.readFileSync(path.join(ROOT, file), 'utf8'); var m = t.match(/<script[^>]*>([\s\S]*)<\/script>/); return m[1]; }
var clientSrc = [inertBody('ScriptsCore.html'), inertBody('ScriptsPages.html'), inertBody('ScriptsPages2.html')].join('\n');
var scriptEl = doc.createElement('script'); scriptEl.textContent = clientSrc; doc.body.appendChild(scriptEl);

var pass = 0, fail = 0;
function warn5() { return Array.from(doc.querySelectorAll('#toast-host .toast')).filter(function (t) { return /ครบ 5 หลัก/.test(t.textContent); }).length; }
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }

console.log('════ CLIENT HARNESS (jsdom) ════');
ok(typeof win.SAM.boot === 'function' && typeof win.SAM.wireGlobal === 'function', 'SAM.boot/wireGlobal exist');
ok(Object.keys(win.SAM.Routes).length >= 15, 'routes registered: ' + Object.keys(win.SAM.Routes).length);

win.SAM.wireGlobal();
win.SAM.boot();

setTimeout(function () {
  // login rendered (no token)
  ok(!!doc.querySelector('.lf-stage'), 'login screen rendered');
  ok(!!doc.querySelector('.lf-demo-card'), 'demo cards rendered');
  ok(!!doc.querySelector('#lf-form'), 'login form present');
  ok(!!doc.querySelector('[data-selfsvc="late"]') && !!doc.querySelector('[data-selfsvc="leave"]'), 'self-service buttons on login');
  ok(!!win.SAM.Routes['#/board'], 'live board route registered');

  // ── v1.1.0: self-service (นักเรียนบันทึกเอง) ก็ต้องล็อก 5 หลัก ──
  doc.querySelector('[data-selfsvc="late"]').click();
  setTimeout(function () {
    var ssi = doc.querySelector('#ss-id'), n = 0, _a = win.google.script.run.api;
    win.google.script.run.api = function (req) { if (req.action === 'public.student_lookup') n++; return _a.apply(this, arguments); };
    ok(!!ssi && ssi.getAttribute('maxlength') === '5', 'self-service: ช่องรหัส maxlength=5');
    ssi.value = '3000'; ssi.dispatchEvent(new win.Event('input', { bubbles: true }));
    setTimeout(function () {
      ok(n === 0, 'self-service: พิมพ์ 4 หลัก → ไม่ค้นหาเอง');
      ok(warn5() === 0, 'self-service: พิมพ์ 4 หลักแล้วหยุด → ไม่เด้งเตือนเอง (auto-trigger เฉพาะครบ 5)');
      doc.querySelector('#ss-form').dispatchEvent(new win.Event('submit', { cancelable: true, bubbles: true }));
      ok(n === 0, 'self-service: กด Enter ตอนยังไม่ครบ → ไม่ค้นหา (เตือนแทน)');
      ssi.value = '30001'; ssi.dispatchEvent(new win.Event('input', { bubbles: true }));
      setTimeout(function () {
        ok(n === 1, 'self-service: ครบ 5 หลัก → ค้นหาอัตโนมัติ');
        win.google.script.run.api = _a;
        doc.querySelector('[data-ssback]').click();
        setTimeout(doLogin, 80);
      }, 700);
    }, 700);
  }, 60);
}, 200);

function doLogin() {
  // simulate admin login (shim jsdom form named-access — Chrome supports natively)
  var uf = doc.querySelector('#lf-form');
  ['username', 'password'].forEach(function (n) { Object.defineProperty(uf, n, { value: uf.elements.namedItem(n), configurable: true }); });
  uf.username.value = 'admin'; uf.password.value = '123456';
  uf.dispatchEvent(new win.Event('submit', { cancelable: true, bubbles: true }));

  setTimeout(function () {
    ok(!!doc.querySelector('.shell'), 'shell rendered after login (hash=' + win.location.hash + ')');
    ok(!!doc.querySelector('.sidebar'), 'sidebar rendered');
    ok(!!doc.querySelector('.navbar'), 'navbar rendered');
    ok(!!doc.getElementById('page'), 'page container present');
    ok(doc.querySelectorAll('.sb-link').length > 5, 'nav links: ' + doc.querySelectorAll('.sb-link').length);
    ok(doc.querySelectorAll('#sidebar .sb-badge[data-nb]').length >= 3, 'sidebar count badges present: ' + doc.querySelectorAll('#sidebar .sb-badge[data-nb]').length);

    // dashboard
    win.location.hash = '#/dashboard';
    win.SAM.dispatch();
    setTimeout(function () {  // eslint-disable-line
      var pageHtml = doc.getElementById('page').innerHTML;
      ok(pageHtml.indexOf('hero') >= 0 || pageHtml.indexOf('kpi') >= 0 || pageHtml.indexOf('stat') >= 0, 'dashboard content rendered');

      // navigate to students
      win.location.hash = '#/students';
      win.SAM.dispatch();
      setTimeout(function () {
        ok(!!doc.querySelector('#stu-list') || !!doc.querySelector('.toolbar'), 'students page rendered');

        // scan late
        win.location.hash = '#/scan/late';
        win.SAM.dispatch();
        setTimeout(function () {
          ok(!!doc.querySelector('#scan-input'), 'scan late page rendered');
          // ── v1.1.0: ล็อกค้นหา 5 หลัก — พิมพ์ 4 ตัวต้องไม่ยิง lookup · ครบ 5 ค่อยยิง ──
          var si = doc.querySelector('#scan-input'), lookups = 0, _api = win.google.script.run.api;
          win.google.script.run.api = function (req) { if (req.action === 'student.lookup') lookups++; return _api.apply(this, arguments); };
          ok(si.getAttribute('maxlength') === '5', 'scan-input maxlength=5');
          var th0 = doc.getElementById('toast-host'); if (th0) th0.innerHTML = '';   // ล้าง toast ที่ค้างจากเทสต์ self-service
          si.value = '3000'; si.dispatchEvent(new win.Event('input', { bubbles: true }));
          setTimeout(function () {
            ok(lookups === 0, 'พิมพ์ 4 หลัก + รอ 700ms → ไม่ค้นหาเอง (เคสลูกค้า)');
            ok(warn5() === 0, 'สแกน: พิมพ์ 4 หลักแล้วหยุด → ไม่เด้งเตือนเอง (auto-trigger เฉพาะครบ 5)');
            si.value = '3000a'; si.dispatchEvent(new win.Event('input', { bubbles: true }));
            ok(si.value === '3000', 'ตัดอักขระที่ไม่ใช่ตัวเลขทิ้ง');
            si.value = '30001'; si.dispatchEvent(new win.Event('input', { bubbles: true }));
            setTimeout(function () {
              ok(lookups === 1, 'ครบ 5 หลัก → ค้นหาอัตโนมัติ 1 ครั้ง (lookups=' + lookups + ')');
              var pvHtml = (doc.querySelector('#scan-preview') || {}).innerHTML || '';
              ok(!!doc.querySelector('#late-arrive'), 'ฟอร์มมาสายมีช่อง "เวลาที่มาถึง" (ครูแก้ได้)');
              ok(/คะแนนมาสายสะสม/.test(pvHtml) && /คะแนนความประพฤติสะสม/.test(pvHtml), 'preview แสดง 2 ก้อน (ความประพฤติ + มาสาย)');
              ok(/ครั้งนี้จะเป็นครั้งที่/.test(pvHtml), 'preview บอกว่าครั้งนี้เป็นครั้งที่เท่าไร/หักเท่าไร');
              win.google.script.run.api = _api;
              // กดบันทึกจริงผ่าน UI ด้วยเวลามาถึง 09:05 → DB ต้องเก็บ arrive_time + term
              var ar = doc.querySelector('#late-arrive'), sv = doc.querySelector('#late-save');
              if (ar && sv) {
                ar.value = '09:05'; sv.click();
                setTimeout(function () {
                  var tok = win.SAM.Store.token;
                  var lst = _dispatch_({ action: 'late.list', token: tok, payload: { student_id: '30001' } });
                  var rec = lst.items[0] || {};
                  ok(rec.arrive_time === '09:05', '★★ กดบันทึกผ่าน UI → DB เก็บเวลามาถึงที่ครูแก้ (' + rec.arrive_time + ')');
                  ok(rec.rank === 1 && rec.deduct === 0, 'รายการแรกหลังเวลาตัด = ครั้งที่ 1 ยังไม่หัก');
                  nextAfterScan();
                }, 300);
              } else { ok(false, 'มีช่องเวลา + ปุ่มบันทึก'); nextAfterScan(); }
            }, 700);
          }, 700);
          function nextAfterScan() {

          // admin settings
          win.location.hash = '#/admin/settings';
          win.SAM.dispatch();
          setTimeout(function () {
            ok(!!doc.querySelector('[data-set="org_name"]') || !!doc.querySelector('#set-form'), 'settings page rendered');
            ok(!!doc.querySelector('[data-set="current_term"]') && !!doc.querySelector('[data-set="late_cutoff_time"]') && !!doc.querySelector('[data-set="late_deduct_table"]'), 'ตั้งค่า: ภาคเรียน + เวลาตัด + ตารางหักมาสาย');
            ok(!!doc.querySelector('[data-set="alert_level_4"]') && (doc.querySelector('[data-set="alert_level_1"]') || {}).value === '40', 'ตั้งค่า: เกณฑ์ 4 ระดับ (ระดับ 1 = 40)');
            ok(!!doc.querySelector('#set-next-term'), 'ปุ่มขึ้นภาคเรียนใหม่');
            ok(!doc.querySelector('[data-setck="late_auto_deduct"]') && !doc.querySelector('[data-set="start_score"]'), 'ตั้งค่าเก่า (หักอัตโนมัติ/คะแนนตั้งต้น) ถูกเอาออก');

            // ── A.printDoc ต้องสร้างเอกสารจริง (เคสจริง: TH.dateTime ไม่มี → ปุ่มพิมพ์ตายเงียบทุกจุด) ──
            var printed = 0; win.print = function () { printed++; };
            try {
              win.SAM.printDoc({
                title: 'ทดสอบพิมพ์', sub: 'ช่วงทดสอบ', summary: '<b>สรุป</b>',
                html: win.SAM.prTable([{ label: 'คอลัมน์', k: 'a' }], [{ a: 'ค่า1' }])
              });
              var pd = doc.querySelector('.pr-only');
              ok(!!pd, 'printDoc สร้างเอกสาร .pr-only');
              ok(printed === 1, 'printDoc เรียก window.print()');
              ok(doc.body.classList.contains('prt-on'), 'printDoc ใส่ body.prt-on (CSS ซ่อนแอปเฉพาะตอนพิมพ์)');
              ok(/ทดสอบพิมพ์/.test(pd.innerHTML) && /ค่า1/.test(pd.innerHTML), 'เอกสารมีหัวเรื่อง + ข้อมูลตาราง');
            } catch (e) { ok(false, 'printDoc ทำงานได้: ' + e.message); }

            // ปุ่มพิมพ์ในหน้ารายงานรายบุคคลต้องกดแล้วได้เอกสารจริง
            win.location.hash = '#/report/student?id=30001';
            win.SAM.dispatch();
            setTimeout(function () {
              ok(doc.querySelectorAll('#page .ring').length === 2 && /ความประพฤติสะสม/.test(doc.getElementById('page').innerHTML) && /คะแนนมาสาย/.test(doc.getElementById('page').innerHTML), 'รายงานรายบุคคล: 2 วงแหวน (ความประพฤติ + มาสาย)');
              var btn = doc.querySelector('#sr-print');
              ok(!!btn, 'หน้ารายงานรายบุคคลมีปุ่มพิมพ์');
              if (btn) {
                var before = printed;
                var oldDoc = doc.querySelector('.pr-only'); if (oldDoc) oldDoc.remove();
                try { btn.click(); } catch (e) {}
                ok(printed === before + 1 && !!doc.querySelector('.pr-only'), 'กดปุ่มพิมพ์รายงานรายบุคคล → สร้างเอกสาร + สั่งพิมพ์จริง');
              }
              console.log('════════════════════════════════════════');
              console.log((fail === 0 ? '✅' : '❌') + ' CLIENT PASS ' + pass + ' / FAIL ' + fail);
              process.exit(fail === 0 ? 0 : 1);
            }, 200);
            return;
          }, 60);
          }
        }, 60);
      }, 60);
    }, 120);
  }, 700);
}
