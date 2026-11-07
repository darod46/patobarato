-- Store catalogue (Awin product feeds) and the full-text search function the web calls with the anon key.
create extension if not exists pg_trgm;

create table catalog_products (
    id bigint generated always as identity primary key,
    store text not null,                      -- pccomponentes, mediamarkt, elcorteingles…
    external_id text not null,                -- id del producto en el feed de Awin
    title text not null,
    description text,                         -- recortada a 500 caracteres
    brand text,
    gtin text,
    category text,
    price numeric(10,2) not null,
    sale_price numeric(10,2),                 -- null sin rebaja; siempre < price
    currency char(3) not null default 'EUR',
    in_stock boolean not null default true,
    image_url text,
    url text not null,                        -- página del producto (link)
    affiliate_url text not null,              -- aw_deep_link
    feed_updated_at timestamptz,
    updated_at timestamptz not null default now(),
    tsv tsvector generated always as (
        setweight(to_tsvector('spanish', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('spanish', coalesce(brand, '')), 'B') ||
        setweight(to_tsvector('spanish', coalesce(description, '')), 'C')) stored,
    unique (store, external_id)
);
create index catalog_products_tsv on catalog_products using gin (tsv);
create index catalog_products_title_trgm on catalog_products using gin (title gin_trgm_ops);
create index catalog_products_store_url on catalog_products (store, url);

create table catalog_feeds (
    store text not null,
    advertiser_id int not null,
    last_run_at timestamptz,
    products int not null default 0,
    last_error text,
    primary key (store, advertiser_id)
);

alter table sources drop constraint sources_type_check;
alter table sources add constraint sources_type_check check (type in
    ('telegram_channel', 'aliexpress_api', 'awin_promotions', 'guide_prices', 'awin_feeds'));
insert into sources (type, identifier, country, active, every_minutes)
values ('awin_feeds', 'awin-feeds', 'ES', true, 1440);

alter table catalog_products enable row level security;
alter table catalog_feeds enable row level security;
-- Supabase grants anon/authenticated on new public tables by default; the web only calls web_catalog_search.
revoke all on catalog_products, catalog_feeds from anon, authenticated;

create function web_catalog_search(q text, max int default 24)
returns table (store text, external_id text, title text, brand text, price numeric,
               sale_price numeric, currency char(3), image_url text, url text,
               affiliate_url text, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
    with query as (select websearch_to_tsquery('spanish', q) as tsq, lower(q) as raw)
    select p.store, p.external_id, p.title, p.brand, p.price, p.sale_price, p.currency,
           p.image_url, p.url, p.affiliate_url, p.updated_at
    from catalog_products p, query
    where length(btrim(q)) >= 2 and p.in_stock
      and (p.tsv @@ query.tsq or similarity(lower(p.title), query.raw) > 0.3)
    order by ts_rank(p.tsv, query.tsq) desc, similarity(lower(p.title), query.raw) desc, p.id
    limit greatest(1, least(max, 48));
$$;
revoke all on function web_catalog_search(text, int) from public;
grant execute on function web_catalog_search(text, int) to anon, authenticated;
