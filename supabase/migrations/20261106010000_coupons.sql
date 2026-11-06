-- Store-wide coupon codes, entered by hand from the Supabase panel (no bot involvement).
create table coupons (
    id bigint generated always as identity primary key,
    store text not null,
    code text not null,
    title text not null,
    conditions text,
    url text,
    starts_at timestamptz not null default now(),
    expires_at timestamptz,
    active boolean not null default true,
    created_at timestamptz not null default now()
);
-- No policies: nobody but the owner (panel/SQL) reads or writes the table itself.
alter table coupons enable row level security;

-- Currently valid coupons, the only thing the web reads.
create view web_coupons as
select id, store, code, title, conditions, url, starts_at, expires_at
from coupons
where active and starts_at <= now() and (expires_at is null or expires_at > now())
order by store, expires_at nulls last, id;

revoke all on web_coupons from anon, authenticated;
grant select on web_coupons to anon, authenticated;
