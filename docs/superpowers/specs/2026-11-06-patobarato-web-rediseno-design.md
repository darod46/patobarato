# PatoBarato web v3 — Rediseño visual y cupones

Fecha: 2026-11-06. Estado: pendiente de aprobación del usuario.
Antecedentes: `2026-11-05-patobarato-web-nextjs-design.md` (web v2, Next.js) y `2026-11-04-patobarato-bot-design.md`.
Maqueta de referencia: lienzo de diseño «PatoBarato · Rediseño web» (pantallas Home escritorio, Home móvil, Tienda AliExpress y Guía de compra). Solo se implementan aquí las partes de la portada con datos reales y los cupones.

## 1. Intención

El usuario quiere una web más moderna y profesional, con el pato superhéroe como protagonista, y empezar a ampliar la web más allá del listado de Amazon. De la maqueta completa (tiendas, cupones, alertas, eventos, guías, comunidad) se ha decidido descomponer en sub-proyectos y hacer primero:

1. **Rediseño visual** sobre los datos que ya existen (vistas `web_deals` y `web_hashtags`).
2. **Cupones**: tabla y vista nuevas en Supabase, bloque en portada y página `/cupones`. Los cupones los introduce el usuario a mano en el panel de Supabase.

Quedan para specs posteriores: multitienda (bot + páginas por tienda), guías de compra, alertas de precio, votos, enviar un chollo y newsletter.

## 2. Objetivos, no objetivos y anti-objetivos

**Objetivos**
- Paleta, tipografía y logo nuevos en toda la web.
- Portada con la estructura de la maqueta: barra de anuncio, cabecera con navegación, hero con el pato, chips + orden + rejilla, cupones, cómo funciona, calendario de eventos, «Hola, soy el Pato», banda Telegram y pie completo.
- Orden del listado por recientes, mayor descuento y mínimo histórico.
- Tabla `coupons`, vista `web_coupons`, página `/cupones` y bloque en portada.
- Páginas legales y de contacto con borradores revisables.

**No objetivos**
- Chollos de tiendas distintas de Amazon (el bot no los captura todavía).
- Alertas de precio, guías, votos, formularios de envío de chollo, newsletter, cuentas de usuario, modo oscuro.
- Panel de administración de cupones.

**Anti-objetivos (se mantienen de v2)**
- Afirmaciones falsas. No se nombra una tienda en el hero ni en los metadatos mientras no haya chollos o cupones suyos. Ninguna cifra inventada; «mínimo histórico» solo cuando hay historial real.
- Romper lo que ya funciona: búsqueda, filtros por hashtag en la URL, «Cargar más», `/oferta/...`, `/chollos/{tag}`, `/go/{ASIN}`, sitemap, aviso de afiliado.
- Exponer `service_role` o leer algo distinto de las vistas públicas.
- Páginas indexables vacías o duplicadas.

## 3. Restricciones

- Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, Vercel con Root Directory `web`. Node >= 22.12.
- Supabase con clave anon; la web solo lee `web_deals`, `web_hashtags` y la nueva `web_coupons`. Migraciones en `supabase/migrations/`, aplicadas por Claude al proyecto real (hace falta el token de acceso de Supabase o la contraseña de la base de datos, que el usuario facilita en el momento).
- Red corporativa con TLS interceptado: en local, `NODE_OPTIONS=--use-system-ca`; nunca se sube al repo ningún apaño.
- Enfoque elegido: **evolución en sitio** (A). Se conserva la arquitectura v2 (páginas servidor con ISR + feed cliente) y se cambian componentes uno a uno. Descartados: reescritura de la portada en server components puros (B) y restyling sin secciones nuevas (C).

## 4. Estilo y tokens

`web/src/app/globals.css` sustituye la paleta de `prototipo/DESIGN.md` por:

| Token | Valor | Uso |
|---|---|---|
| `ink` | `#14161A` | texto principal, fondos oscuros (eventos, banda Telegram) |
| `muted` | `#5B6470` | texto secundario (4.5:1 sobre blanco) |
| `line` | `#E6E8EC` | bordes |
| `surface` | `#F6F7F9` | fondos de sección |
| `primary` / `primary-hover` | `#1F4FD1` / `#163EA8` | botones, enlaces, chip activo de orden |
| `primary-soft` | `#E8EEFC` | fondos de icono, botón de tarjeta |
| `accent` / `accent-ink` | `#FFD24D` / `#3D2E00` | chip «Cupón», halo del pato, acento de marca |
| `danger` | `#B42318` | badge de descuento |
| `success` / `success-soft` | `#14633A` / `#E3F6EA` | «Mínimo histórico», garantías |
| `warm` / `warm-line` | `#FFFBE8` / `#F3E4A6` | fondo del hero y de «Hola, soy el Pato» |

