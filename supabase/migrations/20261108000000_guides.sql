-- Buying guides: content tables, last-known store prices, coupon values and the public views.
create table guides (
    id bigint generated always as identity primary key,
    slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
    title text not null,
    subtitle text,
    category text not null,                 -- «Hogar», «Tecnología»…
    intro_md text not null default '',
    how_to_choose_md text not null default '',
    faq jsonb not null default '[]',        -- [{"q": "...", "a_md": "..."}]
    author text not null default 'el Pato',
    reading_minutes int not null default 5,
    status text not null default 'draft' check (status in ('draft', 'published')),
    published_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table guide_items (
    id bigint generated always as identity primary key,
    guide_id bigint not null references guides (id) on delete cascade,
    position int not null,
    name text not null,                     -- «Ninja AF300 Dual Zone 7,6 L»
    award text,                             -- «Mejor en general»
    summary_md text not null default '',
    pros text[] not null default '{}',
    cons text[] not null default '{}',
    specs jsonb not null default '[]',      -- [{"label": "Capacidad", "value": "7,6 L"}]
    image_url text,
    unique (guide_id, position)
);

create table guide_item_stores (
    id bigint generated always as identity primary key,
    guide_item_id bigint not null references guide_items (id) on delete cascade,
    store text not null,
    external_id text not null,              -- ASIN, id numérico de AliExpress, slug de la tienda Awin
    url text not null,                      -- URL canónica del producto en la tienda
    note text,                              -- «desde España», «tienda oficial»
    position int not null default 0,
    unique (guide_item_id, store)
);

create table product_prices (
    product_id bigint primary key references products (id) on delete cascade,
    price numeric(10,2),
    previous_price numeric(10,2),
    currency char(3) not null default 'EUR',
    checked_at timestamptz not null,
    error text                              -- «Tipo: mensaje» del último fallo; null si el último intento fue bien
);

alter table coupons add column discount_amount numeric(10,2);
alter table coupons add column discount_pct numeric(5,2);
alter table coupons add column min_purchase numeric(10,2);

alter table sources drop constraint sources_type_check;
alter table sources add constraint sources_type_check
    check (type in ('telegram_channel', 'aliexpress_api', 'awin_promotions', 'guide_prices'));
insert into sources (type, identifier, country, active, every_minutes) values ('guide_prices', 'guides', 'ES', true, 360);

alter table guides enable row level security;
alter table guide_items enable row level security;
alter table guide_item_stores enable row level security;
alter table product_prices enable row level security;

-- Supabase grants anon/authenticated on new public tables by default; the web reads only the views.
revoke all on guides, guide_items, guide_item_stores, product_prices from anon, authenticated;

create view web_guides as
select g.slug, g.title, g.subtitle, g.category, g.author, g.reading_minutes,
       g.published_at, g.updated_at, g.intro_md, g.how_to_choose_md, g.faq,
       (select count(*)::int from guide_items i where i.guide_id = g.id) as items,
       (select max(pp.checked_at)
          from guide_items i
          join guide_item_stores s on s.guide_item_id = i.id
          join products p on p.store = s.store and p.country = 'ES' and p.asin = s.external_id
          join product_prices pp on pp.product_id = p.id
         where i.guide_id = g.id and pp.error is null) as prices_checked_at
from guides g
where g.status = 'published';

create view web_guide_items as
select g.slug                             as guide_slug,
       i.id                               as item_id,
       i.position,
       i.name,
       i.award,
       i.summary_md,
       i.pros,
       i.cons,
       i.specs,
       coalesce(i.image_url, p.image_url) as image_url,
       s.store,
       s.external_id,
       s.url,
       s.note,
       s.position                         as store_position,
       p.id                               as product_id,
       pp.price,
       pp.previous_price,
       pp.currency,
       pp.checked_at,
       (pp.error is not null)             as price_error,
       prev.min_price                     as previous_min_price,
       cp.code                            as coupon_code,
       cp.title                           as coupon_title,
       cp.expires_at                      as coupon_expires_at,
       cp.discount_amount,
       cp.discount_pct,
       cp.min_purchase
from guides g
join guide_items i on i.guide_id = g.id
join guide_item_stores s on s.guide_item_id = i.id
left join products p on p.store = s.store and p.country = 'ES' and p.asin = s.external_id
left join product_prices pp on pp.product_id = p.id
left join lateral (
    select min(p2.published_price) as min_price
    from publications p2
    where p2.product_id = p.id
      and p2.country = 'ES'
) prev on true
left join lateral (
    select c.code, c.title, c.expires_at, c.discount_amount, c.discount_pct, c.min_purchase
    from coupons c
    where c.active
      and c.store = s.store
      and c.starts_at <= now()
      and (c.expires_at is null or c.expires_at > now())
    -- A coupon with min_purchase may still be attached to a priceless row; the web decides using min_purchase.
    order by coalesce(case
                when c.discount_amount is not null and (c.min_purchase is null or pp.price >= c.min_purchase)
                    then c.discount_amount
                when c.discount_pct is not null then pp.price * c.discount_pct / 100
                else 0
              end, 0) desc,
             c.expires_at nulls last,
             c.id
    limit 1
) cp on true
where g.status = 'published'
order by g.slug, i.position, s.position, s.id;

create view web_guides_by_product as
select distinct p.id as product_id, g.slug as guide_slug, g.title as guide_title
from guides g
join guide_items i on i.guide_id = g.id
join guide_item_stores s on s.guide_item_id = i.id
join products p on p.store = s.store and p.country = 'ES' and p.asin = s.external_id
where g.status = 'published';

create or replace view web_coupons as
select id, store, code, title, conditions, url, starts_at, expires_at,
       discount_amount, discount_pct, min_purchase
from coupons
where active and starts_at <= now() and (expires_at is null or expires_at > now())
order by store, expires_at nulls last, id;

revoke all on web_guides, web_guide_items, web_guides_by_product from anon, authenticated;
grant select on web_guides, web_guide_items, web_guides_by_product to anon, authenticated;
revoke all on web_coupons from anon, authenticated;
grant select on web_coupons to anon, authenticated;
