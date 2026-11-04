# PatoBarato web

Frontend de patobarato.com: un listado de chollos de Amazon España con búsqueda, filtros por hashtag y estados de carga. Está hecho con Vite, React, TypeScript y Tailwind CSS v4.

La web solo lee las vistas públicas `web_deals` y `web_hashtags` de Supabase. No accede a las tablas internas ni usa claves de servicio.

## Requisitos

- Node.js 22.12 o superior.
- npm.

## Desarrollo local

```bash
cd web
npm install
cp .env.example .env.local
```

Edita `.env.local` y rellena las dos variables:

- `VITE_SUPABASE_URL`: la URL del proyecto, con el formato `https://<ref>.supabase.co`.
- `VITE_SUPABASE_ANON_KEY`: la clave pública (anon/public) del proyecto. Está en Supabase → Project Settings → API Keys.

**Nunca uses la clave `service_role` en la web.** Es una clave con acceso total a la base de datos y no debe aparecer en el frontend ni en `.env.local`. La clave anon es pública por diseño; el acceso real lo limitan los permisos (grants) concedidos sobre las vistas.

Después arranca el servidor de desarrollo:

```bash
npm run dev
```

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo de Vite. |
| `npm test` | Tests con Vitest (una sola pasada). |
| `npm run lint` | Linter con oxlint. |
| `npm run typecheck` | Comprobación de tipos de TypeScript, sin generar archivos. |
| `npm run build` | Comprobación de tipos y build de producción en `dist/`. |
| `npm run preview` | Sirve localmente el resultado de `npm run build`. |

Para comprobar todo antes de subir cambios:

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

Si `npm install` falla con errores de certificado TLS en una red corporativa, usa `NODE_OPTIONS=--use-system-ca`.

## Despliegue en Vercel

El despliegue es automático desde el repositorio `darod46/patobarato`.

1. En Vercel, pulsa **Add New… → Project** e importa el repositorio `darod46/patobarato`.
2. En la configuración del proyecto:
   - **Root Directory:** `web`.
   - **Framework Preset:** Vite.
3. En **Environment Variables**, añade `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` para los entornos **Production** y **Preview**. Usa los mismos valores que en `.env.local`, y recuerda que la clave debe ser la anon/public, nunca la `service_role`.
4. Despliega el proyecto.
5. Dominio propio: en Vercel, ve a **Settings → Domains**, añade `patobarato.com` y configura en tu proveedor de DNS los registros que Vercel muestre.

Las variables `VITE_*` se incrustan en el build. Si las cambias, hay que volver a desplegar para que surtan efecto.