Tipografía: `Inter` (400/500/600/700) para el cuerpo e `Space Grotesk` (500/600/700) para titulares y precios, ambas por `@fontsource` (se elimina `@fontsource/plus-jakarta-sans`). Utilidad `price` con `tabular-nums` se mantiene.

Recursos: `web/public/logo.svg` pasa a ser el vector nuevo de 6 trazos (se añade `recursos/patobarato-logo-vector.svg`, generado en esta sesión con la paleta nueva: rojo `#D9342B`, amarillo `#FFD24D`; `recursos/patobarato-logo-vector-colores-originales_1.svg` es la misma forma con los colores antiguos); `web/public/og.png` se regenera con él. El hero usa `web/public/pato-heroe.svg` (el existente). `prototipo/DESIGN.md` se actualiza con los tokens nuevos.

Accesibilidad: contraste AA en todo el texto (incluidos los grises de 11–12 px), foco visible, objetivos táctiles ≥ 44 px, botones y enlaces reales, `aria-label` en botones solo-icono.

## 5. Portada

Orden de arriba abajo en `/`:

1. **Barra de anuncio** (`AnnouncementBar`): fondo `ink`, texto «{Evento} en N días · Última oferta publicada hace X». Solo se muestra si hay un evento en los próximos 45 días (ver §7). «Última oferta» reutiliza `fetchLatestDeal`; si falla, se omite esa parte.
2. **Cabecera** (`Header`): fija, logo (44 px de alto en escritorio, 34 en móvil), navegación «Chollos» (`#chollos`), «Cupones» (`/cupones`), «Cómo funciona» (`#como-funciona`), «Telegram» (`#telegram`), buscador (el `SearchBox` actual) y botón primario «Unirme al canal». En móvil la navegación se pliega en un menú desplegable (`<details>`/botón con `aria-expanded`), y el buscador pasa a segunda fila como hoy.
3. **Hero** (`Hero`): fondo degradado `warm` → blanco. Izquierda: etiqueta «Vigilante de precios · Ofertas que vuelan», H1 «El pato que caza los chollos de Amazon antes de que vuelen» (Space Grotesk 60/36 px), frase honesta («Vigilo canales de chollos de Telegram y publico cada oferta de Amazon España con su precio, el precio anterior y el cupón si lo hay. Sin registros ni spam.»), botones «Ver chollos de hoy» (primario) y «Recibirlos en Telegram» (borde), y tres garantías con check verde: «Precio comprobado», «Cupón incluido cuando existe», «Gratis, sin cuenta». Derecha: `pato-heroe.svg` a 360 px sobre dos círculos `accent` translúcidos, con hasta tres etiquetas flotantes construidas con datos reales: el mayor descuento del listado actual, el cupón más reciente (si hay) y «Mínimo histórico» (si alguna oferta lo es). Si no hay dato para una etiqueta, no se pinta. En móvil el pato va arriba a 200 px y el texto centrado debajo.
4. **Chollos de hoy** (`DealFeed` ampliado): título H2, subtítulo «Se actualiza automáticamente» (sin recuento inventado), selector de orden segmentado («Más recientes», «Mayor descuento», «Mínimo histórico»), chips de hashtags actuales (estilo píldora: activo `ink`, resto `surface`). Rejilla 1/2/3/4 columnas. Tarjeta (`DealCard`): badge rojo «-N %» arriba a la izquierda, chip amarillo «Cupón» arriba a la derecha si `coupon`, etiqueta verde «Mínimo histórico» abajo a la izquierda si `is_lowest`; cuerpo con «Amazon · hace X», título a dos líneas, precio en Space Grotesk 24 px y anterior tachado, y pie «Ver chollo →» en `primary-soft`. La tarjeta entera sigue siendo un único enlace a `/oferta/...`. «Cargar más» se mantiene.
5. **Cupones de la semana** (`CouponsBlock`): solo si `web_coupons` devuelve filas. H2 «Cupones de {tiendas}» con las tiendas realmente presentes, hasta 4 tarjetas y enlace «Todos los cupones →» a `/cupones`.
6. **Cómo cazamos cada chollo**: tres tarjetas (Vigilamos / Comprobamos / Publicamos) con icono SVG inline; texto fiel a lo que hace el bot.
7. **Calendario de eventos** (`EventsBlock`, `#eventos`): fondo `ink`; izquierda, el próximo evento con «Faltan N días» (sin cuenta atrás de horas/minutos); derecha, los siguientes cuatro eventos con fecha, nombre y tiendas. Sin enlace a guías (no existen).
8. **Hola, soy el Pato** (`AboutBlock`): tarjeta `warm` con el pato pequeño y dos párrafos: qué es PatoBarato (canal de Telegram que vigila canales de chollos y publica ofertas de Amazon España) y cómo se financia (afiliación, sin coste para el usuario). Enlace a `/afiliados`.
9. **Banda Telegram** (`TelegramBlock` actual, restyle a `ink` con botón blanco).
10. **Pie** (`Footer`): tres columnas de enlaces (Chollos: Por categoría → `#chollos`, Cupones, Calendario; Contenido: Cómo funciona, Quiénes somos → `#sobre`, Canal de Telegram; Legal: Contacto, Aviso legal, Privacidad, Cookies, Política de afiliación), aviso de afiliado de Amazon (y de otras tiendas solo cuando haya cupones suyos), «Los precios y la disponibilidad pueden cambiar», «© {año} PatoBarato».

