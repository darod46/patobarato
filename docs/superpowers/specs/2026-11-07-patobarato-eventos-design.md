# PatoBarato — Páginas de evento (Black Friday, 11.11, Cyber Monday…)

Fecha: 2026-11-07. Estado: pendiente de aprobación del usuario.
Antecedentes: `2026-11-06-patobarato-multitienda-design.md` (tiendas, AliExpress, cupones), `2026-11-07-patobarato-buscador-design.md` (catálogo, `CatalogCard`, cliente AliExpress del bot). Estado actual: calendario estático en `web/src/content/events.ts` (cinco eventos) que alimenta la barra de anuncio y `EventsBlock` del home; no existe ninguna página por evento.

## 1. Intención

El usuario quiere una página por evento comercial (Black Friday, 11.11 de AliExpress, Cyber Monday, rebajas de enero, Prime Day) y, sobre todo, **que esas páginas queden indexadas en Google** a tiempo para el 11.11 y el Black Friday de 2026. Enfoque aprobado (A): URLs *evergreen* `/eventos/{slug}` que no cambian de un año a otro, contenido editorial en Supabase (editable después desde el portal de administración), y bloques dinámicos con los chollos propios, los cupones y los productos de las campañas destacadas de AliExpress.

Hechos que condicionan el diseño: Google tarda días o semanas en indexar y posicionar una URL nueva, así que las páginas deben existir y estar enlazadas desde el sitio cuanto antes, con contenido útil aunque el evento no haya empezado; la API de afiliados de AliExpress expone campañas (`aliexpress.affiliate.featuredpromo.get`) y sus productos (`aliexpress.affiliate.featuredpromo.products.get`), sin garantizar descuentos ni fechas; el bot ya tiene cliente firmado para AliExpress y un planificador de fuentes por tipo.

## 2. Objetivos, no objetivos y anti-objetivos

**Objetivos**
- Páginas `/eventos` y `/eventos/{slug}` renderizadas en servidor, indexables, con metadata, JSON-LD y entradas en el sitemap, enlazadas desde la navegación, la barra de anuncio, `EventsBlock` y los chollos con hashtag de evento.
- Contenido editorial (intro, consejos, FAQ) y fechas en una tabla `events` de Supabase, que sustituye a `content/events.ts`; semilla con los cinco eventos actuales.
- Tres modos por fecha (antes, durante, después) sobre la misma URL, sin páginas por año.
- Bloques dinámicos: chollos propios (por hashtag o por rango de fechas), cupones asociados al evento y productos de la campaña de AliExpress sincronizados por el bot en `event_promos`.
- Mando para el bot: listar campañas de AliExpress disponibles para rellenar `events.aliexpress_promo` a mano.

**No objetivos**
- Portal de administración (spec aparte, ya acordado); el texto se edita por SQL/Studio hasta entonces.
- Páginas por evento y año (`/black-friday-2026`), recaps históricos o archivo de ediciones pasadas.
- Campañas de Amazon o de Awin (Awin no expone campañas por API; sus promociones ya entran como cupones).
- Avisos por Telegram o correo cuando empieza un evento.

**Anti-objetivos**
- Afirmar lo que los datos no respaldan: nada de «hasta −70 %», cuentas atrás a fechas aproximadas ni «miles de ofertas» cuando el bloque está vacío. Un bloque sin datos no se muestra.
- Contenido delgado que Google trate como *doorway page*: cada evento publicado lleva intro, consejos y FAQ propios, no plantillas idénticas con el nombre cambiado.
- Exponer tablas: la web lee `web_events` y `web_event_promos` con la anon key; `events` y `event_promos` quedan revocadas.
- Registrar en logs claves, URLs de afiliado o cuerpos de respuesta de AliExpress.

## 3. Restricciones

- Web: Next.js 16 App Router, React 19, Tailwind v4 con los tokens de `globals.css`, Lucide únicamente, Vitest + Testing Library, `react-markdown` + `remark-gfm` vía `components/Markdown.tsx`. Texto en español; código y comentarios en inglés. Objetivos táctiles ≥ 44 px. Fechas en `Europe/Madrid` (como `lib/events.ts`).
- Bot: Python 3.12, httpx, `AliExpressClient` (`stores/aliexpress_client.py`), `ApiScheduler`/`ApiSourceRunner`, repositorio con versión en memoria y Supabase, parser estricto `parse_price`.
- Supabase: migraciones en `supabase/migrations/` aplicadas por la Management API; `notify pgrst, 'reload schema'` tras crear vistas; `scripts/check-views.mjs` vigila lo legible por la anon key.
- Vercel: sin variables nuevas. Las páginas de evento usan ISR; si la carga en servidor falla, degradan como el resto (`lib/optional.ts`).

