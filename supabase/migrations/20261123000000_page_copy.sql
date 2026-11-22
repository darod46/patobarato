-- Editorial copy for listing pages (categories, stores, static pages): table, admin policies,
-- public view of published rows and the hand-written seed.
-- Markers in intro_md: {deals} (active deals) and {stores} (store list, «Amazon y AliExpress»).
-- Each marker lives in its own sentence: the web drops that sentence when the value is unknown.

create table page_copy (
    id bigint generated always as identity primary key,
    kind text not null check (kind in ('category', 'store', 'static')),
    slug text not null,                     -- category: hashtag; store: id de tienda; static: 'chollos' | 'tiendas' | 'cupones' | 'guias' | 'eventos' | 'sobre-nosotros'
    title text not null,                    -- <title>, sin el sufijo « · PatoBarato» (lo añade la web)
    h1 text not null,
    intro_md text not null default '',      -- 150–300 palabras; admite {deals}, {stores} como marcadores
    faq jsonb not null default '[]',        -- [{"q": "...", "a_md": "..."}]
    status text not null default 'draft' check (status in ('draft', 'published')),
    updated_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    unique (kind, slug)
);
create trigger page_copy_set_updated_at before update on page_copy
    for each row execute function guides_touch_updated_at();   -- same function as guides and events
alter table page_copy enable row level security;
revoke all on page_copy from anon, authenticated;
grant select, insert, update, delete on page_copy to authenticated;
create policy page_copy_admin_select on page_copy for select to authenticated using (is_admin());
create policy page_copy_admin_insert on page_copy for insert to authenticated with check (is_admin());
create policy page_copy_admin_update on page_copy for update to authenticated using (is_admin()) with check (is_admin());
create policy page_copy_admin_delete on page_copy for delete to authenticated using (is_admin());

create view web_page_copy as
select kind, slug, title, h1, intro_md, faq, updated_at
from page_copy where status = 'published';
revoke all on web_page_copy from anon, authenticated;
grant select on web_page_copy to anon, authenticated;

-- Seed: categories (the eight hashtags with deals today).
insert into page_copy (kind, slug, title, h1, status, intro_md, faq)
values (
  'category', 'hogar',
  'Chollos de hogar hoy: ofertas en Amazon y AliExpress',
  'Chollos de hogar',
  'published',
  $md$En esta sección reunimos los chollos para la casa: pequeño electrodoméstico, menaje de cocina, ropa de cama, almacenaje, iluminación, limpieza y todo lo que hace más cómodo el día a día. Las ofertas llegan de Amazon y AliExpress, y el bot las publica en cuanto las encuentra.

El pequeño electrodoméstico (freidoras de aire, robots aspiradores, cafeteras) suele bajar de precio en Black Friday y en Prime Day. Textil y menaje se mueven más en las rebajas de enero y de verano, y los ventiladores y el aire acondicionado portátil se abaratan cuando el calor ya ha pasado.

Antes de comprar algo para casa, mira tres cosas. Primero, las medidas y la potencia: una freidora de aire de 3 litros no sirve para lo mismo que una de 8, y un aparato potente puede salir caro en la factura de la luz. Segundo, el envío: en artículos voluminosos los portes pueden comerse buena parte del descuento. Tercero, la devolución: devolver una cafetera es fácil; devolver un colchón enrollado, no tanto.

En cada chollo verás el precio actual y, cuando lo conocemos, el anterior tachado. La etiqueta «Mínimo histórico» indica que es el precio más bajo que PatoBarato ha registrado para ese producto.

Ahora mismo seguimos {deals} chollos activos en esta categoría.$md$,
  $json$[
    {"q": "¿Cuándo bajan de precio los electrodomésticos pequeños?", "a_md": "Las bajadas más fuertes suelen llegar en Black Friday y Prime Day, aunque aparecen ofertas sueltas todo el año. La etiqueta «Mínimo histórico» te ayuda a saber si el precio de hoy es el más bajo que hemos visto."},
    {"q": "¿Los gastos de envío están incluidos en el precio del chollo?", "a_md": "No siempre. Mostramos el precio del producto en la tienda; revisa en el carrito los portes, sobre todo en artículos grandes o pesados."},
    {"q": "¿Puedo recibir los chollos de hogar al momento?", "a_md": "Sí. Todos los chollos se publican en nuestro [canal de Telegram](https://t.me/patobarato) en cuanto el bot los encuentra."}
  ]$json$::jsonb
);

