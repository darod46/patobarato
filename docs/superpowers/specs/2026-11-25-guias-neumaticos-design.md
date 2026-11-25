# Guías de neumáticos (neumaticos.es vía Awin)

## Intención

David está dado de alta en el programa de neumaticos.es en Awin y quiere una serie de guías de
compra de neumáticos (turismo, SUV, furgoneta, invierno, all-season, cómo elegir), publicadas los
viernes, con un buscador de neumaticos.es incrustado para que el lector calcule el precio en su
medida. Es la primera categoría del sitio que no pasa por Amazon.

## Objetivos

- Seis guías programadas, una cada viernes a las 07:00 (Europe/Madrid) desde el 4 de diciembre de
  2026, con el mismo formato que las de Amazon (intro, elección rápida, comparativa, cómo elegir,
  FAQ) y portada ilustrada del pato (prompts para Gemini como las anteriores).
- Cada modelo recomendado va en una **medida de referencia** del segmento, con su precio real en
  neumaticos.es revisado por el bot, y la nota «Precio para 205/55 R16 · otras medidas en el
  buscador».
- El buscador de neumaticos.es (widget de Awin) aparece en esas guías: después de la elección
  rápida y al final, antes de las FAQ.
- Los enlaces a neumaticos.es llevan el tracking de Awin de David.

## No objetivos / anti-objetivos

- No se comparan todas las medidas ni se muestran precios por medida distintos de la de referencia.
- No se tocan las guías de Amazon ni el diseño general de la página de guía.
- Anti-objetivo: que el widget rompa la página (el código con `<script>` de Awin usa
  `document.write` y no puede ir en una página React): se usa solo la versión `<iframe>`.
- Anti-objetivo: cookies de terceros sin aviso: `/cookies` y `/afiliados` se actualizan.

## Restricciones

- Web solo anon + vistas `web_*`; bot con service key; iconos Lucide; copy honesto, español de
  España, tuteo, sin emojis en la web; nada de precios ni porcentajes en el texto de las guías.
- Credenciales de Awin solo en el `.env` del bot (`AWIN_PUBLISHER_ID`, `AWIN_MERCHANTS`).
- IDs vistos en los códigos de Awin: anunciante `v=11552`, editor `r=3145511` (David los confirma
  en el panel), banners `s=3743674` (728×90) y `s=2718820` (468×60), `q=397643`.

## Enfoques considerados

**A. Guías con modelos en medida de referencia y precio real (elegido).** Reutiliza `guide_items`
+ `guide_item_stores` + `product_prices` y el ejecutor `guide_prices`; solo hace falta una tienda
`neumaticos` en el bot con un lector de precio para sus páginas de modelo+medida. El lector pierde
si neumaticos.es cambia el HTML, igual que con Amazon.

**B. Guías editoriales sin precio, solo con el buscador.** Más simple, pero el lector no ve
ningún precio hasta que usa el widget, y las fichas de la guía quedan vacías de dato. Descartado
por David.

**C. Feed de productos de Awin.** neumaticos.es no tiene feed útil por modelo+medida en el
programa (y añadiría un lector de feeds para una sola tienda). Descartado.

## Diseño

### neumaticos.es: cómo se lee un precio

Página de modelo + medida, por ejemplo
`https://www.neumaticos.es/neumaticos/michelin-205-55-16-crossclimate_2/108+200+201+202+205`
(título «Neumáticos Michelin CrossClimate 2 205 55 R16»). Lista las variantes (índice de carga y
velocidad) con el precio por unidad en elementos `itemprop="price"` (texto «98,01 €»). El precio
de la guía es **el menor** de esa página. El identificador del producto (`external_id`) es el
segmento de ruta `michelin-205-55-16-crossclimate_2`; la URL canónica es la de arriba sin query.
**La parte final de la ruta (`/108+200+201+202+205`) es obligatoria**: sin ella o con solo
`/108` el sitio devuelve 404 o un listado genérico. Los códigos varían por modelo y medida, así que
la URL de cada producto se copia tal cual de los enlaces de la página del modelo (lista «El
tamaño»); el bot nunca construye URLs de neumaticos.es, solo usa la guardada (`canonical_for`
conserva la ruta completa; en el enlace Awin `ued=` el `+` va codificado como `%2B`). La petición
se hace sin cookies con las cabeceras de navegador que ya usa el bot; desde el navegador sin
credenciales la página se sirve sin bloqueo. Si desde el servidor neumaticos.es bloqueara al bot,
`guide_prices` deja el precio en null con su error y la ficha muestra la tienda sin precio
(«Precios no disponibles»), como ya ocurre con cualquier fallo; en ese caso David puede lanzar
`guide-prices` desde su ordenador, igual que con Amazon.

