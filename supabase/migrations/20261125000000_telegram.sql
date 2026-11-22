-- Telegram conversion: channel stats, recent channel posts and CTA click tracking.

-- 1. Single-row table with the latest channel member count (written by the stats job).
create table channel_stats (
    id smallint primary key default 1 check (id = 1),
    members integer not null,
    checked_at timestamptz not null
);
alter table channel_stats enable row level security;
revoke all on channel_stats from anon, authenticated;

-- 2. Public stats view: ALWAYS exactly one row (members/checked_at null until the first check).
create view web_channel_stats as
select
    s.members,
    s.checked_at,
    (select count(*)::integer
       from publications pu
      where pu.channel = 'telegram' and pu.message_id is not null and pu.status <> 'draft'
        and pu.published_at >= (date_trunc('day', now() at time zone 'Europe/Madrid') at time zone 'Europe/Madrid')
    ) as posted_today,
    (select max(pu.published_at)
       from publications pu
      where pu.channel = 'telegram' and pu.message_id is not null and pu.status <> 'draft'
    ) as last_posted_at
from (select 1) one
left join channel_stats s on s.id = 1;

-- 3. Latest 5 distinct products posted to the channel.
create view web_channel_recent as
select * from (
    select distinct on (pu.product_id)
        pu.product_id, pr.title, pu.published_price as price, pu.message_id, pu.published_at
    from publications pu
    join products pr on pr.id = pu.product_id
    where pu.channel = 'telegram' and pu.message_id is not null and pu.status <> 'draft'
    order by pu.product_id, pu.published_at desc
) r
order by r.published_at desc
limit 5;

-- 4. Grants for the public views.
revoke all on web_channel_stats, web_channel_recent from anon, authenticated;
grant select on web_channel_stats, web_channel_recent to anon, authenticated;

-- 5. CTA clicks: anonymous insert only, admin read.
create table cta_clicks (
    id bigint generated always as identity primary key,
    placement text not null check (placement in ('header', 'hero', 'block', 'recent', 'deal', 'footer', 'contact')),
    path text not null check (char_length(path) <= 200 and path like '/%'),
    created_at timestamptz not null default now()
);
create index cta_clicks_created_idx on cta_clicks (created_at);
alter table cta_clicks enable row level security;
revoke all on cta_clicks from anon, authenticated;
grant insert (placement, path) on cta_clicks to anon;
grant select on cta_clicks to authenticated;
create policy cta_clicks_anon_insert on cta_clicks for insert to anon with check (true);
create policy cta_clicks_admin_select on cta_clicks for select to authenticated using (is_admin());

-- 6. Daily aggregation, evaluated with the caller's rights (so RLS applies).
create view cta_clicks_daily with (security_invoker = true) as
select (created_at at time zone 'Europe/Madrid')::date as day, placement, count(*) as clicks
from cta_clicks
where created_at >= now() - interval '60 days'
group by 1, 2;
revoke all on cta_clicks_daily from anon, authenticated;
grant select on cta_clicks_daily to authenticated;

-- 7. New source type for the channel stats job.
alter table sources drop constraint sources_type_check;
alter table sources add constraint sources_type_check check (type in
    ('telegram_channel', 'aliexpress_api', 'awin_promotions', 'guide_prices', 'awin_feeds', 'event_promos', 'manual',
     'chollometro', 'channel_stats'));

insert into sources (type, identifier, country, active, every_minutes)
    values ('channel_stats', 'patobarato', 'ES', true, 60)
on conflict (type, identifier) do nothing;

-- 8.
notify pgrst, 'reload schema';
