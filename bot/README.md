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

No hace falta reiniciar el bot: el planificador lee la tabla en cada ciclo. Para pausar una fuente, `active = false`. El resultado de la última ejecución queda en `last_run_at` y `last_error`.

Los cupones de Awin se guardan en la tabla `coupons`; cuando un cupón deja de aparecer en la API se desactiva. Si la API falla, no se desactiva nada.

### Sin credenciales

El ejecutor de cupones de Awin solo existe si están `AWIN_PUBLISHER_ID` y `AWIN_API_TOKEN`; los merchant ids salen de `AWIN_MERCHANTS` o, por fuente, de `config.merchants` (que tiene prioridad). Si faltan las credenciales de una tienda, esa tienda se omite con un aviso en el log y el bot sigue funcionando con el resto. Una fila de `sources` de un tipo sin credenciales simplemente no se ejecuta. Si una fuente `awin_promotions` acaba sin ningún merchant id (ni en `config` ni en `AWIN_MERCHANTS`), registra un aviso y no hace nada.

## 7. Amazon Afiliados

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
