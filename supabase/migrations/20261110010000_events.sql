-- Event pages: editorial events, AliExpress campaign products, coupon link, views and seed.

create table events (
    id bigint generated always as identity primary key,
    slug text not null unique,                 -- black-friday, aliexpress-1111… (URL evergreen)
    name text not null,                        -- «Black Friday»
    stores text[] not null default '{}',       -- ids de lib/stores.ts; vacío = general
    starts_on date not null,                   -- día local (Europe/Madrid)
    ends_on date not null,                     -- inclusive; = starts_on para un solo día
    approximate boolean not null default false,-- fecha no anunciada: solo se muestra el mes
    hashtags text[] not null default '{}',     -- hashtags de chollos del evento (#blackfriday)
    aliexpress_promo text,                     -- promotion_name de featuredpromo.get, null = sin bloque
    intro_md text not null default '',
    tips_md text not null default '',
    faq jsonb not null default '[]',           -- [{"q": "...", "a_md": "..."}], misma forma que guides.faq
    status text not null default 'draft' check (status in ('draft', 'published')),
    updated_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    check (ends_on >= starts_on)
);
create trigger events_set_updated_at before update on events
    for each row execute function guides_touch_updated_at();   -- misma función que guides (sólo pone updated_at = now())

create table event_promos (
    event_id bigint not null references events (id) on delete cascade,
    external_id text not null,                 -- product_id de AliExpress
    title text not null,
    price numeric(10,2) not null,              -- target_sale_price (EUR)
    original_price numeric(10,2),              -- target_original_price; null si no > price
    currency char(3) not null default 'EUR',
    image_url text,
    affiliate_url text not null,               -- promotion_link
    position int not null,                     -- orden devuelto por la API
    synced_at timestamptz not null default now(),
    primary key (event_id, external_id)
);

alter table coupons add column event_id bigint references events (id) on delete set null;

alter table sources drop constraint sources_type_check;
alter table sources add constraint sources_type_check check (type in
    ('telegram_channel', 'aliexpress_api', 'awin_promotions', 'guide_prices', 'awin_feeds', 'event_promos'));
insert into sources (type, identifier, country, active, every_minutes)
    values ('event_promos', 'aliexpress', 'ES', true, 1440);

alter table events enable row level security;
alter table event_promos enable row level security;
revoke all on events, event_promos from anon, authenticated;

create view web_events as
select id, slug, name, stores, starts_on, ends_on, approximate, hashtags, aliexpress_promo,
       intro_md, tips_md, faq, status, updated_at
from events where status = 'published' order by starts_on, id;

create view web_event_promos as
select p.event_id, e.slug, p.external_id, p.title, p.price, p.original_price, p.currency,
       p.image_url, p.affiliate_url, p.position, p.synced_at
from event_promos p join events e on e.id = p.event_id
where e.status = 'published' order by p.event_id, p.position;

create or replace view web_coupons as
select id, store, code, title, conditions, url, starts_at, expires_at,
       discount_amount, discount_pct, min_purchase, event_id
from coupons
where active and starts_at <= now() and (expires_at is null or expires_at > now())
order by store, expires_at nulls last, id;

revoke all on web_events, web_event_promos from anon, authenticated;
grant select on web_events, web_event_promos to anon, authenticated;

-- Seed. aliexpress_promo stays null for every event: it is filled later with the `promos` CLI.
insert into events (slug, name, stores, starts_on, ends_on, approximate, hashtags, status, intro_md, tips_md, faq)
values (
  'aliexpress-1111',
  '11.11 de AliExpress',
  '{aliexpress}', '2026-11-11', '2026-11-11', false, '{1111,aliexpress}', 'published',
  $md$El 11.11, también llamado Día del Soltero, es la gran campaña anual de AliExpress y se celebra cada 11 de noviembre. En 2026 cae en miércoles.

En PatoBarato seguimos las ofertas de AliExpress todo el año. Durante el 11.11 las que detecta el bot aparecen en nuestro canal de Telegram y en esta misma página, según las va encontrando.

Las condiciones de cada oferta las fija la tienda y pueden cambiar durante el día, así que conviene revisar precio y cupones antes de pagar.

Cada chollo que publicamos muestra el historial de precios que tenemos registrado, para que puedas comparar el precio de hoy con el de otras fechas.$md$,
  $md$- Mira el historial de precios de cada chollo antes de comprar: te dice si el precio de hoy es realmente bajo.
- Revisa los cupones de la tienda y las condiciones (importe mínimo, fechas de uso) antes de pagar.
- Comprueba los gastos de envío y el plazo de entrega: dos precios iguales pueden salir distintos con el envío.
- Fíjate en el vendedor y en las valoraciones del producto, no solo en el precio.
- Activa las notificaciones de nuestro canal de Telegram para ver los chollos según aparecen.$md$,
  $json$[
    {"q": "¿Cuándo es el 11.11 de AliExpress?", "a_md": "El 11 de noviembre. En 2026 es miércoles."},
    {"q": "¿Dónde veo los chollos del 11.11 de PatoBarato?", "a_md": "En nuestro [canal de Telegram](https://t.me/patobarato) y en esta página, a medida que el bot los encuentra."},
    {"q": "¿Cómo sé si un precio es bueno?", "a_md": "Cada chollo muestra el historial de precios que PatoBarato tiene registrado. Si el producto aún no tiene historial, verás solo el precio actual."}
  ]$json$::jsonb
),
(
  'black-friday',
  'Black Friday',
  '{amazon,pccomponentes,mediamarkt}', '2026-11-27', '2026-11-29', false, '{blackfriday}', 'published',
  $md$El Black Friday es la jornada de descuentos que se celebra el viernes siguiente al Día de Acción de Gracias. En 2026 es el 27 de noviembre, y en PatoBarato seguimos las ofertas hasta el domingo 29.

Las tiendas que vigilamos para este evento son Amazon, PCComponentes y MediaMarkt. Los chollos que detecta el bot aparecen en nuestro canal de Telegram y en esta página según los encuentra.

Muchas tiendas empiezan a publicar ofertas antes del viernes y algunas las mantienen después, así que las fechas exactas dependen de cada una.

Cada chollo muestra el historial de precios registrado en PatoBarato, para que puedas comparar el precio de hoy con el de semanas anteriores.$md$,
  $md$- Haz una lista de lo que necesitas antes del viernes y comprueba el precio de esos productos con antelación.
- Compara con el historial de precios de cada chollo: un tachado no siempre refleja el precio real anterior.
- Revisa la política de devoluciones y el plazo de entrega de cada tienda.
- Compara el mismo producto en las tres tiendas antes de decidirte.
- Desconfía de la urgencia: si el precio es bueno hoy, comprueba si ya lo fue otras veces.
- Activa las notificaciones de Telegram para recibir los chollos según aparecen.$md$,
  $json$[
    {"q": "¿Cuándo es el Black Friday 2026?", "a_md": "El viernes 27 de noviembre. En PatoBarato seguimos las ofertas hasta el domingo 29, aunque cada tienda decide sus propias fechas."},
    {"q": "¿Qué tiendas sigue PatoBarato en el Black Friday?", "a_md": "Amazon, PCComponentes y MediaMarkt. Los chollos se publican en el [canal de Telegram](https://t.me/patobarato) y en esta página cuando el bot los encuentra."},
    {"q": "¿Cómo compruebo si una oferta es buena?", "a_md": "Mira el historial de precios que aparece en cada chollo y compáralo con el precio actual. Si no hay historial, verás solo el precio actual."}
  ]$json$::jsonb
);

insert into events (slug, name, stores, starts_on, ends_on, approximate, hashtags, status, intro_md, tips_md, faq)
values
  ('cyber-monday', 'Cyber Monday', '{amazon,pccomponentes}', '2026-11-30', '2026-11-30', false, '{cybermonday}', 'draft',
   '[INTRO]', '[CONSEJOS]', '[{"q": "[PREGUNTA]", "a_md": "[RESPUESTA]"}]'::jsonb),
  ('rebajas-enero', 'Rebajas de enero', '{}', '2027-01-07', '2027-01-31', false, '{rebajas}', 'draft',
   '[INTRO]', '[CONSEJOS]', '[{"q": "[PREGUNTA]", "a_md": "[RESPUESTA]"}]'::jsonb),
  ('prime-day', 'Prime Day', '{amazon}', '2027-07-01', '2027-07-02', true, '{primeday}', 'draft',
   '[INTRO]', '[CONSEJOS]', '[{"q": "[PREGUNTA]", "a_md": "[RESPUESTA]"}]'::jsonb);

notify pgrst, 'reload schema';