## 4. Modelo de datos

Migración `supabase/migrations/20261110000000_events.sql`.

```sql
create table events (
    id bigint generated always as identity primary key,
    slug text not null unique,                 -- black-friday, aliexpress-1111… (URL evergreen)
    name text not null,                        -- «Black Friday»
    stores text[] not null default '{}',       -- ids de lib/stores.ts; vacío = general
    starts_on date not null,                   -- día local (Europe/Madrid)
    ends_on date not null,                     -- inclusive; = starts_on para un solo día
    approximate boolean not null default false,-- fecha no anunciada: solo se muestra el mes
    hashtags text[] not null default '{}',     -- hashtags de chollos del evento (#blackfriday)
    aliexpress_promo text,                     -- promotion_name de featuredpromo.get, null = sin bloque
    intro_md text not null default '',
    tips_md text not null default '',
    faq jsonb not null default '[]',           -- [{"q": "...", "a_md": "..."}], misma forma que guides.faq
    status text not null default 'draft' check (status in ('draft', 'published')),
    updated_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    check (ends_on >= starts_on)
);
create trigger events_set_updated_at before update on events
    for each row execute function guides_touch_updated_at();   -- misma función que guides (sólo pone updated_at = now())

create table event_promos (
    event_id bigint not null references events (id) on delete cascade,
    external_id text not null,                 -- product_id de AliExpress
    title text not null,
    price numeric(10,2) not null,              -- target_sale_price (EUR)
    original_price numeric(10,2),              -- target_original_price; null si no > price
    currency char(3) not null default 'EUR',
    image_url text,
    affiliate_url text not null,               -- promotion_link
    position int not null,                     -- orden devuelto por la API
    synced_at timestamptz not null default now(),
    primary key (event_id, external_id)
);

alter table coupons add column event_id bigint references events (id) on delete set null;

alter table sources drop constraint sources_type_check;
alter table sources add constraint sources_type_check check (type in
    ('telegram_channel', 'aliexpress_api', 'awin_promotions', 'guide_prices', 'awin_feeds', 'event_promos'));
insert into sources (type, identifier, country, active, every_minutes)
    values ('event_promos', 'aliexpress', 'ES', true, 1440);
```

Vistas (lo único que lee la web):

- `web_events`: todas las columnas de `events` salvo `created_at`, con `status = 'published'`. Incluye los eventos pasados: la URL es permanente.
- `web_event_promos`: columnas de `event_promos` más `slug`, ordenadas por `event_id, position`, solo de eventos publicados.
- `web_coupons`: añade `event_id`.
- `web_deals` no cambia; el filtro por evento se hace en `fetchDeals`.

RLS activado en `events` y `event_promos`; `revoke all` a `anon`/`authenticated` en ambas tablas; `grant select` en las dos vistas. `scripts/check-views.mjs` comprueba que las vistas responden y las tablas no.

Semilla (misma migración): los cinco eventos de `content/events.ts`. `black-friday` (27/11 – 29/11, hashtags `{blackfriday}`, stores `{amazon,pccomponentes,mediamarkt}`) y `aliexpress-1111` (11/11, hashtags `{1111,aliexpress}`, `aliexpress_promo` a rellenar con el CLI) van `published` con intro, consejos y FAQ cortos y honestos escritos en la migración, para llegar a tiempo. `cyber-monday` (30/11), `rebajas-enero` (07/01 – 31/01/2027) y `prime-day` (julio 2027, `approximate`) van `draft` con `[CORCHETES]` donde falta texto. Para 2027 basta actualizar `starts_on`/`ends_on` desde el portal.

## 5. Bot: campañas de AliExpress

**Cliente** (`stores/aliexpress_client.py`):
- `featured_promos() -> list[AliPromo]`: `aliexpress.affiliate.featuredpromo.get`; `AliPromo(name, start, end)` con fechas opcionales (la API las da como texto; se parsean con tolerancia y se guardan como `None` si no se entienden).
- `featured_promo_products(promo_name, page_no=1, page_size=50, target_currency='EUR', target_language='ES', tracking_id) -> AliPromoPage(products, has_more)`: `aliexpress.affiliate.featuredpromo.products.get`. Cada producto pasa por el parseo estricto ya usado en `hot_products` (`_decimal`, precios > 0, `promotion_link` presente); los que no cumplen se descartan en silencio con un contador en el log.

