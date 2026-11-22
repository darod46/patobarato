# PatoBarato — SEO técnico e indexación

Fecha: 2026-11-22. Estado: pendiente de aprobación del usuario.
Antecedentes: análisis SEO del 22/11/2026 (documento «PatoBarato — Análisis SEO y plan de posicionamiento», tareas 1–6, 9 y 12), `2026-11-07-patobarato-eventos-design.md`, `2026-11-09-patobarato-admin-design.md`. Fase A de tres (A: SEO técnico; B: conversión a Telegram; C: fichas de oferta enriquecidas).

## 1. Intención

En sus primeros 16 días en Google el sitio ha recibido 599 impresiones y 9 clics; 212 de las 228 URLs vistas son fichas de oferta y las 9 páginas con intención comercial (portada, `/chollos`, categorías, tiendas, eventos) apenas suman 60 impresiones. Varias de ellas están «excluidas por noindex» en Search Console porque la web emite `noindex` cuando cuenta pocos elementos, y ese recuento llega a 0 cada vez que falla la lectura de Supabase en Vercel. El usuario quiere que las páginas que acumulan autoridad (categorías, tiendas, cupones, guías, eventos, sobre nosotros) estén siempre indexadas, con título, `h1` y texto propio que respondan a las consultas del nicho («chollos amazon», «ofertas tecnología hoy», «Black Friday 2026»), y resolver de una vez el fallo de lectura en servidor.

## 2. Objetivos, no objetivos y anti-objetivos

**Objetivos**
- Ninguna página de listado emite `noindex` por un fallo de lectura; solo cuando la base de datos responde y la página está realmente vacía.
- `/tiendas`, `/cupones`, `/guias` y `/eventos` indexables siempre, con texto editorial fijo aunque la lista esté vacía.
- Texto editorial por categoría y por tienda (título SEO, `h1`, introducción, FAQ) editable desde Supabase sin desplegar, con texto por defecto honesto cuando no hay fila.
- Títulos de listado con la consulta objetivo y el número vivo de chollos.
- `hreflang` es-ES + x-default y señales de país.
- Índice de sitemaps con tres sitemaps (chollos, páginas evergreen, eventos) y `lastmod` real.
- Página `/sobre-nosotros` con «cómo elegimos los chollos», enlazada desde el pie.
- Eventos próximos enlazados desde la portada y desde cada categoría con el anchor con año.
- Imágenes de tarjetas con `width`/`height` y `loading="lazy"` donde falten.
- Un endpoint de salud que diga, desde el navegador, si el servidor lee Supabase.

**No objetivos**
- Texto o FAQ por ficha de oferta (fase C), bloques de Telegram (fase B), guías nuevas, redes, enlaces externos.
- Cambiar URLs existentes o añadir páginas por marca (se valorará tras medir).
- Analítica de usuario.

**Anti-objetivos**
- Indexar páginas vacías sin texto: la regla es «siempre indexable con texto editorial», nunca «indexable y vacía».
- Copiar texto entre categorías cambiando el nombre; cada fila de `page_copy` se escribe a mano.
- Afirmar cifras que no se calculan («miles de ofertas»): los números del título salen de la base de datos y, si no hay número, el título no lo incluye.
- Romper la regla de la anon key: la web sigue leyendo solo vistas `web_*`.

## 3. Restricciones

- Web: Next.js 16 App Router, React 19, Tailwind v4 con los tokens de `globals.css`, Lucide únicamente, Vitest + Testing Library, `react-markdown` vía `components/Markdown.tsx`. Texto en español; código, comentarios y commits en inglés. Objetivos táctiles ≥ 44 px.
- Supabase: migración en `supabase/migrations/`, aplicada por la Management API; tabla nueva con RLS y `revoke all` a `anon`/`authenticated`; vista `web_page_copy` con `grant select`; política `is_admin()` para el portal (misma forma que `events` en `20261112000000_admin.sql`, ya aplicada en producción). La migración se numera después de `20261113000000_chollometro.sql` (presente en el repo, no aplicada y revertida en el bot).
- Repo: el clon de trabajo debe incorporar antes los commits del repo de David posteriores a la fase de eventos (admin, Chollometro y su revert); la fase arranca desde su `main` actual.
- Portal de administración: fuera de alcance aquí; `page_copy` queda editable por SQL y, cuando el portal añada la pantalla, por sus políticas RLS.
- Vercel: sin variables nuevas. El endpoint de salud no expone claves ni URLs.
- Compatibilidad: las URLs actuales no cambian; `/chollos/{tag}`, `/tiendas/{tienda}` y el resto conservan canonical.

