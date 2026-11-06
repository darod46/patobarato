# PatoBarato — Multitienda y descubrimiento por API

Fecha: 2026-11-06. Estado: pendiente de aprobación del usuario.
Antecedentes: `2026-11-04-patobarato-bot-design.md` (bot), `2026-11-05-patobarato-web-nextjs-design.md` (web v2) y `2026-11-06-patobarato-web-rediseno-design.md` (web v3, cupones).

## 1. Intención

Hoy el bot y la web solo entienden Amazon. El usuario quiere que PatoBarato publique chollos de más tiendas (AliExpress primero; PcComponentes, MediaMarkt y El Corte Inglés en cuanto Awin acepte sus solicitudes) y, además de leer los canales de Telegram, **buscar chollos propios** con las APIs de afiliado: AliExpress Portals (productos en oferta) y Awin (promociones y cupones). Lo descubierto por API sale en la web; una selección para el canal de Telegram queda para más adelante.

Cuentas de afiliado disponibles: Amazon (actual), AliExpress Portals y Awin (publisher; programas de PcComponentes, MediaMarkt y El Corte Inglés pendientes de aceptación).

## 2. Objetivos, no objetivos y anti-objetivos

**Objetivos**
- Abstracción de tienda compartida en el bot: reconocer enlaces de varias tiendas en los canales de Telegram, generar su enlace de afiliado, encontrar su imagen y publicarlos como hoy.
- Fuentes nuevas del bot: `aliexpress_api` (chollos de producto por descuento) y `awin_promotions` (cupones y promociones de los anunciantes afiliados), ejecutadas por un planificador interno y guardadas como publicaciones «solo web» o como cupones.
- Web: páginas por tienda, bloque de tiendas en portada y filtro por tienda, solo con tiendas que tengan datos reales.
- Modelo de datos preparado para publicar en Telegram, en el futuro, una selección de lo descubierto por API.

**No objetivos**
- Publicar en el canal de Telegram lo que venga por API.
- Feeds de producto de Awin (CSV diarios), scraping de tiendas, comparación de precios entre tiendas, alertas, guías.
- Tiendas sin cuenta de afiliado ni adaptador (Decathlon queda fuera de esta fase).

**Anti-objetivos**
- Afirmaciones falsas: la web nombra una tienda solo cuando tiene chollos activos o cupones vigentes.
- Romper el flujo actual de Amazon, el canal de Telegram, `/go/{ASIN}` ni las vistas públicas.
- Exponer credenciales: las de AliExpress y Awin viven solo en el `.env` del bot.
- Inundar: tope de resultados por ejecución y descuento mínimo en cada fuente API.

## 3. Restricciones

- Bot Python 3.12 (Telethon, httpx, pydantic-settings), desplegado como imagen Docker en el servidor del usuario; un solo proceso.
- Supabase compartido; migraciones en `supabase/migrations/`, aplicadas por Claude como las anteriores. La web sigue leyendo solo vistas con la clave anon.
- Web Next.js 16 (v3). Tokens, iconos (Lucide) y reglas de copy de la spec v3.
- APIs externas: AliExpress Portals (firma HMAC con app key/secret, `tracking_id`), Awin Publisher API (token Bearer, `publisher id`, `advertiser id` por anunciante).
- Enfoque elegido: **A, registro de tiendas compartido + fuentes enchufables** en el mismo bot. Descartados: un servicio aparte para las APIs (duplica despliegue y deduplicación) y crons en la web (necesitarían `service_role`).

## 4. Modelo de datos

Migración `20261107000000_multistore.sql`:

