# Guías programadas: 24 guías de compra, una cada lunes

Fecha: 2026-11-22. Estado: aprobado por David («de momento solo con Amazon, adelante»).

## Intención

Publicar una guía de compra cada lunes durante 24 semanas (30 nov 2026 → 10 may 2027) sin
intervención manual: las guías se escriben ahora, se cargan en Supabase con su fecha y la web las
muestra sola cuando llega el día. Objetivo SEO: páginas evergreen con intención de compra ligadas al
calendario comercial español; objetivo de negocio: clics de afiliado Amazon desde cada guía.

## Objetivos

- Programación por fecha: `guides.published_at` en el futuro = guía programada, invisible en la web
  y ausente del sitemap hasta esa hora; a partir de ella aparece sola (ISR de 60 s).
- Precios listos el día de publicación: el bot refresca los precios de las guías programadas para
  los próximos 7 días, no solo de las ya visibles.
- Admin: una guía programada se distingue («Programada · 30 nov») y la fecha se puede cambiar.
- 24 guías completas: copy honesto, 4-5 productos cada una con ASIN real de amazon.es comprobado
  en el momento de escribirla, y precio actual por debajo del tope que anuncia el título.

## No objetivos / anti-objetivos

- AliExpress y Awin quedan fuera de esta tanda (David los añadirá desde el admin cuando quiera).
- Nada de «hemos probado», «el mejor del mercado», precios escritos en el texto (los pone la web en
  vivo) ni porcentajes de descuento. Las guías se escriben a partir de fichas técnicas y opiniones
  públicas; el texto lo dice.
- No se toca el diseño de la página de guía ni el modelo de datos de `guide_items`.

## Restricciones

- Web solo lee vistas `web_*` con la clave anon; el bot usa la service key; el admin usa `is_admin()`.
- Migraciones en `supabase/migrations/`, aplicadas en producción vía Management API desde el
  navegador integrado; tokens nunca en el repo.
- Commits como David; David hace `git push`.

## Enfoques considerados

1. **Estado nuevo `scheduled`** en `guides.status`: explícito, pero obliga a un proceso (bot o cron)
   que cambie el estado el lunes y a tocar admin, bot y vistas igualmente. Descartado: añade una
   pieza móvil que puede fallar un lunes.
2. **`published_at` como fecha de programación** (elegido): `status = 'published'` + fecha futura.
   Las vistas públicas filtran `published_at <= now()`; no hay proceso que ejecutar. El bot y el
   admin solo interpretan la fecha. Mínimo cambio, sin cron.
3. **Programar desde Next (cron de Vercel)**: dependería de Vercel y de la service key en la web;
   va contra la regla de que la web solo use anon. Descartado.

## Diseño

### Base de datos (migración `20261124000000_guides_schedule.sql`)

- `web_guides`, `web_guide_items`, `web_guides_by_product`: añadir
  `and g.published_at is not null and g.published_at <= now()`.
- Sin cambios de columnas.

### Bot

- `Repository.list_guide_products()` devuelve los productos de guías con `status = 'published'` y
  `published_at` nulo o `<= now() + 7 días`. La implementación Supabase selecciona `published_at`
  y filtra en Python (PostgREST no filtra bien por columnas de la relación anidada).
- Log de `GuidePrices` sin cambios.

### Admin

- Lista y panel: insignia «Programada · d mmm» cuando `status = 'published'` y
  `published_at > now()`; «Publicada» en caso contrario.
- Campo fecha/hora de publicación editable (datetime-local en hora de Madrid). Al publicar sin
  fecha, se sella `now()` como hasta ahora.

### Web

- Sin cambios de código: las vistas ya filtran. `revalidate = 60` en `/guias` y `/guias/[slug]`.
- `scripts/check-views.mjs`: sin cambios (sigue comprobando que las vistas responden).

### Contenido (migración `20261124010000_guides_calendar.sql`)

- 24 guías según el calendario aprobado (tabla en el plan), `published_at` = lunes 07:00 Madrid.
- La guía existente `freidoras-de-aire-menos-100` (borrador con marcadores) se reescribe en su sitio
  y es la del 30 nov.
- Por guía: `title` (≤ 60 caracteres, con tope de precio cuando aplica), `subtitle`, `category`
  (Hogar, Tecnología, Belleza, Juguetes, Deporte, Bricolaje), `intro_md` (120-180 palabras),
  `how_to_choose_md` (250-400 palabras, con subtítulos `##`), `faq` (3 preguntas),
  `reading_minutes`, 4-5 `guide_items` con `award`, `summary_md` (60-100 palabras), 3 `pros`,
  2 `cons`, 4-6 `specs` sacadas de la ficha de Amazon, y un `guide_item_stores` con
  `store = 'amazon'`, `external_id = ASIN`, `url = https://www.amazon.es/dp/<ASIN>`.
- Selección de productos: búsqueda en amazon.es desde el navegador integrado el día de escribir;
  se descartan patrocinados, < 4,3 estrellas, < 150 valoraciones y precio actual por encima del
  tope del título. Cada ASIN se confirma abriendo la ficha (título y viñetas) para extraer specs.
- Premios distintos por guía («Mejor en general», «Mejor relación calidad-precio», «La más
  compacta», …), nunca «el mejor del mercado».

## Lo que queda al constructor

- Texto exacto de cada guía dentro de las reglas de copy; nombres de los premios.
- Formato del datetime-local en el admin y su test.

## Adenda (25 nov): anuncio en Telegram al publicarse una guía

Cuando una guía programada llega a su hora, el bot del servidor publica en el canal un mensaje con
la portada ilustrada y el enlace, y lo deja fijado (desfijando el anuncio de la guía anterior, para
que solo haya una guía fijada).

- Ejecutor `guide_announce` (`sources.type = 'guide_announce'`, cada 30 min, alta en la migración
  `20261128000000_guide_announce.sql`), construido solo cuando `build_runners` recibe `bot=`.
- `guides` gana `announced_at timestamptz` y `announce_message_id bigint`. Candidatas: `status =
  'published'`, `published_at <= now()`, `announced_at is null`. Se anuncian de más antigua a más
  nueva; como mucho una por pasada (así la primera ejecución no inunda el canal: las guías ya
  publicadas antes de esta migración se marcan como anunciadas en la propia migración, salvo la
  más reciente, que sí se anuncia).
- Mensaje: foto = `https://www.patobarato.com/guias/<slug>.jpeg` descargada con `download_photo` (si
  falla, se envía sin foto); pie en HTML: `📘 <b>Nueva guía: {title}</b>\n\n{subtitle}\n\n👉
  https://www.patobarato.com/guias/{slug}` (sin subtítulo, se omite esa línea). La URL se construye
  desde `Settings.site_url` (nuevo, por defecto `https://www.patobarato.com`).
- Tras enviar: `pin_message(channel, message_id, notify=False)`; si otra guía tenía
  `announce_message_id`, `unpin_message` de ese id antes (fallo al desfijar → aviso en el registro
  y se sigue). Guardar `announced_at` y `announce_message_id`. Si falla el envío, no se marca y se
  reintenta en la siguiente pasada; si falla el fijado, se marca igualmente (el mensaje ya está
  publicado) y se registra.
- Requisito operativo: el bot debe ser administrador del canal con permiso para fijar mensajes.
