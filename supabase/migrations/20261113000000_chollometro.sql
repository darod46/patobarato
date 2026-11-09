-- Chollometro source: followed threads, source type, seed row; Telegram channels are switched off.

create table chollometro_threads (
    source_id bigint not null references sources (id),
    thread_id bigint not null,
    url text not null,
    state text not null check (state in ('watching', 'qualified', 'published', 'ended', 'skipped')),
    temperature double precision not null,
    discount int,
    first_seen_at timestamptz not null,
    published_at timestamptz not null,          -- publication time on Chollometro
    qualified_at timestamptz,
    store_url text,                             -- result of /visit/, resolved once
    publication_id bigint references publications (id),
    last_checked_at timestamptz,
    skip_reason text,
    snapshot jsonb not null default '{}',       -- latest deal data
    primary key (source_id, thread_id)
);
create index chollometro_threads_source_state_idx on chollometro_threads (source_id, state);

alter table chollometro_threads enable row level security;
revoke all on chollometro_threads from anon, authenticated;

alter table sources drop constraint sources_type_check;
alter table sources add constraint sources_type_check check (type in
    ('telegram_channel', 'aliexpress_api', 'awin_promotions', 'guide_prices', 'awin_feeds', 'event_promos', 'manual',
     'chollometro'));

insert into sources (type, identifier, country, active, every_minutes, config, hashtags)
    values ('chollometro', 'chollometro-nuevos', 'ES', true, 5,
            '{"min_temperature": 50, "min_discount": 40, "max_per_hour": 10, "warm_hours": 24, "max_pages_per_run": 5}',
            '{}');

update sources set active = false where type = 'telegram_channel';

notify pgrst, 'reload schema';
