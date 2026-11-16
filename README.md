# Licitaciones Trenino

Buscador de licitaciones públicas de vestuario abiertas en Mercado Público,
filtradas con los criterios del proyecto: **uniforme escolar** y **vestuario
corporativo**.

La lista se actualiza sola una vez al día y la página es estática, así que no
hay servidor que mantener ni costo de operación.

---

## Cómo funciona

```
GitHub Actions (una vez al día)
  └─ scripts/actualizar.mjs
       ├─ pide a la API todas las licitaciones activas (una sola llamada, ~5.300)
       ├─ filtra por nombre con lib/filtros.mjs
       ├─ baja el detalle solo de las que no conocía
       └─ escribe public/data/licitaciones.json  →  commit al repo
  └─ scripts/enviar-correo.mjs
       └─ si hay licitaciones nuevas, manda el resumen por Resend

Vercel
  └─ al detectar el commit, republica public/ con el JSON nuevo
```

El ticket de ChileCompra y la clave de Resend viven en los secretos del
repositorio. Nunca están en el código ni llegan al navegador.

---

## Qué se puede hacer en la página

Cada licitación se puede marcar con uno de tres estados, y las pestañas de
arriba filtran por ellos:

| Marca | Para qué | Dónde queda |
|---|---|---|
| ★ Favorita | Vale la pena, hay que mirarla con calma | Pestaña *Favoritas* |
| ✓ Postulada | Ya se presentó oferta | Pestaña *Postuladas* |
| ✕ Descartada | No sirve, sacarla de la vista | Pestaña *Descartadas* |

Lo que no está marcado vive en **Por revisar**, que es la bandeja de entrada:
la idea es dejarla vacía.

Las marcas son **compartidas**: quedan en una base de datos y cada marca
guarda quién la puso y cuándo, así que en la tarjeta aparece "Postulada por
Cristián · hace 2 h". Si la base no está conectada, la página sigue
funcionando pero las marcas quedan solo en ese navegador, y lo avisa arriba.

### Fechas que muestra cada licitación

| Fecha | Qué es |
|---|---|
| **Cierre** | Último momento para entregar la oferta. Es el plazo grande, el que sale en rojo o ámbar |
| **Preguntas** | Último día para preguntarle algo al comprador. Si ya pasó, sale "Preguntas cerradas": se puede ofertar, pero sin pedir aclaraciones |

Todas las licitaciones que aparecen están **abiertas a postulación** (estado
"Publicada" en Mercado Público). Las adjudicadas, desiertas o revocadas no
entran.

### Cómo postular

Mercado Público no permite enlazar directo al formulario de oferta. El panel
de cada licitación muestra los dos pasos: entrar como proveedor y después
abrir la ficha, donde recién aparece el botón **Ofertar**. También hay un
botón para copiar el código de la licitación.

---

## Los filtros

Están todos en [`lib/filtros.mjs`](lib/filtros.mjs), comentados. En resumen:

1. El nombre menciona una prenda (uniforme, vestuario, polera, parka, calzado…).
2. No es un servicio ni una obra (lavado, mantención, arriendo…).
3. No es una academia policial o militar: sus "alumnos" y "ajuares de ingreso"
   no son mercado escolar.
4. Si el texto indica que la prenda es para **alumnos** → línea escolar.
   Incluye los programas que financian uniforme: pro-retención, Ley SEP,
   JUNAEB y Mineduc.
5. Si no, y no es del sector salud → línea **corporativa**.

El uniforme clínico y del sector salud queda fuera por decisión del equipo:
scrubs y filipinas son otro producto.

> Este filtro es **más inclusivo** que el usado en el análisis de mercado del
> proyecto. Allá importaba no inflar el tamaño del canal; acá importa no perder
> una licitación. Un falso positivo cuesta diez segundos de lectura, una
> licitación perdida cuesta la venta.