insert into page_copy (kind, slug, title, h1, status, intro_md, faq)
values (
  'category', 'belleza',
  'Chollos de belleza hoy: ofertas en Amazon y AliExpress',
  'Chollos de belleza',
  'published',
  $md$Aquí están los chollos de belleza y cuidado personal: cosmética facial y corporal, cuidado del cabello, perfumes, maquillaje, afeitado, depilación y pequeños aparatos como secadores, planchas o cepillos eléctricos. Publicamos las ofertas de Amazon y AliExpress que encuentra el bot, según aparecen.

Los perfumes y los estuches de regalo se abaratan sobre todo en Black Friday y en las semanas previas a Navidad, y vuelven a moverse antes del Día de la Madre y del Día del Padre. Los aparatos de cuidado personal siguen el calendario de la tecnología: Black Friday y Prime Day.

En belleza conviene fijarse en detalles que no se ven en la foto. Compara el precio por mililitro, porque un formato grande no siempre sale más barato. Comprueba quién vende el producto: un vendedor oficial o la propia tienda da más garantías de que llega precintado y en buen estado. Y si es un producto que caduca, como un protector solar, piensa si de verdad lo vas a gastar antes de comprar tres unidades.

Cada chollo muestra el precio actual y, si lo conocemos, el precio anterior tachado; «Mínimo histórico» significa que no hemos registrado un precio más bajo para ese producto.

Ahora mismo seguimos {deals} chollos activos en esta categoría.$md$,
  $json$[
    {"q": "¿Cuándo es buen momento para comprar perfume?", "a_md": "Black Friday y las semanas previas a Navidad suelen traer las mejores ofertas en perfumes y estuches. Fuera de esas fechas, compara el precio con el que muestra cada chollo como anterior."},
    {"q": "¿Cómo sé si un cosmético es original?", "a_md": "Fíjate en quién lo vende y envía. Si lo vende la propia tienda o la marca oficial, el riesgo es menor; si es un vendedor externo, revisa sus valoraciones antes de comprar."},
    {"q": "¿Compensa comprar el formato grande?", "a_md": "No siempre. Compara el precio por mililitro y, si el producto caduca, como un protector solar, piensa si lo gastarás antes de la fecha indicada en el envase."}
  ]$json$::jsonb
);

insert into page_copy (kind, slug, title, h1, status, intro_md, faq)
values (
  'category', 'tecnologia',
  'Chollos de tecnología hoy: ofertas en Amazon y AliExpress',
  'Chollos de tecnología',
  'published',
  $md$En tecnología publicamos ofertas en móviles, tablets, portátiles, auriculares, relojes inteligentes, discos SSD, memorias, cargadores, monitores y accesorios para el ordenador. El bot publica los chollos de Amazon y AliExpress en cuanto los detecta, así que conviene pasarse a menudo.

Las grandes bajadas de tecnología se concentran en Black Friday, Cyber Monday y Prime Day, y AliExpress tiene su propia campaña fuerte el 11.11. Otra pista útil: cuando sale un modelo nuevo, el anterior suele abaratarse en las semanas siguientes.

En tecnología, un mismo nombre puede esconder productos distintos. Comprueba la versión exacta, la capacidad y la memoria antes de comparar precios. Mira quién vende y quién da la garantía, y en productos que vienen de fuera revisa que el cargador tenga enchufe europeo y que el móvil admita las bandas de los operadores españoles. Si el envío sale de otro país, ten en cuenta el plazo de entrega y cómo se gestiona una devolución.

En cada chollo verás el precio actual, el anterior tachado cuando lo conocemos y la etiqueta «Mínimo histórico» si es el precio más bajo que hemos registrado. Si hay cupón, aparece junto al precio y lo hemos comprobado antes de publicar.

Ahora mismo seguimos {deals} chollos activos en esta categoría.$md$,
  $json$[
    {"q": "¿Cuándo es mejor comprar tecnología?", "a_md": "Black Friday, Cyber Monday y Prime Day concentran las bajadas más grandes, y en AliExpress también el 11.11. Consulta la página de [eventos](/eventos) para ver las próximas fechas."},
    {"q": "¿Es fiable comprar tecnología en AliExpress?", "a_md": "Depende del vendedor. Revisa sus valoraciones, desde dónde se envía y cómo funcionan la garantía y las devoluciones antes de pagar."},
    {"q": "¿El precio anterior tachado es real?", "a_md": "Mostramos el precio anterior solo cuando lo conocemos. Para saber si el precio de hoy es bueno, fíjate también en la etiqueta «Mínimo histórico»."}
  ]$json$::jsonb
);