**Runner** (`sources/event_promos.py`, `EventPromosSource`, `type='event_promos'`, cada 24 h, incluido en `build_runners` solo cuando hay credenciales de AliExpress):
1. `repo.list_events_with_promo()` → eventos (publicados o no) con `aliexpress_promo` no nulo.
2. Por evento: hasta 3 páginas de 50 productos (≤ 150), con la pausa entre llamadas ya configurada para AliExpress.
3. Si todas las páginas responden, `repo.replace_event_promos(event_id, rows)` (borra e inserta en una transacción por evento; en Supabase: `delete` + `upsert` en el mismo runner, con el `synced_at` nuevo). Si alguna llamada falla o devuelve 0 productos en la primera página, **no se toca** lo que hay y se registra `event_promos: <slug> kept N rows — <error>` sin cuerpo de respuesta.
4. Un evento que falla no detiene a los demás.

**CLI**: `python -m patobarato promos` imprime nombre y fechas de las campañas disponibles (tabla en texto plano) para copiar el `promotion_name` en `events.aliexpress_promo`. Sin credenciales termina con un mensaje claro y código 1.

**Repositorio** (Protocol + memoria + Supabase): `list_events_with_promo() -> list[EventRef]` (`EventRef(id, slug, aliexpress_promo)`), `replace_event_promos(event_id, rows: list[EventPromoRow]) -> None`.

## 6. Web

### 6.1 Datos (`lib/events.ts`, `lib/events-data.ts`)
- `SiteEvent` pasa a tener `slug`, `name`, `stores`, `startsOn`, `endsOn`, `approximate`, `hashtags`, `aliexpressPromo`, `introMd`, `tipsMd`, `faq: {q, a}[]`, `updatedAt`. Se elimina `content/events.ts`; las funciones `daysUntil`, `upcomingEvents`, `nextEvent`, `whenLabel`, `eventDateLabel`, `eventLongDateLabel` se conservan con la misma semántica usando `startsOn` (y `ANNOUNCE_WINDOW_DAYS = 45`).
- Nuevo `eventPhase(event, now): 'before' | 'during' | 'after'` por día local de Madrid (`during` cuando `startsOn ≤ hoy ≤ endsOn`).
- `fetchEvents(client)` (todas, orden por `starts_on`), `fetchEvent(client, slug)`, `fetchEventPromos(client, slug)` → `CatalogProduct[]` con `origin: 'aliexpress'` reutilizando `toProduct` de `lib/catalog.ts`.
- `fetchDeals` acepta `event?: { hashtags: string[]; from: string; to: string }`: `hashtags` vacío → solo rango (`published_at` entre `from` 00:00 y `to` 23:59:59 Madrid); con hashtags → `or(hashtags.ov.{…}, and(published_at.gte…, published_at.lte…))`. La página de evento pide 12 y muestra «Ver todos» a `/chollos?tag=<primer hashtag>` solo si hay hashtags.
- Home: `page.tsx` carga los eventos con `optional('home-events', …)`; `HomeClient` recibe `events` y, si llegan `undefined`, omite barra y `EventsBlock` (no vuelve al calendario estático, que ya no existe).