`/chollos/{tag}` y `/oferta/...` reciben el mismo `Header`, `Footer`, tokens y tarjeta nueva; su estructura no cambia. `/oferta/...` muestra además la etiqueta «Mínimo histórico» junto al precio cuando corresponda.

## 6. Datos y migraciones

### 6.1 `20261106000000_web_deals_v3.sql`

`create or replace view web_deals` con las columnas actuales más:

- `discount_pct integer`: `round((previous_price - price) / previous_price * 100)` cuando `previous_price > price > 0`; si no, `null`.
- `previous_min_price numeric`: mínimo de `published_price` entre las publicaciones anteriores del mismo producto y país (`publications` con `published_at` anterior a la publicación actual, cualquier `status`).
- `is_lowest boolean`: `previous_min_price is not null and price <= previous_min_price`.

Se mantiene `distinct on (product_id)` y el orden. Se repiten `revoke`/`grant` para `anon` y `authenticated`.

### 6.2 `20261106010000_coupons.sql`

```sql
create table coupons (
    id bigint generated always as identity primary key,
    store text not null,
    code text not null,
    title text not null,
    conditions text,
    url text,
    starts_at timestamptz not null default now(),
    expires_at timestamptz,
    active boolean not null default true,
    created_at timestamptz not null default now()
);
alter table coupons enable row level security;

create view web_coupons as
select id, store, code, title, conditions, url, starts_at, expires_at
from coupons
where active and starts_at <= now() and (expires_at is null or expires_at > now())
order by store, expires_at nulls last, id;

revoke all on web_coupons from anon, authenticated;
grant select on web_coupons to anon, authenticated;
```

Sin políticas RLS en `coupons`: nadie salvo el propietario (panel/SQL) escribe. El bot no toca esta tabla.

### 6.3 Capa de datos (`web/src/lib`)

- `types.ts`: `Deal` gana `discountPct: number | null`, `previousMinPrice: number | null`, `isLowest: boolean`. Nuevo tipo `Coupon`.
- `deals.ts`: `fetchDeals` acepta `sort?: 'recientes' | 'descuento' | 'minimo'` (por defecto `recientes`). `descuento` ordena por `discount_pct desc nulls last, published_at desc`; `minimo` filtra `is_lowest = true` y ordena por `published_at desc`. El resto de funciones mapea las columnas nuevas.
- `coupons.ts`: `fetchCoupons(client, limit?)` sobre `web_coupons`.
- `stores.ts`: añade `aliexpress`, `pccomponentes`, `mediamarkt`, `elcorteingles`, `decathlon` con nombre, abreviatura y texto de botón; `storeInfo` sigue devolviendo un valor por defecto para tiendas desconocidas.
- `urls.ts`/`useUrlFilters`: parámetro `orden` leído y escrito en la URL; `next.config.ts` reescribe también `?orden=` a `/buscar`, y `/buscar` sigue `noindex`.
- `format.ts`: `discountPercent` se mantiene para datos antiguos, pero la tarjeta usa `discountPct` de la vista.

### 6.4 Eventos (`web/src/content/events.ts`)

Lista estática `{ id, name, date (ISO, Europe/Madrid), stores: string[] }` con, para empezar: 11.11 AliExpress (2026-11-11), Black Friday (2026-11-27), Cyber Monday (2026-11-30), Rebajas de enero (2027-01-07), Prime Day (julio 2027, fecha estimada marcada con `approximate: true` y mostrada como «julio»). `lib/events.ts` expone `nextEvent(now)` (el primero con fecha ≥ hoy) y `upcomingEvents(now, n)`. Los eventos pasados no se muestran.

## 7. Rutas nuevas y SEO

