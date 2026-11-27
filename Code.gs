/**
 * =========================================================
 * HISTORIAL ESCOLAR 2026 · API en Google Apps Script
 * - Entrega al sitio los registros de la hoja de respuestas (JSON).
 * - Entrega los archivos adjuntos (fotos y PDF) leyéndolos desde Drive
 *   con el permiso de quien despliega el script. Así se ven aunque la
 *   escuela (Google Workspace) bloquee compartir archivos "con enlace".
 * No expone credenciales. Solo sirve archivos que figuran en la hoja.
 * =========================================================
 */

/* ---------- CONFIGURACIÓN ---------- */
const CONFIG = {
  SPREADSHEET_ID: '1UK3SmoYPcaZ7e9WEuQOEWLl_GzOLf2HzygezoTCxxV4',
  SHEET_GID: 282001144,          // pestaña de respuestas (número después de gid=)
  CACHE_SECONDS: 120,            // caché de la lista de publicaciones (0 = sin caché)
  IMG_WIDTH: 1400,               // ancho de miniaturas de Drive
  MAX_FILE_MB: 25                // tamaño máximo de archivo que se entrega
};

/* Palabras clave de los encabezados (sin tildes, minúsculas). */
const COLUMNS = {
  timestamp: ['marca temporal', 'timestamp'],
  category:  ['categoria', 'tipo de acontecimiento', 'seccion', 'tipo de'],
  title:     ['titulo', 'nombre del', 'acontecimiento'],
  date:      ['fecha'],
  text:      ['resena', 'descripcion', 'relato', 'breve'],
  files:     ['adjuntar', 'archivo', 'foto', 'imagen']
};
/* Cuadrícula de grados: una columna por grado ("Grado [1°]") con las divisiones marcadas. */
const GRADE_HEADER = /^grado\s*\[(.+?)\]/;

/* ---------- PUNTO DE ENTRADA WEB ---------- */
function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    if (p.action === 'file') return serveFile_(p.id, p.w);
    return listEvents_();
  } catch (err) {
    return json_({ error: String(err), events: [] });
  }
}

function listEvents_() {
  const cache = CacheService.getScriptCache();
  if (CONFIG.CACHE_SECONDS > 0) {
    const hit = cache.get('events_json');
    if (hit) return ContentService.createTextOutput(hit).setMimeType(ContentService.MimeType.JSON);
  }
  const out = JSON.stringify({ events: readEvents_(), updated: new Date().toISOString() });
  if (CONFIG.CACHE_SECONDS > 0 && out.length < 95000) cache.put('events_json', out, CONFIG.CACHE_SECONDS);
  return ContentService.createTextOutput(out).setMimeType(ContentService.MimeType.JSON);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- LECTURA DE LA HOJA ---------- */
function readSheet_() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheets().filter(function (s) { return s.getSheetId() === CONFIG.SHEET_GID; })[0] || ss.getSheets()[0];
  const values = sheet.getDataRange().getValues();
  const headers = (values[0] || []).map(norm_);
  const idx = {};
  Object.keys(COLUMNS).forEach(function (k) { idx[k] = findCol_(headers, COLUMNS[k], idx); });
  const gradeCols = [];
  headers.forEach(function (h, c) { const m = h.match(GRADE_HEADER); if (m) gradeCols.push({ col: c, grade: m[1].trim() }); });
  return { values: values, idx: idx, gradeCols: gradeCols };
}

function readEvents_() {
  const S = readSheet_(), events = [];
  for (let r = 1; r < S.values.length; r++) {
    const row = S.values[r];
    if (row.join('').trim() === '') continue;
    const get = function (k) { return S.idx[k] >= 0 ? row[S.idx[k]] : ''; };
    const gradeList = [], gradeParts = [];
    S.gradeCols.forEach(function (g) {
      const v = String(row[g.col] || '').trim();
      if (v) { gradeList.push(g.grade); gradeParts.push(g.grade + ' (' + v + ')'); }
    });
    events.push({
      id: 'r' + (r + 1),
      category: String(get('category') || '').trim(),
      title: String(get('title') || '').trim() || 'Sin título',
      grades: gradeParts.join(' · '),
      gradeList: gradeList,
      date: toIso_(get('date')),
      timestamp: toIso_(get('timestamp')),
      text: String(get('text') || '').trim(),
      files: describeFiles_(extractIds_(get('files')))
    });
  }
  return events;
}

function findCol_(headers, keys, used) {
  const taken = Object.keys(used).map(function (k) { return used[k]; });
  for (let k = 0; k < keys.length; k++)
    for (let c = 0; c < headers.length; c++)
      if (taken.indexOf(c) === -1 && headers[c].indexOf(keys[k]) !== -1) return c;
  return -1;
}