insert into page_copy (kind, slug, title, h1, status, intro_md, faq)
values (
  'category', 'juguetes',
  'Chollos de juguetes hoy: ofertas en Amazon y AliExpress',
  'Chollos de juguetes',
  'published',
  $md$En esta categoría publicamos ofertas en juguetes, juegos de mesa, construcciones, puzles, muñecos, juguetes educativos y de exterior, además de material para manualidades. Los chollos llegan de Amazon y AliExpress y el bot los añade en cuanto los encuentra.

Los juguetes tienen un calendario muy marcado. Los precios empiezan a moverse en octubre, con los catálogos de Navidad, y Black Friday suele ser buen momento para adelantar los regalos de Papá Noel y Reyes. Después del 6 de enero llegan las rebajas, con descuentos en lo que no se vendió. En verano tocan los juguetes de piscina y playa.

Al comparar, mira la edad recomendada y el marcado CE, sobre todo si el juguete es para un niño pequeño. Comprueba si necesita pilas y si vienen incluidas. Y si es un regalo con fecha, el plazo de entrega importa tanto como el precio: un envío que tarda tres semanas puede no llegar a tiempo para Reyes.

Cada chollo enseña el precio actual, el precio anterior tachado si lo conocemos y la etiqueta «Mínimo histórico» cuando es el más bajo que tenemos registrado.

Ahora mismo seguimos {deals} chollos activos en esta categoría.$md$,
  $json$[
    {"q": "¿Cuándo bajan de precio los juguetes?", "a_md": "Suelen moverse desde octubre, con fuerza en Black Friday, y de nuevo en las rebajas posteriores a Reyes."},
    {"q": "¿Llegará a tiempo para Navidad o Reyes?", "a_md": "Depende de la tienda y de desde dónde se envíe. Revisa la fecha de entrega estimada en la ficha del producto antes de comprar."},
    {"q": "¿Qué debo comprobar en un juguete barato?", "a_md": "La edad recomendada, el marcado CE, si necesita pilas y las valoraciones de otros compradores."}
  ]$json$::jsonb
);

insert into page_copy (kind, slug, title, h1, status, intro_md, faq)
values (
  'category', 'alimentacion',
  'Chollos de alimentación hoy: ofertas en Amazon y AliExpress',
  'Chollos de alimentación',
  'published',
  $md$Aquí reunimos las ofertas en alimentación y bebida: despensa, café e infusiones, snacks, dulces, suplementos, bebidas y productos de droguería que se compran en la misma cesta. Llegan de Amazon y AliExpress, a menudo en packs, y el bot los publica según los encuentra.

A diferencia de otras categorías, aquí hay pocas grandes fechas. Los descuentos aparecen de forma escalonada durante todo el año, con más movimiento en Prime Day, Black Friday y antes de Navidad, cuando llegan los turrones, los bombones y las cestas.

La clave para juzgar un chollo de alimentación es el precio por unidad, por kilo o por litro: un pack de doce puede parecer barato y salir más caro, unidad a unidad, que en el supermercado. Revisa también la fecha de consumo preferente, sobre todo en packs grandes, y piensa si tienes sitio en la despensa. Algunos productos tienen un precio mínimo de pedido o solo se envían junto con otros artículos.

En cada chollo aparece el precio actual, el anterior tachado cuando lo sabemos y la etiqueta «Mínimo histórico» si no hemos registrado un precio más bajo.

Ahora mismo seguimos {deals} chollos activos en esta categoría.$md$,
  $json$[
    {"q": "¿Cómo sé si un pack de alimentación es realmente barato?", "a_md": "Calcula el precio por unidad, kilo o litro y compáralo con lo que pagas habitualmente. Un pack grande no siempre es más económico."},
    {"q": "¿Los productos de alimentación tienen fecha corta?", "a_md": "Puede pasar, sobre todo en packs grandes. Revisa la fecha de consumo preferente en la ficha o pregunta al vendedor."},
    {"q": "¿Cuándo hay más ofertas de alimentación?", "a_md": "Hay ofertas todo el año, con más movimiento en Prime Day, Black Friday y las semanas previas a Navidad."}
  ]$json$::jsonb
);

