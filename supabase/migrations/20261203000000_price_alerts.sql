-- Price-drop alerts of the @patobaratobot Telegram bot: each user follows up to 10 Amazon or AliExpress
-- products; the bot's `price_alerts` runner re-reads their price every 12 hours and messages the user when
-- it drops below the price of the last notice (or the price when the product was added).
-- Only the bot (service role) reads and writes these tables.

create table alert_users (
    telegram_id bigint primary key,
    chat_id bigint not null,
    username text,
    first_name text,
    created_at timestamptz not null default now(),
    -- Set when Telegram says the user blocked the bot: no more notices.
    blocked_at timestamptz
);

create table price_alerts (
    id bigserial primary key,
    telegram_id bigint not null references alert_users (telegram_id) on delete cascade,
    product_id bigint not null references products (id) on delete cascade,
    initial_price numeric(10,2) not null,
    -- The price a drop is measured against: the last notified price, or the initial one.
    baseline_price numeric(10,2) not null,
    last_notified_at timestamptz,
    created_at timestamptz not null default now(),
    unique (telegram_id, product_id)
);
create index price_alerts_product on price_alerts (product_id);

alter table alert_users enable row level security;
alter table price_alerts enable row level security;
revoke all on alert_users, price_alerts from anon, authenticated;

-- The product's affiliate link, also for products that are only tracked (guides already use this table).
alter table product_prices add column if not exists affiliate_url text;

-- Deal page of a product that is only tracked by alerts (no publication): same columns as
-- web_deal_pages, with the tracked price. The web only falls back to it when web_deal_pages has no row,
-- and never lists these products.
create view web_tracked_pages as
select
    null::bigint             as publication_id,
    t.first_tracked          as published_at,
    pp.price,
    null::numeric            as previous_price,
    null::text               as coupon,
    array[]::text[]          as hashtags,
    pp.affiliate_url,
    pr.title,
    pr.image_url,
    pr.asin,
    pr.country,
    pr.store,
    pr.id                    as product_id,
    null::int                as discount_pct,
    null::numeric            as previous_min_price,
    false                    as is_lowest,
    false                    as price_before_coupon,
    'active'::text           as status,
    null::timestamptz        as ended_at,
    pr.slug,
    pr.description,
    pr.category,
    pr.short_title
from products pr
join (select product_id, min(created_at) as first_tracked from price_alerts group by product_id) t
    on t.product_id = pr.id
join product_prices pp on pp.product_id = pr.id
where pp.price is not null and pp.affiliate_url is not null;

revoke all on web_tracked_pages from anon, authenticated;
grant select on web_tracked_pages to anon, authenticated;

alter table sources drop constraint sources_type_check;
alter table sources add constraint sources_type_check check (type in
    ('telegram_channel', 'aliexpress_api', 'awin_promotions', 'guide_prices', 'awin_feeds', 'event_promos', 'manual',
     'chollometro', 'channel_stats', 'ended_posts', 'guide_announce', 'product_enrich', 'price_alerts'));

insert into sources (type, identifier, country, active, every_minutes)
    values ('price_alerts', 'patobaratobot', 'ES', true, 60)
on conflict (type, identifier) do nothing;

notify pgrst, 'reload schema';
