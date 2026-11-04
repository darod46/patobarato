# PatoBarato — Bot de ofertas (diseño)

Fecha: 2026-11-04 · Estado: borrador para aprobación

## 1. Intención y por qué

PatoBarato es un canal de Telegram de ofertas (https://t.me/patobarato) que se monetiza con el programa de afiliados de Amazon España (tag `patobarato-21`). Ahora mismo no existe nada: ni bot, ni base de datos, ni proceso manual.

El bot tiene que llenar el canal de forma automática. Escucha una lista de canales de ofertas de terceros, detecta las ofertas de Amazon, las guarda en Supabase, cambia el enlace para que lleve nuestro tag y las publica en @patobarato sin repetir ofertas.

Más adelante, la API de Amazon sustituirá o complementará a los canales como fuente, y se añadirán más tiendas y más países. El diseño tiene que permitir crecer en esas tres direcciones (fuente, tienda y país) sin rehacerlo.

## 2. Objetivos, no objetivos y antiobjetivos

**Objetivos (v1)**
- Leer en tiempo real los mensajes nuevos de una lista configurable de canales de Telegram.
- Detectar las ofertas de Amazon España, extraer ASIN, título, precio, precio anterior y cupón cuando existan.
- Guardar productos, ofertas y publicaciones en Supabase, siempre con el país (`ES` de momento).
- Publicar en @patobarato con el formato acordado (sección 5), con un enlace que lleve siempre `tag=patobarato-21`.
- No duplicar: volver a publicar un producto solo si el precio nuevo es más bajo que el último publicado.
- Guardar el `message_id` de cada publicación para poder editarla después.

**No objetivos (v1)**
- Filtros por descuento, categoría o precio. De momento se publica todo; los filtros vendrán después.
- Detectar ofertas finalizadas y editar el mensaje. Solo se guarda el `message_id`; la lógica llegará con la API de Amazon.
- Tiendas que no sean Amazon y países que no sean España (el modelo de datos sí los admite).
- Personalizar la imagen.
- Panel web de administración. La gestión se hace desde el panel de Supabase.

**Antiobjetivos (cosas que lo harían un fracaso aunque "funcione")**
- Publicar un enlace de Amazon sin nuestro tag, o con el tag de otro.
- Inundar el canal con duplicados del mismo producto al mismo precio, porque varios canales de origen comparten las mismas ofertas.
- Que la cuenta de Telegram que lee los canales sea baneada por un comportamiento agresivo (unirse en masa, leer historiales enteros, etc.).
- Publicar ofertas sin precio o con datos claramente mal leídos.

## 3. Restricciones

- **Lenguaje:** Python 3.12 (decisión mía, ver la sección 8).
- **Despliegue:** contenedor Docker en el servidor del usuario, con `docker-compose.yml` y configuración en `.env`. Tiene que funcionar 24/7 y reiniciarse solo (`restart: unless-stopped`).
- **Telegram, dos identidades:**
  - **Cuenta de usuario lectora:** una cuenta aparte con su propio número, que el usuario conseguirá. Usa MTProto (`api_id`/`api_hash` de my.telegram.org) para leer los canales de origen. Un bot normal no puede leer canales ajenos.
  - **Bot publicador:** un bot creado con @BotFather y añadido como administrador de @patobarato, con permiso para publicar y editar.
  - El primer inicio de sesión de la cuenta lectora pide un código por SMS o Telegram, así que hace falta un comando interactivo puntual (p. ej. `docker compose run --rm bot login`). La sesión se guarda en un volumen persistente.
- **Base de datos:** un proyecto de Supabase nuevo y vacío. El usuario ha pedido que Claude intente crear el proyecto y las tablas. Para eso hace falta un token de acceso personal de Supabase (Supabase CLI o Management API). Si no se consigue, el plan alternativo es que el usuario cree el proyecto en el panel y Claude aplique las migraciones. El esquema se versiona como migraciones SQL dentro del repositorio.
- **Afiliados de Amazon:** el enlace final siempre se construye como `https://www.amazon.es/dp/{ASIN}?tag=patobarato-21`, quitando cualquier otro tag o parámetro de seguimiento. Los enlaces acortados (`amzn.to`, `amzn.eu`, `a.co`) se abren siguiendo las redirecciones para obtener el ASIN.
- **Límites de Telegram:** hay que respetar los límites de envío (cola con ritmo controlado, gestionando `FloodWait`). El pie de foto admite como máximo 1024 caracteres.

## 4. Flujo

1. La cuenta lectora recibe un **mensaje nuevo** de un canal que está en `sources` y activo. No se procesa el historial al arrancar y se ignoran las ediciones.
2. **Extracción:** se buscan enlaces de Amazon en el texto, en las entidades (enlaces ocultos tras texto), en los botones y en la vista previa del enlace. Los enlaces que no son de Amazon (bit.ly, redirecciones propias de los canales) se siguen hasta el final y solo se usan si acaban en Amazon. *(Decisión mía.)* Del dominio sale el país (`amazon.es` → `ES`). Los dominios de otros países se ignoran en v1, pero el mapa dominio→país debe ser fácil de ampliar. Los mensajes sin enlaces de Amazon se ignoran (se puede dejar constancia en el log).
3. **Análisis:** del texto se sacan el título, el precio actual, el precio anterior y el cupón. Los formatos varían de un canal a otro, así que esta pieza tiene que ser fácil de ampliar y llevar pruebas con mensajes reales.
   - Si un mensaje trae varios productos, cada uno se trata como una oferta independiente cuando se pueda separar con fiabilidad. Si no se puede, se procesa solo el primero. *(Decisión mía.)*
4. **Guardado:** se crea o actualiza el `product` (ASIN + país) y se inserta la `offer`, incluido el texto original para poder depurar.
5. **Decisión de publicar:**
   - Si no hay precio → se guarda con estado `skipped_no_price` y no se publica.
   - Si no existe una publicación previa del producto en ese país → se publica.
   - Si existe y tiene **menos de 7 días** → se publica solo si `precio_nuevo < último precio publicado`. Si no, la oferta queda como `skipped_duplicate`.
   - Si existe pero tiene **7 días o más** → se vuelve a publicar en cuanto una fuente lo saque de nuevo, aunque sea al mismo precio o más caro. *(Decidido por el usuario: "si alguna web lo vuelve a publicar, nosotros también".)*
   - El precio que se compara es el **precio sin cupón**; el cupón no cuenta. *(Decidido por el usuario.)*
   - Una oferta que lleve más de 30 minutos en la cola sin publicarse se descarta con el estado `skipped_stale`, en lugar de publicarse tarde. *(Decisión mía.)*
   - Las ofertas se procesan **de una en una** (cola única), para que dos canales que publican la misma oferta casi a la vez no generen dos mensajes.
6. **Publicación:** el bot publicador envía el mensaje (sección 5) y se guarda la `publication` con `chat_id`, `message_id`, el precio publicado y el estado `active`.
7. Los errores al publicar se reintentan con espera creciente. Si falla del todo, la oferta queda como `publish_failed` y se registra en el log.

## 5. Formato del mensaje (acordado con el usuario)

Es la opción "C + botón de B" que se vio en las maquetas:

```
[FOTO del producto]
🦆 <b>{título}</b>
✅ Precio: <b>{precio} €</b>
❌ Antes: <s>{precio_anterior} €</s> (-{descuento}%)   ← solo si hay precio anterior
🎟️ Cupón: <code>{cupón}</code>                          ← solo si hay cupón

#{categoría} #{marca}                                   ← solo si se pueden deducir
[ 🛒 Ver en Amazon ]  ← botón inline con el enlace de afiliado
```

- **Foto (decidido por el usuario):** sale de la vista previa de Amazon, no de la imagen del mensaje original. *Mi interpretación:* es la imagen de la vista previa que Telegram genera para el enlace de Amazon (el `webpage.photo` del mensaje de origen). Si no la hay, se pide a Telegram la vista previa del enlace de Amazon con `messages.getWebPagePreview` desde la cuenta lectora. No se descargan páginas de amazon.es directamente, porque Amazon suele bloquearlo con captcha y además es más delicado con las normas de afiliados. *(Decisión mía.)* Si tampoco se consigue, el mensaje se publica como texto con el botón. La personalización de la imagen se deja para más adelante.
- El descuento se calcula a partir de los dos precios si el canal no lo indica.
- Los hashtags se añaden solo si la categoría o la marca se pueden deducir del mensaje original (por ejemplo, de sus propios hashtags). Si no, se omiten. *(Decisión mía.)*
- No se muestra la hora del precio. *(Decidido por el usuario, sabiendo que las normas de Amazon Afiliados restringen mostrar precios que no vengan de su API.)*
- Formato HTML de Telegram. El título se recorta para que el pie de foto no pase de 1024 caracteres.

## 6. Modelo de datos (Supabase / Postgres)

*(Propuesta mía. El builder puede ajustar nombres y tipos, pero tiene que mantener los conceptos.)*

- **`sources`**: los canales de origen.
  `id`, `type` (`telegram_channel`; en el futuro `amazon_api`…), `identifier` (@username o id numérico), `name`, `country` (por defecto `ES`), `active`, `created_at`.
  El bot recarga esta lista periódicamente (por ejemplo, cada 5 minutos), así que añadir o desactivar un canal no exige reiniciarlo. Si la cuenta lectora no está unida a un canal público de la lista, se une de forma pausada (con límite de ritmo).
- **`products`**: `id`, `store` (`amazon`), `country`, `asin`, `title`, `image_url`/`image_file_id`, `category`, `brand`, `created_at`, `updated_at`. Clave única `(store, country, asin)`.
- **`offers`**: cada oferta detectada.
  `id`, `product_id`, `source_id`, `source_message_id`, `country`, `price`, `previous_price`, `currency` (`EUR`), `coupon`, `raw_text`, `status` (`published` | `skipped_duplicate` | `skipped_no_price` | `skipped_stale` | `publish_failed`), `detected_at`. Clave única `(source_id, source_message_id, product_id)` para no procesar dos veces el mismo mensaje.
- **`publications`**: lo publicado en nuestro canal.
  `id`, `offer_id`, `product_id`, `country`, `chat_id`, `message_id`, `published_price`, `affiliate_url`, `status` (`active` | `ended`), `published_at`, `ended_at`.
  Para la comprobación de duplicados basta con la última publicación por `(product_id, country)`. El estado `ended` y `ended_at` se dejan preparados para la API futura, en la que una oferta finalizada que vuelva a aparecer también se republicará.
- El bot accede con la `service_role key` desde el servidor. Se activa RLS en todas las tablas, sin políticas públicas.

## 7. Estructura sugerida del código

*(Orientativa. Lo importante es separar fuentes, análisis, almacenamiento y publicación.)*

- `sources/telegram_listener.py`: cliente de la cuenta lectora (Telethon). Recibe mensajes y los entrega como `RawOffer`.
- `parsing/`: detección de enlaces y ASIN, resolución de acortadores, análisis de precio, precio anterior y cupón, y el mapa dominio→país.
- `storage/supabase_repo.py`: acceso a la base de datos.
- `publishing/telegram_publisher.py`: formato y envío con el bot, devuelve el `message_id`.
- `core/pipeline.py`: la cola y la decisión de publicar.
- `config.py` (lee el `.env`), `main.py`, un comando `login`, `Dockerfile`, `docker-compose.yml`, `supabase/migrations/*.sql`.
- Pruebas con pytest, sobre todo del análisis (con mensajes de ejemplo de cada canal guardados como fixtures) y de la decisión de duplicados.

El diseño debe permitir añadir otra fuente (la API de Amazon) que produzca el mismo `RawOffer`, sin tocar el pipeline.

## 8. Decisiones tomadas por Claude (revisables)

- Python 3.12 + **Telethon** para la cuenta lectora y para publicar con el bot (una sola librería), y **supabase-py** para la base de datos.
- Las 4 tablas y los estados descritos en la sección 6.
- La lista de canales se guarda en la tabla `sources` (editable desde Supabase), no en un fichero.
- Sin precio no se publica.
- Solo se procesan mensajes nuevos: ni historial ni ediciones.
- Si un mensaje trae varios productos, se separan cuando se puede; si no, se usa el primero.
- Los hashtags solo aparecen si se pueden deducir.
- Si no hay foto, se publica un mensaje de texto con el botón.

## 9. Lo que queda en manos del builder

- Las expresiones regulares y heurísticas concretas para analizar cada formato de canal.
- La librería para resolver acortadores (httpx o similar) y los tiempos de espera.
- El ritmo exacto de la cola de publicación y de los reintentos.
- La configuración del log y si hay o no un endpoint de salud.
- Los nombres exactos de columnas, índices y tipos.

## 10. Pendiente por parte del usuario

- Conseguir la cuenta de Telegram lectora (otro número) y sus `api_id`/`api_hash`.
- Crear el bot en @BotFather y hacerlo administrador de @patobarato.
- Dar acceso a Supabase (token personal) o crear el proyecto.
- La lista inicial de canales de origen y 2 o 3 mensajes de ejemplo de cada uno. Hasta tenerlos, el análisis se construye para los formatos habituales (precio con €, "Antes"/"PVP", "Cupón") y se prueba con ejemplos inventados. Cuando lleguen los reales, se añaden como fixtures y se ajustan las reglas. Si algún canal es privado, hará falta su enlace de invitación (añadir la columna `invite_link` a `sources`).
- Registrar el canal de Telegram como sitio en la cuenta de Amazon Afiliados.
