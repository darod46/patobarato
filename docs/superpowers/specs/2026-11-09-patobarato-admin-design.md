# PatoBarato — Portal de administración (`admin/`)

Fecha: 2026-11-09. Estado: pendiente de aprobación del usuario.
Antecedentes: `2026-11-04-patobarato-bot-design.md` (publicaciones y `message_id` guardado «para poder editarla después»), `2026-11-06-patobarato-guias-design.md` y `2026-11-07-patobarato-eventos-design.md` (ambos dejan la edición para «el portal de administración»), `2026-11-06-patobarato-multitienda-design.md` (cupones, `channel` en `publications`).

## 1. Intención

Hoy cada corrección de una oferta pasa por pedírsela a Claude: cambiar la fila en Supabase y editar a mano el post de Telegram asociado. Cupones, guías y eventos se editan en Supabase Studio o por SQL. El usuario quiere una web de administración propia donde:

- corregir el **precio** y el **cupón** de una oferta publicada, o **darla por terminada**, y que el post de Telegram se actualice solo;
- **crear ofertas a mano** pegando el enlace del producto: el bot la procesa con su pipeline de siempre, la deja como borrador, y el usuario la revisa y la publica en Telegram;
- **crear y editar** cupones, guías (con sus productos, tiendas y FAQ) y eventos (con su FAQ);
- **copiar cualquier elemento en formato WhatsApp** (imagen + texto) para publicarlo en un canal de WhatsApp nuevo, tanto desde el ordenador como desde el móvil;
- entrar con **Supabase Auth**, con altas solo **por invitación**.

Éxito: el usuario no vuelve a necesitar Studio, SQL ni a Claude para el día a día del canal y la web.

## 2. Objetivos, no objetivos y anti-objetivos

**Objetivos**
- Proyecto nuevo `admin/` en el monorepo, desplegado como segundo proyecto de Vercel.
- Login con email y contraseña de Supabase Auth; registro abierto desactivado; invitaciones por email.
- Ofertas: listado (activas, borradores, terminadas), búsqueda, edición, terminar, crear desde enlace, publicar borrador.
- Cupones, guías y eventos: listado, alta, edición y paso de borrador a publicado donde exista `status`.
- Botones de WhatsApp en ofertas, cupones, guías y eventos.
- Usuarios: listado, invitar y quitar acceso.

**No objetivos**
- Roles o permisos distintos: todos los usuarios pueden hacer lo mismo. La única excepción es que solo el propietario invita y quita usuarios.
- Publicar automáticamente en WhatsApp: no hay API para canales, así que se copia y se pega.
- Borrar posts de Telegram, programar publicaciones o publicar cupones, guías o eventos en Telegram.
- Editar fuentes del bot, `catalog_*`, `event_promos` ni `product_prices`, que siguen siendo responsabilidad del bot.
- Historial de cambios o deshacer, edición simultánea con bloqueo (gana la última escritura) y estadísticas.

**Anti-objetivos**
- Ni la `service_role` ni el token del bot salen del servidor del bot. No deben estar en Vercel ni en el navegador.
- Que Supabase y el post de Telegram queden distintos sin que el usuario lo sepa. Si una edición de Telegram falla, el admin lo muestra y permite reintentar.
- Romper o abrir la web pública: las vistas `web_*` no cambian y las políticas nuevas no conceden nada a `anon`.
- Publicar en Telegram una oferta creada a mano sin que el usuario la haya revisado.
- Que el post editado se vea distinto del que publica el bot: mismo formato, mismo código.

## 3. Restricciones

- **Admin:** Next.js 16 App Router, React 19, Tailwind v4 y TypeScript, igual que `web/`. Se usa `@supabase/supabase-js` con `@supabase/ssr` para la sesión. Los tokens de diseño se reutilizan de `prototipo/DESIGN.md` y `web/src/app/globals.css`, con Lucide como iconos. Los tests van con Vitest y Testing Library, y el lint con oxlint, como en `web/`. La interfaz está en español y el código y los comentarios en inglés. Debe funcionar bien en móvil y en ordenador, con objetivos táctiles de al menos 44 px.
- **Vercel:** proyecto nuevo con Root Directory `admin`. Las únicas variables son `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`, junto con la URL pública de la web para enlazar guías y eventos.
- **Web (`web/`):** la única variable nueva es `REVALIDATE_SECRET`, para el endpoint de revalidación (§4.8). El mismo secreto va en el `.env` del bot.
- **Rama base:** el `main` local, que incluye `price_before_coupon`. `origin/main` va por detrás.
- **Bot:** Python 3.12 y Telethon. Publica con el cliente autenticado con el token del bot, que es admin del canal con permiso para editar. Se despliega con la imagen arm64 en Oracle mediante `docker compose`.
- **Supabase:** las migraciones van en `supabase/migrations/` y se termina con `notify pgrst, 'reload schema'`. Las tablas siguen con RLS. `web/scripts/check-views.mjs` debe seguir pasando.
- **CI:** `admin/` tiene su propio job (lint, typecheck, test y build), como `web.yml`.

