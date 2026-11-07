-- Guides follow-up: affiliate links per product, coupon ranking aligned with the web, updated_at maintenance
-- and honest draft copy for the seeded guide.
alter table product_prices add column affiliate_url text;

-- Same columns as before plus affiliate_url at the end (create or replace view can only append).
-- The coupon rank mirrors the web's finalPrice: no discount when min_purchase is not met (or the price is unknown).
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
order by g.slug, i.position, s.position, s.id;

revoke all on web_guide_items from anon, authenticated;
grant select on web_guide_items to anon, authenticated;

-- guides.updated_at follows edits to the guide, its items and its stores.
create function guides_touch_updated_at() returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger guides_set_updated_at before update on guides
    for each row execute function guides_touch_updated_at();

create function guide_items_touch_guide() returns trigger language plpgsql as $$
begin
    if tg_op in ('UPDATE', 'DELETE') then
        update guides set updated_at = now() where id = old.guide_id;
    end if;
    if tg_op in ('INSERT', 'UPDATE') then
        update guides set updated_at = now() where id = new.guide_id;
    end if;
    return null;
end;
$$;

create trigger guide_items_touch_guide after insert or update or delete on guide_items
    for each row execute function guide_items_touch_guide();

create function guide_item_stores_touch_guide() returns trigger language plpgsql as $$
begin
    if tg_op in ('UPDATE', 'DELETE') then
        update guides set updated_at = now()
         where id in (select guide_id from guide_items where id = old.guide_item_id);
    end if;
    if tg_op in ('INSERT', 'UPDATE') then
        update guides set updated_at = now()
         where id in (select guide_id from guide_items where id = new.guide_item_id);
    end if;
    return null;
end;
$$;

create trigger guide_item_stores_touch_guide after insert or update or delete on guide_item_stores
    for each row execute function guide_item_stores_touch_guide();

-- The seed copy claimed hands-on testing and 90-day price tracking that no data backs.
update guides set subtitle = '[CORCHETES]', intro_md = '[CORCHETES]'
where slug = 'freidoras-de-aire-menos-100' and status = 'draft';
