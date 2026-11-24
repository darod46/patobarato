-- Deal pages keep working after a deal ends: web_deal_pages is web_deals without the
-- "active only" filter (drafts stay hidden), plus status and ended_at.
-- When a product has an active publication it wins; otherwise the latest ended one is shown.
alter table publications add column checked_at timestamptz;
alter table publications add column post_synced_at timestamptz;

create view web_deal_pages as
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
    p.ended_at
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

revoke all on web_deal_pages from anon, authenticated;
grant select on web_deal_pages to anon, authenticated;

notify pgrst, 'reload schema';