insert into page_copy (kind, slug, title, h1, status, intro_md, faq)
values (
  'category', 'deporte',
  'Chollos de deporte hoy: ofertas en Amazon y AliExpress',
  'Chollos de deporte',
  'published',
  $md$Esta categoría recoge los chollos de deporte y aire libre: zapatillas y ropa técnica, material de gimnasio en casa, bicicletas y accesorios, camping, natación, pádel y pulsómetros. Las ofertas proceden de Amazon y AliExpress y el bot las publica en cuanto aparecen.

Enero es el mes del deporte: entre las rebajas y los propósitos de año nuevo, las pesas, las esterillas y las cintas de correr bajan de precio. El material de camping, bicicleta y piscina se mueve en primavera y verano, y los pulsómetros y relojes deportivos siguen las grandes campañas de tecnología, como Black Friday.

En ropa y calzado deportivo lo más importante es la talla: consulta la guía de tallas de la tienda, porque cambia mucho entre fabricantes, y comprueba si el cambio o la devolución son gratuitos. En material de gimnasio, fíjate en el peso máximo que soporta, en las medidas cuando esté montado y en el coste del envío, que en artículos pesados puede ser alto.

En cada chollo verás el precio actual, el precio anterior tachado cuando lo conocemos y la etiqueta «Mínimo histórico» si es el más bajo que hemos visto.

Ahora mismo seguimos {deals} chollos activos en esta categoría.$md$,
  $json$[
    {"q": "¿Cuándo es mejor comprar material deportivo?", "a_md": "En enero, con las rebajas, suelen bajar el material de gimnasio y la ropa. El equipo de verano se mueve en primavera."},
    {"q": "¿Cómo acierto con la talla al comprar online?", "a_md": "Consulta la guía de tallas de la tienda en la ficha del producto y lee las opiniones de otros compradores sobre cómo talla."},
    {"q": "¿Los chollos de deporte incluyen bicicletas?", "a_md": "Sí, publicamos bicicletas, accesorios y repuestos cuando el bot encuentra una oferta en las tiendas que seguimos."}
  ]$json$::jsonb
);

insert into page_copy (kind, slug, title, h1, status, intro_md, faq)
values (
  'category', 'moda',
  'Chollos de moda hoy: ofertas en Amazon y AliExpress',
  'Chollos de moda',
  'published',
  $md$En moda publicamos ofertas en ropa, calzado, bolsos, mochilas, relojes, gafas de sol y complementos para mujer, hombre e infantil. Los chollos llegan de Amazon y AliExpress y el bot los va añadiendo a medida que los encuentra.

La moda sigue su propio calendario: las rebajas de enero y de julio son las fechas fuertes, y entre medias aparecen las ofertas de fin de temporada. Comprar a contratemporada (el abrigo en marzo, el bañador en septiembre) es una de las formas más fiables de pagar menos.

Una oferta de ropa solo es buena si te queda bien. Mide una prenda que ya tengas y compárala con la tabla de tallas del producto, sobre todo en AliExpress, donde muchos vendedores usan tallas asiáticas, más pequeñas. Lee qué tejido es, revisa las fotos de otros compradores y confirma si el cambio de talla es gratis antes de pagar: un cambio de pago puede anular el ahorro.

Cada chollo muestra el precio actual y, si lo conocemos, el precio anterior tachado. La etiqueta «Mínimo histórico» marca el precio más bajo que PatoBarato tiene registrado para ese artículo.

Ahora mismo seguimos {deals} chollos activos en esta categoría.$md$,
  $json$[
    {"q": "¿Cuándo son las rebajas de moda?", "a_md": "Las principales son en enero y en julio, aunque cada tienda decide sus fechas. Entre medias hay ofertas de fin de temporada."},
    {"q": "¿Las tallas de AliExpress son como las de España?", "a_md": "No siempre. Muchos vendedores usan tallas asiáticas, más pequeñas; compara tus medidas con la tabla de tallas de cada producto."},
    {"q": "¿Puedo devolver la ropa si no me queda bien?", "a_md": "Depende de la tienda y del vendedor. Revisa las condiciones de devolución y si el cambio de talla tiene coste antes de comprar."}
  ]$json$::jsonb
);

insert into page_copy (kind, slug, title, h1, status, intro_md, faq)
values (
  'category', 'bricolaje',
  'Chollos de bricolaje hoy: ofertas en Amazon y AliExpress',
  'Chollos de bricolaje',
  'published',
  $md$Aquí están los chollos de bricolaje, herramientas y jardín: taladros y atornilladores, sierras, herramienta manual, medición, organización del taller, iluminación, cortacéspedes, mangueras y riego. Las ofertas proceden de Amazon y AliExpress y el bot las publica en cuanto las detecta.

La herramienta eléctrica suele tener buenas ofertas en Black Friday y Prime Day, y antes del Día del Padre. El jardín tiene su temporada en primavera, cuando se renuevan cortacéspedes, mangueras y muebles de exterior; al final del verano, lo que sobra suele bajar de precio.

En herramienta a batería, fíjate en si el precio incluye batería y cargador o es solo el cuerpo de la máquina. Si ya tienes otras herramientas, que la batería sea compatible puede ahorrarte más que cualquier descuento. Compara el voltaje, el par y los accesorios incluidos, y en herramientas que llegan de fuera revisa que el enchufe sea europeo y cómo funciona la garantía.

En cada chollo verás el precio actual, el anterior tachado cuando lo conocemos y la etiqueta «Mínimo histórico» si es el más bajo que hemos registrado.

Ahora mismo seguimos {deals} chollos activos en esta categoría.$md$,
  $json$[
    {"q": "¿La herramienta del chollo incluye batería?", "a_md": "No siempre. Muchas ofertas son solo el cuerpo de la máquina; revisa en la ficha si incluye batería y cargador."},
    {"q": "¿Cuándo bajan de precio las herramientas?", "a_md": "Black Friday, Prime Day y las semanas previas al Día del Padre suelen traer las mejores ofertas en herramienta eléctrica."},
    {"q": "¿Y el material de jardín?", "a_md": "Su temporada es la primavera. Al final del verano, lo que queda en stock suele bajar de precio."}
  ]$json$::jsonb
);

