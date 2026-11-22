# Plan: guías programadas (24 semanas)

Spec: `docs/superpowers/specs/2026-11-22-guias-programadas-design.md`.

## Global Constraints

- Web solo anon + vistas `web_*`; bot con service key; admin con `is_admin()`.
- Copy honesto: sin «hemos probado», sin precios en el texto, sin porcentajes, sin superlativos
  absolutos; español de España, tuteo, sin emojis.
- Tests antes del código (Vitest en web/admin, pytest en bot). Nada se marca hecho sin
  `npm test` / `pytest` verdes.
- Commits como David: `git -c user.name=David -c user.email=davidr@gco.com commit`.
- No tocar `guide_items`/`guide_item_stores` (esquema) ni el diseño de la página de guía.

## Calendario (semana → lunes 07:00 Madrid → slug → categoría)

| # | Lunes | slug | Título | Categoría | Tope |
|---|---|---|---|---|---|
| 1 | 2026-11-30 | freidoras-de-aire-menos-100 | Las mejores freidoras de aire por menos de 100 € | Hogar | 100 |
| 2 | 2026-12-07 | auriculares-inalambricos-menos-50 | Auriculares inalámbricos por menos de 50 € | Tecnología | 50 |
| 3 | 2026-12-14 | robots-aspiradores-menos-300 | Robots aspiradores por menos de 300 € | Hogar | 300 |
| 4 | 2026-12-21 | juegos-de-mesa-familiares | Juegos de mesa para toda la familia (de 15 a 40 €) | Juguetes | 40 |
| 5 | 2026-12-28 | relojes-y-pulseras-de-actividad-menos-100 | Relojes y pulseras de actividad por menos de 100 € | Deporte | 100 |
| 6 | 2027-01-04 | gimnasio-en-casa-menos-150 | Gimnasio en casa: lo esencial por menos de 150 € | Deporte | 150 |
| 7 | 2027-01-11 | calefactores-bajo-consumo | Calefactores y radiadores de bajo consumo | Hogar | 150 |
| 8 | 2027-01-18 | ssd-nvme-y-discos-externos | SSD NVMe y discos externos de 1 y 2 TB | Tecnología | 150 |
| 9 | 2027-01-25 | cafeteras-capsulas-y-espresso-menos-150 | Cafeteras de cápsulas y espresso por menos de 150 € | Hogar | 150 |
| 10 | 2027-02-01 | secadores-y-planchas-de-pelo-menos-80 | Secadores y planchas de pelo por menos de 80 € | Belleza | 80 |
| 11 | 2027-02-08 | afeitadoras-y-recortadoras-de-barba | Afeitadoras y recortadoras de barba | Belleza | 120 |
| 12 | 2027-02-15 | monitores-27-teletrabajo | Monitores de 27" para teletrabajo y estudio | Tecnología | 250 |
| 13 | 2027-02-22 | aspiradores-escoba-sin-cable-menos-200 | Aspiradores escoba sin cable por menos de 200 € | Hogar | 200 |
| 14 | 2027-03-01 | taladros-atornilladores-bateria | Taladros atornilladores a batería | Bricolaje | 150 |
| 15 | 2027-03-08 | cortacespedes-y-robots-cortacesped | Cortacéspedes y robots cortacésped | Bricolaje | 600 |
| 16 | 2027-03-15 | tablets-menos-200 | Tablets por menos de 200 € | Tecnología | 200 |
| 17 | 2027-03-22 | moviles-menos-300 | Móviles por menos de 300 € | Tecnología | 300 |
| 18 | 2027-03-29 | zapatillas-running-empezar-a-correr | Zapatillas de running para empezar a correr | Deporte | 120 |
| 19 | 2027-04-05 | patinetes-y-bicicletas-electricas-ciudad | Patinetes y bicicletas eléctricas para ciudad | Deporte | 800 |
| 20 | 2027-04-12 | barbacoas-y-planchas-electricas | Barbacoas y planchas eléctricas | Hogar | 150 |
| 21 | 2027-04-19 | ventiladores-y-aire-acondicionado-portatil | Ventiladores y aire acondicionado portátil | Hogar | 350 |
| 22 | 2027-04-26 | depiladoras-ipl-y-cuidado-facial | Depiladoras IPL y cuidado facial | Belleza | 250 |
| 23 | 2027-05-03 | camaras-de-seguridad-y-timbres-inteligentes | Cámaras de seguridad y timbres inteligentes | Tecnología | 120 |
| 24 | 2027-05-10 | piscinas-desmontables-y-depuradoras | Piscinas desmontables y depuradoras | Hogar | 400 |

## Tareas

### Task 1 — Bot: productos de guías programadas (≤ 7 días)

Files: `bot/src/patobarato/storage/repository.py`, `bot/src/patobarato/storage/supabase_repo.py`,
`bot/tests/...` (los que cubren `list_guide_products` y el repo en memoria).

- `list_guide_products()` incluye guías `published` con `published_at` nulo o
  `<= now + 7 días`; excluye las programadas más lejos. El repo en memoria guarda
  `published_at` por guía (adaptar fixtures: `_guide_products` pasa a (product, status, published_at)
  o equivalente). La implementación Supabase selecciona `guides!inner(status, published_at)` y filtra
  en Python con `utcnow()`.
