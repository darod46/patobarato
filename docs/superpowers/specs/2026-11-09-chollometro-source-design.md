# Fuente de ofertas: Chollometro en lugar de canales de Telegram

Fecha: 2026-11-09 · Estado: borrador para aprobación

## Intención y por qué

Hoy el bot obtiene las ofertas leyendo canales de chollos de Telegram con una cuenta de usuario
(`sources/telegram_listener.py`) y parseando el texto libre de cada mensaje (`parsing/`). Dos problemas
lo hacen inservible como fuente:

1. **El parseo es muy deficiente**: cada canal escribe precios, títulos y enlaces a su manera.
2. **Las imágenes contienen el nombre del canal** (marcas de agua), y acaban publicadas en @patobarato.

Se sustituye esa entrada por los chollos de <https://www.chollometro.com/nuevos>, que ofrecen datos
estructurados (título, precio, precio anterior, tienda, enlace, temperatura, estado), y la imagen
deja de tomarse de la fuente.

Éxito = @patobarato y la web reciben ofertas de nuestras tiendas afiliadas, bien parseadas, con la
foto de la tienda, sin duplicados, solo las que valen la pena, y marcadas como terminadas cuando
Chollometro las da por caducadas o agotadas.

## Objetivos

- Nueva fuente programada `chollometro` (un `ApiSourceRunner` más del `ApiScheduler`, fila en `sources`).
- Solo chollos cuyo enlace final sea de una tienda registrada en `StoreRegistry`: de momento Amazon,
  AliExpress y las tiendas Awin configuradas (PcComponentes, MediaMarkt, El Corte Inglés). Una tienda
  nueva que se registre en el futuro entra sola.
- **Filtro de calidad**: un chollo se considera apto si `temperatura > 50°` **o** `descuento ≥ 40 %`.
  Ambos umbrales en `config` de la fila de `sources` (`min_temperature`, `min_discount`), no en código.
- **Límite de publicación en Telegram: máximo 10 por hora** (configurable, `max_per_hour`).
  Cuando hay más aptos que huecos, se eligen por puntuación (ver abajo).
- **Sin duplicados** (requisito explícito, se conserva el mecanismo actual):
  - Un mismo chollo de Chollometro solo crea una fila en `offers`: se usa su id numérico de
    Chollometro como `source_message_id`; la restricción única `(source_id, source_message_id)` ya
    rechaza repeticiones (`insert_offer` devuelve `None`).
  - Un mismo producto (aunque llegue en dos chollos distintos, o ya publicado por otra vía) pasa por
    `decide()` como hoy: solo se republica si baja de precio o han pasado `REPUBLISH_AFTER_DAYS`.
- **Imagen siempre de la tienda** (`store.find_image` / `quote.image_url`), nunca la de Chollometro.
  Si la tienda no da imagen, se publica sin foto.
- **Marcar como terminada**: si un chollo que publicamos aparece en Chollometro como caducado o
  agotado, la publicación pasa a `ended`, se edita el post de Telegram con `format_ended_caption`
  ("❌ OFERTA TERMINADA", precio tachado) y se avisa a la web (`WebRevalidator`). Se hace una sola vez.
- **Retirar Telegram como fuente**: fuera el listener de canales, la cuenta lectora y el comando
  `login`, `make_photo_provider` y el parseo de texto libre que solo usaba el listener. El bot sigue
  **publicando** en @patobarato con su token de bot.

## No objetivos

- No se deduce el fin de una oferta mirando la tienda; solo lo que marca Chollometro.
- No se usan las imágenes de Chollometro ni sus comentarios.
- No cambia el formato del post ni la web.
- No se tocan las demás fuentes de API (AliExpress hot/search, Awin, guías, eventos).

## Anti-objetivos (aunque funcione, sería un fracaso)

- Publicar el mismo chollo o producto dos veces.
- Publicar una foto con marca de agua o de otra web.
- Publicar sin enlace de afiliado (se mantiene `SKIPPED_NO_AFFILIATE`).
- Inundar el canal (más de 10/h) o publicar chollos tibios.
- Que Chollometro bloquee al bot por exceso de peticiones (riesgo mayor al usar `/visit/`).

## Comportamiento

### Lectura

- Cada `every_minutes` (propuesta: 5) la fuente lee `/nuevos` (o su RSS / el JSON embebido en la
  página, lo que sea más estable; a decidir por el constructor tras inspeccionar la web).
- Por cada chollo: id, título, precio, precio anterior, % descuento si lo da, temperatura, estado
  (activo/caducado/agotado), tienda indicada y enlace de salida.
- El enlace de salida de Chollometro es una redirección propia (`/visit/...`): se resuelve con
  `UrlResolver` hasta la URL de la tienda, y con ella `StoreRegistry.store_for(url)` + el
  `canonical_url`/id de producto de la tienda. Los de tiendas no registradas se ignoran sin guardar nada.
- Un chollo que aún no es apto se **vuelve a evaluar** en las siguientes pasadas durante una ventana
  de seguimiento (24 h desde su publicación en Chollometro), porque la temperatura sube con el tiempo.
  Si deja de aparecer en `/nuevos` antes de esa ventana, se consulta su página individual.
- Peticiones con un User-Agent genérico, secuenciales, con pausa entre peticiones a páginas
  individuales.
