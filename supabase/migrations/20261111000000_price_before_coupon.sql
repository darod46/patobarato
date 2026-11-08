-- AliExpress prices fetched from its API (messages that only carry a coupon) are the price
-- BEFORE the coupon: the publication records it so the web can say "sin cupón".
alter table publications add column price_before_coupon boolean not null default false;

-- Offers whose store product is not the one the message talks about (a wrong link).
alter table offers drop constraint offers_status_check;
alter table offers add constraint offers_status_check check (status in (
    'pending', 'published', 'published_web', 'skipped_duplicate',
    'skipped_no_price', 'skipped_stale', 'skipped_no_affiliate', 'skipped_mismatch',
    'publish_failed'));

-- web_deals v4: v3 unchanged, with price_before_coupon appended at the end.
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
    p.price_before_coupon
from publications p
join offers o   on o.id = p.offer_id
join products pr on pr.id = p.product_id
left join lateral (
    select min(p2.published_price) as min_price
    from publications p2
    where p2.product_id = p.product_id
      and p2.country = p.country
      and p2.published_at < p.published_at
) prev on true
where p.status = 'active'
order by p.product_id, p.published_at desc, p.id desc;

revoke all on web_deals from anon, authenticated;
grant select on web_deals to anon, authenticated;