## 4. Arquitectura

```
navegador (admin/)
   ├── lee y escribe tablas con la sesión del usuario ──► Supabase (RLS: solo miembros de admin_users)
   └── encola trabajos en admin_jobs ────────────────────► Supabase
                                                            ▲
bot (Oracle) ── recoge admin_jobs pendientes, los ejecuta ──┘
   ├── create_offer_from_url  → pipeline sin filtro de decisión → publicación en estado draft
   ├── publish_draft          → envía a Telegram y guarda chat_id y message_id
   ├── update_post            → reformatea y edita el mensaje de Telegram
   ├── end_post               → edita el mensaje con el formato de terminada
   ├── invite_user / revoke_user → Supabase Auth admin API con la service_role
   └── revalidate (y tras cada trabajo de Telegram) → POST /api/revalidate de la web
```

**Por qué la cola y no llamadas directas desde el admin (decisión de Claude):**
- El bot ya tiene el token del bot, la `service_role`, el formateador (`publishing/format.py`), la descarga de fotos y el pipeline completo de tiendas y afiliados.
- Si el admin llamara a Telegram por su cuenta, habría que poner secretos en Vercel y duplicar el formato del post en TypeScript.
- Con la cola, el admin solo necesita la anon key y la sesión del usuario.
- El precio es una latencia de unos segundos y que el bot tiene que estar en marcha. Si no lo está, el trabajo queda pendiente y el admin lo muestra.

### 4.1 Tabla `admin_users`

`admin_users(user_id uuid pk → auth.users, email text, is_owner bool, created_at)`.

- Las políticas RLS de todas las tablas que edita el admin exigen `exists (select 1 from admin_users where user_id = auth.uid())`. No basta con estar autenticado, por si alguien activa el registro por error.
- El propietario inicial lo inserta una migración o un paso manual documentado en el README de `admin/`. Esto lo decide quien lo construya.

### 4.2 Tabla `admin_jobs`

`admin_jobs(id, type, payload jsonb, status pending|running|done|error, error text, result jsonb, created_by uuid, created_at, updated_at)`.

- **Permisos:** los miembros pueden insertar y leer. Solo el bot cambia el estado. `invite_user` y `revoke_user` solo los puede insertar un propietario, y eso se comprueba en la política RLS.
- **Recogida en el bot:** un bucle nuevo dentro de `_supervise`, que consulta la tabla cada pocos segundos o usa Realtime (lo decide quien lo construya). Cada trabajo pasa a `running` y luego a `done` o `error` con el mensaje.
- **Errores:** los transitorios de Telegram (FloodWait, 5xx) reutilizan la lógica de reintento de `TelegramPublisher`.
- **En el admin:** cada acción muestra su estado (enviando… / hecho / error + «Reintentar»). Un trabajo `pending` que lleva más de un minuto se marca como «el bot no responde».

### 4.3 Ofertas

**Estados.** `publications.status` añade `draft` (`draft|active|ended`). Un borrador tiene `channel = 'telegram'` sin `chat_id` ni `message_id`, así que hay que ajustar el check `publications_telegram_ids` para permitirlo solo en `draft`. `web_deals` ya filtra por `active`, por lo que los borradores no aparecen en la web.

**Borradores y reglas del bot (decisión de Claude).**
- Los borradores no cuentan para el chequeo de duplicados del bot (`get_last_publication` → `decide()`). Hay que tratar el nuevo valor en `PublicationStatus` para que no rompa al leerlo.
- Tampoco cuentan para el «mínimo histórico» de `web_deals` y de las vistas de guías: se filtra `status <> 'draft'`, y `check-views.mjs` debe seguir pasando.
- Si el bot publica por su cuenta el mismo producto mientras hay un borrador pendiente, el borrador sigue ahí. El admin lo avisa («el bot ya la publicó hace X»).
- Al pulsar «Publicar en Telegram» en un borrador cuyo producto se publicó en los últimos 7 días, el admin avisa y pide confirmar, pero deja publicar. `publish_draft` no aplica la regla de duplicados.
- Las ofertas creadas a mano usan una fila de `sources` de tipo manual, porque `offers.source_id` es obligatorio. Cómo se modela es cosa de quien lo construya.

