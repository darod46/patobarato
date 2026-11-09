# PatoBarato

Chollos de Amazon España para [@patobarato](https://t.me/patobarato) y patobarato.com.

- `bot/`: bot de Telegram en Python que lee canales de chollos y publica las ofertas. Ver [bot/README.md](bot/README.md). Se despliega como imagen Docker en GHCR.
- `web/`: la web (patobarato.com), Next.js (App Router). Ver [web/README.md](web/README.md). Se despliega en Vercel con Root Directory `web`.
- `admin/`: portal de administración, Next.js (App Router). Gestiona ofertas, cupones, guías, eventos y usuarios. Ver [admin/README.md](admin/README.md). Se despliega en Vercel con Root Directory `admin`.
- `supabase/`: migraciones del esquema de la base de datos compartida.
- `docs/`: especificaciones y planes de diseño.
- `prototipo/` y `recursos/`: prototipo visual y recursos gráficos.

## Flujo de trabajos del admin

El admin no habla con Telegram ni con Supabase Auth directamente. Encola un trabajo en `admin_jobs` (RLS: solo miembros de `admin_users`) y el bot lo ejecuta y deja el resultado en la misma fila:

```
admin -> admin_jobs -> bot -> Telegram / Supabase Auth / revalidación de la web
```

Tipos de trabajo: `create_offer_from_url`, `publish_draft`, `sync_post` (Telegram), `invite_user`, `revoke_user` (Supabase Auth) y `revalidate` (web). El admin consulta el estado de cada trabajo hasta `done` o `error`. Detalles en [admin/README.md](admin/README.md).
