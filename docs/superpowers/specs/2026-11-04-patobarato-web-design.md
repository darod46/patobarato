# PatoBarato — web patobarato.com y reorganización del repo

Fecha: 2026-11-04. Estado: pendiente de aprobación del usuario.

## 1. Intención

Hoy el bot publica ofertas de Amazon en el canal de Telegram @patobarato y las guarda en Supabase (ver `2026-11-04-patobarato-bot-design.md`). Ahora hace falta una web pública, **patobarato.com**, donde cualquiera vea esas mismas ofertas reales, las busque y las filtre, y vaya a Amazon con el enlace de afiliado `patobarato-21`.

Lo imprescindible, en palabras del usuario: **«el listado de ofertas con foto, precio y botón»**.

## 2. Objetivos, no objetivos y anti-objetivos

**Objetivos**
- Mostrar un listado de ofertas reales leídas de Supabase, con foto, título, precio, botón «Ver en Amazon» y, si existen, el precio anterior con el % de descuento y el cupón.
- Incluir un buscador por título y filtros por hashtag.
- Seguir el estilo del mockup (`prototipo/screen.png`, `prototipo/code.html`, `prototipo/DESIGN.md`) con los recursos gráficos de `recursos/`.
- Publicarla en **Vercel**.
- Reorganizar el repo: el bot pasa a `bot/` y la web va en `web/`.

**No objetivos (v1)**
- Categorías (Tecnología, Hogar…): no existen en los datos.
- Histórico de precios, «mínimo histórico», Keepa y gráficos.
- Sección «Radar de caídas en vivo», ticker superior, notificaciones, cuentas de usuario y newsletter.
- Página de detalle por oferta, SEO por oferta y modo oscuro.
- Alojamiento en el servidor Oracle. El usuario lo descartó por ahora.

**Anti-objetivos (aunque «funcione», sería un fallo)**
- **Cifras o afirmaciones inventadas.** El mockup trae «36.2K en la bandada», «450+ chollos hoy», «0% estafas», «Revisado con Keepa», «180 días histórico» y «PING 14ms». No se publican: o es un dato real o no aparece.
- **Que la web pueda escribir en la base de datos o vea algo más que las ofertas publicadas.** Nunca debe llevar la clave `service_role`.
- **Romper el bot en producción.** Ya corre en el servidor con `docker compose`.

## 3. Restricciones

- Web hecha con **React + TypeScript + Tailwind CSS** (decisión del usuario).
- Datos: proyecto Supabase existente `hijafeeyheztkggsoezs` (eu-west-1).
- Despliegue de la web en Vercel desde el repo `github.com/darod46/patobarato`, carpeta `web/`. El usuario crea el proyecto en Vercel y pone las variables. El usuario también decidirá cuándo apuntar el dominio.
- La imagen del bot se sigue construyendo para arm64 con la action y se publica en `ghcr.io/darod46/patobarato`. El servidor no cambia: usa `docker-compose.yml` y `.env` sueltos y solo hace `pull`.
- La red corporativa del usuario bloquea Telegram y altera el TLS. Las pruebas reales del bot se hacen en el servidor.

## 4. Lo decidido

### 4.1 Reorganización del repo

```
bot/        el bot actual: src/, tests/, pyproject.toml, Dockerfile, docker-compose.yml,
            .env.example, .dockerignore, README.md (el README actual del bot)
web/        la web nueva
supabase/   migraciones, compartidas (se queda en la raíz)
docs/       specs y planes (se queda)
prototipo/  y recursos/ se quedan como material de origen
README.md   raíz: breve, explica qué hay en cada carpeta
```

- La action `docker.yml` construye con contexto `bot/` y solo se lanza cuando cambian `bot/**` o el propio workflow. Los tests del bot se ejecutan desde `bot/`.
- El `.env` local y `data/` pasan a `bot/` y siguen ignorados por git. `.gitignore` se ajusta.
- La web tiene su propio job de CI (lint, typecheck, tests, build) en la action, solo cuando cambia `web/**`.

### 4.2 Cambios en el bot y en Supabase

