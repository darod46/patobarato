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
    pr.id             as product_id
from publications p
join offers o   on o.id = p.offer_id
join products pr on pr.id = p.product_id
where p.status = 'active'
order by p.product_id, p.published_at desc, p.id desc;

revoke all on web_deals from anon, authenticated;
grant select on web_deals to anon, authenticated;
