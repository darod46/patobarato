# PatoBarato

Bot que lee canales de chollos de Telegram con una cuenta de usuario, guarda las ofertas de Amazon España en Supabase (y, con las fuentes correspondientes, de otras tiendas como AliExpress o las de Awin) y las publica en [@patobarato](https://t.me/patobarato) a través de un bot. Los enlaces de Amazon llevan el tag de afiliado (`https://www.amazon.es/dp/{ASIN}?tag=patobarato-21`); en las demás tiendas se usa su enlace de afiliado cuando está configurado.

## Requisitos

- Docker y Docker Compose (para ejecutarlo); o Python 3.12 si se ejecuta sin Docker.
- Una cuenta de Telegram que sea miembro de los canales de origen.
- Un proyecto de Supabase.
- Node.js (`npx`) para aplicar el esquema de base de datos.
- El canal @patobarato dado de alta en Amazon Afiliados.

## 1. Credenciales de Telegram

### `api_id` y `api_hash`

1. Entra en <https://my.telegram.org> con el teléfono de la cuenta lectora.
2. Abre **API development tools** y crea una aplicación (el nombre es libre).
3. Copia `api_id` y `api_hash`.

### Bot con BotFather

1. En Telegram, abre [@BotFather](https://t.me/BotFather) y envía `/newbot`.
2. Sigue las instrucciones y copia el token del bot.
3. Añade el bot como **administrador** de @patobarato con permiso para publicar mensajes.

## 2. Supabase

El esquema está en `supabase/migrations/` (en la raíz del repositorio, `../supabase/migrations` respecto a `bot/`). Para aplicarlo a tu proyecto, ejecuta desde la raíz del repositorio:

```
npx supabase login
npx supabase link --project-ref <ref>
npx supabase db push
```

`<ref>` es el identificador del proyecto (lo ves en la URL del panel). Después deben existir las 4 tablas del esquema (`sources`, `products`, `offers` y `publications`).

En el panel, en **Project Settings > API**, copia la URL del proyecto y la `service_role key`.

## 3. Configuración (`.env`)

```
cp .env.example .env
```

Rellena como mínimo:

| Variable | Descripción |
| --- | --- |
| `TELEGRAM_API_ID` | `api_id` de my.telegram.org |
| `TELEGRAM_API_HASH` | `api_hash` de my.telegram.org |
| `TELEGRAM_BOT_TOKEN` | Token de BotFather |
| `SUPABASE_URL` | URL del proyecto de Supabase |
| `SUPABASE_SERVICE_KEY` | `service_role key` (secreta, nunca la subas al repositorio) |

El resto tiene valores por defecto razonables (`TARGET_CHANNEL=@patobarato`, `AFFILIATE_TAG=patobarato-21`, `REPUBLISH_AFTER_DAYS=7`, `STALE_AFTER_MINUTES=30`...). Para probar sin tocar el canal real, pon `TARGET_CHANNEL` apuntando a un canal de pruebas. `TARGET_CHANNEL`, `AFFILIATE_TAG` y las variables obligatorias no pueden quedar vacías.

| Variable opcional | Por defecto | Descripción |
| --- | --- | --- |
| `DEFAULT_COUNTRY` | `ES` | País por defecto. En v1 solo se admite `ES`; el país de cada oferta sale del dominio del enlace (`amazon.es`). |
| `HTTP_TIMEOUT_SECONDS` | `10.0` | Tiempo máximo, en segundos, de cada petición HTTP al resolver enlaces acortados (`amzn.to`, `bit.ly`...). |
| `SOURCES_REFRESH_SECONDS` | `300` | Cada cuánto se repasan los canales de la cuenta lectora. |
| `ADMIN_URL` | _(vacío)_ | URL base del panel de administración; las invitaciones por email redirigen a `ADMIN_URL/auth/confirm`. Sin ella no se pueden invitar usuarios. |
| `WEB_REVALIDATE_URL` | _(vacío)_ | Endpoint de la web pública (`https://patobarato.es/api/revalidate`) al que el bot avisa tras publicar o editar. |
| `REVALIDATE_SECRET` | _(vacío)_ | Secreto compartido enviado en la cabecera `x-revalidate-secret`. Sin URL y secreto, no se avisa a la web. |
| `ADMIN_JOBS_POLL_SECONDS` | `3.0` | Cada cuánto el bot busca trabajos nuevos del panel de administración. |

## 4. Puesta en marcha con Docker

### Imagen

Cada push a `main` que toque `bot/` lanza la action `.github/workflows/docker.yml`: pasa los tests, construye la imagen para **arm64** (el servidor Ampere de Oracle) y la publica en `ghcr.io/darod46/patobarato` con las etiquetas `latest` y el SHA corto del commit.

Los comandos de Docker se ejecutan desde `bot/`. En el servidor solo hacen falta `docker-compose.yml`, `.env` y la carpeta `data/`:

```
mkdir -p ~/patobarato/data && cd ~/patobarato
sudo chown 1000:1000 data
# copia aquí docker-compose.yml y .env
docker login ghcr.io -u <usuario-github>   # contraseña: un token con permiso read:packages
docker compose pull
```

Para actualizar tras un nuevo push: `docker compose pull && docker compose up -d`.

### Sesiones y arranque

Primero hay que iniciar sesión una vez con la cuenta lectora (te pedirá teléfono, código y, si lo tiene, la contraseña de 2 pasos):

```
docker compose run --rm bot login
```

La sesión se guarda en `./data/reader.session` (y la del bot en `./data/bot.session`). Después, arranca el bot en segundo plano:

```
docker compose up -d
docker compose logs -f bot
```

### Permisos de `./data`

El contenedor se ejecuta con un usuario no root (UID 1000) y escribe las sesiones en `/app/data`, montado desde `./data`. En Linux, la carpeta `./data` debe poder escribirla ese UID:

```
mkdir -p data && sudo chown 1000:1000 data
```

Alternativa: usar un volumen con nombre en `docker-compose.yml` (`volumes: [bot-data:/app/data]` y declarar `bot-data` en la sección `volumes:`), que se crea con los permisos correctos. En ese caso, las sesiones no quedan visibles en el host.

Los ficheros `*.session` equivalen a tener la cuenta abierta: no los compartas ni los subas al repositorio.

## 5. Canales de origen

El bot lee **todos los canales de difusión a los que está suscrita la cuenta lectora**. Para añadir un canal, únete a él desde la app de Telegram con esa cuenta; para dejar de leerlo, sal del canal.

- Cada `SOURCES_REFRESH_SECONDS` segundos (300 por defecto) el bot repasa los canales de la cuenta y apunta los nuevos en la tabla `sources` de Supabase, con su identificador numérico (`-100…`), su nombre y el país `DEFAULT_COUNTRY`. No hace falta reiniciarlo.
- No se leen grupos, chats privados ni el propio canal de destino (`TARGET_CHANNEL`).
- Para silenciar un canal sin salir de él, pon `active = false` en su fila de `sources`.

## 6. Tiendas y fuentes de API (AliExpress y Awin)

Además de los canales de Telegram, el bot puede alimentar la web con ofertas y cupones obtenidos por API. Cada tienda se activa por separado con sus credenciales en `.env`:

| Variable | Descripción |
| --- | --- |
| `ALIEXPRESS_APP_KEY` | App key del portal de afiliados de AliExpress (Portals) |
| `ALIEXPRESS_APP_SECRET` | App secret (secreta) |
| `ALIEXPRESS_TRACKING_ID` | Tracking ID de afiliado |
| `AWIN_PUBLISHER_ID` | Tu publisher id de Awin (compartido por todas las tiendas Awin) |
| `AWIN_API_TOKEN` | Token de la API de Awin (secreto; el bot nunca lo escribe en el log) |
| `AWIN_MERCHANTS` | JSON `{"tienda": merchant_id}`, p. ej. `{"pccomponentes": 1234, "mediamarkt": 5678}`. Por defecto las tres tiendas sin id. Opcional si cada fuente lleva sus `merchants` en `config` |

Tiendas soportadas: AliExpress (`aliexpress`) y, vía Awin, PcComponentes (`pccomponentes`), MediaMarkt (`mediamarkt`) y El Corte Inglés (`elcorteingles`). El `merchant_id` de cada anunciante se ve en el panel de Awin; solo se piden cupones de los anunciantes a los que te has unido (`membership=joined`) y de España.

### Dar de alta una fuente de API

Las fuentes de API viven en la tabla `sources` (junto a los canales de Telegram). `identifier` es obligatorio y único por tipo: usa un nombre corto. `every_minutes` indica cada cuánto se ejecuta; `config` y `hashtags` son opcionales.

```sql
-- Ofertas calientes de AliExpress; la fuente añade el hashtag aliexpress sola (config: query, category_ids, keywords, min_discount, min_price, max_price, max_results)
insert into sources (type, identifier, country, active, config, every_minutes, hashtags)
values ('aliexpress_api', 'aliexpress-hot', 'ES', true,
        '{"min_discount": 30, "max_results": 20}', 60, '{}');

-- Cupones de Awin; "merchants" en config es opcional y tiene prioridad sobre AWIN_MERCHANTS
insert into sources (type, identifier, country, active, config, every_minutes, hashtags)
values ('awin_promotions', 'awin-es', 'ES', true,
        '{"merchants": {"pccomponentes": 1234, "mediamarkt": 5678}}', 360, '{}');
```

Opciones de `config` de `aliexpress_api`:

- `query`: `"hot"` (por defecto, productos calientes vía `hotproduct.query`) o `"search"` (búsqueda por palabra clave vía `product.query`, ordenada por ventas recientes). `search` necesita `keywords` y/o `category_ids`; si no hay ninguno, la fuente avisa en el log y no hace nada.
- `keywords`, `category_ids`: filtros de la búsqueda (`category_ids` admite un id o una lista).
- Fallback automático: si en `hot` la app no tiene permiso para `hotproduct.query` (error `InsufficientPermission`), la fuente usa `product.query` con los mismos `keywords`/`category_ids`. Sin ninguno de los dos, registra un error pidiendo configurarlos (o solicitar el permiso a AliExpress) y no publica nada.

```sql
-- Búsqueda del 11.11 (no requiere el permiso hotproduct)
insert into sources (type, identifier, country, active, config, every_minutes, hashtags)
values ('aliexpress_api', 'aliexpress-1111', 'ES', true,
        '{"query": "search", "keywords": "11.11", "min_discount": 30, "max_results": 20}', 60, '{1111}');
```

No hace falta reiniciar el bot: el planificador lee la tabla en cada ciclo. Para pausar una fuente, `active = false`. El resultado de la última ejecución queda en `last_run_at` y `last_error`.

Los cupones de Awin se guardan en la tabla `coupons`; cuando un cupón deja de aparecer en la API se desactiva. Si la API falla, no se desactiva nada.

### Catálogo de tiendas (feeds de Awin)

El ejecutor `awin_feeds` descarga el feed de productos de cada anunciante de Awin (los mismos `AWIN_MERCHANTS` o `config.merchants`, con las mismas credenciales) y rellena la tabla `catalog_products`, que usa el buscador global de la web. La fila de `sources` ya la crea la migración (`awin-feeds`, cada 1440 minutos, es decir, una vez al día).

- Los productos se guardan por lotes de 500 (clave `store, external_id`). Al terminar un feed completo, los productos de esa tienda que ya no aparecen se marcan sin stock. Si el feed falla a mitad, se conservan los productos ya guardados, no se toca el stock y el error queda en `catalog_feeds.last_error`.
- Awin limita las descargas de feeds a **5 peticiones por minuto**: el ejecutor procesa un anunciante tras otro y espera 15 segundos entre uno y otro.
- Un anunciante que falla no impide los demás. El resumen de cada ejecución (`last_run_at`, `products`, `last_error`) queda en `catalog_feeds`.
- Para **forzar una ejecución** sin esperar al intervalo: `update sources set last_run_at = null where type = 'awin_feeds';`. El planificador la lanzará en su siguiente ciclo.

### Campañas de AliExpress (`event_promos`)

El ejecutor `event_promos` (solo existe con las tres credenciales de AliExpress) sincroniza los productos de la campaña de AliExpress asociada a cada evento. Para enlazarlos:

1. Lista las campañas vigentes: `python -m patobarato promos` (con Docker: `docker compose run --rm bot promos`). Imprime nombre, inicio y fin de cada una.
2. Copia el nombre **exacto** de la campaña en la columna `events.aliexpress_promo` del evento (por SQL o desde Supabase Studio).
3. Fuerza una sincronización: `update sources set last_run_at = null where type = 'event_promos';`. Si no lo haces, el ejecutor corre cada 24 h.

Las filas de `event_promos` de un evento solo se reemplazan cuando toda la descarga termina bien; si la API falla, se conservan las anteriores. La web oculta las filas con `synced_at` de hace más de 7 días, así que si la sincronización deja de funcionar el bloque desaparece en lugar de mostrar productos caducados.

### Sin credenciales

El ejecutor de cupones de Awin solo existe si están `AWIN_PUBLISHER_ID` y `AWIN_API_TOKEN`; los merchant ids salen de `AWIN_MERCHANTS` o, por fuente, de `config.merchants` (que tiene prioridad). Si faltan las credenciales de una tienda, esa tienda se omite con un aviso en el log y el bot sigue funcionando con el resto. Una fila de `sources` de un tipo sin credenciales simplemente no se ejecuta. Si una fuente `awin_promotions` acaba sin ningún merchant id (ni en `config` ni en `AWIN_MERCHANTS`), registra un aviso y no hace nada.

## 7. Guías de compra y precios

El ejecutor `guide_prices` refresca el precio de todos los productos de las guías **publicadas** (las guías en borrador, con ids de relleno como `[ASIN]`, nunca se consultan). Para cada producto lee el precio con el lector de su tienda y lo guarda junto con la hora de la comprobación; si la lectura falla, conserva el último precio y anota el error (`no price`, o `store_disabled` si la tienda no está activa en el bot). Las peticiones van una detrás de otra, con una pausa de `GUIDE_PRICE_DELAY_SECONDS` segundos (por defecto 1,5) entre productos. Un producto que ya existe en `products` conserva su título y su URL; solo los nuevos toman el nombre de la guía.

La fuente `guide_prices` (cada 360 minutos) ya viene creada por la migración `20261108000000_guides.sql`; no hay que darla de alta. Para pausarla: `update sources set active = false where type = 'guide_prices';`.

### Cómo dar de alta una guía por SQL

Las guías se escriben directamente en la base de datos. Parte de `supabase/migrations/20261108000001_guides_seed.sql`: crea la guía como borrador con sus productos y sus tiendas. Sustituye todos los valores `[CORCHETES]` (ids de tienda, URLs y textos pendientes) y, cuando esté lista, publícala:

```sql
update guides set status = 'published', published_at = now() where slug = 'freidoras-de-aire-menos-100';
```

En el siguiente ciclo del planificador el ejecutor empezará a rellenar los precios de la guía (y el enlace de afiliado de cada tienda, `product_prices.affiliate_url`). `guides.updated_at` se mantiene solo: un trigger lo actualiza al editar la guía, sus productos o sus tiendas.

## 8. Amazon Afiliados

Recuerda registrar el canal @patobarato en tu cuenta de Amazon Afiliados y comprobar que el tag `patobarato-21` está asociado a él; si no, las comisiones no se contabilizan.

## Tests

```
pip install -e .[dev]
pytest
```

Las pruebas de integración contra Supabase solo se ejecutan si defines `SUPABASE_TEST_URL` y `SUPABASE_TEST_KEY` (usa un proyecto de pruebas, no el de producción).

## Imágenes de producto

Al publicar una oferta, el bot abre la página del producto en amazon.es y guarda en `products.image_url` el enlace a su imagen principal (`m.media-amazon.com`, 500 px). La web enlaza esa imagen directamente; no se descarga ni se guarda. Si Amazon devuelve un captcha o un error, la oferta se publica igual y la web muestra el pato. En el log aparecen las líneas `Amazon image for … found/not found (ok=…, failed=…)` para ver cuántas veces lo consigue.

Para buscar la imagen de los productos que aún no la tienen (espera 3 s entre peticiones):

```
docker compose run --rm bot backfill-images
```