- Tests: guía publicada sin fecha → incluida; fecha pasada → incluida; fecha en 3 días → incluida;
  fecha en 10 días → excluida; borrador → excluida.
- `pytest -q` verde. Commit.

### Task 2 — DB: vistas con `published_at <= now()`

Files: `supabase/migrations/20261124000000_guides_schedule.sql`, `web/README.md` (sección de guías:
una línea sobre programación).

- `create or replace view` de `web_guides`, `web_guide_items`, `web_guides_by_product` con las
  mismas columnas en el mismo orden (copiar de `20261108000000` + `20261108010000`) añadiendo
  `and g.published_at is not null and g.published_at <= now()`; `revoke`/`grant` como las
  originales. Sin cambios de columnas.
- Commit.

### Task 3 — Admin: «Programada» y fecha editable

Files: `admin/src/lib/guides.ts` (+ test), `admin/src/app/guias/page.tsx`,
`admin/src/app/guias/GuidePanel.tsx` (+ test), `admin/src/app/guias/GuideDataFields.tsx`.

- `GuideRow` añade `publishedAt: string | null` (select `published_at`).
- Helper puro `guideStatusLabel(status, publishedAt, now): string` → «Borrador» | «Publicada» |
  «Programada · 30 nov» (fecha en `es-ES`, zona Europe/Madrid). Tests.
- Lista: usa el helper. Panel/Datos: campo «Fecha de publicación» `datetime-local` (hora Madrid)
  visible cuando `status === 'published'`; vacío = ahora al guardar (comportamiento actual).
  Conversión ISO ↔ datetime-local en helpers puros con tests (`toLocalInput`, `fromLocalInput`).
- `npm test`, `npm run typecheck`, `npm run lint` verdes en `admin/`. Commit.

### Task 4 — Datos de productos (lo hace el controlador, no un subagente)

- Para cada guía, búsqueda(s) en amazon.es desde el navegador integrado; extraer orgánicos con
  ASIN, título, precio, valoración, nº de opiniones; descartar patrocinados, < 4,3★, < 150 opiniones,
  precio > tope. Elegir 4-5 que cubran usos distintos. Abrir cada ficha (`/dp/ASIN`) y guardar
  título, viñetas «Acerca de este artículo» y tabla técnica.
- Salida: `.superpowers/sdd/<plan>/products/<slug>.json`:
  `{ slug, title, cap, items: [{ asin, name, price, rating, reviews, bullets[], specs{} }] }`.

### Task 5 — Redacción (subagentes, 4 lotes de 6 guías, en paralelo: ficheros independientes)

Files: `.superpowers/sdd/<plan>/content/<slug>.json` por guía.

- Entrada: el JSON de productos de la guía y las reglas de copy. Salida JSON:
  `{ slug, title, subtitle, category, reading_minutes, intro_md, how_to_choose_md, faq[3],
     items: [{ position, asin, name, award, summary_md, pros[3], cons[2], specs[{label,value}] }] }`.
- Reglas: ver spec «Contenido». `name` = nombre comercial corto (marca + modelo + dato clave),
  no el título de Amazon. Specs solo de las viñetas/tabla de Amazon. Nada de precios ni «hemos
  probado». `how_to_choose_md` con 3-5 `##`. FAQ útiles, no publicitarias. Enlaces internos
  permitidos: `/chollos/<categoria>`, `/eventos`, `/afiliados`.

### Task 6 — Revisión editorial (subagente)

- Lee los 24 JSON y marca: afirmaciones no respaldadas por los datos de producto, precios/porcentajes
  en el texto, superlativos, specs no presentes en las viñetas, títulos > 60 caracteres, duplicados
  de premio dentro de una guía. Informe en `.superpowers/sdd/<plan>/review-content.md`; corregir.

### Task 7 — Migración de contenido

Files: `scripts/build-guides-migration.mjs` (repo raíz, sin dependencias), 
`supabase/migrations/20261124010000_guides_calendar.sql` (generado, se commitea).

- El script lee `content/*.json` + calendario (tabla de arriba, embebida en el script) y emite SQL:
  por guía, `insert into guides … on conflict (slug) do update set …` (así la freidora se
  reescribe), `delete from guide_items where guide_id = …`, inserts de items y stores
  (`store 'amazon'`, `url https://www.amazon.es/dp/<ASIN>`), `published_at` = lunes 07:00 Madrid
  (06:00Z hasta el 22 mar; 05:00Z desde el 29 mar, ya en CEST). Dollar-quoting con etiquetas únicas. Al final
  `insert into supabase_migrations.schema_migrations` NO (lo hace el controlador al aplicar).
- Test ligero: ejecutar el script y comprobar con `node --check`, contar 24 guías y que ningún
  título pase de 60 caracteres.

### Task 8 — Aplicar y sincronizar (controlador)

- Aplicar ambas migraciones en producción (Management API) y registrarlas; comprobar con anon:
  `web_guides` devuelve solo la del 30 nov cuando llegue (hoy: 0 filas futuras visibles),
  `guides` 401.
- Merge a main, bundle a la carpeta de David, informe.
