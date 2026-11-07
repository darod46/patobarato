-- Offers without an affiliate link are never published: record why they were skipped.
alter table offers drop constraint offers_status_check;
alter table offers add constraint offers_status_check check (status in (
    'pending', 'published', 'published_web', 'skipped_duplicate',
    'skipped_no_price', 'skipped_stale', 'skipped_no_affiliate', 'publish_failed'));