### 6.2 Rutas
- `/eventos` (`revalidate = 3600`): cabecera «Eventos de compras», lista de tarjetas en tres grupos: «En marcha», «Próximos», «Pasados» (los pasados con fecha de la última edición y enlace; sin cuenta atrás). Cada tarjeta: nombre, fecha (`eventLongDateLabel`, o «previsto para julio» si `approximate`), tiendas (chips existentes) y resumen = primera línea de `introMd`.
- `/eventos/[slug]` (`revalidate = 3600`, `generateStaticParams` desde `web_events`, `dynamicParams = true`, `notFound()` si no existe o es `draft`). Estructura:
  1. Migas (Inicio › Eventos › nombre) + `h1` nombre + línea de estado según fase: *before* «Empieza el 27 de noviembre (en N días)» / «Previsto para julio» si aproximado; *during* «En marcha hasta el 29 de noviembre» (o «Es hoy» si un día); *after* «Terminó el 29 de noviembre. El próximo evento es … (enlace)» o «Volverá en 2027» sin próximo.
  2. Intro (`Markdown`).
  3. Bloque de chollos (`DealCarousel`/rejilla existente) con título «Chollos del Black Friday» (*during*/*after*) o «Chollos relacionados» (*before*, con lo que haya por hashtag). Omitido si vacío.
  4. Bloque de cupones del evento (`CouponsBlock` filtrado por `event_id`). Omitido si vacío.
  5. Bloque «Selección de AliExpress para el 11.11» con `CatalogCard` (`CatalogBlock`, `onlyWhenResults`), con la nota honesta ya usada en `/buscar` (precio del catálogo, no chollo verificado). Solo si hay filas en `web_event_promos`. En *before* se muestra igual si existe (AliExpress abre campañas antes de la fecha).
  6. Consejos (`Markdown` de `tipsMd`), FAQ (`<details>` por pregunta), y enlace a Telegram con el `TelegramBlock` existente.
  Orden en *before*: 1, 2, 6 (consejos+FAQ), 3, 4, 5, Telegram. En *during*/*after*: 1, 2, 3, 4, 5, 6, Telegram.
- `lib/nav.ts`: nuevo ítem «Eventos» → `/eventos` (entre Cupones y Tiendas). `AnnouncementBar` y `EventsBlock` enlazan cada evento a `/eventos/{slug}`. `DealCard` no cambia; la relación chollo→evento la da el chip de hashtag que ya lleva a `/chollos?tag=`.

### 6.3 SEO
- `generateMetadata`: title «Black Friday 2026: chollos, cupones y consejos | PatoBarato» (el año = el de `startsOn`), description derivada de la primera frase de `introMd` (máx. 155 caracteres), `alternates.canonical`, OpenGraph con la imagen por defecto del sitio. `/eventos` con metadata fija.
- JSON-LD en la página de evento: `BreadcrumbList` siempre; `Event` solo si `approximate = false`, con `name`, `startDate`/`endDate` (fecha sin hora), `eventStatus: EventScheduled`, `eventAttendanceMode: OnlineEventAttendanceMode`, `location: { "@type": "VirtualLocation", url }`, `organizer: { "@type": "Organization", name: "PatoBarato", url }`, `description`. Sin `offers` (no hay un precio del evento).
- `lib/sitemap.ts`: `/eventos` (`weekly`, 0.7) y cada evento publicado (`lastmod = updatedAt`, `weekly`, prioridad 0.9 si empieza en ≤ 60 días o está en marcha, 0.6 en otro caso). `app/sitemap.ts` añade `fetchEvents` con `.catch(() => [])`.
- Sin `noindex` en ninguna fase; `/eventos/[slug]` nunca redirige.

### 6.4 Errores
- `fetchEvent` falla (no 404): la página lanza y Next sirve la última versión ISR; en el build, `generateStaticParams` devuelve `[]` con `console.error('events: …')` y las páginas se generan bajo demanda.
- Fallan los bloques (chollos, cupones, promos): cada uno va en `optional('evento/<slug>/<bloque>', …)` y se omite; la página editorial se sirve igual.
- Markdown vacío: la sección no se renderiza (sin encabezados huérfanos).

## 7. Tests

**Web (Vitest)**: `eventPhase` y etiquetas de estado en los tres modos incluyendo límites (día de inicio, día de fin, cambio de día a las 23:30 Madrid, `approximate`); `fetchDeals` con `event` (solo rango, hashtags + rango, consulta construida); `generateMetadata` y JSON-LD (`Event` ausente con `approximate`); `buildSitemap` con eventos (prioridades por fecha); página `/eventos` con los tres grupos; página de evento con bloques omitidos cuando no hay datos y `notFound` para slug inexistente; `HomeClient` sin eventos; `nav` con «Eventos».

**Bot (pytest)**: `featured_promos` y `featured_promo_products` con respuestas grabadas (producto sin precio descartado, `has_more`); `EventPromosSource`: reemplazo completo en éxito, conservación en fallo de página 2, conservación con 0 productos, paginación ≤ 3, un evento fallido no bloquea al siguiente, no incluido en `build_runners` sin credenciales; CLI `promos` con y sin credenciales; repositorio en memoria y Supabase (`replace_event_promos` borra lo anterior).

**Comprobación manual**: `node scripts/check-views.mjs`; `curl` de `/eventos/black-friday` y `/sitemap.xml` en producción; prueba de datos estructurados de Google sobre la URL.

## 8. Despliegue y entrega

1. Migración aplicada vía Management API + `notify pgrst, 'reload schema'`.
2. Merge a `main`; David hace `git push`; Vercel despliega.
3. David: ejecuta `python -m patobarato promos`, copia el nombre de la campaña del 11.11 en `events.aliexpress_promo`, fuerza el runner (`last_run_at = null` en `sources` tipo `event_promos`); revisa los textos publicados de Black Friday y 11.11 y publica los demás cuando quiera.
4. Tras el deploy: pedir indexación de `/eventos/black-friday` y `/eventos/aliexpress-1111` en Search Console (acción manual de David; el sitio ya envía el sitemap).