-- Seed: stores with deals today (PcComponentes, MediaMarkt, El Corte Inglés and Decathlon get copy
-- once Awin accepts them and they have deals).
insert into page_copy (kind, slug, title, h1, status, intro_md, faq)
values (
  'store', 'amazon',
  'Chollos de Amazon hoy: ofertas y cupones en Amazon.es',
  'Chollos de Amazon',
  'published',
  $md$En esta página están los chollos de Amazon.es que ha encontrado PatoBarato: ofertas de casi todas las categorías, desde tecnología y hogar hasta alimentación y juguetes. El bot revisa canales de chollos y publica cada oferta en cuanto la encuentra.

Amazon tiene sus propias campañas, como Prime Day, normalmente en verano, y la Fiesta de Ofertas Prime de otoño, además de participar en Black Friday y Cyber Monday. Fuera de esas fechas también hay ofertas flash que duran pocas horas, por eso conviene mirar con frecuencia o seguir el canal de Telegram.

Al comprar en Amazon fíjate en quién vende y quién envía el producto: no es lo mismo que lo venda Amazon que un vendedor externo, sobre todo para la garantía y las devoluciones. Muchos productos tienen un cupón que se activa con una casilla en la propia ficha; si el chollo lo necesita, lo indicamos junto al precio.

Cada chollo muestra el precio actual, el anterior tachado cuando lo conocemos y la etiqueta «Mínimo histórico» si es el precio más bajo que hemos registrado. Los enlaces a Amazon son de afiliado, como explicamos en [afiliados](/afiliados).

Ahora mismo seguimos {deals} chollos activos de Amazon.$md$,
  $json$[
    {"q": "¿Cómo se aplica un cupón de Amazon?", "a_md": "En la ficha del producto aparece una casilla para activar el cupón. El descuento se aplica en el carrito. Si un chollo necesita cupón, lo indicamos junto al precio."},
    {"q": "¿Pago más por comprar desde un enlace de PatoBarato?", "a_md": "No. El precio es el mismo; Amazon nos paga una comisión por la venta. Lo explicamos en [afiliados](/afiliados)."},
    {"q": "¿Cuándo es Prime Day?", "a_md": "Amazon lo anuncia cada año, normalmente para el verano. Lo verás en nuestra página de [eventos](/eventos) cuando se acerque."}
  ]$json$::jsonb
);

insert into page_copy (kind, slug, title, h1, status, intro_md, faq)
values (
  'store', 'aliexpress',
  'Chollos de AliExpress hoy: ofertas y cupones',
  'Chollos de AliExpress',
  'published',
  $md$Aquí reunimos los chollos de AliExpress que encuentra PatoBarato: gadgets, accesorios para el móvil y el ordenador, herramientas, artículos para el hogar, moda y mucho más. Además de leer canales de chollos, el bot consulta la API de AliExpress y publica cada oferta en cuanto la detecta.

El 11.11 es la gran campaña anual de AliExpress, y también tiene ofertas fuertes en su aniversario de marzo, en Black Friday y en las rebajas de verano. En esas fechas suele haber cupones de la tienda que se suman a los descuentos de cada producto.

En AliExpress el precio no lo es todo. Mira desde dónde se envía el producto: si sale de un almacén en España o en Europa llega antes y la devolución es más sencilla. Comprueba el precio final en el carrito, con envío incluido, y revisa las valoraciones del vendedor y del producto, no solo la nota media. En ropa y calzado, consulta la tabla de tallas.

En cada chollo verás el precio actual, el precio anterior tachado cuando lo conocemos y la etiqueta «Mínimo histórico» si no hemos registrado un precio más bajo. Si hay cupón, aparece junto al precio y lo comprobamos antes de publicar. Los enlaces son de afiliado, como contamos en [afiliados](/afiliados).

Ahora mismo seguimos {deals} chollos activos de AliExpress.$md$,
  $json$[
    {"q": "¿Cuándo es el 11.11 de AliExpress?", "a_md": "El 11 de noviembre de cada año. Tienes los detalles en nuestra página de [eventos](/eventos)."},
    {"q": "¿Cuánto tarda en llegar un pedido de AliExpress?", "a_md": "Depende de desde dónde se envíe. Los productos que salen de almacenes en España o en Europa llegan antes; revisa la fecha estimada en la ficha."},
    {"q": "¿Los cupones de AliExpress funcionan de verdad?", "a_md": "Comprobamos cada cupón antes de publicarlo. Aun así, algunos tienen usos limitados o un importe mínimo, así que revisa sus condiciones."}
  ]$json$::jsonb
);