## 4. Enfoques considerados

Para el texto editorial se consideraron tres sitios: (1) tabla en Supabase editable desde el portal, con texto por defecto cuando no hay fila; (2) ficheros Markdown en el repo, versionados pero con deploy por cambio e invisibles para el portal; (3) texto generado solo con datos, gratis pero idéntico entre páginas (contenido fino). El usuario eligió (1), coherente con `events` y `guides` y con el portal de administración.

## 5. Modelo de datos

Migración `supabase/migrations/20261123000000_page_copy.sql`.

```sql
create table page_copy (
    id bigint generated always as identity primary key,
    kind text not null check (kind in ('category', 'store', 'static')),
    slug text not null,                     -- category: hashtag; store: id de tienda; static: 'chollos' | 'tiendas' | 'cupones' | 'guias' | 'eventos' | 'sobre-nosotros'
    title text not null,                    -- <title>, sin el sufijo « · PatoBarato» (lo añade la web)
    h1 text not null,
    intro_md text not null default '',      -- 150–300 palabras; admite {deals}, {stores} como marcadores
    faq jsonb not null default '[]',        -- [{"q": "...", "a_md": "..."}]
    status text not null default 'draft' check (status in ('draft', 'published')),
    updated_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    unique (kind, slug)
);
create trigger page_copy_set_updated_at before update on page_copy
    for each row execute function guides_touch_updated_at();
alter table page_copy enable row level security;
revoke all on page_copy from anon, authenticated;
grant select, insert, update, delete on page_copy to authenticated;
create policy page_copy_admin_select on page_copy for select to authenticated using (is_admin());
create policy page_copy_admin_insert on page_copy for insert to authenticated with check (is_admin());
create policy page_copy_admin_update on page_copy for update to authenticated using (is_admin()) with check (is_admin());
create policy page_copy_admin_delete on page_copy for delete to authenticated using (is_admin());

create view web_page_copy as
select kind, slug, title, h1, intro_md, faq, updated_at
from page_copy where status = 'published';
revoke all on web_page_copy from anon, authenticated;
grant select on web_page_copy to anon, authenticated;
```

Semilla (misma migración, `status = 'published'`, texto escrito a mano y honesto por el ejecutor de la fase, 150–300 palabras cada `intro_md`, 3 FAQ): categorías `hogar`, `belleza`, `tecnologia`, `juguetes`, `alimentacion`, `deporte`, `moda`, `bricolaje` (los ocho hashtags con chollos hoy); tiendas `amazon`, `aliexpress` (las dos con chollos; PcComponentes, MediaMarkt, El Corte Inglés y Decathlon reciben texto cuando Awin acepte y tengan chollos); estáticas `chollos`, `tiendas`, `cupones`, `guias`, `eventos`, `sobre-nosotros`. Los hechos de `sobre-nosotros` (quién está detrás, cómo se gana dinero, cómo se eligen los chollos) los proporciona el usuario antes de escribir la semilla; el resto del texto se redacta a partir de lo que el sitio hace de verdad (bot, precio anterior, mínimo histórico, cupones verificados, enlaces de afiliado declarados). Los marcadores `{deals}` y `{stores}` se sustituyen en la web por el número de chollos activos y la lista de tiendas (frase «en Amazon y AliExpress»); si el número no está disponible, la frase que lo contiene se omite entera (el marcador va siempre en su propia frase).

Título por defecto cuando no hay fila publicada (nunca `noindex` por falta de fila):
- categoría: `Chollos de {tag}{: N ofertas hoy}` (segmento solo con número);
- tienda: `Chollos de {Tienda} hoy{: N ofertas}`;
- `/chollos`: `Chollos de hoy{: N ofertas en {tiendas}}`;
- `/tiendas`: `Tiendas con chollos`; `/cupones`: `Cupones de descuento vigentes`; `/guias`: `Guías de compra`; `/eventos`: `Eventos de compras: Black Friday, 11.11, Cyber Monday`; `/sobre-nosotros`: `Quiénes somos y cómo elegimos los chollos`.

