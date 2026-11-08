-- Event copy fixes: the 11.11 keeps only its event hashtag (#aliexpress is store-wide), and the published
-- copy describes what a deal card actually shows (current price, previous price, «Mínimo histórico»)
-- instead of a price history the web does not display.

update events set hashtags = '{1111}' where slug = 'aliexpress-1111';

update events set
  intro_md = $md$El 11.11, también llamado Día del Soltero, es la gran campaña anual de AliExpress y se celebra cada 11 de noviembre. En 2026 cae en miércoles.

En PatoBarato seguimos las ofertas de AliExpress todo el año. Durante el 11.11 las que detecta el bot aparecen en nuestro canal de Telegram y en esta misma página, según las va encontrando.

Las condiciones de cada oferta las fija la tienda y pueden cambiar durante el día, así que conviene revisar precio y cupones antes de pagar.

Cada chollo muestra el precio actual y, cuando lo conocemos, el precio anterior tachado. Si es el precio más bajo que PatoBarato ha registrado para ese producto, lleva la etiqueta «Mínimo histórico».$md$,
  tips_md = $md$- Fíjate en la etiqueta «Mínimo histórico»: indica que es el precio más bajo que hemos registrado para ese producto.
- Revisa los cupones de la tienda y las condiciones (importe mínimo, fechas de uso) antes de pagar.
- Comprueba los gastos de envío y el plazo de entrega: dos precios iguales pueden salir distintos con el envío.
- Fíjate en el vendedor y en las valoraciones del producto, no solo en el precio.
- Activa las notificaciones de nuestro canal de Telegram para ver los chollos según aparecen.$md$,
  faq = $json$[
    {"q": "¿Cuándo es el 11.11 de AliExpress?", "a_md": "El 11 de noviembre. En 2026 es miércoles."},
    {"q": "¿Dónde veo los chollos del 11.11 de PatoBarato?", "a_md": "En nuestro [canal de Telegram](https://t.me/patobarato) y en esta página, a medida que el bot los encuentra."},
    {"q": "¿Cómo sé si un precio es bueno?", "a_md": "Cada chollo muestra el precio actual y, cuando lo conocemos, el precio anterior tachado. Si es el más bajo que PatoBarato ha registrado para ese producto, verás la etiqueta «Mínimo histórico»."}
  ]$json$::jsonb
where slug = 'aliexpress-1111';

update events set
  intro_md = $md$El Black Friday es la jornada de descuentos que se celebra el viernes siguiente al Día de Acción de Gracias. En 2026 es el 27 de noviembre, y en PatoBarato seguimos las ofertas hasta el domingo 29.

Las tiendas que vigilamos para este evento son Amazon, PCComponentes y MediaMarkt. Los chollos que detecta el bot aparecen en nuestro canal de Telegram y en esta página según los encuentra.

Muchas tiendas empiezan a publicar ofertas antes del viernes y algunas las mantienen después, así que las fechas exactas dependen de cada una.

Cada chollo muestra el precio actual y, cuando lo conocemos, el precio anterior tachado. Si es el precio más bajo que PatoBarato ha registrado para ese producto, lleva la etiqueta «Mínimo histórico».$md$,
  tips_md = $md$- Haz una lista de lo que necesitas antes del viernes y comprueba el precio de esos productos con antelación.
- Busca la etiqueta «Mínimo histórico»: un tachado no siempre refleja el precio real anterior.
- Revisa la política de devoluciones y el plazo de entrega de cada tienda.
- Compara el mismo producto en las tres tiendas antes de decidirte.
- Desconfía de la urgencia: un precio rebajado no tiene por qué ser el más bajo que ha tenido el producto.
- Activa las notificaciones de Telegram para recibir los chollos según aparecen.$md$,
  faq = $json$[
    {"q": "¿Cuándo es el Black Friday 2026?", "a_md": "El viernes 27 de noviembre. En PatoBarato seguimos las ofertas hasta el domingo 29, aunque cada tienda decide sus propias fechas."},
    {"q": "¿Qué tiendas sigue PatoBarato en el Black Friday?", "a_md": "Amazon, PCComponentes y MediaMarkt. Los chollos se publican en el [canal de Telegram](https://t.me/patobarato) y en esta página cuando el bot los encuentra."},
    {"q": "¿Cómo compruebo si una oferta es buena?", "a_md": "Compara el precio actual con el precio anterior tachado, cuando lo hay, y busca la etiqueta «Mínimo histórico»: aparece cuando es el precio más bajo que PatoBarato ha registrado para ese producto."}
  ]$json$::jsonb
where slug = 'black-friday';

notify pgrst, 'reload schema';
