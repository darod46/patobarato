# Guías de neumáticos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seis guías de neumáticos (viernes desde el 4 dic 2026) con modelos en medida de referencia, precio real de neumaticos.es leído por el bot, enlaces Awin y el buscador de neumaticos.es incrustado.

**Architecture:** Tienda `neumaticos` en el bot (Awin + lector propio del precio mínimo de la página modelo+medida); columna `guides.widget` expuesta en `web_guides`; componente `TyreFinder` (iframes de Awin) en `GuideView`; generador de migraciones de guías generalizado (carpeta de contenido, día de publicación, tiendas por ítem, nota, widget, 0 ítems).

**Tech Stack:** Python 3.12 + httpx + pytest (bot); Next.js 16 + Vitest (web); PostgreSQL/Supabase; Node (generador).

**Spec:** `docs/superpowers/specs/2026-11-25-guias-neumaticos-design.md`

## Global Constraints

- Web solo anon + vistas `web_*`; bot con service key; iconos Lucide; copy honesto en español de España, tuteo, sin emojis en la web; nada de precios ni porcentajes en el texto de las guías.
- Credenciales Awin solo en el `.env` del bot: `AWIN_PUBLISHER_ID`, `AWIN_MERCHANTS={"neumaticos": 11552}`.
- Iframes exactos: `https://www.awin1.com/cawshow.php?v=11552&s=3743674&q=397643&r=3145511&iframe=1` (728×90) y `https://www.awin1.com/cawshow.php?v=11552&s=2718820&q=397643&r=3145511&iframe=1` (468×60). Nunca el `<script>` de Awin.
- URLs de neumaticos.es se guardan tal cual (ruta completa con códigos); el bot no las construye.
- TDD; `pytest -q` (bot: `cd bot && PYTHONPATH=src .venv-linux/bin/python -m pytest -q`), `npm test`/`typecheck`/`lint` (web); commits como David (`git -c user.name=David -c user.email=$(git log -1 --format=%ae)`).
- No tocar las guías de Amazon ni su contenido.

## Review Focus

1. Una URL de neumaticos.es sin la cola de códigos no debe aceptarse como producto (Task 1: `product_id` devuelve None cuando la ruta no tiene el patrón `marca-ancho-perfil-llanta-modelo` o le falta el segmento de códigos).
2. Página con precios en varias monedas o «desde» (Task 1: solo se toman `itemprop="price"` con «€»; sin ellos → None y `last_failure`).
3. Guía con `widget` y 0 ítems: `GuideView` no pinta elección rápida ni comparativa, pero sí dos widgets (Task 3, test).
4. Iframe en móvil estrecho (360 px): el 468×60 escalado no desborda ni deja hueco (Task 3, test de clases/estilos del contenedor).
5. Generador: guía de Amazon sin cambios de salida tras generalizar (Task 4: el SQL de las 24 guías actuales se regenera y es idéntico al fichero `20261124010000_guides_calendar.sql` salvo cabecera).

---

### Task 1: Bot — tienda `neumaticos` y lector de precio

**Files:**
- Create: `bot/src/patobarato/sources/neumaticos_page.py`, `bot/tests/test_neumaticos_page.py`, `bot/tests/fixtures/neumaticos_model_size.html` (recorte real: cabecera + 3-4 variantes con `itemprop="price"`)
- Modify: `bot/src/patobarato/stores/awin.py`, `bot/tests/test_stores_awin.py` (o el fichero donde se prueba `AwinStore`)

**Interfaces:**
- Produces: `extract_min_price(page: str) -> Decimal | None` en `neumaticos_page.py` (busca `itemprop="price"`; acepta texto «98,01 €» o atributo `content="98.01"`; devuelve el mínimo; None sin precios).
- `AWIN_HOSTS["neumaticos"] = ["neumaticos.es"]`, `AWIN_NAMES["neumaticos"] = "Neumaticos.es"`.
- `AwinStore.product_id(url)`: para el host neumaticos.es devuelve el segmento tras `/neumaticos/` solo si cumple `^[a-z0-9]+-\d{3}-\d{2}-\d{2}c?-[a-z0-9_]+$` y existe un segmento posterior de códigos (`^\d+(\+\d+)*$`); si no, None. El resto de hosts no cambia.
- `AwinStore.fetch_price`: si `self.id == "neumaticos"`, descarga la página (`http.get(url, headers=BROWSER_HEADERS, follow_redirects=True)` como `fetch_product_meta`) y usa `extract_min_price`; devuelve `PriceQuote(price, None, "EUR", None)`; sin precio → `None` y `self._last_failure = "no price in page"` (añadir `last_failure` a `AwinStore` como en `AmazonStore`).

