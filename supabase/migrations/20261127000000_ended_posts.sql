-- Ended deals' Telegram posts are edited by the server bot's `ended_posts` runner
-- (check-deals no longer uses Telegram). Hourly, up to 100 posts per pass.

alter table sources drop constraint sources_type_check;
alter table sources add constraint sources_type_check check (type in
    ('telegram_channel', 'aliexpress_api', 'awin_promotions', 'guide_prices', 'awin_feeds', 'event_promos', 'manual',
     'chollometro', 'channel_stats', 'ended_posts'));

insert into sources (type, identifier, country, active, every_minutes)
    values ('ended_posts', 'patobarato', 'ES', true, 60)
on conflict (type, identifier) do nothing;

notify pgrst, 'reload schema';
