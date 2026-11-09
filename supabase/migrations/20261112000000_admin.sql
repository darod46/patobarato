-- Admin app: invite-only access (admin_users), job queue for the bot (admin_jobs) and draft publications.
-- The admin app talks to Supabase with the signed-in user's session; RLS lets only admin_users in.
-- Nothing is ever granted to anon.

create table admin_users (
    user_id uuid primary key references auth.users on delete cascade,
    email text not null,
    is_owner boolean not null default false,
    created_at timestamptz default now()
);

create table admin_jobs (
    id bigint generated always as identity primary key,
    type text not null check (type in (
        'create_offer_from_url', 'publish_draft', 'sync_post', 'invite_user', 'revoke_user', 'revalidate')),
    payload jsonb not null default '{}',
    status text not null default 'pending' check (status in ('pending', 'running', 'done', 'error')),
    result jsonb,
    error text,
    created_by uuid default auth.uid(),
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create trigger admin_jobs_set_updated_at before update on admin_jobs
    for each row execute function guides_touch_updated_at();   -- only sets updated_at = now()

alter table admin_users enable row level security;
alter table admin_jobs enable row level security;
revoke all on admin_users, admin_jobs from anon, authenticated;

create function is_admin() returns boolean language sql security definer stable set search_path = public as $$
    select exists (select 1 from admin_users where user_id = auth.uid());
$$;

create function is_owner() returns boolean language sql security definer stable set search_path = public as $$
    select exists (select 1 from admin_users where user_id = auth.uid() and is_owner);
$$;

revoke all on function is_admin(), is_owner() from public;
grant execute on function is_admin(), is_owner() to authenticated;

-- Draft publications: created by the admin before anything is posted, so no Telegram ids yet.
alter table publications drop constraint publications_status_check;
alter table publications add constraint publications_status_check check (status in ('active', 'ended', 'draft'));
alter table publications drop constraint publications_telegram_ids;
alter table publications add constraint publications_telegram_ids
    check (channel <> 'telegram' or status = 'draft' or (chat_id is not null and message_id is not null));

-- Manual source: owner of the offers/products created from the admin.
alter table sources drop constraint sources_type_check;
alter table sources add constraint sources_type_check check (type in
    ('telegram_channel', 'aliexpress_api', 'awin_promotions', 'guide_prices', 'awin_feeds', 'event_promos', 'manual'));
insert into sources (type, identifier, country, active)
    values ('manual', 'admin', 'ES', false)
    on conflict (type, identifier) do nothing;

-- Grants: authenticated only, every operation backed by an is_admin() policy below.
grant select, insert, update, delete on products, offers, publications, coupons,
    guides, guide_items, guide_item_stores, events to authenticated;
grant select on product_prices, event_promos, sources, admin_users to authenticated;
grant select, insert on admin_jobs to authenticated;

do $$
declare t text;
begin
    foreach t in array array['products', 'offers', 'publications', 'coupons',
                             'guides', 'guide_items', 'guide_item_stores', 'events'] loop
        execute format('create policy %I on %I for select to authenticated using (is_admin())', t || '_admin_select', t);
        execute format('create policy %I on %I for insert to authenticated with check (is_admin())', t || '_admin_insert', t);
        execute format('create policy %I on %I for update to authenticated using (is_admin()) with check (is_admin())', t || '_admin_update', t);
        execute format('create policy %I on %I for delete to authenticated using (is_admin())', t || '_admin_delete', t);
    end loop;
    foreach t in array array['product_prices', 'event_promos', 'sources', 'admin_users', 'admin_jobs'] loop
        execute format('create policy %I on %I for select to authenticated using (is_admin())', t || '_admin_select', t);
    end loop;
end $$;

create policy admin_jobs_admin_insert on admin_jobs for insert to authenticated
    with check (is_admin() and (type not in ('invite_user', 'revoke_user') or is_owner()));

-- web_deals and web_guide_items: same columns as before; drafts never count in the "previous price" laterals.
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
      and p2.status <> 'draft'
) prev on true
where p.status = 'active'
order by p.product_id, p.published_at desc, p.id desc;

revoke all on web_deals from anon, authenticated;
grant select on web_deals to anon, authenticated;

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
order by g.slug, i.position, s.position, s.id;

revoke all on web_guide_items from anon, authenticated;
grant select on web_guide_items to anon, authenticated;

notify pgrst, 'reload schema';
