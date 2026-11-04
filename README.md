# PatoBarato

Bot que lee canales de chollos de Telegram con una cuenta de usuario, guarda las ofertas de Amazon España en Supabase y las publica en [@patobarato](https://t.me/patobarato) a través de un bot. Todos los enlaces publicados llevan el tag de afiliado (`https://www.amazon.es/dp/{ASIN}?tag=patobarato-21`).

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

El esquema está en `supabase/migrations/`. Para aplicarlo a tu proyecto:

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
| `SOURCES_REFRESH_SECONDS` | `300` | Cada cuánto se recarga la tabla `sources`. |

## 4. Puesta en marcha con Docker

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

## 5. Añadir canales de origen

Los canales que se leen están en la tabla `sources` de Supabase. Añade filas desde el panel (Table Editor) o con SQL:

```sql
-- Canal público
insert into sources (identifier, name) values ('@canal_de_chollos', 'Canal de chollos');

-- Canal privado: se guarda el enlace de invitación
insert into sources (identifier, name, invite_link)
values ('-1001234567890', 'Canal privado', 'https://t.me/+AbCdEfGhIjK');
```

- `identifier`: el @usuario del canal; para un canal privado, su identificador numérico (por ejemplo `-1001234567890`). No pongas un nombre inventado: se buscaría como @usuario y podría coincidir con otro canal.
- `invite_link`: **obligatorio para canales privados**. Un canal privado no tiene @usuario, así que si la cuenta lectora aún no es miembro el bot solo puede encontrarlo y unirse con este enlace. Si el canal exige aprobación del administrador, el bot envía la solicitud y no la repite hasta pasadas 6 horas.
- `country`: `ES` por defecto (v1 solo soporta Amazon España).
- `active`: ponlo a `false` para dejar de leer un canal.

El bot recarga la lista de canales cada `SOURCES_REFRESH_SECONDS` segundos (300 por defecto), así que no hace falta reiniciarlo. Cada canal se resuelve una sola vez; solo se vuelve a buscar si cambias su `identifier` o su `invite_link`.

## 6. Amazon Afiliados

Recuerda registrar el canal @patobarato en tu cuenta de Amazon Afiliados y comprobar que el tag `patobarato-21` está asociado a él; si no, las comisiones no se contabilizan.

## Tests

```
pip install -e .[dev]
pytest
```

Las pruebas de integración contra Supabase solo se ejecutan si defines `SUPABASE_TEST_URL` y `SUPABASE_TEST_KEY` (usa un proyecto de pruebas, no el de producción).
