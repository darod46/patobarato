-- Short product description and category written by DeepSeek (bot runner `product_enrich`), editable
-- in the admin. A manual edit sets description_manual and the bot never touches that product again;
-- clearing the description in the admin resets it so the bot writes a new one.

alter table products
    add column description text,
    add column description_manual boolean not null default false,
    add column enriched_at timestamptz,
    add column enrich_attempts int not null default 0;

-- The column existed but was never filled; it now only takes the web's categories.
update products set category = null where category is not null;
alter table products add constraint products_category_check check (category in
    ('tecnologia', 'hogar', 'belleza', 'juguetes', 'alimentacion', 'deporte', 'moda', 'bricolaje', 'otros'));

-- Products still waiting for a description (the runner's queue).
create index products_enrich_queue on products (id desc)
    where description is null and not description_manual and enrich_attempts < 3;

create or replace view web_deals as
select distinct on (p.product_id)
    p.id              as publication_id,
    p.published_at,
    p.published_price as price,
    o.previous_price,
    o.coupon,
    o.hashtags,
    p.affiliate_url,
    pr.title,
    pr.image_url,
    pr.asin,
    p.country,
    pr.store,
    pr.id             as product_id,
    case
        when o.previous_price > p.published_price and p.published_price > 0
        then round((o.previous_price - p.published_price) / o.previous_price * 100)::int
    end               as discount_pct,
    prev.min_price    as previous_min_price,
    (prev.min_price is not null and p.published_price <= prev.min_price) as is_lowest,
    p.price_before_coupon,
    pr.slug,
    pr.description,
    pr.category
from publications p
join offers o   on o.id = p.offer_id
join products pr on pr.id = p.product_id
left join lateral (
    select min(p2.published_price) as min_price
    from publications p2
    where p2.product_id = p.product_id
      and p2.country = p.country
      and p2.published_at < p.published_at
      and p2.status <> 'draft'
) prev on true
where p.status = 'active'
order by p.product_id, p.published_at desc, p.id desc;

create or replace view web_deal_pages as
select distinct on (p.product_id)
    p.id              as publication_id,
    p.published_at,
    p.published_price as price,
    o.previous_price,
    o.coupon,
    o.hashtags,
    p.affiliate_url,
    pr.title,
    pr.image_url,
    pr.asin,
    p.country,
    pr.store,
    pr.id             as product_id,
    case
        when o.previous_price > p.published_price and p.published_price > 0
        then round((o.previous_price - p.published_price) / o.previous_price * 100)::int
    end               as discount_pct,
    prev.min_price    as previous_min_price,
    (prev.min_price is not null and p.published_price <= prev.min_price) as is_lowest,
    p.price_before_coupon,
    p.status,
    p.ended_at,
    pr.slug,
    pr.description,
    pr.category
from publications p
join offers o   on o.id = p.offer_id
join products pr on pr.id = p.product_id
left join lateral (
    select min(p2.published_price) as min_price
    from publications p2
    where p2.product_id = p.product_id
      and p2.country = p.country
      and p2.published_at < p.published_at
      and p2.status <> 'draft'
) prev on true
where p.status <> 'draft'
order by p.product_id, (p.status = 'active') desc, p.published_at desc, p.id desc;

revoke all on web_deals, web_deal_pages from anon, authenticated;
grant select on web_deals, web_deal_pages to anon, authenticated;

alter table sources drop constraint sources_type_check;
alter table sources add constraint sources_type_check check (type in
    ('telegram_channel', 'aliexpress_api', 'awin_promotions', 'guide_prices', 'awin_feeds', 'event_promos', 'manual',
     'chollometro', 'channel_stats', 'ended_posts', 'guide_announce', 'product_enrich'));

insert into sources (type, identifier, country, active, every_minutes)
    values ('product_enrich', 'deepseek', 'ES', true, 10)
on conflict (type, identifier) do nothing;

notify pgrst, 'reload schema';
