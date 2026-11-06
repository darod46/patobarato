-- products.asin pasa a ser "identificador del producto en su tienda" (ASIN, id numérico de AliExpress, ruta de la URL en tiendas Awin).
comment on column products.asin is 'Identificador del producto en su tienda';
alter table products add column url text;                         -- URL canónica del producto

alter table publications alter column chat_id drop not null;
alter table publications alter column message_id drop not null;
alter table publications add column channel text not null default 'telegram'
    check (channel in ('telegram', 'web'));
alter table publications add constraint publications_telegram_ids
    check (channel <> 'telegram' or (chat_id is not null and message_id is not null));

alter table offers drop constraint offers_status_check;
alter table offers add constraint offers_status_check check (status in (
    'pending', 'published', 'published_web', 'skipped_duplicate',
    'skipped_no_price', 'skipped_stale', 'publish_failed'));

alter table sources drop constraint sources_type_check;
alter table sources add constraint sources_type_check
    check (type in ('telegram_channel', 'aliexpress_api', 'awin_promotions'));
alter table sources add column config jsonb not null default '{}';
alter table sources add column every_minutes int not null default 60;
alter table sources add column hashtags text[] not null default '{}';
alter table sources add column last_run_at timestamptz;
alter table sources add column last_error text;

alter table coupons add column source_id bigint references sources (id);
alter table coupons add column external_id text;
create unique index coupons_source_external_key on coupons (source_id, external_id)
    where source_id is not null;

create view web_stores as
select s.store,
       coalesce(d.deals, 0)   as deals,
       coalesce(c.coupons, 0) as coupons
from (select store from web_deals union select store from web_coupons) s
left join (select store, count(*)::int as deals from web_deals group by store) d using (store)
left join (select store, count(*)::int as coupons from web_coupons group by store) c using (store)
order by deals desc, coupons desc, store;

revoke all on web_stores from anon, authenticated;
grant select on web_stores to anon, authenticated;

-- RLS without policies already hides the rows, but anon kept the default table grants; the web
-- reads only the views, so the base tables are closed to the public roles outright.
revoke all on sources, products, offers, publications from anon, authenticated;
