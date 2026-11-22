# Conversión a Telegram: datos en vivo, «Avísame del próximo», suscriptores y medición

Fecha: 2026-11-22. Estado: aprobado por David (propuestas 1, 2, 4 y 7 de la ronda de mejoras;
medición con tabla propia en Supabase, «ok con la tabla»).

## Intención

El canal de Telegram es el activo principal de PatoBarato: quien se suscribe vuelve sin pasar por
Google. La web tiene hoy tres enlaces genéricos al canal y un bloque en portada con una vista
previa. Queremos que cada visita vea razones concretas para suscribirse (actividad real del canal,
cuánta gente ya está, qué se acaba de publicar), que la ficha de un chollo ofrezca el siguiente
paso natural cuando la oferta ya no interesa o se ha agotado, y saber qué botón convierte.

## Objetivos

1. Bloque de Telegram en portada con datos en vivo: chollos publicados hoy, hace cuánto salió el
   último, número de suscriptores y los últimos tres mensajes del canal con enlace al mensaje.
2. En cada ficha de chollo, una llamada «Avísame del próximo» que lleve al canal con un texto
   ligado a la categoría del chollo.
3. Número de suscriptores real, actualizado por el bot cada hora, visible donde el canal se
   promociona (bloque de portada y, en pequeño, junto al botón del hero).
4. Medición de clics hacia Telegram por emplazamiento y página, sin cookies ni identificadores,
   con un resumen diario en el admin.

## No objetivos / anti-objetivos

- Nada de cifras inventadas ni infladas: si el bot no ha podido leer el número de suscriptores, no
  se muestra; si hay menos de 100, tampoco (mi decisión; David puede bajar el umbral).
- No se prometen alertas por categoría ni notificaciones personalizadas: el canal es uno.
- No se recogen IP, user-agent, cookies ni identificadores de usuario. No cambia la política de
  cookies; se añade una frase en /privacidad.
- No se añade analítica de terceros.
- No se toca el diseño general de la portada ni la ficha más allá de los bloques nuevos.

## Restricciones

- La web usa solo la clave anon y lee solo vistas `web_*`; la única escritura permitida desde la
  web es la inserción en `cta_clicks` a través de `/api/clic`, con política de solo inserción.
- El bot usa la service key; el admin, `is_admin()`.
- Iconos Lucide; copy honesto; español de España; sin emojis en la web (la vista previa del
  mensaje de Telegram reproduce el formato del canal, que sí los lleva).
- Migraciones en `supabase/migrations/`; el controlador las aplica en producción.

## Enfoques considerados (medición)

1. **Tabla propia `cta_clicks` en Supabase** (elegido): inserción anónima solo-escritura desde una
   ruta `/api/clic` de la web, resumen diario en el admin. Sin cookies, sin terceros, visible donde
   David ya gestiona todo.
2. Vercel Web Analytics con eventos: menos código, pero depende del plan de Vercel, no se ve en el
   admin y añade un script de terceros.
3. GA4: igual que 2 con consentimiento de cookies obligatorio. Descartado.

## Diseño

### Base de datos (`supabase/migrations/20261125000000_telegram.sql`)

- `channel_stats (id smallint primary key default 1 check (id = 1), members integer not null,
  checked_at timestamptz not null)`: una fila, la escribe el bot. RLS, revokes; vista
  `web_channel_stats (members, checked_at)` con grant select a anon y authenticated.
- `web_channel_recent`: las 5 últimas publicaciones activas (`publications` ∪ `products`) con
  `title`, `price` (`published_price`), `message_id`, `published_at`, ordenadas por
  `published_at desc`. Solo publicaciones con `chat_id` del canal (la vista filtra
  `status = 'active'`; el canal es único hoy). Grant select a anon y authenticated.
- `cta_clicks (id bigint identity, placement text not null check (placement in
  ('header','hero','block','recent','deal','footer')), path text not null check (char_length(path)
  <= 200 and path like '/%'), created_at timestamptz not null default now())`. RLS: política
  `cta_clicks_anon_insert for insert to anon with check (true)`; `grant insert on cta_clicks to
  anon`; sin select para anon. Política de select para authenticated con `is_admin()`.
- `cta_clicks_daily`: vista `security_invoker` con `day` (fecha en Europe/Madrid), `placement`,
  `clicks`, últimos 60 días. Grant select a authenticated (la RLS de la tabla se aplica).