/* ---------- ARCHIVOS ADJUNTOS ---------- */
/* Google Forms guarda: https://drive.google.com/open?id=XXXX, https://drive.google.com/open?id=YYYY */
function extractIds_(cell) {
  const ids = [];
  String(cell || '').split(/[,\n]+/).forEach(function (part) {
    const m = part.match(/[-\w]{25,}/);
    if (m && ids.indexOf(m[0]) === -1) ids.push(m[0]);
  });
  return ids;
}

/* Para cada ID devuelve nombre, tipo (image | pdf | other) y miniatura. */
function describeFiles_(ids) {
  const cache = CacheService.getScriptCache();
  return ids.map(function (id) {
    let meta = null;
    const hit = cache.get('m_' + id);
    if (hit) meta = JSON.parse(hit);
    else {
      try {
        const f = DriveApp.getFileById(id);
        const mime = f.getMimeType();
        meta = { id: id, name: f.getName(), mime: mime,
                 type: mime.indexOf('image/') === 0 ? 'image' : (mime === 'application/pdf' ? 'pdf' : 'other') };
        try { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { /* política del dominio: se usa el respaldo por el script */ }
        cache.put('m_' + id, JSON.stringify(meta), 21600);
      } catch (e) { meta = { id: id, name: 'Archivo no disponible', mime: '', type: 'missing' }; }
    }
    if (meta.type === 'image') {
      // HEIC/HEIF (fotos de iPhone) no se muestran en la mayoría de navegadores:
      // se marcan "proxy" para que el sitio las pida convertidas a JPEG por el script.
      meta.proxy = /hei[cf]/i.test(meta.mime) || /\.hei[cf]$/i.test(meta.name);
      if (!meta.proxy) meta.thumb = 'https://drive.google.com/thumbnail?id=' + id + '&sz=w' + CONFIG.IMG_WIDTH;
    }
    return meta;
  });
}

/* Entrega un archivo en base64 (solo si su ID figura en la hoja). */
function serveFile_(id, width) {
  const S = readSheet_(), allowed = [];
  for (let r = 1; r < S.values.length; r++) extractIds_(S.idx.files >= 0 ? S.values[r][S.idx.files] : '').forEach(function (x) { allowed.push(x); });
  if (!id || allowed.indexOf(id) === -1) return json_({ error: 'Archivo no autorizado' });
  const f = DriveApp.getFileById(id);
  // Imágenes: se pide a Drive una versión JPEG redimensionada (convierte HEIC y pesa menos).
  if (f.getMimeType().indexOf('image/') === 0) {
    const jpg = thumbnailJpeg_(id, Math.min(parseInt(width, 10) || CONFIG.IMG_WIDTH, 2000));
    if (jpg) return json_({ name: f.getName().replace(/\.[^.]+$/, '') + '.jpg', mime: 'image/jpeg', data: Utilities.base64Encode(jpg) });
  }
  if (f.getSize() > CONFIG.MAX_FILE_MB * 1048576) return json_({ error: 'Archivo demasiado grande' });
  const b = f.getBlob();
  return json_({ name: f.getName(), mime: b.getContentType(), data: Utilities.base64Encode(b.getBytes()) });
}

/* Miniatura JPEG generada por Drive, pedida con la autorización del dueño del script. */
function thumbnailJpeg_(id, w) {
  try {
    const r = UrlFetchApp.fetch('https://drive.google.com/thumbnail?id=' + id + '&sz=w' + w, {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true, followRedirects: true });
    const type = String(r.getHeaders()['Content-Type'] || r.getHeaders()['content-type'] || '');
    if (r.getResponseCode() === 200 && type.indexOf('image/') === 0) return r.getContent();
  } catch (e) { /* se usa el archivo original */ }
  return null;
}

/* ---------- UTILIDADES ---------- */
function norm_(t) { return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); }
function toIso_(v) {
  if (!v) return '';
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2) : s;
}

/* ---------- PARA EL ADMINISTRADOR (ejecutar a mano) ---------- */
/** Ejecutar UNA vez: autoriza Hojas + Drive y muestra qué recibirá el sitio. */
function probar() {
  const ev = readEvents_();
  UrlFetchApp.fetch('https://www.google.com', { muteHttpExceptions: true });   // pide el permiso de conexión externa
  Logger.log('Registros: ' + ev.length);
  Logger.log(JSON.stringify(ev.slice(0, 3), null, 2));
}
