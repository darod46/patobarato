# PatoBarato web v2 — Next.js, páginas de producto y SEO

Fecha: 2026-11-05. Estado: pendiente de aprobación del usuario.
Antecedentes: `2026-11-04-patobarato-web-design.md` (web v1, Vite) y `2026-11-04-patobarato-bot-design.md`.

## 1. Intención

La web v1 es una página única que se monta en el navegador. El usuario quiere tres cosas:

1. **Una cabecera más profesional**, sin marco.
2. **Tarjetas sin botón** que, al pulsarlas, lleven a una **página propia de cada producto**. Esa página es la que tiene el botón para ir a Amazon.
3. **Mejor SEO.** La gente debe llegar desde Google buscando **productos concretos** («oferta freidora Cecotec») y **chollos en general**. En el futuro habrá **más tiendas que Amazon**: AliExpress con sus cupones, El Corte Inglés, etc.

Para que Google indexe bien cada producto y para que, al compartir un enlace, salgan su foto y su precio, el HTML tiene que llegar ya montado desde el servidor. Por eso la web pasa a **Next.js** (decisión del usuario, 2026-11-05).

## 2. Objetivos, no objetivos y anti-objetivos

**Objetivos**
- Migrar `web/` de Vite a Next.js (App Router) con React, TypeScript y Tailwind CSS v4, desplegado en Vercel con el dominio `www.patobarato.com`.
- Nueva cabecera (hero) sin marco.
- Tarjeta clicable entera y página de producto con su botón.
- SEO técnico completo: HTML renderizado en servidor, metadatos por página, Open Graph, datos estructurados, sitemap, robots, URL canónicas y páginas por hashtag.
- Direcciones y modelo de datos que admitan otras tiendas sin rehacer nada.

**No objetivos (en esta versión)**
- Integrar AliExpress, El Corte Inglés u otras tiendas. Solo se deja preparado.
- Cambiar el bot o los mensajes de Telegram.
- Histórico de precios, categorías, cuentas de usuario y modo oscuro.
- Textos o descripciones de producto generados.

**Anti-objetivos**
- Afirmaciones falsas. No se dice «Amazon, AliExpress y más» mientras solo haya Amazon. Ninguna cifra inventada.
- Romper lo que ya funciona: búsqueda, filtros por hashtag en la URL, «Cargar más», la redirección `/go/{ASIN}` y el aviso de afiliado.
- Exponer la clave `service_role` o leer algo distinto de las vistas públicas.
- Páginas vacías o duplicadas indexables, como resultados de búsqueda con `?q=`.

## 3. Restricciones

- Vercel, proyecto existente con Root Directory `web` y dominio principal `www.patobarato.com` (el dominio sin `www` redirige).
- Supabase con la clave pública (anon). Solo lectura de las vistas `web_deals` y `web_hashtags`. Si hace falta ampliarlas, se hace con una migración nueva aplicada por Claude, como las anteriores.
- Estilo de `prototipo/DESIGN.md` con los ajustes de accesibilidad AA ya aplicados en v1.
- Red corporativa del desarrollador con TLS interceptado: en local, `NODE_OPTIONS=--use-system-ca`. Nunca se sube al repo ningún apaño.

## 4. Lo decidido

### 4.1 Rutas

| Ruta | Contenido | Renderizado |
|---|---|---|
| `/` | Hero, listado, bloque Telegram y pie | Servidor, revalidación cada 60 s. La primera página del listado viene en el HTML; búsqueda, filtros y «Cargar más» siguen en el cliente como en v1 |
| `/oferta/{tienda}/{slug}-{id}`, p. ej. `/oferta/amazon/cecotec-accesorios-freidora-de-aire-b0bpzvjjqj` | Página de producto | Servidor, revalidación cada 10 min |
| `/chollos/{hashtag}`, p. ej. `/chollos/hogar` | Listado filtrado por ese hashtag, con título y descripción propios | Servidor, revalidación cada 60 s |
| `/go/{ASIN}` | Página mínima de salto a Amazon (ya existe, v1) | Estática, se mantiene igual |
| `/sitemap.xml`, `/robots.txt` | SEO | Generados |

- **`{id}`** es el identificador del producto en su tienda (el ASIN en minúsculas para Amazon).
- **`{slug}`** se obtiene del título: minúsculas, sin acentos, palabras separadas por guiones y un máximo de unas 8 palabras.
- Si el slug de la URL no coincide con el actual, se hace una **redirección 308** a la URL canónica. Así los títulos pueden cambiar sin romper enlaces.
- Los enlaces antiguos `/?q=` y `/?tag=` siguen funcionando. Además, `/?tag=X` incluye un `rel=canonical` hacia `/chollos/X`.

