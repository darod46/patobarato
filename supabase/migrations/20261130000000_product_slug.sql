-- Stable deal URLs. The URL of a deal page is /oferta/<store>/<slug>-<id>, and the slug used to come from
-- the product's current title, which the bot overwrites every time another channel posts the product: each
-- repost changed the URL (the old one redirects), so Google kept finding the same page under new addresses
-- ("Duplicada: Google ha elegido una versión canónica diferente").
-- Now each product keeps the slug it got when it was created; later title changes leave the URL alone.

alter table products add column slug text;

-- Same result as the web's slugify(): accents folded, lowercase, words of [a-z0-9], first 8 joined by "-",
-- "oferta" when nothing is left. Checked against all 4,192 Amazon/AliExpress titles: identical output.
create or replace function product_slug(title text) returns text
language sql immutable as $$
  select coalesce(
    nullif(
      array_to_string(
        (regexp_split_to_array(
          trim(both '-' from regexp_replace(
            translate(lower(title),
              'áàäâãåāăąéèëêēĕėęěíìïîīĭįóòöôõōŏőúùüûūŭůűųñńňçćĉčýÿďťľĺŕřśŝšşźżžğ',
              'aaaaaaaaaeeeeeeeeeiiiiiiioooooooouuuuuuuuunnnccccyydtllrrsssszzzg'),
            '[^a-z0-9]+', '-', 'g')),
          '-'))[1:8],
        '-'),
      ''),
    'oferta')
$$;

create or replace function products_set_slug() returns trigger
language plpgsql as $$
begin
  if new.slug is null then
    new.slug := product_slug(new.title);
  end if;
  return new;
end
$$;

create trigger products_slug before insert on products
for each row execute function products_set_slug();

-- Existing products keep the URL they are served under today (slug of the current title).
update products set slug = product_slug(title) where slug is null;
alter table products alter column slug set not null;

-- Both deal views expose the slug, appended as the last column.
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
    pr.slug
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
    pr.slug
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

notify pgrst, 'reload schema';
