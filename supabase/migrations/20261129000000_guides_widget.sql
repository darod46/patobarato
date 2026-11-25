-- Guides can embed an interactive widget (currently only the tyre finder). Exposed in web_guides as the last column.

alter table guides add column widget text check (widget in ('neumaticos'));

create or replace view web_guides as
select g.slug, g.title, g.subtitle, g.category, g.author, g.reading_minutes,
       g.published_at, g.updated_at, g.intro_md, g.how_to_choose_md, g.faq,
       (select count(*)::int from guide_items i where i.guide_id = g.id) as items,
       (select max(pp.checked_at)
          from guide_items i
          join guide_item_stores s on s.guide_item_id = i.id
          join products p on p.store = s.store and p.country = 'ES' and p.asin = s.external_id
          join product_prices pp on pp.product_id = p.id
         where i.guide_id = g.id and pp.error is null) as prices_checked_at,
       g.widget
from guides g
where g.status = 'published'
  and g.published_at is not null and g.published_at <= now();

revoke all on web_guides from anon, authenticated;
grant select on web_guides to anon, authenticated;

notify pgrst, 'reload schema';