-- Seed: static listing pages.
insert into page_copy (kind, slug, title, h1, status, intro_md, faq)
values (
  'static', 'chollos',
  'Chollos de hoy: ofertas en Amazon y AliExpress',
  'Chollos de hoy',
  'published',
  $md$Estos son los últimos chollos que ha publicado PatoBarato, ordenados por defecto del más reciente al más antiguo. Un bot revisa canales de chollos y la API de AliExpress, y publica cada oferta aquí y en nuestro canal de Telegram en cuanto la encuentra.

Hoy hay {deals} chollos activos en {stores}.

Cada tarjeta muestra lo necesario para decidir rápido: el precio actual, el precio anterior tachado cuando lo conocemos y, si es el caso, la etiqueta «Mínimo histórico», que indica que es el precio más bajo que PatoBarato ha registrado para ese producto. Si la oferta necesita un cupón, aparece junto al precio; los cupones los verificamos antes de publicar.

Un chollo puede durar días o desaparecer en minutos, porque el precio lo decide la tienda. Por eso conviene comprobar el precio final en el carrito antes de pagar, con los gastos de envío incluidos. Si quieres ver solo un tipo de producto, entra en una categoría, como tecnología, hogar o juguetes, o filtra por tienda en la página de tiendas.

Los enlaces de PatoBarato son de afiliado: si compras a través de ellos, la tienda nos paga una pequeña comisión y tú pagas lo mismo. Lo explicamos con detalle en [afiliados](/afiliados).$md$,
  $json$[
    {"q": "¿Cada cuánto se actualizan los chollos?", "a_md": "El bot publica cada oferta en cuanto la encuentra, a cualquier hora. Para recibirlas al momento, únete al [canal de Telegram](https://t.me/patobarato)."},
    {"q": "¿Por qué un chollo ya no tiene el precio que indicáis?", "a_md": "El precio lo fija la tienda y puede cambiar en cualquier momento, a veces en minutos. Comprueba siempre el precio final en el carrito."},
    {"q": "¿Qué significa «Mínimo histórico»?", "a_md": "Que es el precio más bajo que PatoBarato ha registrado para ese producto desde que lo seguimos."}
  ]$json$::jsonb
);

insert into page_copy (kind, slug, title, h1, status, intro_md, faq)
values (
  'static', 'tiendas',
  'Tiendas con chollos: Amazon y AliExpress',
  'Tiendas con chollos',
  'published',
  $md$Desde esta página puedes ver los chollos de cada tienda por separado. Hoy publicamos ofertas de Amazon.es y AliExpress. Iremos sumando otras tiendas españolas a medida que podamos comprobar sus precios.

Hoy hay {deals} chollos activos en {stores}.

Cada tienda tiene su página con sus ofertas, sus cupones vigentes y algunos consejos para comprar en ella. No es lo mismo comprar en Amazon, donde conviene mirar si vende Amazon o un vendedor externo, que en AliExpress, donde el almacén de envío marca el plazo de entrega y la facilidad de la devolución.

Elegimos las tiendas por el interés de sus ofertas para quien compra desde España, no porque nos paguen por aparecer: ninguna tienda paga por salir en PatoBarato. Sí tenemos enlaces de afiliado con ellas, y lo declaramos en [afiliados](/afiliados).

En todas las tiendas aplicamos el mismo criterio: publicamos el precio que vemos al publicar el chollo, mostramos el precio anterior cuando lo conocemos, marcamos con «Mínimo histórico» los precios más bajos que hemos registrado y verificamos los cupones antes de publicarlos. Así puedes comparar ofertas de tiendas distintas con la misma información.$md$,
  $json$[
    {"q": "¿Qué tiendas sigue PatoBarato?", "a_md": "Hoy, Amazon.es y AliExpress. Iremos sumando otras tiendas a medida que podamos comprobar sus precios."},
    {"q": "¿Las tiendas pagan por aparecer?", "a_md": "No. Ninguna tienda paga por salir en PatoBarato. Ganamos una comisión de afiliado si compras desde nuestros enlaces, como explicamos en [afiliados](/afiliados)."},
    {"q": "¿Puedo pedir que añadáis una tienda?", "a_md": "Sí, escríbenos desde la página de [contacto](/contacto). La valoraremos si tiene ofertas interesantes para quien compra en España y podemos comprobar sus precios."}
  ]$json$::jsonb
);