- **`/visit/` y `robots.txt`**: el `robots.txt` de Chollometro prohíbe `/visit/` a los bots. El usuario
  decide seguirlo igualmente (opción B), asumiendo el riesgo de bloqueo. Para minimizarlo: solo se
  resuelve `/visit/` de chollos que **ya** pasaron el filtro y son de una tienda candidata (por el nombre
  de tienda que muestra Chollometro), una sola vez por chollo (la URL resuelta se guarda), y cuentan
  dentro del presupuesto de peticiones. Si Chollometro empieza a responder 403/429, la fuente registra
  el error en `last_error` y espera a la siguiente ejecución sin reintentar en bucle.

### Descuento

- Se usa el que da Chollometro o, si no, `(anterior − precio) / anterior`.
- Para el 40 % se prefiere el precio actual de la tienda (`store.fetch_price`) cuando está disponible,
  porque el "antes" de Chollometro puede estar inflado. (AliExpress: su precio de API va antes de cupón,
  como ya trata `STORES_PRICED_BEFORE_COUPON`.)

### Momento de detección y caducidad

- `decide()` descarta lo detectado hace más de `STALE_AFTER_MINUTES` (30). Para esta fuente el
  `detected_at` es **el momento en que el chollo pasa el filtro**, no su fecha en Chollometro.

### Límite y puntuación

- Ventana deslizante de 60 minutos sobre las publicaciones de Telegram de esta fuente.
- En cada pasada se ordenan los aptos pendientes por **temperatura descendente; empate por descuento**
  y se publican hasta llenar los huecos libres.
- Los que no caben siguen como candidatos en pasadas posteriores mientras no superen
  `STALE_AFTER_MINUTES` desde que pasaron el filtro; después se marcan `skipped_stale`.

### Fin de oferta

- Los chollos publicados se siguen revisando durante 7 días (`REPUBLISH_AFTER_DAYS`).
- Caducado/agotado ⇒ publicación `active → ended`, edición del post vía `PostPublisher.edit`
  (misma lógica que `PostService.sync_post`), revalidación de la web. Una publicación ya `ended` no
  se vuelve a tocar. Tras `ended`, `decide()` ya permite republicar si aparece un chollo nuevo.

## Restricciones

- Python 3.12, async, estructura existente de `bot/` (fuentes en `sources/`, contrato `ApiSourceRunner`).
- Migración nueva en `supabase/migrations/` que añada `chollometro` al `sources_type_check` y cree la
  fila de la fuente (como hacen `guide_prices`/`awin_feeds`).
- El estado de seguimiento (chollos vistos no aptos, publicados a vigilar) debe sobrevivir a un
  reinicio del contenedor: en Supabase, no en memoria.
- Tests con fixtures HTML/JSON reales de Chollometro guardadas en `bot/tests/fixtures/`, sin red.
- README del bot actualizado: sin sección de cuenta lectora/canales; nueva sección de la fuente.

## Decidido por el usuario

- Origen: Chollometro `/nuevos`; tiendas: Amazon, AliExpress y las afiliadas.
- Seguir los enlaces `/visit/` aunque `robots.txt` los prohíba (riesgo de bloqueo asumido).
- Filtro: > 50° o ≥ 40 % de descuento.
- Máximo 10 publicaciones por hora, priorizando por puntuación.
- Marcar como terminadas las ofertas publicadas que Chollometro caduque o agote.
- Motivo del cambio: parseo deficiente e imágenes con el nombre del canal.

## Decisiones mías (revisables)

- Retirar del todo la lectura de Telegram (no dejarla desactivada).
- Imagen solo de la tienda; sin imagen ⇒ post sin foto.
- Ventanas: 24 h para que un chollo se caliente; 7 días de vigilancia de fin; cada 5 min.
- Puntuación = temperatura, desempate por descuento.
- Los que no caben en el límite esperan hasta 30 min y luego se descartan (no van solo a la web).

- **Precio y cupón**: se publica el precio de Chollometro (el que el lector consigue) y su código de
  cupón va a la línea de cupón existente (`ParsedOffer.coupon`). El "antes" es el precio anterior de
  la tienda si lo da; si no, el de Chollometro. El precio de la tienda solo sirve de control: si es
  **menor** que el de Chollometro se publica el de la tienda; si es mayor y el chollo no trae cupón ni
  condición, se descarta (`skipped_mismatch`). `decide()` compara el precio publicado.
- **Presupuesto de peticiones**: como máximo 60 páginas individuales de Chollometro por hora, primero
  las de publicaciones vigiladas (fin de oferta), después los candidatos que se calientan, los más
  calientes antes. Marcar "terminada" puede tardar unas horas: aceptable.
- **Hashtags**: las categorías/grupos de Chollometro se normalizan como hashtags (además de los de
  la fila de `sources` y la tienda), para que la web siga clasificando y las páginas de evento
  (p. ej. `#blackfriday`) reciban chollos.
- **Filas antiguas de Telegram**: se dejan en `sources` con `active = false`; el tipo
  `telegram_channel` sigue permitido por el histórico de `offers`/`publications`. No se borra nada.
- La rama parte del `main` local (con el portal de administración). El flujo del panel "nuevo desde
  enlace" (`Pipeline.create_draft`) sigue usando `extract_offers`/`UrlResolver`: no se borran.

## Queda para el constructor

- Cómo leer Chollometro (HTML, JSON embebido, RSS) y el detalle de cómo detectar caducado/agotado.
- Esquema concreto de la tabla de seguimiento.
- Qué partes de `parsing/` se borran y cuáles se reutilizan (p. ej. `links.py`, `UrlResolver`).
