# Ofertas caducadas: comprobación diaria y ficha indexada

## Intención

Las ofertas de Amazon publicadas en el canal duran poco; cuando el precio vuelve a subir, la
ficha de patobarato.com sigue enseñando el precio del chollo y Google sigue mandando gente a ella.
David quiere (1) un comando que lance a mano desde su ordenador una vez al día, que compruebe el
precio actual de las ofertas activas y dé por terminadas las que han subido, y (2) que la ficha de
una oferta terminada siga existiendo e indexada, pero diga con claridad que la oferta ha caducado,
en vez de desaparecer con un 404 como ahora.

Lo que le importa es el lector que llega desde Google y encuentra otro precio: que vea que la
oferta pasó, que tenga a mano el precio actual y otras ofertas vigentes.

## Objetivos

- Comando `check-deals` del bot, ejecutable desde casa con el `.env` del bot, sin levantar el lector
  de Telegram, que termine las ofertas cuyo precio actual en Amazon es mayor que el publicado.
- La ficha `/oferta/amazon/<slug>` de una oferta terminada se sirve (200) con el estado «caducada»
  y sigue en el sitemap durante 30 días desde `ended_at`; después sigue abierta pero `noindex`.
- Portada, listados, buscador, relacionados, etiquetas y vistas de cuenta siguen mostrando solo
  activas: nada de lo que hoy lee `web_deals` cambia.
- El post de Telegram de una oferta terminada se edita con el precio tachado, como hace el admin.

## No objetivos / anti-objetivos

- No se actualiza el precio publicado cuando baja: la oferta sigue activa con su precio original.
- No se comprueban ofertas de AliExpress (sin credenciales de la API no hay lector) ni de otras
  tiendas: solo `store = 'amazon'`.
- No se automatiza en el servidor: el comando es manual y local (Amazon no sirve la ficha al
  servidor). Si algún día funciona desde el servidor, bastará darlo de alta como fuente.
- Anti-objetivo: machacar la IP de David. El comando acota, espacia y se detiene si Amazon bloquea.
- Anti-objetivo: que una caducada se cuele en un listado o en el JSON-LD como oferta vigente.

## Restricciones

- Web solo con clave anon y vistas `web_*`; bot con service key; admin con `is_admin()`.
- Iconos Lucide; español de España, tuteo, sin emojis; copy honesto.
- Commits como David; tests antes del código (Vitest en web, pytest en bot).
- Un lector de Amazon ya endurecido (`AmazonPageFetcher`: cabeceras de Chrome, HTTP/2, reintento
  ante la página genérica). `store.fetch_price(asin, canonical)` devuelve `PriceQuote | None`.

## Enfoques considerados

**A. Vista nueva solo para la ficha (elegido).** `web_deal_pages` = `web_deals` sin el filtro de
activas, más `status` y `ended_at`. Solo la ficha y el sitemap la usan; el resto sigue con
`web_deals`. Imposible que una caducada aparezca donde no toca.

**B. Quitar el filtro a `web_deals` y añadir `status`.** Menos piezas, pero los siete consumidores
actuales tendrían que filtrar por su cuenta; un olvido mete caducadas en portada. Descartado.

Para acotar el volumen (3.465 activas, ~200 nuevas al día) David eligió: cada oferta se comprueba
como mucho una vez cada 48 h, con tope por ejecución, de más reciente a más antigua, y las de más
de 30 días se dan por caducadas sin consultar.

## Diseño

### Base de datos (`supabase/migrations/20261126000000_deal_pages.sql`)

- `alter table publications add column checked_at timestamptz` (última comprobación de precio por
  `check-deals`; null = nunca) y `add column post_synced_at timestamptz` (última edición del post
  de Telegram tras terminar; null = pendiente o nunca terminada).
- Vista `web_deal_pages`: misma `select` que la versión vigente de `web_deals`
  (`20261106000000_web_deals_v3.sql`, con `discount_pct`, `previous_min_price`, `is_lowest`,
  `price_before_coupon` y lo que haya añadido después), **sin** `where p.status = 'active'` (sí
  excluye `draft`), y con dos columnas al final: `p.status`, `p.ended_at`. Sigue siendo
  `distinct on (p.product_id)`, pero ordenado por `(p.status = 'active') desc, p.published_at
  desc, p.id desc`: un producto republicado (el bot repite productos pasados
  `republish_after_days`) enseña su publicación activa si la tiene, y si no la terminada más
  reciente. Es la misma fila que daría `web_deals` cuando hay una activa. `revoke all … from anon, authenticated; grant select
  … to anon, authenticated`.
- `web_deals` no cambia.
- `notify pgrst, 'reload schema'`. Se registra en `supabase_migrations.schema_migrations`.
- `web/scripts/check-views.mjs`: `web_deal_pages` responde 200 y trae `status` y `ended_at`.

### Bot: comando `check-deals`

