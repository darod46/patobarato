# PatoBarato web

Web pública de [PatoBarato](https://www.patobarato.com): Next.js 16 (App Router), React, TypeScript y Tailwind v4. Los datos vienen de Supabase con la clave pública (anon) y solo se leen las vistas `web_deals` y `web_hashtags`.

## Desarrollo local

Requisitos: Node >= 22.12.

```bash
cd web
npm install
```

Crea `web/.env.local` (ver `.env.example`):

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Los nombres antiguos `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` también valen: `next.config.ts` los usa como fallback.

```bash
npm run dev
```

Notas:

- En red corporativa con proxy TLS, arranca con `NODE_OPTIONS=--use-system-ca` en tu entorno. No se commitean apaños para esto.
- `next dev` puede generar `web/AGENTS.md` si detecta un agente de IA; está en `.gitignore`.

## Scripts

| Script | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm start` | Sirve el build (`next start`) |
| `npm test` | Tests (vitest) |
| `npm run lint` | oxlint |
| `npm run typecheck` | `tsc --noEmit --incremental false` |

## Rutas

- `/`: portada con listados y chips de hashtags rastreables.
- `/oferta/{tienda}/{slug}-{id}`: ficha de producto. Redirige con 308 a la URL canónica si el slug no coincide; 404 si la oferta no existe.
- `/chollos/{hashtag}`: listado por hashtag. `noindex` si tiene menos de 3 ofertas.
- `/buscar`: ruta interna a la que reescribe `/?q=` y `/?tag=`; siempre `noindex`. Cualquier URL con `?q=` lleva además `X-Robots-Tag: noindex`.
- `/go/{ASIN}`: página de salto a Amazon (`public/go.html`, añade el tag de afiliado por script).
- `/sitemap.xml` y `/robots.txt`: generados por `src/app/sitemap.ts` y `src/app/robots.ts`. robots.txt bloquea `/go/` y `/buscar`.
- `/og.png`: imagen Open Graph (`public/og.png`).

## Caché (ISR)

- Listados (`/`, `/chollos/{hashtag}`): 60 s.
- Producto (`/oferta/...`): 600 s.
- Sitemap: 3600 s.

## SEO

- Metadatos (title, description, Open Graph) por página y URLs canónicas.
- JSON-LD: `Product` (ficha), `BreadcrumbList`, `WebSite` con `SearchAction` y `Organization` (sitio).
- Search Console: añade la propiedad `www.patobarato.com` y envía `/sitemap.xml`.

## Seguridad

La web solo usa la clave pública (anon) de Supabase y solo lee las vistas `web_deals` y `web_hashtags`. Nunca pongas la clave `service_role` en la web ni en Vercel.

## Despliegue en Vercel

1. Importa el repositorio `darod46/patobarato`.
2. Root Directory: `web` (el framework Next.js lo fija `vercel.json`).
3. Variables de entorno `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` en Production y Preview. Las `VITE_SUPABASE_*` antiguas siguen valiendo por el fallback de `next.config.ts`.
4. Las variables se incrustan en el build: tras cambiarlas hay que redesplegar.
5. Dominio principal: `www.patobarato.com` (`patobarato.com` redirige a él).