- `sources`: tipo nuevo `channel_stats` en el check constraint; fila
  `('channel_stats', 'patobarato', 'ES', true, 60)`.
- `notify pgrst, 'reload schema'`.

### Bot

- Runner `ChannelStatsSource` (`type = "channel_stats"`) en `sources/channel_stats.py`: recibe el
  cliente Telethon del bot y el `target_channel`; en `run` pide
  `functions.channels.GetFullChannelRequest(target)` y guarda
  `full_chat.participants_count` con `repo.upsert_channel_stats(members, checked_at)`. Errores:
  log a nivel warning sin traza con URL; no relanza.
- `Repository.upsert_channel_stats` (abstracta, memoria y Supabase: upsert por `id = 1`).
- `build_runners` recibe opcionalmente el cliente del bot (`bot: TelegramClient | None`) y añade
  el runner solo si lo tiene; `run()` se lo pasa.
- Tests: runner con cliente falso (participants_count), repo en memoria, fallo de red → warning y
  sin excepción.

### Web

- `lib/telegram.ts`: `TELEGRAM_URL = 'https://t.me/patobarato'`, `messageUrl(messageId)` →
  `https://t.me/patobarato/{id}`, tipos `ChannelStats`, `ChannelPost`, `fetchChannelStats(client)`
  y `fetchChannelRecent(client, limit = 3)` (lecturas secundarias con `optional()`),
  `formatMembers(n)` → `null` si `n < 100`, si no `'1.240'` con separador es-ES, y
  `CtaPlacement` union.
- `lib/cta.ts` (cliente): `trackCtaClick(placement)`: `navigator.sendBeacon('/api/clic', blob
  JSON {placement, path: location.pathname})` con fallback `fetch(..., { keepalive: true })`;
  nunca bloquea la navegación; sin `await`.
- `app/api/clic/route.ts` (POST): valida `placement` ∈ lista y `path` (string, `^/`, ≤ 200,
  sin query), limita por IP con `RateLimiter` (30/min) usando `x-forwarded-for`, inserta con el
  cliente anon de la web (`getSupabase().from('cta_clicks').insert(...)`), responde 204
  (`Cache-Control: no-store`); 400 en payload inválido, 429 si se supera el límite, 204 también si
  Supabase falla (nunca romper la navegación; log en servidor sin datos personales). `robots`: ya
  está `/api/` en disallow.
- `components/TelegramCta.tsx`: `<a href={TELEGRAM_URL} target="_blank" rel="noopener
  noreferrer" onClick/onAuxClick → trackCtaClick(placement)>` con `placement` y `className`
  props; sustituye los tres enlaces actuales (Header → `header`, Hero → `hero`, Footer →
  `footer`) y el botón del bloque (`block`).
- `TelegramBlock` (portada): además de la vista previa, una fila de datos en vivo:
  - «{n} chollos hoy» (`n` = publicaciones de hoy en Madrid; si 0, se omite),
  - «Último chollo hace {timeAgo}» (del último `published_at`),
  - «{members} suscriptores» solo si `formatMembers` no es `null`.
  - Lista «Últimos en el canal»: 3 `ChannelPost` con título (truncado a 2 líneas), precio y
    `timeAgo`, cada uno enlazando a `messageUrl` con placement `recent`. Si la lectura falla o
    está vacía, el bloque se muestra como hoy (sin la fila ni la lista).
  - Los datos llegan como props desde la página (servidor), no se piden desde el cliente.
- Hero: bajo el botón «Recibirlos en Telegram», una línea pequeña «{members} suscriptores ·
  gratis» solo cuando hay cifra; si no, nada.
- Ficha de chollo (`ProductView`): tras el bloque de compra y antes de «Más chollos», una tarjeta
  `NextDealCta`: título «¿Se te ha escapado?» (o «¿Quieres el siguiente?»), texto «El próximo
  chollo de {categoría} también saldrá en el canal, con su precio y su cupón», botón
  «Avísame del próximo» (placement `deal`). Categoría = primer hashtag de la lista de categorías
  conocidas (`/chollos/<tag>`), si no hay, «el próximo chollo como este». Icono Lucide `Bell`.
- `/privacidad`: una frase: «Contamos los clics en los botones de Telegram (botón y página) sin
  guardar ningún dato que te identifique.»
- Tests Vitest de: `formatMembers`, `messageUrl`, la ruta `/api/clic` (validación, límite,
  inserción con cliente falso, 204 en fallo), `TelegramCta` (llama al tracker), `TelegramBlock`
  con y sin datos, `NextDealCta` con y sin categoría.

