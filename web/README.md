# PatoBarato web

Web pública de [PatoBarato](https://www.patobarato.com): Next.js 16 (App Router), React, TypeScript y Tailwind v4. Los datos vienen de Supabase con la clave pública (anon) y solo se leen las vistas `web_deals`, `web_hashtags`, `web_coupons`, `web_stores`, `web_guides`, `web_guide_items`, `web_guides_by_product`, `web_events`, `web_event_promos` y `web_page_copy`.

## Desarrollo local

Requisitos: Node >= 22.12.

```bash
cd web
npm install
```

Crea `web/.env.local` (ver `.env.example`):

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Los nombres antiguos `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` también valen: `next.config.ts` los usa como fallback.

```bash
npm run dev
```

Notas:

- En red corporativa con proxy TLS, arranca con `NODE_OPTIONS=--use-system-ca` en tu entorno. No se commitean apaños para esto.
- `next dev` puede generar `web/AGENTS.md` si detecta un agente de IA; está en `.gitignore`.

## Scripts

| Script | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm start` | Sirve el build (`next start`) |
| `npm test` | Tests (vitest) |
| `npm run lint` | oxlint |
| `node scripts/check-views.mjs` | Comprueba el acceso anon a las vistas públicas (incluye `web_page_copy` legible y `page_copy` no) |
| `node scripts/render-og.mjs` | Regenera `public/og.png` |
| `npm run typecheck` | `tsc --noEmit --incremental false` |

## Rutas

- `/`: portada: barra de anuncio (próximo evento del calendario), hero, listado con orden (`?orden=recientes|descuento|minimo`) y chips de hashtags, cupones (si hay), cómo funciona, calendario de eventos, «Hola, soy el Pato», bloque Telegram y pie.
- `/cupones`: cupones vigentes (vista `web_coupons`), agrupados por tienda. Siempre indexable (con texto editorial aunque no haya cupones).
- `/tiendas`: índice de tiendas con chollos o cupones activos (vista `web_stores`), con sus recuentos. Siempre indexable; si la vista no carga, la página lanza (ver «Textos editoriales»).
- `/tiendas/{tienda}`: chollos y cupones de una tienda (el slug es el id de `src/lib/stores.ts`; 404 si no existe). Cabecera con los recuentos reales, cupones vigentes de la tienda y listado con orden, hashtags y «cargar más». `noindex` solo sin texto editorial y con menos de 3 chollos.
- `?tienda={id}`: filtra por tienda el listado de la portada (y de `/buscar`) y lo marca con chips; en `/tiendas/{tienda}` se ignora porque la tienda viene de la ruta.
- `/guias`: índice de guías de compra publicadas (vista `web_guides`), más recientes primero. Siempre indexable.
- `/guias/{slug}`: una guía con sus productos (vista `web_guide_items`), precios y cupones de la tienda. `noindex` mientras sus precios no estén frescos (ver «Guías de compra»); 404 si el slug no existe o no está publicada.
- `/aviso-legal`, `/privacidad`, `/cookies`, `/afiliados`, `/contacto`: páginas estáticas. Los textos llevan marcadores `[TITULAR]`, `[NIF]`, `[DIRECCIÓN]`, `[EMAIL]`, `[CIUDAD]`, `[PLAZO]` que hay que sustituir.
- `/oferta/{tienda}/{slug}-{id}`: ficha de producto (Amazon y AliExpress). Las tiendas de Awin usan `/oferta/{tienda}/{id}`, con el id codificado como porcentaje. Redirige con 308 a la URL canónica si el slug no coincide; 404 si la oferta no existe.
- Fichas caducadas: una oferta que ya no está activa conserva su ficha en `/oferta/...` (vista `web_deal_pages`, que incluye activas y caducadas) con el aviso de que ha caducado y alternativas. Es indexable durante 30 días desde `ended_at` (entra en el sitemap `chollos`); pasado ese plazo la ficha sigue existiendo pero lleva `noindex` y sale del sitemap.
- `/chollos/{hashtag}`: listado por hashtag. 404 si no tiene ningún chollo activo; `noindex` solo con 1–2 chollos y sin texto editorial.
- `/sobre-nosotros`: quiénes somos, cómo elegimos los chollos y cómo ganamos dinero (texto de `page_copy`, `static`/`sobre-nosotros`; JSON-LD `AboutPage` y `Organization`). Enlazada desde el pie.
- `/api/salud`: comprobación de salud del servidor (ver «Salud del servidor»).
- `/chollos`: listado puro (sin buscador) con orden (`?orden=`), tienda (`?tienda=`) y chips. Es dinámico: el servidor valida `?tag=`, `?orden=` y `?tienda=` con las mismas reglas que el cliente (`src/lib/filters.ts`) y pinta ya la página 0 filtrada, sin `revalidate`.
- `/buscar`: buscador global, indexable sin `?q=` (con `?q=` lleva `noindex`, también por `X-Robots-Tag`). Un campo y tres bloques: «Chollos» (vista `web_deals`), «En AliExpress» (`/api/buscar/aliexpress`; se oculta si el endpoint responde 204) y «En tiendas» (catálogo propio, función `web_catalog_search`). Desde 2 letras; el campo escribe `?q=` en la URL. La cabecera de todas las demás páginas enlaza aquí con el botón «Buscar».
- `/api/buscar/aliexpress?q=`: búsqueda en AliExpress desde el servidor. Variables `ALIEXPRESS_APP_KEY`, `ALIEXPRESS_APP_SECRET` y `ALIEXPRESS_TRACKING_ID`, **solo en Vercel y solo servidor** (nunca `NEXT_PUBLIC_*`). Sin ellas responde 204 y el bloque no se muestra. Caché de 15 min (`s-maxage=900`) y límite global de 30 consultas distintas por minuto (no por cliente; 429 con `Retry-After`).
- Catálogo de tiendas: la tabla `catalog_products` la rellena el bot (`upsert_catalog_products`) y la web solo la consulta con la función `web_catalog_search` (anon); la tabla no se lee directamente.
- Redirecciones (308, `next.config.ts`): `/?q=…` y `/chollos?q=…` van a `/buscar?q=…`; `/?tag=…`, `/?orden=…` y `/?tienda=…` van a `/chollos` con el mismo filtro. Ya no hay reescrituras hacia `/buscar`.
- `/go/{ASIN}`: página de salto a Amazon (`public/go.html`, añade el tag de afiliado por script).
- `/sitemap.xml` y `/robots.txt`: el primero es un índice de sitemaps (ver «Sitemaps»); `robots.txt` lo genera `src/app/robots.ts` y apunta a `/sitemap.xml`. Bloquea `/go/` y `/api/`.
- `/og.png`: imagen Open Graph (`public/og.png`), generada con `node scripts/render-og.mjs` a partir de `scripts/og.html` (necesita Playwright).

## Caché (ISR)

Cada regeneración de una página ISR cuenta como una escritura en Vercel (200.000 al mes en el plan Hobby), así que los intervalos son largos y los cambios urgentes llegan por revalidación bajo demanda.

- Portada (`/`): 300 s. Etiquetas y tiendas (`/chollos/{hashtag}`, `/tiendas`, `/tiendas/{tienda}`): 600 s.
- `/chollos` y `/buscar`: dinámicos (por petición); `/api/buscar/aliexpress`: 15 min.
- Cupones (`/cupones`): 1800 s.
- Producto (`/oferta/...`): 3600 s (el precio mostrado es el publicado y no cambia; una oferta terminada se ve al instante gracias a la revalidación que lanza `check-deals` o el admin).
- Guías (`/guias`, `/guias/{slug}`): 3600 s (los precios se refrescan cada 6 h en el bot; una edición desde el admin llega con `/api/revalidate`).
- Sitemaps (`/sitemap.xml` y `/sitemaps/*.xml`): 3600 s.
- Revalidación bajo demanda: `POST /api/revalidate` con la cabecera `x-revalidate-secret` (debe coincidir con `REVALIDATE_SECRET`; sin variable, siempre 401) revalida todo el sitio (`revalidatePath('/', 'layout')`). Lo llama el bot tras cada cambio del admin, para que las ediciones se vean al instante.

## SEO

- Metadatos (title, description, Open Graph) por página y URLs canónicas. Los listados los generan con `listingMetadata` (`src/lib/seo.ts`) a partir de `page_copy`.
- hreflang: cada página emite `es-ES` y `x-default` apuntando a su propia ruta (`withHreflang(path)` en `src/lib/seo.ts`; el layout pone lo mismo para `/`), y `<meta name="geo.region" content="ES">`. El sitio es solo en español, así que ambos apuntan a la misma URL.
- JSON-LD: `Product` (ficha), `BreadcrumbList`, `WebSite` con `SearchAction` y `Organization` (sitio).
- Search Console: añade la propiedad `www.patobarato.com` y envía `/sitemap.xml` (el índice; no hace falta enviar los tres ficheros).

## Textos editoriales (`page_copy`)

Los listados llevan título SEO, `h1`, introducción y FAQ propios, editables desde Supabase sin desplegar. La web solo lee la vista `web_page_copy` (filas con `status = 'published'`); la tabla `page_copy` tiene RLS, sin acceso para `anon`, y solo la editan los administradores (`is_admin()`). La semilla está en `supabase/migrations/20261123000000_page_copy.sql`.

**Filas.** `kind` + `slug` son únicos:

| `kind` | `slug` | Página |
| --- | --- | --- |
| `category` | el hashtag (`hogar`, `tecnologia`, `bricolaje`…) | `/chollos/{hashtag}` |
| `store` | el id de `src/lib/stores.ts` (`amazon`, `aliexpress`…) | `/tiendas/{tienda}` |
| `static` | `chollos`, `tiendas`, `cupones`, `guias`, `eventos`, `sobre-nosotros` | `/chollos`, `/tiendas`, `/cupones`, `/guias`, `/eventos`, `/sobre-nosotros` |

Campos: `title` (el `<title>` sin el sufijo « · PatoBarato», que añade la web), `h1`, `intro_md` (Markdown), `faq` (`[{"q": "...", "a_md": "..."}]`, con `FAQPage` JSON-LD) y `status` (`draft` no sale en la web). Para publicar o cambiar un texto basta un `insert`/`update` en `page_copy`; las páginas lo recogen en su siguiente revalidación (300-600 s en listados; 1800 s en `/cupones`) o al instante con `/api/revalidate`.

**Marcadores.** `intro_md` admite `{deals}` (número de chollos activos de la página) y `{stores}` (lista de tiendas, «Amazon y AliExpress»). Reglas:

- Cada marcador va **en su propia frase**: si no hay valor (lectura fallida, lista vacía), la web elimina la frase entera; nunca se pinta un `{deals}` o `{stores}` literal (hay test).
- Los números salen de la base de datos: por categoría, `web_hashtags.count`; por tienda, `web_stores.deals`; en `/chollos`, la suma de `web_stores`. `{stores}` son las tiendas con al menos un chollo.
- Singular: con exactamente 1 chollo, «1 chollos activos» pasa a «1 chollo activo» (y «1 chollos» / «1 ofertas» a singular).
- Se escribe a mano cada fila; no se copian textos entre categorías cambiando el nombre.

**Sin fila publicada** la página usa título y `h1` por defecto, sin introducción ni FAQ. El número solo aparece si se conoce (y es > 0):

| Página | Título por defecto |
| --- | --- |
| Categoría | `Chollos de {tag}: N ofertas hoy` / `Chollos de {tag}` |
| Tienda | `Chollos de {Tienda} hoy: N ofertas` / `Chollos de {Tienda} hoy` |
| `/chollos` | `Chollos de hoy: N ofertas en {tiendas}` / `Chollos de hoy` |
| `/tiendas`, `/cupones`, `/guias` | `Tiendas con chollos`, `Cupones de descuento vigentes`, `Guías de compra` |
| `/eventos`, `/sobre-nosotros` | `Eventos de compras: Black Friday, 11.11, Cyber Monday`, `Quiénes somos y cómo elegimos los chollos` |

El `h1` por defecto es el título sin el número (en categorías y tiendas, `Chollos de {tag}` / `Chollos de {Tienda}`). La descripción es la primera frase de `intro_md` ya renderizada (≤ 160 caracteres).

**Reglas de indexación** (spec §6, tal como están implementadas):

| Página | Regla |
| --- | --- |
| `/chollos/{tag}` | 404 si el hashtag no tiene ningún chollo activo (con la lectura correcta). Indexable con fila en `page_copy` **o** ≥ 3 chollos; `noindex` solo con 1–2 chollos **y** sin fila. |
| `/tiendas/{tienda}` | Indexable con fila publicada **o** ≥ 3 chollos; `noindex` solo sin fila y con menos de 3. Sin chollos muestra el texto editorial y «ahora mismo no hay chollos activos». |
| `/chollos`, `/tiendas`, `/cupones`, `/guias`, `/eventos`, `/sobre-nosotros` | Siempre indexables; con la lista vacía, texto editorial y un mensaje honesto. |
| `/guias/{slug}` | Sin cambio: `noindex` mientras los precios no estén frescos (ver «Guías de compra»). |
| `/buscar?q=` | Sin cambio: `noindex`. |
| Fallo de lectura de Supabase en un listado | La página **lanza** y Next sigue sirviendo la última versión ISR: nunca 404, nunca `noindex`, nunca una página vacía cacheada. Solo los bloques secundarios (chips, tiendas del pie, eventos, texto editorial) usan `optional()` y se omiten si fallan. Excepción: `/chollos` es dinámica (por petición) y su listado también usa `optional()`: si falla, el cliente vuelve a pedirlo en el navegador. |

`noindex` solo se emite cuando la base de datos ha respondido y la página es realmente fina. Si falla la lectura del texto editorial, la página sale con título y `h1` por defecto y **nunca** con `noindex`, aunque tenga 1–2 chollos: un fallo no es «sin fila». Solo una lectura correcta sin fila cuenta como «sin texto editorial». Si falla solo el contador pero la lectura principal va bien, se usa el número de elementos cargados.

**Fase de build.** Sin base de datos durante `next build`, `src/lib/primary.ts` (`primary()`) registra el error y devuelve `undefined` en lugar de lanzar (`NEXT_PHASE=phase-production-build`), de modo que el despliegue sigue y la página queda con su estado vacío honesto hasta la primera revalidación. Fuera del build, `primary()` relanza siempre. Con Supabase caído y sin versión ISR previa, la primera petición da el error de Next (500); `/api/salud` permite detectarlo antes de pedir indexación.

## Sitemaps

`/sitemap.xml` (la URL que Google ya conoce) es un **índice** `<sitemapindex>` (`src/app/sitemap.xml/route.ts`) con tres sitemaps (`src/app/sitemaps/[name]/route.ts`; lógica en `src/lib/sitemap-data.ts` y `src/lib/sitemap.ts`):

| Sitemap | Contenido | `lastmod` |
| --- | --- | --- |
| `/sitemaps/chollos.xml` | Fichas de oferta activas y caducadas hace menos de 30 días (`changefreq daily`) | `endedAt` si está caducada, si no `publishedAt` |
| `/sitemaps/paginas.xml` | Portada, listados (`/chollos`, `/buscar`, `/tiendas`, `/cupones`, `/guias`), categorías indexables, tiendas indexables, guías con precios frescos (las demás llevan `noindex`) y páginas estáticas (incl. `/sobre-nosotros`) | `updated_at` de `page_copy` o de la guía |
| `/sitemaps/eventos.xml` | `/eventos` y cada evento publicado | `updated_at` del evento |

Las categorías y tiendas entran con la misma regla que su página (categoría con ≥ 1 chollo y, además, fila o ≥ 3 chollos; tienda con fila o ≥ 3 chollos), así que `/chollos/bricolaje` con 2 chollos y sin fila **no** está. El índice lleva el `lastmod` de la fila más reciente de cada sitemap. Cada fichero devuelve su versión mínima si la lectura falla durante el build y **lanza** en runtime (Next conserva la última versión). `robots.txt` apunta a `/sitemap.xml`. Search Console: envía solo el índice.

## Salud del servidor

`GET /api/salud` comprueba desde el servidor si Supabase se lee (las mismas lecturas que usan los listados). Responde siempre `200` y `Cache-Control: no-store`:

```json
{ "ok": true, "at": "2026-11-22T10:00:00.000Z", "checks": { "supabase": "ok", "deals": 316, "events": 5, "copies": 6 } }
```

- `checks.deals`: suma de chollos activos de `web_stores`; `checks.events`: número de eventos publicados; `checks.copies`: número de textos editoriales publicados de tipo `static` (`web_page_copy`; 0 indica que falta la migración o la semilla); todos `null` si falla la lectura.
- Con fallo: `ok: false`, `checks.supabase: "error"` y `checks.errorName` con solo el nombre del error. `TypeError` suele ser un fallo de red; `Error` puede ser variables sin configurar **o** un error de PostgREST (por ejemplo, una vista que no existe porque falta una migración), así que `errorName` por sí solo no distingue entorno de base de datos: revisa los logs de la función. Nunca incluye URLs, claves ni mensajes completos.
- `robots.txt` lo bloquea (`Disallow: /api/`). Úsalo desde el navegador tras cada despliegue y antes de pedir la validación en Search Console.

## Iconos

Solo iconos de [Lucide](https://lucide.dev) vía `lucide-react`; `src/icons.test.ts` falla si aparece un `<svg>` a mano o un emoji fuera de `TelegramPreview`.

## Cupones

Los cupones también se sincronizan desde Awin (ver el README del bot); además se pueden insertar a mano en la tabla `coupons` desde el panel de Supabase (`store` con el id de `src/lib/stores.ts`, p. ej. `aliexpress`; `code`; `title` como «−6 € en 40 €»; `conditions`; `url` de afiliado opcional; `starts_at`, `expires_at`, `active`). La vista `web_coupons` solo devuelve los vigentes; la portada los recoge en ≤ 60 s y `/cupones` en ≤ 600 s.

## Guías de compra

Vistas: `web_guides` (una fila por guía publicada, con `prices_checked_at`), `web_guide_items` (una fila por producto × tienda, con el precio, `affiliate_url` —el enlace de afiliado que guarda el bot para las tiendas que no son Amazon— y el cupón vigente que más descuenta) y `web_guides_by_product` (qué guías citan cada producto, para enlazarlas desde la ficha). `web_coupons` añade `discount_amount`, `discount_pct` y `min_purchase` para calcular el precio final con el cupón.

Hoy una guía se publica con SQL, hasta que exista el panel de administración:

1. Inserta la fila en `guides` (`slug` en minúsculas con guiones, `title`, `subtitle`, `category`, `intro_md`, `how_to_choose_md`, `faq` como `[{"q": "...", "a_md": "..."}]`, `reading_minutes`) con `status = 'draft'`.
2. Añade los productos en `guide_items` (`guide_id`, `position`, `name`, `award`, `summary_md`, `pros`, `cons`, `specs`) y sus tiendas en `guide_item_stores` (`store`, `external_id` = ASIN o id de la tienda, `url` canónica, `note`).
3. Cuando el contenido esté listo, pon `status = 'published'` y `published_at`. La guía aparece en `/guias`, y en el sitemap en cuanto sus precios estén frescos.

Una guía con `status = 'published'` y un `published_at` futuro está programada: es invisible (las vistas `web_guides`, `web_guide_items` y `web_guides_by_product` la filtran con `published_at <= now()`) hasta esa hora y después aparece sola, con la caché ISR de una hora (o al instante con `/api/revalidate`).

El ejemplo completo es `supabase/migrations/20261108000001_guides_seed.sql` (la guía de freidoras de aire, como borrador con los valores entre corchetes por rellenar).

Los precios los actualiza el bot con la fuente `guide_prices` (cada 6 h, `every_minutes = 360`), que escribe en `product_prices` para los productos de las guías. Una guía sin precios frescos (menos de 48 h) se sirve igualmente, pero con `noindex` y con la fecha de comprobación visible; así no se indexa una guía con precios antiguos.

## Calendario de eventos

Los eventos salen de la vista `web_events` (ver «Eventos»). La barra de anuncio muestra el siguiente; el bloque de eventos, los cuatro siguientes.

## Eventos

Páginas editoriales de eventos de compras (`/eventos` y `/eventos/{slug}`). Los datos viven en la tabla `events` y la web solo lee las vistas `web_events` (solo `status = 'published'`) y `web_event_promos`; ambas tablas tienen RLS y sin acceso para `anon`.

- Campos de `events`: `slug` (único y evergreen: `black-friday`, no `black-friday-2026`), `name`, `stores` (ids de `src/lib/stores.ts`; vacío = general), `starts_on` y `ends_on` (días locales en `Europe/Madrid`, ambos inclusivos; `ends_on = starts_on` para un solo día), `approximate` (fecha no anunciada: solo se muestra el mes y no se emite JSON-LD), `hashtags` (hashtags de chollos del evento, p. ej. `{blackfriday}`), `aliexpress_promo` (`promotion_name` de la campaña de AliExpress; `null` = sin bloque), `intro_md`, `tips_md` y `faq` (`[{"q": "...", "a_md": "..."}]`, misma forma que `guides.faq`).
- `status`: `draft` (no sale en ninguna vista, ni en el sitemap) o `published`.
- Tres fases según la fecha de hoy: antes («Empieza el…»), en marcha («En marcha hasta el…») y terminado. La página es la misma; cambian el estado de la cabecera y qué bloques tienen sentido.
- Bloques (los vacíos se omiten, nunca se pinta «0 resultados»):
  - Chollos: los que llevan alguno de los `hashtags` del evento o se publicaron dentro del rango de fechas en una de sus `stores` (sin `stores`, en cualquier tienda; si el evento no tiene hashtags, solo el rango). «Ver todos los chollos» lleva a `/chollos/{hashtag}`.
  - Cupones: los de `web_coupons` con `coupons.event_id` igual al evento.
  - Productos de AliExpress: filas de `event_promos` (vista `web_event_promos`) que sincroniza el ejecutor `event_promos` del bot a partir de `aliexpress_promo`. Se muestran con una nota que aclara que son precios del catálogo de AliExpress y no chollos verificados. Ver `bot/README.md`, «Campañas de AliExpress».
- Portada: mientras hay un evento en marcha, el botón principal del hero pasa a «Chollos del {evento}» y apunta a `/eventos/{slug}`.
- SEO: `/eventos` (índice, prioridad 0,7 en el sitemap) y `/eventos/{slug}` (0,9 mientras el evento está en marcha o empieza en los próximos 60 días; 0,6 en otro caso). JSON-LD `Event` solo con fechas confirmadas (`approximate = false`). Los borradores no entran en el sitemap.
- Publicar un evento: rellena el contenido y cambia `status` a `published` (`update events set status = 'published' where slug = '...';`). Las páginas se regeneran cada hora (`revalidate = 3600`), así que el cambio tarda hasta 1 h en verse.
- El seed de `supabase/migrations/20261110010000_events.sql` publica 11.11 y Black Friday; Cyber Monday, Rebajas de enero y Prime Day quedan como borrador con textos entre corchetes por rellenar.

## Telegram

- Actividad del canal: la tabla `channel_stats` se expone en la vista `web_channel_stats` (`members`, `checked_at`, `posted_today`, `last_posted_at`) y las últimas publicaciones (máximo 5) en `web_channel_recent`. El bloque de Telegram de la portada las lee en el servidor; si faltan, oculta las cifras.
- El ejecutor `channel_stats` del bot actualiza esos datos cada 60 min con `GetFullChannelRequest` de Telethon. Ver `bot/README.md`.
- `POST /api/clic` recibe `{placement, path}` e inserta una fila en `cta_clicks` (solo insert anónimo). Límite de 20 peticiones por minuto y por IP; responde siempre 204. No se guarda nada identificativo: ni IP, ni user agent, ni cookies.
- La página de administración `/clics` (en `admin/`) lee la vista `cta_clicks_daily` (últimos 14 días).
- En el cliente, el helper `trackCtaClick` envía el clic y el componente `TelegramCta` lo usa en cada botón que lleva al canal. Ubicaciones (`placement`): `header`, `hero`, `block`, `recent`, `deal`, `footer` y `contact`.

### Portadas de las guías

Cada guía puede tener una ilustración del pato con el producto en `public/guias/<slug>.jpeg` (1376 × 768, generada con los prompts de `docs/guias-portadas-prompts.md`). La lista de guías con portada está en `src/lib/guide-covers.ts`: al añadir una imagen nueva, añade su slug ahí. La portada se usa como imagen Open Graph y `Article.image` de la guía, bajo la cabecera de la ficha y arriba de la tarjeta en `/guias`; sin portada se usa la imagen genérica del sitio.

## Seguridad

La web solo usa la clave pública (anon) de Supabase y solo lee las vistas `web_deals`, `web_hashtags`, `web_coupons`, `web_stores`, `web_guides`, `web_guide_items`, `web_guides_by_product`, `web_events`, `web_event_promos` y `web_page_copy`. Nunca pongas la clave `service_role` en la web ni en Vercel. `node scripts/check-views.mjs` comprueba con la clave anon que esas vistas se leen y que la tabla `coupons` no; también cubre las vistas y tablas de guías (`web_guides*` legibles; `guides`, `guide_items`, `guide_item_stores` y `product_prices` no) de eventos (`web_events` y `web_event_promos` legibles; `events` y `event_promos` no) y de textos editoriales (`web_page_copy` legible; `page_copy` no).

## Despliegue en Vercel

1. Importa el repositorio `darod46/patobarato`.
2. Root Directory: `web` (el framework Next.js lo fija `vercel.json`).
3. Variables de entorno `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` en Production y Preview; además `ALIEXPRESS_APP_KEY`, `ALIEXPRESS_APP_SECRET` y `ALIEXPRESS_TRACKING_ID` (solo servidor) para el bloque de AliExpress; y `REVALIDATE_SECRET` (solo servidor, el mismo valor que en el `.env` del bot) para la revalidación bajo demanda. Las `VITE_SUPABASE_*` antiguas siguen valiendo por el fallback de `next.config.ts`.
4. Las variables se incrustan en el build: tras cambiarlas hay que redesplegar.
5. Orden de despliegue con migraciones nuevas: aplicar `20261123000000_page_copy.sql` y ejecutar `node scripts/check-views.mjs` antes de desplegar la web; después, comprobar `/api/salud` (`checks.copies` > 0).
6. Dominio principal: `www.patobarato.com` (`patobarato.com` redirige a él).