**Crear desde enlace.**
1. El usuario pega la URL y el admin encola `create_offer_from_url`.
2. El bot resuelve la tienda y obtiene precio, título, imagen, enlace de afiliado y hashtags, igual que con un mensaje de una fuente.
3. Se salta el filtro de `core/decision.py` y crea `product`, `offer` y `publication` en `draft`. El precio anterior, si la tienda lo da, se guarda en `offers.previous_price`.
4. Si la tienda no está soportada o no hay precio ni afiliado, el trabajo acaba en `error` con un motivo legible.
5. En el admin, el borrador aparece en «Borradores». El usuario ajusta título, precio, precio anterior, cupón, «sin cupón» y hashtags, mira la vista previa y pulsa «Publicar en Telegram», que encola `publish_draft`.

**Editar.**
- Campos editables: precio, precio anterior, cupón, «precio sin cupón» (`price_before_coupon`) y título.
- «Guardar y actualizar Telegram» escribe los campos y encola `update_post` cuando la publicación tiene `message_id`. Una publicación `channel = 'web'` solo se guarda en Supabase.
- El bot rehace el texto con `format_caption` a partir de los datos guardados y edita el mensaje. Con Telethon, `edit_message` sirve tanto para un pie de foto como para un mensaje de texto.
- Hoy el precio publicado está en `publications` y el cupón y el precio anterior en `offers`. Dónde vive cada campo editable lo decide quien lo construya. La condición es que el post rehecho y la web reflejen lo editado.

**Terminar.**
- Pone `status = 'ended'` y `ended_at`, y encola `end_post`.
- El bot edita el mensaje: añade arriba la línea `❌ OFERTA TERMINADA` y tacha el precio actual. Para eso se añade una variante en `format.py`, por ejemplo `format_ended_caption`.
- El post no se borra. La oferta deja de verse en la web porque `web_deals` solo muestra `active`.
- Se puede reactivar una oferta terminada (vuelve a `active` y encola `update_post`). Esto es decisión de Claude, para corregir un clic por error.

**Vista previa de Telegram.** Es un port a TypeScript de `format_caption`, solo para la vista previa. Para que no se separen, las salidas esperadas se guardan como fixtures JSON compartidos que comprueban tanto `bot/tests` como los tests de `admin/`. Lo que se envía de verdad lo formatea siempre el bot.

### 4.4 Cupones, guías y eventos

- **Cupones:** todos los campos de `coupons` (tienda, código, título, condiciones, URL, fechas, `active`, importe, % y compra mínima, evento). Los cupones del bot (`source_id` no nulo) también se pueden editar, sabiendo que el bot puede volver a sobrescribirlos en la siguiente sincronización. El admin lo advierte en el formulario.
- **Guías:** campos de `guides`, más el Markdown de la intro y de «cómo elegir» con vista previa, la FAQ como lista editable de pregunta y respuesta, y los `guide_items` con sus `guide_item_stores` (ordenar, añadir y quitar). `product_prices` se muestra pero no se edita, porque lo refresca el bot.
- **Eventos:** campos de `events`, con Markdown y FAQ igual que en las guías. `event_promos` es de solo lectura.
- **Borrador y publicación:** guías y eventos tienen `status draft|published`. El admin permite crear en borrador y publicar. Hay un enlace «Ver en la web» a `/guias/{slug}` o `/eventos/{slug}`.
- **Slugs:** se generan desde el título y son editables. Se comprueba que no se repitan.

### 4.5 WhatsApp

Cada elemento tiene una sección «WhatsApp» con la vista previa del texto, que se puede retocar antes de copiar sin que se guarde.

**Texto.** Formato de WhatsApp: `*negrita*`, `~tachado~` y el cupón entre comillas invertidas.
- **Oferta:** título, precio, precio anterior con %, cupón, enlace de afiliado y hashtags, con los mismos datos y el mismo orden que el post de Telegram. Si la oferta está terminada, empieza por `❌ OFERTA TERMINADA`.
- **Cupón:** tienda, título, código, condiciones, caducidad y URL.
- **Guía o evento:** título, subtítulo o intro breve y enlace a su página en la web. Esto es decisión de Claude.

**Imagen.**
- **Oferta:** la imagen del producto.
- **Guía:** la imagen de su primer producto.
- **Cupón y evento:** la imagen OG de la web (`/og.png`) o ninguna. Quien lo construya puede cambiarlo por algo mejor.

