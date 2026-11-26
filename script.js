/* =========================================================
   HISTORIAL ESCOLAR 2026 · Lógica del sitio (JavaScript vanilla)
   ========================================================= */

/* ---------- 1. CONFIGURACIÓN (lo único que hay que editar) ---------- */
const CONFIG = {
  // Pegar aquí la URL de la "aplicación web" de Apps Script (termina en /exec).
  // Mientras esté vacía, el sitio muestra DATOS DE DEMOSTRACIÓN.
  API_URL: "https://script.google.com/macros/s/AKfycbztBYV9mmh-zTxVb7HGG6ZRznWbwUE4h1j0WweyS5pEhAXdYlvOoY1--a-LJbz8yTR_uw/exec",
  // Imagen de fondo de la portada (opcional). Ej.: "fondo.jpg". Vacío = fondo institucional.
  HERO_IMAGE: ""
};

/* Categorías. "keys" son palabras que, si aparecen en lo que eligió el docente
   en el formulario, asignan la publicación a esa sección (sin tildes, minúsculas). */
const CATEGORIES = [
  { id:"actos",       name:"Actos escolares", icon:"🇦🇷", color:"#c8202f", keys:["acto"],
    desc:"Actos patrios, conmemoraciones, celebraciones y fechas significativas." },
  { id:"proyectos",   name:"Proyectos institucionales", icon:"📚", color:"#3f9a39", keys:["proyecto"],
    desc:"Experiencias pedagógicas y propuestas de enseñanza de los distintos grados." },
  { id:"ferias",      name:"Ferias de ciencias", icon:"🔬", color:"#2a7fb8", keys:["feria","ciencia"],
    desc:"Investigaciones, experiencias científicas, producciones y exposiciones." },
  { id:"salidas",     name:"Salidas educativas", icon:"🚌", color:"#e08a1e", keys:["salida","excursion","visita"],
    desc:"Visitas didácticas, recorridos y experiencias fuera de la institución." },
  { id:"actividades", name:"Actividades deportivas, culturales y recreativas", icon:"⚽", color:"#8b4fb8", keys:["deport","cultural","recreativ","muestra"],
    desc:"Encuentros deportivos, muestras artísticas, música y recreación." },
  { id:"encuentros",  name:"Participación en encuentros y programas educativos", icon:"🤝", color:"#1d8f8a", keys:["encuentro","programa","exposicion"],
    desc:"Experiencias vinculadas con programas provinciales, nacionales o institucionales." },
  { id:"distinciones",name:"Distinciones", icon:"🏅", color:"#f2c230", keys:["distincion","premio","reconocimiento"],
    desc:"Premios y reconocimientos recibidos por la comunidad educativa." }
];

/* ---------- 2. UTILIDADES ---------- */
const $ = (s, el = document) => el.querySelector(s);
const norm = t => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));

/** Asigna un id de categoría a partir del texto libre del formulario. */
function categoryOf(raw) {
  const t = norm(raw);
  const hit = CATEGORIES.find(c => c.keys.some(k => t.includes(k)));
  return hit ? hit.id : null;
}
/** Separa "3° A, 4° B y 5°" en ["3° A","4° B","5°"]. */
function gradesOf(e) {
  return Array.isArray(e.gradeList) ? e.gradeList : splitGrades(e.grades);
}
function splitGrades(g) {
  return String(g || "").split(/[,;\/\n]|\sy\s/i).map(s => s.trim()).filter(Boolean);
}
/** Fecha legible; si no se puede interpretar, devuelve el texto original. */
function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + (iso.length === 10 ? "T12:00:00" : ""));
  return isNaN(d) ? iso : d.toLocaleDateString("es-AR", { day:"numeric", month:"long", year:"numeric" });
}
const ts = e => { const d = new Date(e.date || e.timestamp || 0); return isNaN(d) ? 0 : d.getTime(); };

/* ---------- 3. DATOS DE DEMOSTRACIÓN (no son hechos reales de la escuela) ---------- */
function demoImg(label, hue) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='600'><rect width='800' height='600' fill='hsl(${hue},45%,32%)'/><text x='400' y='290' font-size='46' fill='#fff' text-anchor='middle' font-family='sans-serif'>FOTO DE EJEMPLO</text><text x='400' y='350' font-size='30' fill='#ffe58a' text-anchor='middle' font-family='sans-serif'>${label}</text></svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}
function demoData() {
  const mk = (i, cat, title, grades, date, text, n) => ({
    id: "demo" + i, category: cat, title, grades, date, text,
    images: Array.from({ length: n }, (_, k) => demoImg("Imagen " + (k + 1), i * 47 + k * 20)), demo: true });
  return [
    mk(1,"Actos escolares","[DEMO] Acto de ejemplo","Todos los grados","2026-05-25","Texto de demostración. Aquí se mostrará la reseña completa que el docente cargue en el formulario.",3),
    mk(2,"Proyectos institucionales","[DEMO] Proyecto de ejemplo","4° y 5° grado","2026-04-10","Texto de demostración de un proyecto institucional.",2),
    mk(3,"Ferias de ciencias","[DEMO] Feria de ejemplo","6° grado","2026-09-18","Texto de demostración de una feria de ciencias.",1),
    mk(4,"Salidas educativas","[DEMO] Salida de ejemplo","1° y 2° grado","2026-06-02","Texto de demostración de una salida educativa.",2),
    mk(5,"Actividades deportivas, culturales y recreativas","[DEMO] Muestra de ejemplo","3° grado","2026-10-05","Texto de demostración de una actividad.",1),
    mk(6,"Participación en encuentros","[DEMO] Encuentro de ejemplo","7° grado","",  "Registro sin fecha: se ubica al final del orden cronológico.",0)
  ];
}

