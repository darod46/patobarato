create table sources (
    id bigint generated always as identity primary key,
    type text not null default 'telegram_channel' check (type in ('telegram_channel')),
    identifier text not null,
    name text,
    invite_link text null,
    country char(2) not null default 'ES',
    active boolean not null default true,
    created_at timestamptz not null default now()
);

create table products (
    id bigint generated always as identity primary key,
    store text not null default 'amazon',
    country char(2) not null default 'ES',
    asin text not null,
    title text not null,
    image_url text,
    image_file_id text,
    category text,
    brand text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (store, country, asin)
);

create table offers (
    id bigint generated always as identity primary key,
    product_id bigint not null references products (id),
    source_id bigint not null references sources (id),
    source_message_id bigint not null,
    country char(2) not null default 'ES',
    price numeric(10,2),
    previous_price numeric(10,2),
    currency char(3) not null default 'EUR',
    coupon text,
    raw_text text not null,
    status text not null default 'pending' check (status in (
        'pending', 'published', 'skipped_duplicate',
        'skipped_no_price', 'skipped_stale', 'publish_failed'
    )),
    detected_at timestamptz not null default now(),
    unique (source_id, source_message_id, product_id)
);

create table publications (
    id bigint generated always as identity primary key,
    offer_id bigint not null references offers (id),
    product_id bigint not null references products (id),
    country char(2) not null default 'ES',
    chat_id bigint not null,
    message_id bigint not null,
    published_price numeric(10,2) not null,
    affiliate_url text not null,
    status text not null default 'active' check (status in ('active', 'ended')),
    published_at timestamptz not null default now(),
    ended_at timestamptz
);

create index publications_product_country_published_idx
    on publications (product_id, country, published_at desc);

alter table sources enable row level security;
alter table products enable row level security;
alter table offers enable row level security;
alter table publications enable row level security;
