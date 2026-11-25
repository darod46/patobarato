-- Each guide is announced (and pinned) in the Telegram channel when it is published, by the
-- server bot's `guide_announce` runner. Every 30 min, one guide per pass, oldest first.

alter table guides
    add column announced_at timestamptz,
    add column announce_message_id bigint;

-- Guides already published are not announced, except the most recent one, so the first
-- pass does not flood the channel.
update guides set announced_at = now()
where status = 'published'
  and published_at <= now()
  and id <> (
      select id from guides
      where status = 'published' and published_at <= now()
      order by published_at desc
      limit 1
  );

alter table sources drop constraint sources_type_check;
alter table sources add constraint sources_type_check check (type in
    ('telegram_channel', 'aliexpress_api', 'awin_promotions', 'guide_prices', 'awin_feeds', 'event_promos', 'manual',
     'chollometro', 'channel_stats', 'ended_posts', 'guide_announce'));

insert into sources (type, identifier, country, active, every_minutes)
    values ('guide_announce', 'patobarato', 'ES', true, 30)
on conflict (type, identifier) do nothing;

notify pgrst, 'reload schema';