### 4.2 Cabecera (hero)

Opción A elegida en las maquetas (`.superpowers/brainstorm/.../hero-opciones.html`), con la imagen **a la izquierda**:

- **Sin marco:** sin caja, sin sombra y sin bordes redondeados. Fondo continuo con la página, con un degradado muy suave de blanco a `#fbf8ff`.
- **Izquierda:** mascota `pato-heroe.svg`, sin círculo ámbar.
- **Derecha:**
  - etiqueta pequeña en ámbar en mayúsculas («Chollos verificados cada día»);
  - titular H1 con «Amazon» resaltado en ámbar, por ejemplo «Los mejores chollos de Amazon, cada día en un solo sitio»;
  - una frase honesta;
  - botones «Ver chollos» (carbón) y «Unirme en Telegram» (borde).
- **En móvil:** la mascota pequeña arriba o al lado del titular y los botones a ancho completo.
- **Sin cifras.** Cuando haya más tiendas se cambia el texto.

### 4.3 Tarjeta del listado

- La tarjeta compacta de v1 (2/3/4/5 columnas), **sin el botón**. Toda la tarjeta es un único enlace a la página de producto.
- En la línea inferior: precio anterior tachado a la izquierda y «{Tienda} · hace X» a la derecha.
- Al pasar el ratón: sombra y título subrayado. Foco visible con el teclado.
- Los hashtags dentro de la tarjeta se quitan. El filtro por hashtag queda en los chips de arriba y en la página de producto. Así se evitan enlaces anidados.

### 4.4 Página de producto

Maqueta elegida: **A en escritorio y B en móvil**.

**Contenido:**
- **Ruta de migas:** Inicio › #primer-hashtag (si lo hay) › título. Se marca también como datos estructurados de ruta de migas.
- **Foto grande**, con la pastilla de descuento «-N%» si lo hay. Si no hay foto, el pato.
- **Pastilla de tienda** («Amazon España»).
- **Título H1.**
- **Precio grande**, precio anterior tachado y la línea «Ahorras X €».
- **Cupón** si lo hay.
- **Línea secundaria:** «Publicado hace X · El precio puede cambiar».
- **Botón ámbar «🛒 Ver en Amazon»**, que enlaza al `affiliate_url` con `rel="sponsored noopener noreferrer"`. En Android y iOS mantiene el comportamiento de v1 para intentar abrir la app.
- **Hashtags** como enlaces a `/chollos/{tag}`.
- **Aviso de afiliado de Amazon**, junto al botón y también en el pie.
- **Debajo, «Más chollos de #tag»:** hasta 10 tarjetas del mismo hashtag. Si no hay hashtag, las más recientes.

**Distribución:**
- **Escritorio:** dos columnas, foto a la izquierda y datos a la derecha.
- **Móvil:** una columna centrada. El botón «Ver en Amazon» queda **fijo abajo** mientras se baja por la página.

**Producto inexistente** (o fuera de `web_deals`): página «Esta oferta ya no está disponible», con enlaces a los chollos actuales y **código HTTP 404**.

### 4.5 SEO

- **`metadataBase`:** `https://www.patobarato.com`.
- **Título y descripción por página:**
  - Producto: `{título} por {precio} € ({-N%}) · PatoBarato`. La descripción lleva precio, precio anterior, tienda y cupón, en unos 155 caracteres.
  - Hashtag: `Chollos de {tag} · PatoBarato`.
  - Portada: título y descripción generales.
- **URL canónica** en cada página.
- **Open Graph y Twitter:**
  - Producto: imagen del producto, título y precio.
  - Resto: imagen genérica de la marca. Se genera una `og:image` de 1200×630 con el logo y el pato, a partir de `recursos/`.
- **Datos estructurados (JSON-LD):**
  - Producto: `Product` con `name`, `image`, `sku` (ASIN) y `offers` (`price`, `priceCurrency` EUR, `availability` InStock, `url` de la página, `seller` = tienda).
  - Producto y hashtag: `BreadcrumbList`.
  - Portada: `WebSite` con `SearchAction` hacia `/?q={search_term_string}`, y `Organization` con el logo.
- **`sitemap.xml`:** portada, todas las ofertas de `web_deals` (con `lastmod` = `published_at`) y las páginas de hashtag de `web_hashtags`.
- **`robots.txt`:** todo permitido salvo `/go/`, y referencia al sitemap.
- **`noindex`:** `/go/`, búsquedas con `q` y páginas 404.
- **`lang="es"`,** un único H1 por página, textos alternativos en todas las imágenes.
- **Rendimiento:** imágenes con tamaño reservado, carga diferida salvo la foto principal del producto y la mascota del hero, fuentes servidas localmente y nada de JavaScript innecesario en las páginas de producto.