insert into page_copy (kind, slug, title, h1, status, intro_md, faq)
values (
  'static', 'cupones',
  'Cupones de descuento vigentes y comprobados',
  'Cupones de descuento',
  'published',
  $md$En esta página están los cupones de descuento vigentes de las tiendas que sigue PatoBarato, agrupados por tienda y ordenados por fecha de caducidad, para que veas primero los que terminan antes. Solo mostramos cupones activos: cuando uno caduca, desaparece de la lista.

Antes de publicar un cupón comprobamos que funciona. Aun así, las condiciones las pone la tienda y pueden cambiar, así que lee siempre la letra pequeña que acompaña a cada uno: el importe mínimo de compra, las fechas de uso, si solo vale para ciertos productos o para clientes nuevos, y si se puede combinar con otras ofertas.

Hay dos tipos de cupones. Los códigos se copian y se pegan en el carrito al pagar; es lo habitual en AliExpress, sobre todo durante campañas como el 11.11. Los cupones de producto se activan desde la propia ficha, como la casilla de cupón de Amazon. Cuando un chollo concreto necesita un cupón, también lo mostramos en su tarjeta, junto al precio.

Un consejo: haz las cuentas con el precio final. Un cupón con importe mínimo puede llevarte a añadir cosas que no necesitabas, y entonces deja de ser un ahorro.

Los enlaces de las tiendas son de afiliado, como explicamos en [afiliados](/afiliados).$md$,
  $json$[
    {"q": "¿Los cupones están comprobados?", "a_md": "Sí, comprobamos cada cupón antes de publicarlo. Las condiciones las fija la tienda y pueden cambiar, así que revísalas al pagar."},
    {"q": "¿Por qué no me funciona un cupón?", "a_md": "Lo más habitual es no llegar al importe mínimo, que el cupón no sea válido para ese producto o que se hayan agotado sus usos. Revisa las condiciones del cupón."},
    {"q": "¿Puedo juntar un cupón con un chollo?", "a_md": "Depende de la tienda. Algunos cupones se suman a los descuentos del producto y otros no; lo verás al aplicarlo en el carrito."}
  ]$json$::jsonb
);

insert into page_copy (kind, slug, title, h1, status, intro_md, faq)
values (
  'static', 'guias',
  'Guías de compra: comparativas y qué mirar antes de comprar',
  'Guías de compra',
  'published',
  $md$Las guías de compra de PatoBarato están pensadas para cuando no buscas una oferta concreta, sino saber qué comprar. En cada guía comparamos varios modelos de un mismo tipo de producto, explicamos para quién es cada uno y te contamos qué características importan y cuáles son solo marketing.

Cada producto de una guía tiene sus ventajas e inconvenientes, sus especificaciones principales y los precios en las tiendas donde se vende, que el bot actualiza con regularidad. Y si un producto de una guía aparece como chollo, su ficha de oferta enlaza a la guía.

Las guías no sustituyen a los chollos, los complementan. Lo ideal es leer primero la guía para tener claro qué modelo te encaja y después esperar a que ese modelo baje de precio: con la etiqueta «Mínimo histórico» sabrás cuándo está más barato de lo que lo hemos visto nunca.

Las escribimos a partir de las fichas técnicas de cada modelo. Ninguna marca ni tienda paga por aparecer en una guía ni por su posición. Los enlaces a las tiendas son de afiliado: si compras desde ellos nos llevamos una comisión sin que tú pagues más, como explicamos en [afiliados](/afiliados).$md$,
  $json$[
    {"q": "¿Las marcas pagan por salir en las guías?", "a_md": "No. Ninguna marca ni tienda paga por aparecer en una guía ni por su posición. Los enlaces son de afiliado, como explicamos en [afiliados](/afiliados)."},
    {"q": "¿Los precios de las guías están actualizados?", "a_md": "El bot los actualiza con regularidad, pero el precio final lo fija la tienda. Compruébalo siempre antes de pagar."},
    {"q": "¿Puedo pedir una guía sobre un producto?", "a_md": "Sí, escríbenos desde la página de [contacto](/contacto) y lo tendremos en cuenta para las próximas guías."}
  ]$json$::jsonb
);