### Bot

- `stores/awin.py`: `AWIN_HOSTS["neumaticos"] = ["neumaticos.es"]`, `AWIN_NAMES["neumaticos"] =
  "Neumaticos.es"`; `product_id` para este host devuelve el segmento de ruta tras `/neumaticos/`
  (solo si tiene forma `marca-ancho-perfil-llanta-modelo`); el resto de rutas no son producto.
- `fetch_price` para `neumaticos`: lector propio `sources/neumaticos_page.py` con
  `extract_min_price(page) -> Decimal | None` (todos los `itemprop="price"`, formato «98,01 €»,
  mínimo) usado antes del genérico `fetch_product_meta` (que no encuentra precio en esa página);
  si no hay precio → `None` con `last_failure = "no price in page"`. Sin imagen (la ficha de la
  guía usa la portada del modelo: `guide_items.image_url`, que rellena David o queda el pato).
- `affiliate_url`: el que ya genera `AwinStore` (`cread.php?awinmid=11552&awinaffid=…&ued=…`),
  con `AWIN_MERCHANTS={"neumaticos": 11552}` en el `.env` de producción.
- Tests: `product_id` acepta/rechaza rutas; `extract_min_price` con un fixture recortado de la
  página real; `fetch_price` devuelve el mínimo; sin precio → None + `last_failure`.

### Base de datos

- `guides` gana `widget text check (widget in ('neumaticos'))` (nulo = sin widget), expuesta en
  `web_guides` (misma columna al final; `create or replace view`).
- `guide_item_stores.note` se usa para «Precio para 205/55 R16».
- Migración `20261129000000_guides_widget.sql` + migración de contenido generada
  (`20261129010000_guides_neumaticos.sql`) con el mismo generador `scripts/build-guides-migration.mjs`
  ampliado: `store: 'neumaticos'`, `url` canónica de neumaticos.es, `note` por tienda, `widget`
  por guía, viernes 07:00 Madrid (06:00Z en diciembre y enero).

### Web

- `lib/stores.ts`: `neumaticos: { slug: 'neumaticos', name: 'Neumaticos.es', short:
  'Neumaticos.es', cta: 'Ver en Neumaticos.es' }`.
- `Guide` gana `widget: 'neumaticos' | null`.
- Componente `TyreFinder` (`components/guides/TyreFinder.tsx`): tarjeta con título «Calcula el
  precio en tu medida», texto «Buscador de Neumaticos.es: elige la medida de tu neumático y verás
  el precio actual. Enlace de afiliado.» y el iframe de Awin: 728×90 desde `md`, 468×60 por debajo
  (`iframe` con `title="Buscador de neumáticos de Neumaticos.es"`, `loading="lazy"`,
  `sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-top-navigation-by-user-activation"`,
  `referrerPolicy="strict-origin-when-cross-origin"`). En pantallas más estrechas que 468 px el
  iframe de 468 se escala con `transform: scale()` dentro de un contenedor de alto fijo. Las URLs
  son constantes en el componente:
  `AWIN_FINDER_WIDE = 'https://www.awin1.com/cawshow.php?v=11552&s=3743674&q=397643&r=3145511&iframe=1'`
  (728×90) y `AWIN_FINDER_NARROW = 'https://www.awin1.com/cawshow.php?v=11552&s=2718820&q=397643&r=3145511&iframe=1'`
  (468×60). El ID de editor `r=3145511` es público por naturaleza (va en todos los enlaces de
  afiliado `awinaffid=`); no es una credencial.
- `GuideView`: con `guide.widget === 'neumaticos'`, `TyreFinder` tras `QuickPicks` (o, en una
  guía sin productos, tras la introducción) y otra vez antes de `GuideFaq` (si no hay FAQ, al
  final). Una guía sin productos (`como-elegir-neumaticos`) no muestra elección rápida, comparativa
  ni fichas: solo intro, widget, «Cómo elegir», widget y FAQ; el generador acepta 0 ítems cuando la
  guía lleva `widget`.
