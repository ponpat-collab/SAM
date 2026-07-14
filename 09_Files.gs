/**
 * ═══════════════════════════════════════════════════════════════
 *  ระบบงานปกครองนักเรียน · Student Affairs Management System (SAM)
 *  File:        09_Files.gs — อัปโหลดรูปหลักฐานเข้า Drive → ลิงก์ lh3
 *  Version:     1.0.0
 *  Last Update: 2026-07-13
 *  Developer:   ครูวิรัตน์  หาดคำ · www.kruwirat.com
 *  License:     Proprietary · © 2026
 *  Notice:      ห้ามจำหน่าย · แบ่งปันเพื่อการศึกษาและต่อยอดเท่านั้น (ใช้เชิงพาณิชย์ต้องได้รับอนุญาตจากผู้พัฒนา)
 * ═══════════════════════════════════════════════════════════════
 */

var FILE_ALLOWED_MIME = Object.freeze(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
var FILE_MAX_BYTES = 6 * 1024 * 1024;
var FILE_SUBFOLDERS = Object.freeze(['หลักฐานลากลับ', 'หลักฐานพฤติกรรม']);

function _rootFolder_() {
  var ssId = _ss_().getId();
  var file = DriveApp.getFileById(ssId);
  var parents = file.getParents();
  var parent = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  var name = _ss_().getName();
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}
function _subFolder_(root, path) {
  var cur = root;
  path.split('/').forEach(function (part) {
    if (!part) return;
    var it = cur.getFoldersByName(part);
    cur = it.hasNext() ? it.next() : cur.createFolder(part);
  });
  return cur;
}

function Files_upload(user, p) {
  Auth_requireCap(user, 'file.upload');
  var dataUrl = String((p && p.data) || '');
  var m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error('รูปแบบไฟล์ไม่ถูกต้อง');
  var mime = m[1];
  if (FILE_ALLOWED_MIME.indexOf(mime) < 0) throw new Error('รองรับเฉพาะไฟล์รูปภาพ (JPG/PNG/WEBP)');
  var bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > FILE_MAX_BYTES) throw new Error('ไฟล์ใหญ่เกิน 6MB');
  var sub = FILE_SUBFOLDERS.indexOf(String((p && p.folder) || '')) >= 0 ? String(p.folder) : 'หลักฐานลากลับ';
  var ym = cfg_dateOnly_(new Date()).substring(0, 7);
  var settings = Settings_map_();
  var ay = settings.academic_year || '2569';
  var folder = _subFolder_(_rootFolder_(), sub + '/' + ay + '-' + ym.substring(5));
  var ext = mime === 'image/png' ? 'png' : (mime === 'image/webp' ? 'webp' : 'jpg');
  var fname = String((p && p.name) || (cfg_yymm_() + '_' + Date.now())).replace(/[\/\\:*?"<>|]/g, '_').substring(0, 80) + '.' + ext;
  var blob = Utilities.newBlob(bytes, mime, fname);
  var file = folder.createFile(blob);
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }
  catch (e) { try { file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW); } catch (e2) {} }
  var id = file.getId();
  Audit_log_(user, 'file.upload', 'file', id, { folder: sub });
  return { id: id, url: 'https://lh3.googleusercontent.com/d/' + id, view: 'https://drive.google.com/file/d/' + id + '/view' };
}