Para ajustar qué entra y qué no, se editan las expresiones regulares de ese
archivo. No hay que tocar nada más.

---

## Puesta en marcha

### 1. Secretos del repositorio

En **Settings → Secrets and variables → Actions**:

| Tipo | Nombre | Qué es |
|---|---|---|
| Secret | `TICKET_MERCADO_PUBLICO` | Ticket de la API de ChileCompra |
| Secret | `RESEND_API_KEY` | Clave de Resend, empieza con `re_` |
| Secret | `CORREO_DESTINO` | Destinatarios separados por coma |
| Variable | `CORREO_ORIGEN` | Remitente. Sin dominio propio: `Licitaciones Trenino <onboarding@resend.dev>` |
| Variable | `SITIO_URL` | URL del sitio en Vercel, para el botón del correo |

### 2. Base de datos de las marcas

En el proyecto de Vercel: **Storage → Create Database → Upstash for Redis**
(plan gratis). Al conectarla al proyecto, Vercel inyecta solas las variables
`KV_REST_API_URL` y `KV_REST_API_TOKEN`, que es lo único que necesita
`lib/almacen.mjs`. No hay que instalar ningún paquete.

Sin esa base el sitio funciona igual, solo que las marcas no se comparten.

### 3. Vercel

Importar el repositorio y dejar la configuración por defecto: `vercel.json` ya
indica que el sitio es estático y que la carpeta a publicar es `public/`.
Cada commit del workflow dispara una republicación automática.

### 4. Primera corrida

En la pestaña **Actions**, ejecutar *Actualizar licitaciones* a mano con
**Run workflow**. Después corre solo todos los días a las 08:00 de Chile.

---

## Desarrollo local

```bash
cp .env.example .env        # y completar el ticket
export $(grep -v '^#' .env | xargs)

npm run actualizar          # consulta la API y regenera el JSON
npm run dev                 # sirve la página en http://localhost:3000
npm run correo              # manda el correo de prueba
```

No hay dependencias que instalar: todo usa Node 20+ y `fetch` nativo.

---

## Estructura

| Archivo | Qué hace |
|---|---|
| `lib/filtros.mjs` | Las reglas de clasificación. **Es el archivo a editar** si cambian los criterios |
| `lib/api.mjs` | Cliente de la API, con reintentos ante 429 y límite de 3 llamadas en paralelo |
| `lib/almacen.mjs` | Las marcas compartidas. Usa Upstash Redis; sin base, cae a un archivo local |
| `api/marcas.js` | Función serverless que lee y escribe las marcas |
| `scripts/actualizar.mjs` | El proceso diario: consulta, filtra, guarda |
| `scripts/enviar-correo.mjs` | Resumen por Resend; no envía nada si no hay novedades |
| `scripts/servidor.mjs` | Servidor estático para desarrollo |
| `public/` | La página: `index.html`, `app.js`, `styles.css` y el JSON de datos |
| `public/app.js` | Render, filtros y las marcas en `localStorage` |
| `.github/workflows/actualizar.yml` | El cron diario |

---

## Detalles que conviene saber

- **La API devuelve las activas en una sola llamada.** Por eso el proceso diario
  gasta pocas llamadas: una para el listado y una por cada licitación nueva.
- **Tres llamadas en paralelo como máximo.** Con más, la API responde HTTP 429.
- **El campo `vistaPrimeraVez`** guarda cuándo se vio por primera vez cada
  licitación; de ahí sale la marca "Nueva" y el contenido del correo.
- **El correo no se manda si no hay novedades**, para que no se vuelva ruido.
- **`VERSION_ESQUEMA` en `actualizar.mjs`**: al agregar campos al registro hay
  que subir ese número, si no el script reusa los registros viejos sin el
  campo nuevo y queda a medias.
- Es una ayuda de búsqueda, no un reemplazo de Mercado Público: antes de
  postular hay que entrar a la ficha oficial y leer las bases.