### Admin

- Página `/clics`: tabla de los últimos 14 días (filas = día, columnas = emplazamientos, última
  columna total) desde `cta_clicks_daily`, más el total del periodo. Enlace en la navegación.
  Tests del cálculo de la tabla (helper puro) y de la página con cliente falso.

### Estado vacío y fallos

- Sin `channel_stats` (bot aún sin desplegar): no hay cifra en ningún sitio.
- Sin publicaciones recientes: el bloque no muestra la lista.
- `/api/clic` caído: la navegación a Telegram sigue funcionando.

## Lo que queda al constructor

- Diseño exacto de la fila de datos y de la lista (clases Tailwind coherentes con el bloque).
- Nombre y ubicación del helper de «hoy en Madrid» (existe `madridDay` en `lib/events.ts`).
- Si la portada es un componente cliente (`HomeClient`), cómo llegan las props del servidor sin
  romper el patrón actual de `fetchLatestDeal`.

## Decisiones tras la revisión del constructor (mis decisiones, David puede cambiarlas)

1. **Datos en vivo desde una sola vista.** `web_channel_stats` pasa a ser una vista de una fila:
   `members` y `checked_at` (null si el bot aún no ha escrito en `channel_stats`),
   `posted_today` (nº de `publications` con `channel = 'telegram'`, `message_id is not null`,
   `status <> 'draft'` y `published_at >= inicio del día en Europe/Madrid`) y `last_posted_at`
   (máximo `published_at` con esos filtros). Así «chollos hoy» y «último chollo» cuentan solo lo
   que de verdad salió en el canal, no los chollos solo-web.
2. **`web_channel_recent`** = `publications` JOIN `products` (title, image_url) con
   `channel = 'telegram'`, `message_id is not null`, `status <> 'draft'`, `distinct on (product_id)`
   quedándose con la publicación más reciente de cada producto, orden `published_at desc`,
   `limit 5`. Columnas: `product_id, title, price (published_price), message_id, published_at`.
   `channel_stats.members` es global (un canal).
3. **Portada:** `app/page.tsx` (servidor) lee `web_channel_stats` y `web_channel_recent` con
   `optional()` y pasa `live: { stats, posts } | null` a `HomeClient` → `TelegramBlock`. La vista
   previa sigue cargándose en cliente con `fetchLatestDeal` como hoy. Los «hace X» se calculan con
   el reloj cliente ya existente (`useClock`/`now`) para que no se congelen con el ISR.
4. **Límite de `/api/clic`:** nuevo `RequestLimiter` (por clave, ventana fija de 60 s, máximo 20
   peticiones por IP, en memoria por instancia) en `lib/rate-limit.ts`, con tests. Se asume que
   la clave anon permite insertar directamente vía PostgREST: aceptado (la tabla no guarda nada
   sensible, los checks limitan el contenido y el admin solo muestra agregados).
5. **Categoría del `NextDealCta`:** constante `CATEGORY_TAGS = ['tecnologia','hogar','belleza',
   'juguetes','alimentacion','deporte','moda','bricolaje']` en `lib/telegram.ts` con su etiqueta
   en castellano; se usa el primer hashtag del chollo que esté en la lista. Si ninguno, copy
   genérico «El próximo chollo como este también saldrá en el canal».
6. **Admin `/clics`:** consulta `cta_clicks_daily` filtrando `day >= hoy - 13` y rellena con cero
   los días sin filas; la vista devuelve 60 días para dejar margen.
7. **Enlaces a cubrir con `TelegramCta`:** Header (y el menú móvil, que reutiliza el enlace de
   Header), Hero, Footer, TelegramBlock, `/contacto` (placement `contact`) y cualquier otro
   anchor a `t.me/patobarato` en `components/` o `app/` que aparezca al hacer `grep`; el
   `sameAs` de `lib/seo.ts` no se toca. `CtaPlacement` = header | hero | block | recent | deal |
   footer | contact.
8. **`sources_type_check`:** la migración redefine la lista completa vigente
   (`telegram_channel, aliexpress_api, awin_promotions, guide_prices, awin_feeds, event_promos,
   manual, chollometro`) más `channel_stats`; la fila de `sources` se inserta con
   `on conflict (type, identifier) do nothing`.
9. **/privacidad:** además de la frase, se actualiza la fecha `updated` del aviso.