**Ordenador.** Botones «Copiar imagen» y «Copiar texto».
- La imagen se copia como `image/png` con la Clipboard API.
- Las imágenes de las tiendas son de otro origen, así que se sirven a través de una ruta del propio admin que la descarga en el servidor y la convierte a PNG. La ruta exige sesión y solo acepta hosts de tiendas conocidas.

**Móvil.**
- Botón «Compartir» con `navigator.share({ files, text })`, que abre el menú del sistema para elegir WhatsApp.
- Al pulsarlo, el texto se copia antes al portapapeles, por si el destino ignora el texto.
- Si el navegador no puede compartir archivos, se muestran los dos botones del ordenador.

### 4.6 Interfaz

Opción A elegida por el usuario en el boceto:
- **Navegación superior:** Ofertas · Cupones · Guías · Eventos · Usuarios. Usuarios solo se ve si eres propietario.
- **Ordenador:** cada sección es una lista con búsqueda y filtros por estado. Al pulsar un elemento se abre un **panel lateral derecho** de edición sin salir de la lista.
- **Móvil:** el panel ocupa la pantalla completa y tiene botón «←».
- **URL:** el panel abierto se refleja en la URL (`/ofertas?id=123`) para poder enlazarlo y recargar.
- **Panel de oferta:** estado de la oferta y de Telegram, campos editables, vista previa de Telegram, «Guardar y actualizar Telegram», «Terminar oferta» y la sección WhatsApp.
- **Guías:** son grandes, así que su panel puede ser más ancho o tener pestañas (Datos · Contenido · FAQ · Productos). Lo decide quien lo construya.

### 4.7 Usuarios e invitaciones

- **Invitar:** el propietario escribe un email y el admin encola `invite_user`. El bot llama a `auth.admin.invite_user_by_email` con `redirect_to` a `/{admin}/auth/callback` e inserta la fila en `admin_users`.
- **Primer acceso:** la persona invitada recibe el email de Supabase, entra y define su contraseña.
- **Quitar acceso:** encola `revoke_user`, que borra la fila de `admin_users` y el usuario de Auth.
- **Contraseña:** «He olvidado mi contraseña» usa el flujo estándar de Supabase.
- **Supabase:** hay que desactivar «Allow new users to sign up» y añadir la URL del admin a las Redirect URLs. Son pasos manuales que van documentados en el README.

### 4.8 La web se actualiza al momento

Lo pidió el usuario: los cambios se tienen que ver en la web nada más guardar, sin esperar a la caché (hoy una oferta tarda hasta 10 minutos y un evento hasta 1 hora). La revalidación la hace el bot, así que el admin sigue sin secretos.

- **Endpoint en la web:** `web/` añade `POST /api/revalidate`, protegido con `REVALIDATE_SECRET` en una cabecera. Recibe una lista de rutas o etiquetas y llama a `revalidatePath`/`revalidateTag`.
- **Trabajos que ya pasan por el bot:** al terminar con éxito `publish_draft`, `update_post` o `end_post`, el bot llama al endpoint con las páginas afectadas: la ficha `/oferta/{store}/{slug}`, la portada, `/chollos` y sus etiquetas, la tienda, y los eventos o guías que la incluyan, si es fácil saberlo.
- **Cupones, guías y eventos:** su edición no pasa por Telegram. Después de guardar, el admin encola un trabajo `revalidate` con las rutas: `/cupones`, `/guias/{slug}`, `/eventos/{slug}` y sus listados.
- **Si la revalidación falla:** el trabajo acaba en `error` con «Reintentar», sin deshacer lo guardado. En el peor caso la web se pone al día cuando caduca su caché.
- **Precisión:** quien lo construya decide si se revalida por ruta o por etiquetas, y lo fino que se hace. La condición es que lo editado se vea al recargar.

## 5. Qué decide quien lo construya

- Polling o Realtime para `admin_jobs`, y su intervalo.
- Dónde se guarda cada campo editable de la oferta, siempre que el post y la web lo reflejen.
- Librerías de formularios y de validación, y cómo se estructuran los componentes.
- Cómo se divide el panel de guías.
- La imagen para cupones y eventos en WhatsApp.
- Cómo se da de alta el primer propietario.
- Orden de entrega. La recomendación es: base (auth, `admin_users`, RLS, `admin_jobs`, worker del bot) → ofertas → WhatsApp → cupones → eventos → guías → usuarios.