### 4.6 Datos

- **Ampliar `web_deals`** con una migración nueva: añadir `store` (de `products.store`) y `product_id`. La vista sigue dando una fila por producto, con su última publicación activa.
- **Búsqueda de un producto** por (`store`, `asin`) en `web_deals`.
- **Lectura en servidor** con la clave pública (`NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`, o equivalentes), siempre de las vistas.
- **Nombres de tienda** en una tabla de la web: `amazon` → «Amazon España», enlace «Ver en Amazon». Así añadir otra tienda es añadir una entrada.

### 4.7 Migración

- Se sustituye Vite por Next.js en `web/`. Se reaprovechan los componentes, hooks y `lib/` de v1, adaptados a Server y Client Components.
- Se mantienen Vitest y Testing Library para componentes y lógica, y oxlint.
- La CI de `web` (`.github/workflows/web.yml`) se adapta: lint, comprobación de tipos, tests y `next build`.
- **Variables de entorno en Vercel:** si cambia el prefijo de `VITE_` a `NEXT_PUBLIC_`, el usuario tiene que actualizarlas en Vercel antes de desplegar. Se avisa explícitamente.
- `/go/{ASIN}` se mantiene: `public/go.html` más la reescritura, en `next.config` o en `vercel.json`.

### 4.8 Precisiones (tras la revisión del constructor)

- **Caducidad:** hoy nada marca una publicación como terminada (`ended` llegará con la API de Amazon), y el usuario decidió no poner límite de antigüedad. Una oferta solo desaparece de `web_deals` si deja de haber publicación activa. La página muestra siempre la última publicación activa del producto (precio y `affiliate_url`). El JSON-LD usa `availability` InStock, y `priceValidUntil` no se pone. El `lastmod` del sitemap avanza cuando el bot vuelve a publicar.
- **Hashtags:** se guardan normalizados, en minúsculas, sin `#` y solo con `[a-z0-9_áéíóúñü]`. En la URL van codificados (`encodeURIComponent`).
  - `/chollos/{tag}` sin ninguna oferta → 404.
  - Con menos de 3 ofertas → `noindex`.
  - El sitemap solo incluye hashtags con 3 ofertas o más.
- **`/chollos/{tag}`** reutiliza el mismo listado de la portada con ese hashtag fijo: buscador y «Cargar más» incluidos, 24 por página, y la primera página renderizada en el servidor. Los chips llevan a `/chollos/{otro}`, y «Todos» lleva a `/`.
- **`/go/{ASIN}`:** la reescritura pasa a `next.config` (`rewrites`). `go.html` ya lleva `<meta name="robots" content="noindex">`, y además `robots.txt` excluye `/go/`.
- **Variables de entorno:** el código usa `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`. `next.config` los rellena desde `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` si no existen, así el despliegue funciona sin cambiar nada en Vercel. Más adelante se pueden renombrar.
- **Identificadores:** `products` es único por (`store`, `country`, `asin`). En la URL el ASIN va en minúsculas y se busca en mayúsculas. `product_id` es interno y nunca aparece en una URL.
- **Volumen:** el sitemap lee `web_deals` en bloques de 1000 hasta agotarlo. Con el volumen actual cabe en un solo sitemap; si supera las 45.000 URL, se partirá.
- **Imágenes:** `<img>` normal con `width` y `height`, sin `next/image`, para no pasar las imágenes de Amazon por el optimizador de Vercel. La `og:image` genérica se genera con el logo y el pato de `recursos/` (`ImageResponse` o PNG estático).
- **Textos del hero:** los escribe el constructor, con el tono indicado y solo Amazon.

## 5. Decisiones de Claude (revisables)

- **Direcciones `/oferta/{tienda}/{slug}-{id}`,** con la tienda en la ruta para el futuro multitienda.
- **Páginas `/chollos/{hashtag}`** para posicionar búsquedas genéricas.
- **Tiempos de revalidación:** 60 s en listados y 10 min en producto.
- **Texto del hero:** solo Amazon mientras sea la única tienda.
- **Sin hashtags dentro de las tarjetas,** para evitar enlaces anidados.
- **Botón fijo abajo en la página de producto en móvil.**
- **Producto inexistente → 404** con enlaces a los chollos actuales.

## 6. Lo que queda al constructor

- Estructura interna de componentes y la división entre Server y Client Components.
- Textos exactos, dentro del tono y sin afirmaciones falsas.
- El generador de slugs y el detalle de la imagen Open Graph.
- Cómo comprobar los metadatos y el JSON-LD en los tests.