1. **Hashtags.** Columna nueva `offers.hashtags text[] not null default '{}'`. Se guardan en minúsculas y sin `#`, como ya los normaliza el parser.
2. **Foto.** Bucket público (creado por migración con un insert en `storage.buckets`) de Supabase Storage `product-images`. Cuando el bot obtiene la foto de una oferta que va a publicar, la sube a `{country}/{asin}.jpg`, sobrescribiendo si existe, y guarda la URL pública en `products.image_url`. Cada publicación vuelve a subirla, así que una foto que falló se repara la siguiente vez que se publique el producto. **Si la subida falla, se registra el error y se publica igual**: la foto en la web nunca bloquea Telegram. Las ofertas anteriores no tienen foto.
3. **Vista pública `web_deals`.**
   - Contiene una fila por producto con su **última publicación activa**: id de publicación, `published_at`, precio publicado, precio anterior, cupón, hashtags, `affiliate_url`, título, `image_url`, asin y country.
   - Precio publicado y `affiliate_url` salen de `publications`. Precio anterior, cupón y hashtags salen de su oferta (`publications.offer_id` → `offers`). Título e imagen salen de `products`.
   - Si un producto tiene varias publicaciones activas, gana siempre la más reciente, aunque sea más cara.
   - Las publicaciones con `status = 'ended'` no salen.
   - **Sin límite de antigüedad** (decisión del usuario): una publicación activa sale aunque sea antigua. Hoy nada marca `ended`; eso llegará con la API de Amazon. La tarjeta muestra «hace X» para que se vea la edad.
   - Es la única cosa que el rol `anon` puede leer (`grant select`). Las tablas siguen con RLS sin políticas.
4. **Vista `web_hashtags`.** Contiene `(tag, count)` de los hashtags de las ofertas de `web_deals` publicadas en los últimos 30 días, ordenados por frecuencia. Sirve para los chips de filtro.
5. Todo va en migraciones nuevas en `supabase/migrations/`. Claude las aplica al proyecto real con la API de gestión de Supabase y su token, como la migración inicial, y las registra en `supabase_migrations.schema_migrations`.
6. **Relleno inicial.** Una migración rellena `offers.hashtags` de las ofertas existentes a partir de `raw_text`, con la misma regla que el parser (`#palabra`, en minúsculas). Las fotos antiguas no se rellenan.
7. **Orden de despliegue.** Primero las migraciones y después la nueva imagen del bot. Si no, el bot falla al escribir `hashtags`. El servidor no cambia su `docker-compose.yml`. El push de la reorganización lanza un nuevo build, que no tiene efecto hasta que se haga `pull` en el servidor.

### 4.3 La web

**Pila:** Vite + React + TypeScript + Tailwind CSS v4 + `@supabase/supabase-js`. Es una web estática, sin servidor propio. Variables: `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (la clave pública).

**Página única, de arriba abajo:**

1. **Cabecera fija** con efecto cristal, como en el mockup:
   - Logo (`recursos/patobarato-logo-cabecera.svg`).
   - Buscador. En móvil se pliega o baja a una segunda fila.
   - Botón «Telegram» a `https://t.me/patobarato`.
   - Sin menú de categorías, campana ni avatar.
2. **Hero:**
   - Etiqueta: «Vigilante de precios • Ofertas que vuelan».
   - Titular: «¡Cazo los mejores chollos antes de que vuelen!».
   - Texto honesto sobre qué hace PatoBarato, sin afirmar rastreo de millones de productos.
   - Dos botones: «Ver chollos» (baja al listado) y «Unirse en Telegram».
   - Mascota `pato-2-heroe.svg` en el círculo ámbar.
   - Sin la fila de cifras ni las insignias inventadas.
3. **Listado («Chollos»):**
   - **Chips de hashtag:** «Todos» más los 12 hashtags más frecuentes de `web_hashtags`. Se elige uno a la vez.
   - **Rejilla de tarjetas:** auto-fill con un mínimo de 280px por tarjeta. Las más recientes primero.
   - **«Cargar más»:** páginas de 24.
4. **Bloque Telegram** oscuro, como en el mockup:
   - Titular y texto invitando al canal, con el botón «Unirme al canal».
   - A la derecha, la vista de un mensaje del canal hecha con la última oferta real de `web_deals`, con la misma maqueta que el mensaje del bot (`format_caption`: 🦆 título, ✅ precio, ❌ antes con %, 🎟️ cupón, hashtags y botón «🛒 Ver en Amazon»). La web la reconstruye con los campos de la vista. Si no hay ofertas, se omite esa vista.
   - Sin número de miembros.
