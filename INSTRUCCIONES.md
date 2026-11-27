# Historial Escolar 2026 · Guía de puesta en marcha

Contenido: `index.html`, `styles.css`, `script.js`, `Code.gs`, `logo.png`.
Sin configurar nada, el sitio abre en **modo demostración** (contenido marcado "[DEMO]").

## 1. Preparar el Google Forms
Tu formulario actual ya funciona con estos encabezados: *Título descriptivo, Fecha de la actividad, Categoría de la actividad, Breve descripción, Adjuntar archivos* y las columnas *Grado [1°]…[7°]*. Referencia (el sistema reconoce las columnas por palabras del encabezado):

| Pregunta | Tipo | Palabra clave en el título |
|---|---|---|
| Categoría | Desplegable | "Categoría" |
| Título del acontecimiento | Respuesta corta | "Título" |
| Grado/s participante/s | Cuadrícula de casillas (filas: 1° a 7°; columnas: A, B, C, D) | "Grado [1°]", "Grado [2°]"… (ya configurado) |
| Fecha del evento | Fecha | "Fecha" |
| Reseña | Párrafo | "Reseña" o "Descripción" |
| Fotografías | Carga de archivos (varias) | "Foto" |

Opciones de **Categoría** (deben contener estas palabras): Actos escolares · Proyectos institucionales · Jornadas de reflexión · Salidas educativas · Actividades deportivas, culturales y recreativas · Participación en encuentros/programas educativos · Distinciones.

Importante: las **fotos subidas al Forms quedan en el Drive del dueño del formulario**; quien creó el Forms debe ser quien despliegue el script (paso 2).

## 2. Instalar el Apps Script
1. Abrir la hoja de respuestas: <https://docs.google.com/spreadsheets/d/1UK3SmoYPcaZ7e9WEuQOEWLl_GzOLf2HzygezoTCxxV4/edit> → **Extensiones → Apps Script**.
2. Borrar el contenido y pegar `Code.gs`. (ID de hoja y `gid` 282001144 ya están cargados en `CONFIG`).
3. Elegir la función **`probar`** → **Ejecutar** → aceptar permisos (Hojas de cálculo y Drive). Revisar en **Registro de ejecución** que los datos se lean bien.
4. **Implementar → Nueva implementación → Aplicación web**: *Ejecutar como*: **Yo**; *Quién tiene acceso*: **Cualquier persona**. Copiar la URL terminada en `/exec`.
5. Si luego se modifica `Code.gs`: Implementar → Administrar implementaciones → editar → **Nueva versión**.

Seguridad: no hay claves en el navegador; el script solo lee y entrega datos. Las fotos se comparten "con enlace" en modo lectura.

## 3. Conectar el sitio
En `script.js`, pegar la URL en `CONFIG.API_URL`. Opcional: `HERO_IMAGE` con una foto de fondo para la portada.

## 4. Publicar
Subir los 5 archivos a cualquier hosting estático (GitHub Pages, Netlify, Google Sites con incrustación, etc.). Para probar localmente: `python3 -m http.server`.

## Solución de problemas
- **No se ven las fotos**: ejecutar `probar` otra vez (comparte los archivos), o verificar que quien implementó el script es el dueño de la carpeta de fotos.
- **Una publicación no aparece**: su "Categoría" no contiene las palabras clave; revisar las opciones del desplegable.
- **Cambios que tardan**: la caché dura 2 minutos (`CACHE_SECONDS`).
- **Error al cargar**: revisar que la implementación tenga acceso "Cualquier persona".