/* ---------- 4. ESTADO ---------- */
let EVENTS = [];
const F = { q:"", cat:"", grade:"", order:"desc" };

/* ---------- 5. CARGA DE DATOS ---------- */
async function loadData() {
  const st = $("#status");
  st.className = "status";
  st.innerHTML = '<div class="spinner"></div>Cargando publicaciones…';
  try {
    if (!CONFIG.API_URL) { EVENTS = demoData(); }
    else {
      const res = await fetch(CONFIG.API_URL);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      EVENTS = (json.events || []).map(e => ({ ...e, category: e.category }));
    }
    st.innerHTML = "";
    if (!CONFIG.API_URL) st.innerHTML = '<div class="demo-flag">Modo demostración: contenido de ejemplo. Configurá API_URL en script.js.</div>';
    buildGradeFilter();
    render();
  } catch (err) {
    console.error(err);
    st.className = "status status--error";
    st.innerHTML = "No se pudieron obtener las publicaciones. Revisá tu conexión y volvé a intentar. " +
      '<br><button class="btn btn--ghost" id="retry" type="button">Reintentar</button>';
    $("#retry").onclick = loadData;
    render(); // dibuja las secciones vacías
  }
}

/* ---------- 6. RENDER ---------- */
function buildSections() {
  $("#sections").innerHTML = CATEGORIES.map(c => `
    <section class="section" id="${c.id}" style="--sec:${c.color}">
      <div class="section__head"><span class="section__icon" aria-hidden="true">${c.icon}</span><h2>${esc(c.name)}</h2></div>
      <p class="section__desc">${esc(c.desc)}</p>
      <div class="section__rule"></div>
      <div class="grid" id="grid-${c.id}"></div>
    </section>`).join("");
  $("#fCat").innerHTML = '<option value="">Todas las categorías</option>' +
    CATEGORIES.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
}
function buildGradeFilter() {
  const set = new Set();
  EVENTS.forEach(e => gradesOf(e).forEach(g => set.add(g)));
  const list = [...set].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  $("#fGrade").innerHTML = '<option value="">Todos los grados</option>' + list.map(g => `<option>${esc(g)}</option>`).join("");
}
function filtered() {
  const q = norm(F.q);
  return EVENTS.filter(e =>
    (!q || norm(e.title).includes(q)) &&
    (!F.grade || gradesOf(e).includes(F.grade))
  ).sort((a, b) => {
    // Sin fecha → siempre al final
    if (!ts(a) && !ts(b)) return 0; if (!ts(a)) return 1; if (!ts(b)) return -1;
    return F.order === "asc" ? ts(a) - ts(b) : ts(b) - ts(a);
  });
}
function cardHTML(e, idx) {
  const img = e.images && e.images[0]
    ? `<img src="${esc(e.images[0])}" alt="${esc(e.title)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'noimg',textContent:'📷'}))">`
    : '<div class="noimg">📷</div>';
  const n = (e.images || []).length;
  const cat = CATEGORIES.find(c => c.id === e._cat);
  return `<button class="card reveal" data-i="${idx}" type="button" aria-label="Abrir: ${esc(e.title)}">
    <div class="card__img">${img}${n > 1 ? `<span class="card__count">${n} fotos</span>` : ""}</div>
    <div class="card__body">
      <span class="chip">${esc(cat ? cat.name : "Otros")}</span>
      <h3>${esc(e.title || "Sin título")}</h3>
      <p class="meta">${esc([e.grades, fmtDate(e.date)].filter(Boolean).join(" · "))}</p>
      <p>${esc(e.text || "")}</p>
    </div></button>`;
}
function render() {
  EVENTS.forEach(e => { e._cat = categoryOf(e.category); });
  const list = filtered();
  const shown = [];
  CATEGORIES.forEach(c => {
    const grid = $("#grid-" + c.id);
    const items = list.filter(e => e._cat === c.id);
    const hide = F.cat && F.cat !== c.id;
    grid.closest("section").hidden = hide;
    if (hide) return;
    grid.innerHTML = items.length
      ? items.map(e => { shown.push(e); return cardHTML(e, EVENTS.indexOf(e)); }).join("")
      : `<p class="empty">${(F.q || F.grade) ? "No hay publicaciones que coincidan con la búsqueda." : "Todavía no hay publicaciones en esta sección. ¡Pronto vas a ver acá nuevas experiencias!"}</p>`;
  });
  $("#count").textContent = EVENTS.length ? `${shown.length} publicación(es) mostradas de ${EVENTS.length}` : "";
  observeReveal();
}

