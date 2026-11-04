-- Hashtags of each offer, lowercase, without '#'.
alter table offers add column hashtags text[] not null default '{}';

-- Backfill from the original text (same rule as the parser: #word, lowercase).
update offers o
set hashtags = coalesce((
    select array_agg(distinct lower(m[1]))
    from regexp_matches(o.raw_text, '(?:^|[^[:alnum:]_])#([[:alnum:]_]+)', 'g') as m
), '{}');

-- Public bucket for product photos uploaded by the bot.
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;

-- One row per product: its latest active publication.
-- Owned by postgres, so it reads the RLS-protected tables; anon gets only this view.
create view web_deals as
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
    p.country
from publications p
join offers o   on o.id = p.offer_id
join products pr on pr.id = p.product_id
where p.status = 'active'
order by p.product_id, p.published_at desc, p.id desc;

create view web_hashtags as
select tag, count(*)::int as count
from web_deals, unnest(hashtags) as tag
where published_at > now() - interval '30 days'
group by tag
order by count desc, tag;

revoke all on web_deals, web_hashtags from anon, authenticated;
grant select on web_deals, web_hashtags to anon, authenticated;