`python -m patobarato check-deals` (y `docker compose run --rm bot check-deals`). Arranca solo el
bot publicador (`bot.start(bot_token=…)`), no el lector; si el bot no arranca, sale con error 1.

Selección (`Repository.list_deals_to_check(now, max_age_days=30, recheck_hours=48, limit)`):
publicaciones `status = 'active'`, `channel = 'telegram'`, producto `store = 'amazon'`,
**oferta sin cupón** (`offers.coupon is null`: el precio publicado de un chollo con cupón es el
precio tras el cupón y la buy box enseña el de antes, así que la comparación no vale; esas ofertas
solo caducan por antigüedad), `published_at > now - 30 días`, y `checked_at is null or checked_at <
now - 48 h`; ordenadas por `checked_at asc nulls first, published_at desc` (primero las nunca
comprobadas y las que llevan más tiempo sin comprobar, para que ninguna se quede sin turno);
`limit` = `CHECK_DEALS_LIMIT` (ajuste en `Settings`, por defecto 600). Con la pausa de 1,5 s por
defecto una ejecución completa dura unos 15 minutos y, con ~1.650 activas de menos de 30 días,
cada oferta pasa por el lector cada 2-3 días. Devuelve `DealToCheck(publication_id, product_id,
asin, canonical_url, published_price)`.

Opción `--dry-run`: hace la selección y las consultas, imprime lo que haría (qué terminaría, cuántas
caducarían por antigüedad) y no escribe nada ni edita posts. Recomendado para la primera ejecución.

Expiración sin consultar (`Repository.end_stale_deals(now, max_age_days=30) -> list[int]`): un
solo `update publications set status = 'ended', ended_at = now where status = 'active' and channel
= 'telegram' and published_at <= now - 30 días and product.store = 'amazon'`, que devuelve los ids.
La primera vez serán ~1.800 de golpe; Telegram limita las ediciones por minuto, así que sus posts
se editan **como mucho `CHECK_DEALS_EDIT_LIMIT` (por defecto 100) por ejecución**, los más
recientes primero, con la pausa de 1,5 s; los que quedan sin editar se registran en el resumen
(«pendientes de editar: N») y van saliendo en ejecuciones siguientes (`Repository.list_ended_posts_
to_edit(limit)`: `status='ended'`, `message_id not null`, `post_synced_at is null`). Para saber
cuáles están editados, `publications` gana `post_synced_at timestamptz`, que `sync_post` rellena
(también cuando lo lanza el admin). Las de AliExpress no se tocan.

Bucle, en `patobarato/sources/deal_check.py`, clase `DealChecker(registry, repo, posts, clock,
sleep, delay_seconds=settings.guide_price_delay_seconds)` con `async run(now) -> CheckSummary`:

- Por cada `DealToCheck`, `store.fetch_price(asin, canonical_url)`; pausa `delay_seconds` entre
  peticiones de red (misma pauta que `GuidePriceRefresher`).
- `quote.price > published_price` → `repo.end_publication(publication_id, ended_at=now)` (pone
  `status='ended'`, `ended_at`, `checked_at`), después `posts.sync_post(publication_id)` para
  editar el post (si falla, se anota y se sigue: la oferta ya está terminada en la base de datos).
- `quote.price <= published_price` → `repo.mark_checked(publication_id, now)`.
- `None` con ficha leída pero sin precio (sin buy box, sin stock) → `repo.mark_checked(
  publication_id, now)` y cuenta como `unknown`; no se termina: no sabemos el precio.
- `None` por fallo de lectura (red, HTTP ≠ 200, captcha, página bloqueada) → **no** se marca
  `checked_at` (volverá a tocarle) y cuenta como `failed`. Para distinguirlo, `AmazonPageFetcher`
  expone `last_failure: str | None` (motivo de la última llamada, `None` si fue bien) y
  `AmazonStore` lo reexpone como `last_failure`; el checker lo lee tras cada `fetch_price`.
- Bloqueo: si `last_failure` es `captcha`, `blocked page…` o `HTTP 503` dos veces seguidas, el
  bucle para y el resumen lo dice (`stopped_blocked=True`).
- Al final, `WebRevalidator.revalidate()` (`patobarato/admin/revalidate.py`, ya existe; usa
  `WEB_REVALIDATE_URL` y `REVALIDATE_SECRET` del `.env`) una vez si se ha terminado alguna; si las
  variables faltan, el resumen lo dice.

`CheckSummary(checked, ended, kept, unknown, failed, stale_ended, posts_edited, edit_failed,
posts_pending, stopped_blocked, dry_run)`. Salida
por `print` en español, por ejemplo: «Comprobadas 600: 41 caducadas, 530 siguen, 29 sin precio.
Caducadas por antigüedad (>30 días): 1.812. Posts editados: 41 (0 fallos).» y, si para,
«Amazon ha bloqueado dos peticiones seguidas; parada. Vuelve a lanzarlo más tarde.»