## 6. Reglas de indexación

| Página | Antes | Ahora |
|---|---|---|
| `/chollos/{tag}` | `noindex` si `count < 3` (0 si falla la lectura) | 404 si el hashtag no tiene ningún chollo activo (lectura correcta); `noindex` solo si tiene 1–2 chollos **y** no hay fila en `page_copy`; si la lectura falla, se lanza (Next conserva la última versión ISR), nunca `noindex` |
| `/tiendas/{tienda}` | `noindex` si `deals < 3` | Indexable si tiene fila publicada en `page_copy` **o** ≥ 3 chollos; `noindex` solo para una tienda sin texto y con menos de 3 chollos (las cuatro tiendas de Awin hasta que tengan texto); sin chollos muestra el texto editorial y «ahora mismo no hay chollos activos» |
| `/tiendas`, `/cupones`, `/guias`, `/eventos` | `noindex` si la lista está vacía | Indexables siempre; lista vacía → texto editorial + mensaje honesto |
| `/guias/{slug}` | `noindex` si los precios no están frescos | Sin cambio (regla propia de guías) |
| `/buscar?q=` | `noindex` | Sin cambio |
| Fallo de lectura en cualquier listado | contador 0 → `noindex` | La página lanza; `optional()` queda solo para bloques secundarios |

## 7. Páginas y componentes

- `lib/page-copy.ts`: `fetchPageCopy(client, kind, slug) -> PageCopy | null`, `fetchPageCopies(client, kind)`; `renderCopy(introMd, { deals, stores })` que sustituye marcadores y elimina las frases con marcador sin valor; `defaultTitle(kind, slug, { deals, stores })` con las plantillas de §5.
- `components/PageIntro.tsx`: `h1` + `Markdown` de la introducción + FAQ (`GuideFaq`) con `FAQPage` JSON-LD; usado por `/chollos`, `/chollos/[tag]`, `/tiendas`, `/tiendas/[store]`, `/cupones`, `/guias`, `/eventos`.
- `lib/seo.ts`: `listingMetadata({ kind, slug, copy, deals, stores })` sustituye a `dealsMetadata`, `hashtagMetadata`, `storeMetadata`, `storesMetadata`, `couponsMetadata`, `guidesMetadata`, `eventsMetadata` (las funciones quedan como envoltorios finos o se eliminan; sus tests se adaptan). Título = `copy.title` o el por defecto + ` · PatoBarato`; descripción = primera frase de `intro_md` renderizada (≤ 160 caracteres).
- `app/sobre-nosotros/page.tsx`: estática, texto de `page_copy` (`static`, `sobre-nosotros`), con secciones «Quién hay detrás», «Cómo elegimos los chollos» (criterios: precio comprobado en la tienda, precio anterior real, mínimo histórico registrado, cupón verificado, enlaces de afiliado declarados), «Cómo ganamos dinero». JSON-LD `AboutPage` + `Organization`. Enlaces en el pie: «Quiénes somos» → `/sobre-nosotros` (sustituye `/#sobre`), «Cómo elegimos los chollos» → `/sobre-nosotros#como-elegimos`.
- Eventos enlazados: la portada ya tiene barra y bloque; cada categoría y tienda añade bajo el `h1` una línea «Próximo evento: Black Friday 2026 (27–29 nov)» enlazada a `/eventos/{slug}` cuando `nextEvent` cae dentro de `ANNOUNCE_WINDOW_DAYS`.
- `app/layout.tsx`: `alternates.languages = { 'es-ES': '/', 'x-default': '/' }` en `metadataBase`; cada página hereda `alternates.canonical` y añade `languages` con su propia ruta (helper `withHreflang(path)` en `lib/seo.ts`). `<meta name="geo.region" content="ES">`.
- Sitemaps: `/sitemap.xml` conserva su URL (la que Google ya conoce) pero pasa a ser un **índice** `<sitemapindex>` emitido por `app/sitemap.xml/route.ts`, que apunta a `app/sitemaps/[name]/route.ts` con `name` ∈ `chollos` (fichas, `lastmod` = `publishedAt`, `changefreq daily`), `paginas` (portada, listados, categorías con ≥ 1 chollo, tiendas indexables, guías, estáticas; `lastmod` = `updated_at` de `page_copy` o de la guía) y `eventos` (los de la fase de eventos). `lib/sitemap.ts` pasa a tener `buildSitemapIndex(siteUrl, names, lastmods)` y `buildSitemapFile(name, …)`; `app/sitemap.ts` se elimina; `robots.ts` sigue apuntando a `/sitemap.xml`. Fallback de build: cada fichero devuelve su mínimo si la lectura falla en build, y lanza en runtime (como hoy).
- Números vivos: `deals` por categoría = `web_hashtags.count`; por tienda y total = `web_stores.deals` (suma para `/chollos`); `stores` = tiendas de `web_stores` con ≥ 1 chollo. No hacen falta vistas nuevas.
- Línea «Próximo evento»: la renderiza `PageIntro` (prop opcional `nextEvent`), bajo el `h1` y antes de la introducción.
- Imágenes: `DealCard`, `CatalogCard`, `EventCard` (si lleva imagen) y `Hero` con `width`, `height` y `loading="lazy"` (salvo la imagen del hero, que es LCP y lleva `fetchpriority="high"`).
- `app/api/salud/route.ts`: `GET` → `{ ok, checks: { supabase: 'ok' | 'error', deals: n | null, events: n | null }, at }` con `Cache-Control: no-store`; nunca incluye URLs, claves ni mensajes de error completos (solo `error.name`). Sirve para verificar en producción, desde el navegador, que el servidor lee Supabase; `robots.txt` lo bloquea (`disallow: /api/`).