- `freshnessLabel` no cambia; la nota de la tienda («Precio para 205/55 R16») ya la pinta
  `StoreRow`. En `QuickPicks`/`GuideItemCard` nada cambia.
- `/cookies`: párrafo sobre el buscador de Neumaticos.es (contenido incrustado de Awin que puede
  usar cookies de terceros al interactuar). `/afiliados`: Neumaticos.es en la lista de programas
  (Awin). Son textos de `page_copy` o estáticos según cómo estén hoy; se edita donde estén.
- Portada de cada guía: `web/public/guias/<slug>.jpeg` (David las genera con los prompts; hasta
  entonces la guía sale sin portada) y los slugs en `guide-covers.ts`.

### Contenido

| Viernes | slug | Título | Medida de referencia |
|---|---|---|---|
| 2026-12-04 | como-elegir-neumaticos | Cómo elegir neumáticos: medida, etiqueta y tipos | (sin productos: solo widget) |
| 2026-12-11 | neumaticos-turismo-205-55-r16 | Neumáticos para turismo compacto (205/55 R16) | 205/55 R16 |
| 2026-12-18 | neumaticos-suv-235-55-r18 | Neumáticos para SUV (235/55 R18) | 235/55 R18 |
| 2026-12-25 | neumaticos-invierno | Neumáticos de invierno: cuándo compensan | 205/55 R16 |
| 2027-01-01 | neumaticos-all-season | Neumáticos all-season: para quién sí | 205/55 R16 |
| 2027-01-08 | neumaticos-furgoneta-215-65-r16c | Neumáticos para furgoneta (215/65 R16C) | 215/65 R16C |

Cada guía con productos: 4-5 modelos (mínimo 3 si la medida no da para más; premium, dos
intermedios, uno económico; marcas como Michelin, Continental, Bridgestone, Goodyear, Hankook,
Falken, Nexen) elegidos por el controlador en la página de la medida de neumaticos.es desde el
navegador integrado (como con Amazon), guardando la URL exacta de cada modelo+medida; un mismo
modelo puede aparecer en varias guías (las tablas se indexan por tienda + id, sin conflicto); datos de la etiqueta UE (eficiencia, agarre en mojado, ruido) tomados
de la propia página y usados como specs. El texto sigue las reglas de siempre (sin precios ni
porcentajes, sin «hemos probado»); los pros y contras se basan en la etiqueta y en lo que indica
el fabricante. Las guías del 25 de diciembre y el 1 de enero se publican igualmente (es
contenido perenne).

### Lo que decide el constructor

- Nombres de clases Tailwind del `TyreFinder`, siguiendo `AffiliateNotice`.
- Cómo falsear el iframe en los tests (basta comprobar `src`, `title` y tamaños).
- Si el escalado móvil va con CSS puro o con un `ResizeObserver`; lo más simple que no deje hueco.

## Adenda (25 nov, tras probar el widget)

Los dos códigos de Awin no son banners de 728×90 / 468×60: `cawshow.php?...&iframe=1` devuelve una
página que incrusta el **configurador responsive de neumaticos.es** (`/affiliates/configurator`)
en un iframe de 580 px de alto y 100 % de ancho (medido: 535 px de alto a 375 px de ancho). Por
tanto `TyreFinder` lleva **un solo iframe**, `src = AWIN_FINDER =
'https://www.awin1.com/cawshow.php?v=11552&s=3743674&q=397643&r=3145511&iframe=1'`, `width="100%"`,
`height="600"`, sin escalado ni variante móvil.

Al cargarse, la página de Awin establece cookies de seguimiento de afiliado (`aw11552`, `AWSESS`)
sin que el lector interactúe. El texto de `/cookies` lo dice así: «En las guías de neumáticos
incrustamos el buscador de Neumaticos.es a través de Awin. Al cargarse, Awin establece cookies de
seguimiento de afiliado en su propio dominio, aunque no uses el buscador.» El iframe se carga con
`loading="lazy"`, así que solo ocurre si el lector llega hasta él.