insert into page_copy (kind, slug, title, h1, status, intro_md, faq)
values (
  'static', 'eventos',
  'Eventos de compras: Black Friday, 11.11 y Cyber Monday',
  'Eventos de compras',
  'published',
  $md$Algunas fechas concentran las mejores ofertas del año, y en esta página reunimos las que seguimos: Black Friday, el 11.11 de AliExpress y otras campañas como Cyber Monday, las rebajas de enero o Prime Day, que añadimos a medida que se acercan y las tiendas confirman sus fechas.

Cada evento tiene su propia página con las fechas, las tiendas que participan, los chollos que va encontrando el bot y, cuando los hay, los cupones de la campaña. Durante el evento, los chollos aparecen en la página y en nuestro canal de Telegram según los detectamos.

Los eventos son buenos momentos para comprar, pero no todo lo que se anuncia como oferta lo es. Algunas recomendaciones que repetimos cada año:

- Haz una lista antes de que empiece el evento y mira el precio de esos productos con unos días de antelación.
- Fíjate en la etiqueta «Mínimo histórico»: te dice si el precio es el más bajo que PatoBarato ha registrado, algo más fiable que un precio tachado.
- Revisa el plazo de entrega y las condiciones de devolución, que en estas fechas pueden cambiar.
- No te dejes llevar por las cuentas atrás: una oferta con cuenta atrás suele repetirse; comprueba con «Mínimo histórico» si ya estuvo a ese precio.

Las fechas de cada evento las fija cada tienda, y algunas empiezan antes o terminan después de la fecha oficial.$md$,
  $json$[
    {"q": "¿Qué eventos de compras sigue PatoBarato?", "a_md": "Black Friday y el 11.11 de AliExpress, y otras campañas como Cyber Monday, las rebajas de enero o Prime Day, que añadimos cuando se confirman sus fechas."},
    {"q": "¿Las ofertas de Black Friday son reales?", "a_md": "No todas. Compara con el precio anterior y fíjate en la etiqueta «Mínimo histórico», que indica el precio más bajo que hemos registrado para ese producto."},
    {"q": "¿Cómo me entero de los chollos durante un evento?", "a_md": "Los publicamos en la página del evento y en nuestro [canal de Telegram](https://t.me/patobarato) en cuanto el bot los encuentra."}
  ]$json$::jsonb
);

-- About page. The owner can edit this row later from the admin.
insert into page_copy (kind, slug, title, h1, status, intro_md, faq)
values (
  'static', 'sobre-nosotros',
  'Quiénes somos y cómo elegimos los chollos',
  'Sobre PatoBarato',
  'published',
  $md$PatoBarato es un proyecto independiente hecho en España por un desarrollador aficionado a cazar chollos; no pertenece a ninguna tienda. Un bot revisa canales de chollos y la API de AliExpress, y publica las ofertas que pasan nuestros filtros en esta web y en el [canal de Telegram](https://t.me/patobarato).

## Cómo elegimos los chollos

No publicamos cualquier rebaja. Antes de que un chollo aparezca en PatoBarato, se cumplen estos criterios:

- **Precio comprobado en la tienda.** El precio que publicamos es el que vemos en la tienda o en el canal de origen en el momento de publicarlo; si cambia después, la ficha lo indica cuando volvemos a comprobarlo.
- **Precio anterior real.** Solo mostramos un precio tachado cuando lo conocemos; si no lo sabemos, no lo inventamos.
- **Mínimo histórico registrado.** La etiqueta «Mínimo histórico» aparece cuando el precio es el más bajo que PatoBarato ha registrado para ese producto.
- **Cupón verificado.** Si un chollo necesita cupón, comprobamos que funciona antes de publicarlo.
- **Enlaces de afiliado declarados.** Todos los enlaces a tiendas son de afiliado y lo decimos claramente.

## Cómo ganamos dinero

PatoBarato se financia con comisiones de afiliado de Amazon, AliExpress y las tiendas del programa Awin: si compras desde uno de nuestros enlaces, la tienda nos paga una pequeña parte de la venta. Tú pagas el mismo precio que si entraras directamente. Las tiendas nunca pagan por aparecer en la web ni por la posición de sus ofertas. Tienes todos los detalles en [afiliados](/afiliados).$md$,
  $json$[
    {"q": "¿Quién está detrás de PatoBarato?", "a_md": "Un desarrollador español aficionado a cazar chollos. Es un proyecto independiente y no pertenece a ninguna tienda."},
    {"q": "¿Las tiendas pagan por aparecer en PatoBarato?", "a_md": "No. Ganamos una comisión de afiliado cuando compras desde nuestros enlaces, pero ninguna tienda paga por salir ni por su posición. Más detalles en [afiliados](/afiliados)."},
    {"q": "¿Cómo comprobáis los precios?", "a_md": "Publicamos el precio que vemos en la tienda o en el canal de origen en el momento de publicar, mostramos el precio anterior solo cuando lo conocemos y marcamos como «Mínimo histórico» el precio más bajo que tenemos registrado."}
  ]$json$::jsonb
);

notify pgrst, 'reload schema';