```sql
-- products.asin pasa a ser "identificador del producto en su tienda" (ASIN, id numérico de AliExpress, ruta de la URL en tiendas Awin).
comment on column products.asin is 'Identificador del producto en su tienda';
alter table products add column url text;                         -- URL canónica del producto

alter table publications alter column chat_id drop not null;
alter table publications alter column message_id drop not null;
alter table publications add column channel text not null default 'telegram'
    check (channel in ('telegram', 'web'));
alter table publications add constraint publications_telegram_ids
    check (channel <> 'telegram' or (chat_id is not null and message_id is not null));

alter table offers drop constraint offers_status_check;
alter table offers add constraint offers_status_check check (status in (
    'pending', 'published', 'published_web', 'skipped_duplicate',
    'skipped_no_price', 'skipped_stale', 'publish_failed'));

alter table sources drop constraint sources_type_check;
alter table sources add constraint sources_type_check
    check (type in ('telegram_channel', 'aliexpress_api', 'awin_promotions'));
alter table sources add column config jsonb not null default '{}';
alter table sources add column every_minutes int not null default 60;
alter table sources add column hashtags text[] not null default '{}';
alter table sources add column last_run_at timestamptz;
alter table sources add column last_error text;

alter table coupons add column source_id bigint references sources (id);
alter table coupons add column external_id text;
create unique index coupons_source_external_key on coupons (source_id, external_id)
    where source_id is not null;

create view web_stores as
select s.store,
       coalesce(d.deals, 0)   as deals,
       coalesce(c.coupons, 0) as coupons
from (select store from web_deals union select store from web_coupons) s
left join (select store, count(*)::int as deals from web_deals group by store) d using (store)
left join (select store, count(*)::int as coupons from web_coupons group by store) c using (store)
order by deals desc, coupons desc, store;

revoke all on web_stores from anon, authenticated;
grant select on web_stores to anon, authenticated;
```

- `web_deals` no cambia: sigue siendo la última publicación activa por producto, sea de Telegram o `web`. `web_coupons` tampoco.
- `sources.hashtags`: etiquetas que la fuente añade a sus ofertas (p. ej. `{aliexpress}`); para los canales de Telegram se deja vacío (los hashtags vienen del mensaje, como hoy).
- `sources.identifier` para las fuentes API es un nombre único legible (`aliexpress-hot-tecnologia`, `awin-promotions`).

## 5. Bot: tiendas

Paquete `patobarato/stores/`:

```python
class Store(Protocol):
    id: str            # 'amazon', 'aliexpress', 'pccomponentes', 'mediamarkt', 'elcorteingles'
    name: str          # 'AliExpress'
    def matches(self, url: str) -> bool: ...
    def product_id(self, url: str) -> str | None: ...
    def canonical_url(self, product_id: str, country: str) -> str: ...
    async def affiliate_url(self, canonical_url: str, product_id: str) -> str: ...
    async def find_image(self, product_id: str, canonical_url: str) -> str | None: ...
```

- `registry.py`: lista ordenada de tiendas activas; `store_for(url)` devuelve la primera que `matches`. Una tienda sin credenciales completas no entra en el registro y se avisa en el log al arrancar.
- **`amazon`**: envuelve lo actual (`links.py`, `amazon_page.py`); afiliado `?tag=`; `product_id` = ASIN.
- **`aliexpress`**: hosts `aliexpress.com`, `*.aliexpress.com`, `aliexpress.us`; acortadores `s.click.aliexpress.com`, `a.aliexpress.com` resueltos con `UrlResolver` (que pasa a aceptar un predicado de «URL final» en vez de «es Amazon»); `product_id` = dígitos de `/item/{id}.html` (también `/i/{id}.html`); canónica `https://es.aliexpress.com/item/{id}.html`; afiliado con `aliexpress.affiliate.link.generate` (`promotion_link_type=0`, `tracking_id`); imagen con `aliexpress.affiliate.productdetail.get` (`product_main_image_url`), con el precio actual como dato extra para la fuente API. Cliente `aliexpress_client.py`: firma `sha256` HMAC del método + parámetros ordenados, `timestamp`, `sign_method=sha256`, endpoint `https://api-sg.aliexpress.com/sync`.
- **`awin`** (clase genérica instanciada por anunciante a partir de `AWIN_MERCHANTS`): `matches` por host (`pccomponentes.com`, `mediamarkt.es`, `elcorteingles.es`); `product_id` = último segmento de la ruta sin parámetros, barra final ni extensión (`.html`); como dos rutas distintas podrían compartir último segmento, `products.url` guarda la ruta completa y la canónica se toma de ahí; canónica = la URL original sin parámetros de seguimiento; afiliado = `https://www.awin1.com/cread.php?awinmid={mid}&awinaffid={AWIN_PUBLISHER_ID}&ued={url codificada}`; imagen = `og:image` de la página del producto (`generic_page.py`, con las cabeceras de navegador de `amazon_page.py`). Un anunciante con `mid` nulo en `AWIN_MERCHANTS` se reconoce pero publica el enlace directo y lo registra como `affiliate=missing`.
- `extract_offers(msg, registry)`: por cada URL, `store_for(url)`; una oferta por producto (`ParsedOffer` gana `store` real y `product_url`; `asin` se mantiene como nombre del campo). Mensajes con varias tiendas funcionan igual que hoy con varios ASIN.
- Imagen: `ChainImageFinder` delega en `store.find_image`.
- Caption: `LINK_LABEL` pasa a `f"🛒 Ver en {store.name}:"`.
- `pipeline`: `build_affiliate_url` se sustituye por `await store.affiliate_url(...)`; si falla (API caída), se publica con la URL canónica y se registra.
- Configuración (`config.py`): `aliexpress_app_key`, `aliexpress_app_secret`, `aliexpress_tracking_id` (opcionales: sin ellos AliExpress queda desactivada), `awin_publisher_id`, `awin_api_token` (opcionales), `awin_merchants: dict[str, int | None]` (JSON; por defecto `{"pccomponentes": null, "mediamarkt": null, "elcorteingles": null}`).