- [ ] **Step 1:** Tests: `extract_min_price` con el fixture → `Decimal("98.01")`; sin `itemprop` → None; `product_id("https://www.neumaticos.es/neumaticos/michelin-205-55-16-crossclimate_2/108+200+201+202+205")` → `"michelin-205-55-16-crossclimate_2"`; sin códigos → None; `/neumaticos/michelin/108` → None; furgoneta `215-65-16c` aceptado; `fetch_price` con transporte falso devuelve el mínimo y `last_failure is None`; página sin precio → None y `last_failure == "no price in page"`.
- [ ] **Step 2:** Fallar → implementar → `pytest -q` verde. Commit `feat(bot): tienda neumaticos.es con lector de precio por medida`.

### Task 2: DB — `guides.widget` en `web_guides`

**Files:**
- Create: `supabase/migrations/20261129000000_guides_widget.sql`
- Modify: `web/scripts/check-views.mjs`

- [ ] **Step 1:** `alter table guides add column widget text check (widget in ('neumaticos'));` y `create or replace view web_guides as` con la select vigente de `20261124000000_guides_schedule.sql` (mismas columnas y orden) más `g.widget` al final; `revoke`/`grant` como ahí; `notify pgrst, 'reload schema'`.
- [ ] **Step 2:** `check-views.mjs`: `web_guides` trae `widget` cuando hay filas. `node --check`. Commit `feat(db): guides.widget`.

### Task 3: Web — tienda, `widget`, `TyreFinder`, textos legales

**Files:**
- Create: `web/src/components/guides/TyreFinder.tsx` (+ test)
- Modify: `web/src/lib/stores.ts` (+ test), `web/src/lib/types.ts`, `web/src/lib/guides-data.ts` (+ test), `web/src/components/GuideView.tsx` (+ test), `web/src/app/cookies/page.tsx`, `web/src/app/afiliados/page.tsx`, `web/README.md`

**Interfaces:**
- `STORES.neumaticos = { slug: 'neumaticos', name: 'Neumaticos.es', short: 'Neumaticos.es', cta: 'Ver en Neumaticos.es' }`.
- `Guide.widget: 'neumaticos' | null` (`toGuide`: `row.widget === 'neumaticos' ? 'neumaticos' : null`).
- `TyreFinder()` sin props: `<section aria-labelledby="buscador-neumaticos">` con `h2` «Calcula el precio en tu medida», párrafo «Buscador de Neumaticos.es: elige la medida de tu neumático y verás el precio actual. Enlace de afiliado.», iframe ancho (`hidden md:block`, 728×90) e iframe estrecho (`md:hidden`, 468×60) con `title="Buscador de neumáticos de Neumaticos.es"`, `loading="lazy"`, `sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-top-navigation-by-user-activation"`, `referrerPolicy="strict-origin-when-cross-origin"`; el estrecho dentro de un contenedor con `aspect-[468/60] w-full max-w-[468px]` y el iframe escalado con `transform: scale(min(1, 100% / 468px))`-equivalente en CSS (`[&>iframe]:origin-top-left` + anchura 468 px fija y `scale` calculado con una variable CSS: `style={{ '--w': '468px' }}`; lo más simple que pase el test de no desbordar: aceptar también `width: 100%; height: auto` sobre un `iframe` con `aspect-ratio: 468/60` si funciona con Awin). Constantes exportadas `AWIN_FINDER_WIDE`, `AWIN_FINDER_NARROW`.
- `GuideView`: `const finder = guide.widget === 'neumaticos'`; `{hasItems && <QuickPicks …/>}` seguido de `{finder && <TyreFinder />}` (así en guías sin ítems queda tras la cabecera y antes de la intro: aceptable; si el constructor prefiere tras la intro, que lo haga consistente en ambos casos y lo documente); segundo `<TyreFinder />` justo antes de `{hasFaq && <GuideFaq …/>}`; `GuideToc` recibe `hasFinder` para añadir la entrada «Calcula tu precio» (ancla `buscador-neumaticos`) si el TOC lo admite sin rediseño; si no, se omite.
- `/cookies`: en «Cookies de terceros», párrafo: «En las guías de neumáticos incrustamos el buscador de Neumaticos.es a través de Awin. Ese contenido lo sirve Awin y puede usar cookies propias cuando interactúas con él; si no lo usas, no se activa ninguna.» `/afiliados`: frase: «En las guías de neumáticos los enlaces a Neumaticos.es son de afiliado a través de Awin, igual que el buscador que incrustamos.»
- `README.md` web: sección guías: `widget` y `TyreFinder`.

