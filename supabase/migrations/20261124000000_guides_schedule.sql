-- Scheduled guides: the public views only show guides whose published_at has arrived (status = 'published' and published_at <= now()).
-- Same columns as before; the only change is the extra published_at condition in each view.

create or replace view web_guides as
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
where g.status = 'published'
  and g.published_at is not null and g.published_at <= now();

create or replace view web_guide_items as
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
       cp.min_purchase,
       pp.affiliate_url
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
      and p2.status <> 'draft'
) prev on true
left join lateral (
    select c.code, c.title, c.expires_at, c.discount_amount, c.discount_pct, c.min_purchase
    from coupons c
    where c.active
      and c.store = s.store
      and c.starts_at <= now()
      and (c.expires_at is null or c.expires_at > now())
    order by coalesce(case
                when c.min_purchase is not null and (pp.price is null or pp.price < c.min_purchase)
                    then 0
                when c.discount_amount > 0
                    then c.discount_amount
                when c.discount_pct > 0
                    then pp.price * c.discount_pct / 100
                else 0
              end, 0) desc,
             c.expires_at nulls last,
             c.id
    limit 1
) cp on true
where g.status = 'published'
  and g.published_at is not null and g.published_at <= now()
order by g.slug, i.position, s.position, s.id;

create or replace view web_guides_by_product as
select distinct p.id as product_id, g.slug as guide_slug, g.title as guide_title
from guides g
join guide_items i on i.guide_id = g.id
join guide_item_stores s on s.guide_item_id = i.id
join products p on p.store = s.store and p.country = 'ES' and p.asin = s.external_id
where g.status = 'published'
  and g.published_at is not null and g.published_at <= now();

revoke all on web_guides, web_guide_items, web_guides_by_product from anon, authenticated;
grant select on web_guides, web_guide_items, web_guides_by_product to anon, authenticated;

notify pgrst, 'reload schema';