## 6. Bot: fuentes por API

- `patobarato/sources/api_scheduler.py`: tarea supervisada junto al lector de Telegram. Cada 60 s lee las fuentes activas de tipo API (`repo.list_api_sources()`), ejecuta las que tengan `last_run_at` nulo o anterior a `now - every_minutes`, y guarda `last_run_at`/`last_error`. Una fuente que falle no afecta a las demás ni al lector.
- **`aliexpress_api`** (`sources/aliexpress_source.py`): `config` = `{ "query": "hot" | "search", "keywords": "…", "category_ids": "…", "min_discount": 30, "max_results": 20, "min_price": null, "max_price": null }`. Llama a `affiliate.hotproduct.query` (o `product.query` con `keywords`), `target_currency=EUR`, `target_language=ES`, `ship_to_country=ES`, `sort=LAST_VOLUME_DESC`, `page_size=50`; filtra por `discount >= min_discount` y rango de precio; toma los `max_results` primeros. Cada producto → `ParsedOffer(store='aliexpress', asin=product_id, title, price=target_sale_price, previous_price=target_original_price, coupon=None, hashtags=source.hashtags + ['aliexpress'], canonical_url, product_url, image_url=product_main_image_url, affiliate_url=promotion_link)`. Pasa por `decide` (duplicados, republicación) y se guarda con `insert_publication(channel='web', affiliate_url)`; estado de la oferta `published_web`. No se envía a Telegram.
- **`awin_promotions`** (`sources/awin_source.py`): `GET https://api.awin.com/publishers/{id}/promotions/` con `advertiserIds` de los anunciantes con `mid`, `regionCodes=ES`, `type=voucher,promotion`, `membership=joined`. Solo se guardan los *vouchers* con código; las promociones sin código se descartan. Cada voucher → `upsert_coupon(source_id, external_id=promotionId, store, code, title, conditions=terms, url=urlTracking, starts_at=startDate, expires_at=endDate, active=true)`. Al terminar, `deactivate_coupons_not_in(source_id, external_ids)`.
- `Repository` gana: `list_api_sources()`, `mark_source_run(source_id, error: str | None)`, `upsert_coupon(...)`, `deactivate_coupons_not_in(source_id, ids)`; `insert_publication` acepta `channel`. `InMemoryRepository` los implementa para los tests.
- Alta de una fuente API (documentado en `bot/README.md`): un `insert into sources (type, identifier, name, config, every_minutes, hashtags)`; sin filas de ese tipo, el planificador no hace nada.

## 7. Web

