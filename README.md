# HTML PDF Viewer

Visor de PDF en canvas, una sola página a la vez, sin dependencias instaladas. Diseñado para verse como una edición impresa, compatible con escritorio, iOS y Android.

## Requisitos

Ninguna instalación. Solo necesitas un servidor HTTP local, ya que el navegador bloquea `fetch` desde `file://`.

## Cómo ejecutar

```bash
# Opción A — Node.js
npx serve .

# Opción B — Python
python -m http.server 8080
```

Luego abre `http://localhost:3000` (o el puerto que indique el servidor).

## Cambiar el PDF

Edita la constante `PDF_URL` al inicio del bloque `<script type="module">` en `index.html`:

```js
const PDF_URL = 'pdf/tu-archivo.pdf';
```

Pon el archivo PDF dentro de la carpeta `pdf/`.

## Controles

| Acción | Cómo |
|---|---|
| Página siguiente | Botón `›`, tecla `→` / `↓` / `PageDown`, o swipe izquierda |
| Página anterior | Botón `‹`, tecla `←` / `↑` / `PageUp`, o swipe derecha |
| Zoom + / − | Botones `+` / `−` de la barra |
| Ajustar al ancho | Botón `↔` |
| Zoom libre (móvil) | Pinch-to-zoom nativo del sistema |

## Estructura

```
/
├── index.html   # Todo el visor (HTML + CSS + JS, sin build)
├── pdf/         # Coloca aquí los archivos PDF
└── CLAUDE.md    # Contexto para Claude Code
```
