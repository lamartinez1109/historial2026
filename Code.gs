/**
 * =========================================================
 * HISTORIAL ESCOLAR 2026 · API en Google Apps Script
 * Lee las respuestas del Google Forms (hoja de cálculo) y las
 * entrega al sitio web en formato JSON. No expone credenciales.
 * =========================================================
 */

/* ---------- CONFIGURACIÓN ---------- */
const CONFIG = {
  // ID de la hoja de respuestas (la parte larga de la URL, entre /d/ y /edit)
  SPREADSHEET_ID: '1UK3SmoYPcaZ7e9WEuQOEWLl_GzOLf2HzygezoTCxxV4',
  // Pestaña de respuestas, identificada por su gid (el número después de "gid=" en la URL).
  // Si no se encuentra, se usa la primera pestaña.
  SHEET_GID: 282001144,
  // Segundos que se guarda la respuesta en caché (acelera el sitio). Poner 0 para desactivar.
  CACHE_SECONDS: 120,
  // Ancho de las imágenes pedidas a Drive (px)
  IMG_WIDTH: 1400
};

/* Palabras clave para reconocer cada columna sin depender del texto exacto de la pregunta.
   Se compara sin tildes y en minúsculas. Se usa la PRIMERA columna que contenga la palabra. */
const COLUMNS = {
  timestamp: ['marca temporal', 'timestamp'],
  category:  ['categoria', 'tipo de acontecimiento', 'seccion', 'tipo de'],
  title:     ['titulo', 'nombre del', 'acontecimiento'],
  date:      ['fecha'],
  text:      ['resena', 'descripcion', 'relato', 'breve'],
  images:    ['foto', 'imagen', 'imagenes', 'archivo']
};

/* Los grados llegan de una cuadrícula del Forms: una columna por grado
   ("Grado [1°]", "Grado [2°]"...) cuyo valor son las divisiones marcadas ("A, B, C"). */
const GRADE_HEADER = /^grado\s*\[(.+?)\]/;

/* ---------- PUNTO DE ENTRADA WEB ---------- */
function doGet() {
  try {
    const cache = CacheService.getScriptCache();
    if (CONFIG.CACHE_SECONDS > 0) {
      const hit = cache.get('events_json');
      if (hit) return json_(hit);
    }
    const out = JSON.stringify({ events: readEvents_(), updated: new Date().toISOString() });
    // La caché admite hasta ~100 KB; si es mayor simplemente no se guarda.
    if (CONFIG.CACHE_SECONDS > 0 && out.length < 95000) cache.put('events_json', out, CONFIG.CACHE_SECONDS);
    return json_(out);
  } catch (err) {
    return json_(JSON.stringify({ error: String(err), events: [] }));
  }
}

function json_(text) {
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- LECTURA DE LA HOJA ---------- */
function readEvents_() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheets().filter(function (s) { return s.getSheetId() === CONFIG.SHEET_GID; })[0] || ss.getSheets()[0];
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0].map(norm_);
  const idx = {};
  Object.keys(COLUMNS).forEach(function (k) { idx[k] = findCol_(headers, COLUMNS[k], idx); });
  // Columnas de grado: [{col: 2, grade: '1°'}, ...]
  const gradeCols = [];
  headers.forEach(function (h, c) { const m = h.match(GRADE_HEADER); if (m) gradeCols.push({ col: c, grade: m[1].trim() }); });

  const events = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const get = function (k) { return idx[k] >= 0 ? row[idx[k]] : ''; };
    if (row.join('').trim() === '') continue;                 // fila vacía

    const images = parseImages_(get('images'));
    const gradeList = [], gradeParts = [];
    gradeCols.forEach(function (g) {
      const v = String(row[g.col] || '').trim();
      if (v) { gradeList.push(g.grade); gradeParts.push(g.grade + ' (' + v + ')'); }
    });
    events.push({
      id: 'r' + (r + 1),
      category: String(get('category') || '').trim(),
      title: String(get('title') || '').trim() || 'Sin título',
      grades: gradeParts.join(' · '),     // para mostrar: "1° (A, B) · 3° (C)"
      gradeList: gradeList,               // para filtrar: ["1°", "3°"]
      date: toIso_(get('date')),
      timestamp: toIso_(get('timestamp')),
      text: String(get('text') || '').trim(),
      images: images
    });
  }
  return events;
}

/* Busca la columna cuyo encabezado contiene alguna palabra clave (y que no esté ya usada). */
function findCol_(headers, keys, used) {
  const taken = Object.keys(used).map(function (k) { return used[k]; });
  for (let k = 0; k < keys.length; k++) {
    for (let c = 0; c < headers.length; c++) {
      if (taken.indexOf(c) === -1 && headers[c].indexOf(keys[k]) !== -1) return c;
    }
  }
  return -1;
}

/* ---------- IMÁGENES DE GOOGLE DRIVE ---------- */
/* Google Forms guarda los enlaces separados por coma: https://drive.google.com/open?id=XXXX
   Se extrae el ID, se comparte el archivo "con enlace" (lectura) y se devuelve una URL
   de miniatura que los navegadores pueden mostrar dentro de <img>. */
function parseImages_(cell) {
  if (!cell) return [];
  const ids = [];
  String(cell).split(/[,\n]+/).forEach(function (part) {
    const m = part.match(/[-\w]{25,}/);                      // los IDs de Drive tienen 25+ caracteres
    if (m && ids.indexOf(m[0]) === -1) ids.push(m[0]);
  });
  return ids.map(function (id) {
    shareFile_(id);
    return 'https://drive.google.com/thumbnail?id=' + id + '&sz=w' + CONFIG.IMG_WIDTH;
  });
}

function shareFile_(id) {
  try {
    const f = DriveApp.getFileById(id);
    if (f.getSharingAccess() !== DriveApp.Access.ANYONE_WITH_LINK && f.getSharingAccess() !== DriveApp.Access.ANYONE) {
      f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    }
  } catch (e) { /* sin permisos o archivo borrado: la imagen simplemente no se verá */ }
}

/* ---------- UTILIDADES ---------- */
function norm_(t) {
  return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}
function toIso_(v) {
  if (!v) return '';
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);       // dd/mm/aaaa
  return m ? m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2) : s;
}

/* ---------- HERRAMIENTAS PARA EL ADMINISTRADOR (se ejecutan a mano) ---------- */

/** Ejecutar UNA vez: autoriza permisos y muestra en el registro lo que el sitio recibirá. */
function probar() {
  const ev = readEvents_();
  Logger.log('Registros leídos: ' + ev.length);
  Logger.log(JSON.stringify(ev.slice(0, 3), null, 2));
}

/** Opcional: hace públicas (solo lectura) todas las fotos de una carpeta de Drive. */
function compartirCarpeta() {
  const FOLDER_ID = 'PEGAR_ID_DE_LA_CARPETA';
  const files = DriveApp.getFolderById(FOLDER_ID).getFiles();
  while (files.hasNext()) files.next().setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
}