5. **Pie:**
   - Logo, enlace al canal y el **aviso obligatorio de Amazon Afiliados**: «En calidad de Afiliado de Amazon, PatoBarato obtiene ingresos por las compras adscritas que cumplen los requisitos aplicables».
   - Nota: los precios y la disponibilidad pueden cambiar.
   - © año actual.
   - Sin enlaces a páginas que no existen.

**Tarjeta de oferta:**
- **Foto** sobre fondo neutro. Sin foto, aparece una imagen del pato (`pato-3-etiqueta.svg`).
- **Pastilla ámbar «-N%»**, si hay precio anterior. Se calcula como en el bot (ROUND_HALF_UP).
- **Título** en máximo 2 líneas.
- **Precio** grande en formato español («1.299,90 €», cifras tabulares) y **precio anterior** tachado.
- **Cupón** en una pastilla, si existe.
- **Hashtags** pequeños. Al pulsar uno se activa ese filtro.
- **«Hace X min / h / días»**.
- **Botón «Ver en Amazon»** a `affiliate_url`, con `target="_blank"` y `rel="sponsored noopener noreferrer"`.

**Buscador:**
- Busca en el título sin distinguir mayúsculas. Se combina con el hashtag elegido.
- Espera 300 ms tras dejar de teclear.
- Búsqueda y filtro se reflejan en la URL (`?q=…&tag=…`), para poder compartir el enlace y que el botón «atrás» funcione.

**Estados:**
- **Cargando:** tarjetas esqueleto.
- **Sin resultados:** pato y texto «No hay chollos que coincidan», con un botón para quitar filtros.
- **Error de red:** mensaje y botón «Reintentar».

**Estilo:** el de `prototipo/DESIGN.md`:
- Plus Jakarta Sans.
- Fondo claro.
- Ámbar `#F59E0B` solo para descuentos y acentos.
- Botón principal carbón `#09090b`.
- Bordes de 1px.
- Tarjetas de 12px de radio, con una sombra fina al pasar el ratón.

Recursos usados: logo de cabecera, `pato-2-heroe.svg`, `pato-3-etiqueta.svg` y el favicon `favicon_v2.ico`. Los vídeos no se usan en v1.

**Accesibilidad básica:**
- Textos alternativos en las imágenes.
- Foco visible.
- Contraste AA en textos.
- Navegable con teclado.

### 4.4 Pruebas

- **Bot:** TDD como hasta ahora (pytest). Cubre guardar los hashtags y subir la foto, incluido que un fallo de subida no impida publicar.
- **Migraciones:** se aplican al proyecto real y se comprueba que `anon` solo lee `web_deals` y `web_hashtags`.
- **Web:** Vitest + Testing Library. Cubre el formato de precio y descuento, el «hace X», la tarjeta (con y sin precio anterior, cupón o foto), el filtro y la búsqueda reflejados en la URL, y los estados vacío y error con la capa de datos simulada. Más typecheck, lint y build en CI.

## 5. Decisiones de Claude (revisables)

- Vite en vez de Next.js. Una página que solo lee no necesita servidor. Coste: peor SEO por oferta; migrable más adelante.
- Una tarjeta por producto, mostrando su última publicación activa. Las terminadas se ocultan.
- Doce chips de hashtag, de los últimos 30 días. Un solo hashtag activo a la vez.
- Fuera de v1: el «Radar en vivo», el ticker, el «Compromiso ético» (sus afirmaciones no son ciertas hoy) y el modo oscuro.
- Fuente servida localmente con `@fontsource`, no con Google Fonts.
- Iconos SVG en línea o una librería ligera, no la fuente Material Symbols.

## 6. Lo que queda al constructor

- Estructura interna de componentes y hooks, la herramienta de lint y el formato del código.
- Los textos exactos del hero y del bloque Telegram, dentro del tono del mockup y sin afirmaciones falsas.
- El detalle responsive, partiendo de los cortes de `DESIGN.md`.
- Cómo se construye la consulta a Supabase, siempre que use solo las dos vistas.
