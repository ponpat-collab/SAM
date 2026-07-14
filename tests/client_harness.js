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

          // admin settings
          win.location.hash = '#/admin/settings';
          win.SAM.dispatch();
          setTimeout(function () {
            ok(!!doc.querySelector('[data-set="org_name"]') || !!doc.querySelector('#set-form'), 'settings page rendered');
            console.log('════════════════════════════════════════');
            console.log((fail === 0 ? '✅' : '❌') + ' CLIENT PASS ' + pass + ' / FAIL ' + fail);
            process.exit(fail === 0 ? 0 : 1);
          }, 60);
        }, 60);
      }, 60);
    }, 120);
  }, 700);
}, 200);