- `lib/stores.ts`: añade `slug` (igual al id) y `storeFromSlug`. Lista fija de tiendas conocidas; cualquier `store` desconocido de la base de datos se muestra con su id como nombre, como hoy.
- `lib/stores-data.ts`: `fetchStores(client)` sobre `web_stores` → `{ store, deals, coupons }[]`.
- `fetchDeals` acepta `store?: string` (`.eq('store', …)`); `useUrlFilters` lee y escribe `?tienda=`; `next.config.ts` reescribe `/?tienda=` a `/buscar`.
- `/tiendas` (servidor, 60 s): lista de tiendas con datos (nombre, chollos, cupones), enlace a cada una; `noindex` si no hay más de una tienda con datos.
- `/tiendas/{tienda}` (servidor, 60 s): 404 si el slug no existe en `STORES`; cabecera con nombre, recuentos reales y sus cupones vigentes (reutiliza `CouponCard`); listado con `DealFeed` fijando `store` (orden, chips de hashtag y «cargar más» funcionan igual); metadatos propios; `noindex` con menos de 3 chollos.
- Portada: `StoresBlock` después del hero, solo si `web_stores` devuelve más de una tienda; tarjetas con nombre y «N chollos · M cupones» reales; enlaza a `/tiendas/{tienda}`. El párrafo del hero se construye con `storeNames` de las tiendas con datos: «Amazon, AliExpress y PcComponentes. Cada oferta con su precio, el precio anterior y el cupón si lo hay. Sin registros ni spam.» (solo Amazon → «Amazon. Cada oferta…»). Chip de tienda en la rejilla (`SortSelector` no cambia; chips de tienda junto a los hashtags cuando hay más de una tienda).
- `homeMetadata` y `Footer` reciben las tiendas con datos (chollos o cupones) en lugar de solo `couponStores`.
- `AmazonButton` pasa a `BuyButton`: `/go/{ASIN}` solo para Amazon; el resto abre `affiliateUrl` en pestaña nueva con `rel="sponsored noopener noreferrer"`. URLs de producto por tienda (`lib/urls.ts`): Amazon sigue igual (`/oferta/amazon/{slug}-{asin}`, ASIN de 10 caracteres); AliExpress `/oferta/aliexpress/{slug}-{id}` con id numérico (`\d{8,20}`); tiendas Awin `/oferta/{tienda}/{id}`, donde el id es el último segmento de la ruta original (ya es un slug legible, p. ej. `ninja-af300-freidora-de-aire`), sin añadir otro slug. `parseProductSlug(store, param)` aplica la regla de cada tienda; las URL de Amazon existentes no cambian.
- Sitemap: `/tiendas` y cada `/tiendas/{tienda}` con ≥ 3 chollos.

## 8. Errores y degradación

- Credenciales ausentes: la tienda o la fuente queda desactivada con aviso; Amazon y Telegram siguen.
- API de AliExpress caída al generar un enlace de afiliado: se publica con la URL canónica y se anota `affiliate=missing` en el log; la imagen, si falla, queda vacía como hoy.
- Awin devuelve error: los cupones existentes no se desactivan en esa ejecución.
- `web_stores` vacía o con error: la web omite el bloque de tiendas y el hero nombra solo Amazon.

## 9. Pruebas

- Bot: por adaptador (URL → tienda, id, canónica, deep-link Awin con `ued` codificado, acortadores de AliExpress), firma del cliente de AliExpress contra un vector conocido, mapeo de respuestas de `hotproduct.query`, `link.generate`, `productdetail.get` y de Awin promotions desde fixtures JSON en `tests/fixtures/`, `extract_offers` con mensajes mixtos, caption por tienda, planificador (solo fuentes vencidas, aislamiento de errores, `last_error`), upsert y desactivación de cupones con `InMemoryRepository`, `insert_publication(channel='web')` sin ids de Telegram.
- Web: `fetchDeals` con `store`, `fetchStores`, `useUrlFilters` con `tienda`, `StoresBlock` solo con > 1 tienda, hero dinámico, página de tienda (404, `noindex`, cupones arriba), `BuyButton` por tienda, sitemap.
- Tras aplicar la migración: `web_stores` legible por anon; `sources`, `coupons` y `products` no.

## 10. Despliegue

1. Migración `multistore` (compatible: columnas nuevas con valores por defecto).
2. Imagen nueva del bot; variables `ALIEXPRESS_*`, `AWIN_*` en el `.env` del servidor (sin ellas, sigue solo Amazon).
3. Alta de las fuentes API en `sources` cuando haya credenciales.
4. Web: push a `main`; Vercel.