- [ ] **Step 1:** Tests: `storeInfo('neumaticos').cta`; `toGuide` mapea `widget`; `TyreFinder` renderiza dos iframes con esos `src` exactos, `title`, `sandbox`, `loading`; `GuideView` con `widget: 'neumaticos'` y 0 ítems muestra exactamente 2 secciones «Calcula el precio en tu medida» y ninguna «Nuestras recomendaciones»; con ítems, el primer finder va después de la elección rápida; sin `widget`, ninguno.
- [ ] **Step 2:** Fallar → implementar → `npm test`, `typecheck`, `lint` verdes. Commit `feat(web): buscador de Neumaticos.es en las guías de neumáticos`.

### Task 4: Generador de migraciones generalizado

**Files:**
- Modify: `scripts/build-guides-migration.mjs`
- Create: `content/guides-neumaticos/_calendar.json` (6 entradas `{ "week", "day": "2026-12-04", "slug", "title", "category": "Motor", "size": "205/55 R16" | null }`), `scripts/build-guides-migration.test.mjs` (node:test)

**Interfaces:**
- CLI: `node scripts/build-guides-migration.mjs [contentDir] [header]`; sin argumentos, comportamiento actual (`content/guides`, lunes).
- Calendario: acepta `monday` o `day` (`publishedAt(entry.day ?? entry.monday)`).
- Ítem: `asin` (Amazon, como hoy) **o** `stores: [{ store, external_id, url, note? }]` (uno o más; `position` por orden). Guía: `widget?: 'neumaticos'` → columna `widget` en el insert/update (null si falta). Ítems: 4-5 salvo que la guía tenga `widget`, entonces 0-5. `note` se escribe en `guide_item_stores.note`.

- [ ] **Step 1:** Test: la salida con `content/guides` es byte a byte igual a `supabase/migrations/20261124010000_guides_calendar.sql` tras quitar la primera línea de cabecera de ambos (si la cabecera cambia, se compara el resto); un ítem con `stores` genera `insert into guide_item_stores (…, note)` con `'neumaticos'`, la URL exacta y la nota; guía con `widget` y 0 ítems no lanza y escribe `widget = 'neumaticos'`.
- [ ] **Step 2:** Implementar; `node --test scripts/`. Commit `feat(scripts): generador de guías con tiendas, nota, widget y día`.

### Task 5: Datos de productos (controlador, navegador integrado)

- Para cada medida de referencia, desde la página de la medida en neumaticos.es (`/neumaticos/<marca>-<ancho>-<perfil>-<llanta>-<modelo>/<códigos>` llegando desde las páginas de marca), elegir 4-5 modelos y guardar `.superpowers/sdd/<plan>/products/<slug>.json`: `{ slug, size, items: [{ brand, model, external_id, url, min_price, label: { fuel, wet, noise_db, noise_class }, season, notes[] }] }` con los datos de etiqueta UE tal como aparecen en la página.
- Guía `como-elegir-neumaticos`: sin productos.

### Task 6: Redacción (subagentes, 2 lotes de 3) y revisión editorial

- Salida `content/guides-neumaticos/<slug>.json` con el mismo esquema que las guías de Amazon, donde cada ítem lleva `stores: [{ store: 'neumaticos', external_id, url, note: 'Precio para <medida>' }]` y `specs` solo con datos de la etiqueta UE y del fabricante; `widget: 'neumaticos'` en todas. Reglas de copy de la spec «Contenido». La guía «Cómo elegir» explica medida (ancho/perfil/llanta/carga/velocidad), etiqueta UE, verano/invierno/all-season, cuándo cambiar; `items: []`.
- Revisión editorial (subagente) como en las guías de Amazon: afirmaciones sin respaldo, precios/porcentajes, superlativos, títulos > 60.

### Task 7: Migración de contenido, prompts de portadas, aplicar y sincronizar (controlador)

- `node scripts/build-guides-migration.mjs content/guides-neumaticos "Guías de neumáticos (viernes)" > supabase/migrations/20261129010000_guides_neumaticos.sql`; `node --check`; contar 6 guías.
- `docs/guias-neumaticos-portadas-prompts.md`: 6 prompts (mismo bloque de estilo que `docs/guias-portadas-prompts.md`; escenas: el pato con un neumático, en un taller, en un SUV, en la nieve, bajo lluvia y sol, con una furgoneta); slugs en `guide-covers.ts` cuando David deje las imágenes.
- Aplicar `20261129000000` y `20261129010000` en producción, registrarlas, comprobar con anon que `web_guides` devuelve `widget` y que las 6 guías no son visibles aún (`published_at` futuro).
- Merge a main, bundle a la carpeta de David, informe: `.env` de producción (`AWIN_MERCHANTS`, `AWIN_PUBLISHER_ID`), portadas con Gemini, primera comprobación de precios (`guide-prices` desde casa si el servidor no lee neumaticos.es).