## 8. Errores

- Lectura de Supabase fallida en un listado: la página lanza; Next sirve la última versión ISR; en build, `generateStaticParams` devuelve `[]`.
- `page_copy` sin fila o lectura fallida: título y `h1` por defecto, sin introducción ni FAQ; la página sigue indexable salvo en el caso de §6 (tienda o categoría con < 3 chollos y sin texto).
- Lectura del contador fallida con lectura principal correcta: se usa el número de elementos cargados; nunca `noindex` por ese fallo. Los bloques secundarios (chips, tiendas del pie, eventos) siguen en `optional()`.
- Primer deploy con Supabase caído y sin versión ISR previa: la página muestra el error de Next (500). Es aceptable porque `/api/salud` permite detectarlo antes de pedir indexación; la alternativa (cachear vacíos) es lo que se está corrigiendo.
- Marcador sin valor: frase omitida; nunca se renderiza `{deals}` literal (test).
- `/api/salud` con fallo: `200` con `ok: false` (no 500), para que el navegador muestre el detalle.

## 9. Tests

Vitest: `renderCopy` (sustitución, omisión de frase, marcador literal nunca visible), `defaultTitle` por tipo con y sin número, `listingMetadata` (sin `noindex` cuando hay copy; `noindex` solo en el caso 1–2 chollos sin copy; `hreflang` presente), páginas de listado con copy y sin copy, lanzamiento en fallo de lectura (no 404, no `noindex`), `/sobre-nosotros` con JSON-LD, sitemaps (tres ficheros, `lastmod`, índice), `/api/salud` con cliente falso que falla y que responde, `Footer` con los nuevos enlaces, imágenes con atributos. Build de Next verde.

Comprobación manual tras el deploy: `/api/salud` desde el navegador; `curl -s https://www.patobarato.com/tiendas | grep robots` sin `noindex`; Search Console → «Validar corrección» en las URL excluidas por `noindex`; prueba de resultados enriquecidos en una categoría (FAQPage) y en `/sobre-nosotros`.

## 10. Despliegue y entrega

1. Migración aplicada vía Management API con la semilla publicada; `notify pgrst, 'reload schema'`.
2. Merge a `main`, `git push` de David, deploy en Vercel.
3. David abre `/api/salud` en producción; si `supabase: 'error'`, el nombre del error dice si faltan variables (`Error`) o es de red (`TypeError`), y se corrige en Vercel antes de pedir la validación en Search Console.
4. Search Console: enviar el índice de sitemaps, validar las exclusiones por `noindex`, pedir indexación de `/tiendas/amazon`, `/chollos/tecnologia`, `/sobre-nosotros` y `/eventos/black-friday`.