| Ruta | Contenido | Renderizado |
|---|---|---|
| `/cupones` | H1 «Cupones vigentes», cupones agrupados por tienda; cada tarjeta: tienda, caducidad, título, condiciones, código en monoespaciada con botón «Copiar» (cliente, `navigator.clipboard`, con estado «Copiado») y enlace «Ir a {tienda}» si hay `url`. Estado vacío honesto si no hay ninguno. | Servidor, revalidación 600 s. `noindex` cuando no hay cupones. |
| `/aviso-legal`, `/privacidad`, `/cookies`, `/afiliados`, `/contacto` | Páginas estáticas con borradores para una web de afiliación en España; los datos del titular y el correo van como `[TITULAR]`, `[EMAIL]`, `[NIF]`, `[DIRECCIÓN]`. `/contacto` enlaza al canal de Telegram y al `[EMAIL]`. | Estáticas. |

- `layout.tsx`: el título global se mantiene «PatoBarato · Chollos de Amazon» mientras no haya cupones; `generateMetadata` de la portada lo cambia a «PatoBarato · Chollos y cupones de Amazon{ y otras tiendas}» solo si `web_coupons` tiene filas (y añade las tiendas presentes). La descripción sigue la misma regla.
- `sitemap.ts`: añade las cinco páginas estáticas y `/cupones` (esta última solo si hay cupones).
- `siteJsonLd` no cambia. Sin JSON-LD para cupones.
- `og.png` regenerado con el logo nuevo y el pato (mismo script que en v2).

## 8. Componentes y ficheros

Nuevos: `components/AnnouncementBar.tsx`, `MobileNav.tsx`, `SortSelector.tsx`, `CouponCard.tsx`, `CouponsBlock.tsx`, `HowItWorks.tsx`, `EventsBlock.tsx`, `AboutBlock.tsx`, `LegalLayout.tsx`; `lib/coupons.ts`, `lib/events.ts`, `content/events.ts`, `content/legal/*.tsx`; `app/cupones/page.tsx` y las cinco páginas legales.

Modificados: `globals.css`, `layout.tsx`, `page.tsx`, `HomeClient.tsx`, `Header.tsx`, `Hero.tsx`, `DealCard.tsx`, `DealFeed.tsx`, `HashtagChips.tsx`, `TelegramBlock.tsx`, `Footer.tsx`, `ProductView.tsx`, `lib/deals.ts`, `lib/types.ts`, `lib/stores.ts`, `lib/urls.ts`, `hooks/useUrlFilters.ts`, `hooks/useDeals.ts`, `next.config.ts`, `sitemap.ts`, `public/logo.svg`, `public/og.png`, `web/README.md`, `prototipo/DESIGN.md`, `package.json` (fuentes).

Eliminados: dependencia `@fontsource/plus-jakarta-sans`.

## 9. Errores y degradación

- Sin cupones o con error al leerlos: el bloque de portada y la navegación siguen mostrando «Cupones», pero `/cupones` enseña el estado vacío y la portada omite el bloque.
- Sin evento próximo: no hay barra de anuncio; el calendario muestra los siguientes.
- `fetchLatestDeal` falla: la barra omite «Última oferta».
- Las columnas nuevas de `web_deals` ausentes (migración aún no aplicada): `toDeal` las trata como `null`/`false`; el selector de orden «mínimo histórico» devuelve lista vacía con el estado vacío actual.
- Portapapeles no disponible: el botón «Copiar» muestra el código seleccionado para copiar a mano.

## 10. Pruebas

- `lib/deals.test.ts`: parámetros de orden y filtro enviados al cliente Supabase para cada `sort`; mapeo de `discount_pct`, `previous_min_price`, `is_lowest`.
- `lib/coupons.test.ts`: mapeo y orden de `web_coupons`.
- `lib/events.test.ts`: `nextEvent` y `upcomingEvents` con fechas límite (hoy, pasado, aproximado).
- Componentes: `Header` (navegación y menú móvil accesible), `Hero` (etiquetas flotantes solo con datos), `DealCard` (badge, chip cupón, mínimo histórico, enlace único), `SortSelector`, `CouponCard` (copiar y fallback), `AnnouncementBar`, `EventsBlock`, `Footer` (aviso de afiliado según tiendas).
- `useUrlFilters.test.tsx`: `orden` en la URL.
- Tras aplicar migraciones: consulta con la clave anon a `web_deals` (columnas nuevas) y `web_coupons`; comprobación de que `coupons` no es legible por `anon`.
- `npm run typecheck`, `npm run lint`, `npm test` y `npm run build` en verde.

## 11. Despliegue

1. Aplicar las dos migraciones al proyecto de Supabase.
2. Push a `main`; Vercel despliega. No hay variables de entorno nuevas.
3. Insertar los primeros cupones desde el panel de Supabase (la portada los recoge en ≤ 60 s y `/cupones` en ≤ 600 s).
4. Revisar las páginas legales y sustituir los `[CORCHETES]`.
