# PatoBarato web

Web pública de [PatoBarato](https://www.patobarato.com): Next.js 16 (App Router), React, TypeScript y Tailwind v4. Los datos vienen de Supabase con la clave pública (anon) y solo se leen las vistas `web_deals`, `web_hashtags`, `web_coupons`, `web_stores`, `web_guides`, `web_guide_items` y `web_guides_by_product`.

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
| `node scripts/check-views.mjs` | Comprueba el acceso anon a las vistas públicas |
| `node scripts/render-og.mjs` | Regenera `public/og.png` |
| `npm run typecheck` | `tsc --noEmit --incremental false` |

## Rutas

- `/`: portada: barra de anuncio (próximo evento del calendario), hero, listado con orden (`?orden=recientes|descuento|minimo`) y chips de hashtags, cupones (si hay), cómo funciona, calendario de eventos, «Hola, soy el Pato», bloque Telegram y pie.
- `/cupones`: cupones vigentes (vista `web_coupons`), agrupados por tienda. `noindex` si no hay ninguno.
- `/tiendas`: índice de tiendas con chollos o cupones activos (vista `web_stores`), con sus recuentos. `noindex` salvo que haya más de una tienda con datos; si la vista no carga, muestra un aviso en lugar de datos inventados.
- `/tiendas/{tienda}`: chollos y cupones de una tienda (el slug es el id de `src/lib/stores.ts`; 404 si no existe). Cabecera con los recuentos reales, cupones vigentes de la tienda y listado con orden, hashtags y «cargar más». `noindex` si tiene menos de 3 chollos.
- `?tienda={id}`: filtra por tienda el listado de la portada (y de `/buscar`) y lo marca con chips; en `/tiendas/{tienda}` se ignora porque la tienda viene de la ruta.
- `/guias`: índice de guías de compra publicadas (vista `web_guides`), más recientes primero. `noindex` si no hay ninguna.
- `/guias/{slug}`: una guía con sus productos (vista `web_guide_items`), precios y cupones de la tienda. `noindex` mientras sus precios no estén frescos (ver «Guías de compra»); 404 si el slug no existe o no está publicada.
- `/aviso-legal`, `/privacidad`, `/cookies`, `/afiliados`, `/contacto`: páginas estáticas. Los textos llevan marcadores `[TITULAR]`, `[NIF]`, `[DIRECCIÓN]`, `[EMAIL]`, `[CIUDAD]`, `[PLAZO]` que hay que sustituir.
- `/oferta/{tienda}/{slug}-{id}`: ficha de producto (Amazon y AliExpress). Las tiendas de Awin usan `/oferta/{tienda}/{id}`, con el id codificado como porcentaje. Redirige con 308 a la URL canónica si el slug no coincide; 404 si la oferta no existe.
- `/chollos/{hashtag}`: listado por hashtag. `noindex` si tiene menos de 3 ofertas.
- `/chollos`: listado puro (sin buscador) con orden (`?orden=`), tienda (`?tienda=`) y chips. Es dinámico: el servidor valida `?tag=`, `?orden=` y `?tienda=` con las mismas reglas que el cliente (`src/lib/filters.ts`) y pinta ya la página 0 filtrada, sin `revalidate`.
- `/buscar`: buscador global, indexable sin `?q=` (con `?q=` lleva `noindex`, también por `X-Robots-Tag`). Un campo y tres bloques: «Chollos» (vista `web_deals`), «En AliExpress» (`/api/buscar/aliexpress`; se oculta si el endpoint responde 204) y «En tiendas» (catálogo propio, función `web_catalog_search`). Desde 2 letras; el campo escribe `?q=` en la URL. La cabecera de todas las demás páginas enlaza aquí con el botón «Buscar».
- `/api/buscar/aliexpress?q=`: búsqueda en AliExpress desde el servidor. Variables `ALIEXPRESS_APP_KEY`, `ALIEXPRESS_APP_SECRET` y `ALIEXPRESS_TRACKING_ID`, **solo en Vercel y solo servidor** (nunca `NEXT_PUBLIC_*`). Sin ellas responde 204 y el bloque no se muestra. Caché de 15 min (`s-maxage=900`) y límite global de 30 consultas distintas por minuto (no por cliente; 429 con `Retry-After`).
- Catálogo de tiendas: la tabla `catalog_products` la rellena el bot (`upsert_catalog_products`) y la web solo la consulta con la función `web_catalog_search` (anon); la tabla no se lee directamente.
- Redirecciones (308, `next.config.ts`): `/?q=…` y `/chollos?q=…` van a `/buscar?q=…`; `/?tag=…`, `/?orden=…` y `/?tienda=…` van a `/chollos` con el mismo filtro. Ya no hay reescrituras hacia `/buscar`.
- `/go/{ASIN}`: página de salto a Amazon (`public/go.html`, añade el tag de afiliado por script).
- `/sitemap.xml` y `/robots.txt`: generados por `src/app/sitemap.ts` y `src/app/robots.ts`. El sitemap incluye `/guias` y `/guias/{slug}` (con `lastModified` = `updated_at`) aunque una guía aún no tenga precios, porque la página se marca `noindex` por su cuenta. El sitemap incluye `/buscar`; robots.txt solo bloquea `/go/`.
- `/og.png`: imagen Open Graph (`public/og.png`), generada con `node scripts/render-og.mjs` a partir de `scripts/og.html` (necesita Playwright).

## Caché (ISR)

- Listados (`/`, `/chollos/{hashtag}`, `/tiendas`, `/tiendas/{tienda}`): 60 s.
- `/chollos` y `/buscar`: dinámicos (por petición); `/api/buscar/aliexpress`: 15 min.
- Cupones (`/cupones`): 600 s.
- Producto (`/oferta/...`): 600 s.
- Sitemap: 3600 s.

## SEO

- Metadatos (title, description, Open Graph) por página y URLs canónicas.
- JSON-LD: `Product` (ficha), `BreadcrumbList`, `WebSite` con `SearchAction` y `Organization` (sitio).
- Search Console: añade la propiedad `www.patobarato.com` y envía `/sitemap.xml`.

## Iconos

Solo iconos de [Lucide](https://lucide.dev) vía `lucide-react`; `src/icons.test.ts` falla si aparece un `<svg>` a mano o un emoji fuera de `TelegramPreview`.

## Cupones

Los cupones también se sincronizan desde Awin (ver el README del bot); además se pueden insertar a mano en la tabla `coupons` desde el panel de Supabase (`store` con el id de `src/lib/stores.ts`, p. ej. `aliexpress`; `code`; `title` como «−6 € en 40 €»; `conditions`; `url` de afiliado opcional; `starts_at`, `expires_at`, `active`). La vista `web_coupons` solo devuelve los vigentes; la portada los recoge en ≤ 60 s y `/cupones` en ≤ 600 s.

## Guías de compra

Vistas: `web_guides` (una fila por guía publicada, con `prices_checked_at`), `web_guide_items` (una fila por producto × tienda, con el precio, `affiliate_url` —el enlace de afiliado que guarda el bot para las tiendas que no son Amazon— y el cupón vigente que más descuenta) y `web_guides_by_product` (qué guías citan cada producto, para enlazarlas desde la ficha). `web_coupons` añade `discount_amount`, `discount_pct` y `min_purchase` para calcular el precio final con el cupón.

Hoy una guía se publica con SQL, hasta que exista el panel de administración:

1. Inserta la fila en `guides` (`slug` en minúsculas con guiones, `title`, `subtitle`, `category`, `intro_md`, `how_to_choose_md`, `faq` como `[{"q": "...", "a_md": "..."}]`, `reading_minutes`) con `status = 'draft'`.
2. Añade los productos en `guide_items` (`guide_id`, `position`, `name`, `award`, `summary_md`, `pros`, `cons`, `specs`) y sus tiendas en `guide_item_stores` (`store`, `external_id` = ASIN o id de la tienda, `url` canónica, `note`).
3. Cuando el contenido esté listo, pon `status = 'published'` y `published_at`. La guía aparece en `/guias` y en el sitemap.

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

## Seguridad

La web solo usa la clave pública (anon) de Supabase y solo lee las vistas `web_deals`, `web_hashtags`, `web_coupons`, `web_stores`, `web_guides`, `web_guide_items`, `web_guides_by_product`, `web_events` y `web_event_promos`. Nunca pongas la clave `service_role` en la web ni en Vercel. `node scripts/check-views.mjs` comprueba con la clave anon que esas vistas se leen y que la tabla `coupons` no; también cubre las vistas y tablas de guías (`web_guides*` legibles; `guides`, `guide_items`, `guide_item_stores` y `product_prices` no) y de eventos (`web_events` y `web_event_promos` legibles; `events` y `event_promos` no).

## Despliegue en Vercel

1. Importa el repositorio `darod46/patobarato`.
2. Root Directory: `web` (el framework Next.js lo fija `vercel.json`).
3. Variables de entorno `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` en Production y Preview; además `ALIEXPRESS_APP_KEY`, `ALIEXPRESS_APP_SECRET` y `ALIEXPRESS_TRACKING_ID` (solo servidor) para el bloque de AliExpress. Las `VITE_SUPABASE_*` antiguas siguen valiendo por el fallback de `next.config.ts`.
4. Las variables se incrustan en el build: tras cambiarlas hay que redesplegar.
5. Dominio principal: `www.patobarato.com` (`patobarato.com` redirige a él).
