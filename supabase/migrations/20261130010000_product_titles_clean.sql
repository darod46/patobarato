-- Product titles lose the channel tags that leaked into them ("… | 200 ml | #Amazon #Publicidad #BlackFriday",
-- also cut ones like "#publici") and the separators left dangling; the bot no longer lets them in.
-- Apply only once the web reads products.slug (20261130000000): until then it builds the URL from the
-- title, so cleaning titles first would move the URL of every cleaned product.
update products
   set title = btrim(regexp_replace(
         regexp_replace(title, '\s*#[[:alpha:]][[:alnum:]_]*', '', 'g'),
         '[\s|·\-–—,;:]+$', '')),
       updated_at = now()
 where title ~ '#[[:alpha:]]';
