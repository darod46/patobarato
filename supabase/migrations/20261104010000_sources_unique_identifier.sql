-- Sources are discovered from the reader account's channels and upserted by
-- their Telegram peer id, so an identifier may appear only once per type.
create unique index sources_type_identifier_key on sources (type, identifier);