/* ---------- 7. APARICIÓN AL DESPLAZARSE ---------- */
const io = "IntersectionObserver" in window ? new IntersectionObserver(es => es.forEach(x => {
  if (x.isIntersecting) { x.target.classList.add("is-in"); io.unobserve(x.target); }
}), { threshold: .12 }) : null;
function observeReveal() {
  document.querySelectorAll(".reveal:not(.is-in)").forEach(el => io ? io.observe(el) : el.classList.add("is-in"));
}

/* ---------- 8. MODAL Y GALERÍA ---------- */
let cur = null, gi = 0;
function openModal(i) {
  cur = EVENTS[i]; if (!cur) return; gi = 0;
  const cat = CATEGORIES.find(c => c.id === cur._cat);
  $("#mCat").textContent = cat ? cat.name : "Otros";
  $("#mTitle").textContent = cur.title || "Sin título";
  $("#mMeta").textContent = [cur.grades && "Grado/s: " + cur.grades, fmtDate(cur.date)].filter(Boolean).join(" · ");
  $("#mText").textContent = cur.text || "Sin reseña.";
  showPhoto(0);
  $("#modal").hidden = false;
  document.body.style.overflow = "hidden";
  $(".modal__close").focus();
}
function showPhoto(n) {
  const imgs = cur.images || [];
  const mImg = $("#mImg");
  gi = (n + imgs.length) % (imgs.length || 1);
  mImg.style.display = imgs.length ? "" : "none";
  if (imgs.length) { mImg.src = imgs[gi]; mImg.alt = cur.title; }
  $("#gPrev").hidden = $("#gNext").hidden = imgs.length < 2;
  $("#gThumbs").innerHTML = imgs.length < 2 ? "" : imgs.map((u, k) =>
    `<button type="button" data-k="${k}" class="${k === gi ? "is-on" : ""}" aria-label="Foto ${k + 1}"><img src="${esc(u)}" alt="" referrerpolicy="no-referrer"></button>`).join("");
}
function closeModal() { $("#modal").hidden = true; document.body.style.overflow = ""; }

/* ---------- 9. EVENTOS ---------- */
function init() {
  if (CONFIG.HERO_IMAGE) $("#heroBg").style.backgroundImage = `url(${CONFIG.HERO_IMAGE})`;
  buildSections();

  // Filtros
  $("#fSearch").oninput = e => { F.q = e.target.value; render(); };
  $("#fCat").onchange   = e => { F.cat = e.target.value; render(); };
  $("#fGrade").onchange = e => { F.grade = e.target.value; render(); };
  $("#fOrder").onchange = e => { F.order = e.target.value; render(); };
  $("#fReset").onclick  = () => { Object.assign(F, { q:"", cat:"", grade:"", order:"desc" });
    ["fSearch","fCat","fGrade"].forEach(id => $("#" + id).value = ""); $("#fOrder").value = "desc"; render(); };

  // Tarjetas → modal
  $("#sections").addEventListener("click", e => { const c = e.target.closest(".card"); if (c) openModal(+c.dataset.i); });
  $("#modal").addEventListener("click", e => { if (e.target.hasAttribute("data-close")) closeModal(); const t = e.target.closest("[data-k]"); if (t) showPhoto(+t.dataset.k); });
  $("#gPrev").onclick = () => showPhoto(gi - 1);
  $("#gNext").onclick = () => showPhoto(gi + 1);
  document.addEventListener("keydown", e => {
    if ($("#modal").hidden) return;
    if (e.key === "Escape") closeModal();
    if (e.key === "ArrowLeft") showPhoto(gi - 1);
    if (e.key === "ArrowRight") showPhoto(gi + 1);
  });

  // Menú hamburguesa
  const tg = $("#navToggle"), menu = $("#navMenu");
  tg.onclick = () => { const o = menu.classList.toggle("is-open"); tg.setAttribute("aria-expanded", o); };
  menu.addEventListener("click", e => { if (e.target.tagName === "A") { menu.classList.remove("is-open"); tg.setAttribute("aria-expanded", false); } });

  // Botón volver arriba + enlace activo del menú
  const top = $("#toTop");
  top.onclick = () => window.scrollTo({ top: 0, behavior: "smooth" });
  addEventListener("scroll", () => {
    top.hidden = scrollY < 600;
    let active = "inicio";
    document.querySelectorAll("main .section:not([hidden])").forEach(s => { if (s.getBoundingClientRect().top < 140) active = s.id; });
    menu.querySelectorAll("a").forEach(a => a.classList.toggle("is-active", a.getAttribute("href") === "#" + active));
  }, { passive: true });

  loadData();
}
document.addEventListener("DOMContentLoaded", init);