Registro: nunca URLs de afiliado ni cuerpos de respuesta; por producto una línea `DealCheck: amazon
B0… published 29.99 now 34.99 -> ended` (o `kept` / `unknown`).

Tests (pytest, repo en memoria y `FakeStore`): sube → ended + sync_post llamado; igual/baja →
kept + checked_at; None → unknown + checked_at; dos bloqueos seguidos → para; `list_deals_to_check`
respeta 48 h, 30 días, tope y orden; `end_stale_deals` solo toca activas de Amazon de más de 30
días; `main(["check-deals"])` llama a la corrutina; sin `sync_post` fallido se cuenta en
`edit_failed`.

README del bot: subsección «Comprobar ofertas caducadas» (qué hace, cómo lanzarlo, qué significa el
resumen, por qué no se editan los posts antiguos).

### Web

**Datos.** `Deal` gana `status: 'active' | 'ended'` y `endedAt: string | null` (desde
`web_deal_pages`; `toDeal` sobre `web_deals` pone `active`/`null`). `fetchDealByProduct` pasa a leer
`web_deal_pages`; `fetchRelatedDeals`, `fetchDeals`, `fetchLatestDeal` siguen en `web_deals`.
`fetchAllDealRefs` (sitemap) lee `web_deal_pages` con `or(status.eq.active,ended_at.gt.<now-30d>)`
y devuelve además `status`/`endedAt`. Helper puro `isDealIndexable(deal, now)`: activa, o terminada
hace ≤ 30 días.

**Ficha** (`app/oferta/[store]/[slug]/page.tsx`, `ProductView`, `seo.ts`):

- `generateMetadata`: título de caducada `«<título> · Oferta caducada · PatoBarato»`; descripción
  «Esta oferta de <tienda> ya ha terminado. Se publicó a <precio> el <fecha>. Mira el precio actual
  o las ofertas vigentes de <categoría>.»; `robots: NOINDEX` cuando `!isDealIndexable`.
- JSON-LD: en caducada se mantiene `price` (el publicado) y se añade `priceValidUntil = ended_at`
  (fecha) y `availability: https://schema.org/SoldOut`, que es lo que Google documenta para ofertas
  que ya no están disponibles.
- `ProductView` con `deal.status === 'ended'`:
  - Aviso arriba del bloque de precio: icono Lucide `Clock`, texto «Oferta caducada · terminó el
    <d mmm>» (`timeAgo` no: fecha absoluta en `es-ES`, zona Europe/Madrid, helper existente de
    guías o `Intl`).
  - Precio publicado tachado (`<s>`), sin «Ahorras», sin el precio anterior, sin mínimo histórico.
  - Botón principal de compra sustituido por un enlace secundario «Ver precio actual en Amazon»
    (`TelegramCta` no: es `BuyButton` con variante secundaria, misma URL de afiliado, `rel`
    `sponsored nofollow noopener`). La barra fija inferior de móvil no se muestra.
  - Un bloque «Para no perderte la próxima» con el `NextDealCta` que ya existe, y a continuación
    «Más chollos de <categoría>» (los relacionados, que siguen siendo activos).
- Sin cambios para activas.

**Sitemap** `chollos`: entradas activas y caducadas de ≤ 30 días; `lastModified` =
`ended_at ?? published_at`.

**Tests** (Vitest): metadata y robots en los tres casos (activa, caducada reciente, caducada
antigua); `ProductView` caducada muestra el aviso, el precio tachado, no muestra barra fija ni
«Ahorras», muestra el enlace al precio actual y el `NextDealCta`; `fetchDealByProduct` consulta
`web_deal_pages`; `fetchAllDealRefs` aplica el filtro de 30 días; `isDealIndexable` en el límite.

README de la web: párrafo en la sección de ofertas sobre fichas caducadas e indexación.

### Admin

Sin cambios funcionales: `OfferPanel` ya termina y reactiva. Si una oferta terminada por
`check-deals` se reactiva desde el admin, vuelve a aparecer y `check-deals` la volverá a comprobar
cuando toque (su `checked_at` se conserva).

## Comprobado en el código

- `WebRevalidator`, `PostService.sync_post`, `format_ended_caption` y `publications.ended_at` ya
  existen; el admin termina ofertas con `setOfferStatus` + job `sync_post`.
- Las demás vistas que leen `publications` (`web_hashtags`, `web_stores`, las de cuenta) filtran
  `status = 'active'` por su cuenta y no cambian.

## Lo que decide el constructor

- Nombres exactos de helpers y clases de Tailwind, siguiendo `ProductView` y `NextDealCta`.
- Cómo falsear `PostService`/`fetch_price` en los tests del bot (ya hay patrones en
  `test_guide_prices.py` y `test_posts.py`).
- Si `AmazonPageFetcher.last_failure` o un contador de bloqueos consecutivos: lo que sea más
  simple y esté probado.
