-- Seed: the air fryer guide from the mockup, as a draft. Fill every [CORCHETES] value (store ids,
-- urls, missing copy) and then set status = 'published' and published_at.
with g as (
    insert into guides (slug, title, subtitle, category, intro_md, how_to_choose_md, faq, reading_minutes, status)
    values (
        'freidoras-de-aire-menos-100',
        'Las mejores freidoras de aire por menos de 100 €',
        'Hemos comparado Ninja, Cosori, Cecotec y Ufesa por capacidad, ruido, limpieza y precio real en las últimas semanas. Estas son las que de verdad merecen la pena.',
        'Hogar',
        'Una freidora de aire de menos de 100 € ya hace casi todo lo que hace una de 200 €: patatas crujientes, verduras asadas y pollo sin aceite. La diferencia está en la capacidad real, el ruido y lo fácil que es limpiar la cesta. Hemos probado las cuatro más vendidas en Amazon y PcComponentes y seguido su precio durante 90 días para decirte cuándo comprarlas.',
        '[CORCHETES]',
        '[{"q": "[CORCHETES]", "a_md": "[CORCHETES]"}, {"q": "[CORCHETES]", "a_md": "[CORCHETES]"}]'::jsonb,
        8,
        'draft')
    returning id
), items as (
    insert into guide_items (guide_id, position, name, award, summary_md, pros, cons, specs)
    select g.id, v.position, v.name, v.award, v.summary_md, v.pros, v.cons, v.specs::jsonb
    from g, (values
        (1, 'Ninja AF300 Dual Zone 7,6 L', 'Mejor en general',
         'Dos cajones independientes para cocinar dos cosas a la vez con tiempos distintos y que terminen al mismo tiempo. Es la más grande y la más silenciosa del grupo, y la única que compramos sin dudar si hay más de dos personas en casa.',
         array['Dos zonas con sincronización', 'Cestas antiadherentes muy fáciles de limpiar', 'Baja de 100 € en casi todas las campañas'],
         array['Ocupa mucho en la encimera', 'Sin ventana ni app'],
         '[{"label": "Capacidad", "value": "7,6 L (2 cajones)"}, {"label": "Potencia", "value": "2.470 W"}, {"label": "Funciones", "value": "6 funciones"}, {"label": "Limpieza", "value": "Apta lavavajillas"}]'),
        (2, 'Cosori Lite 3,8 L', 'Mejor calidad-precio',
         'La que recomendamos para una o dos personas o para cocinas pequeñas. Calienta rápido, es ligera y la cesta cuadrada aprovecha mejor el espacio que las redondas de su tamaño.',
         array['[CORCHETES]'],
         array['[CORCHETES]'],
         '[{"label": "Capacidad", "value": "3,8 L"}, {"label": "Potencia", "value": "1.500 W"}, {"label": "Tamaño", "value": "Compacta"}, {"label": "Control", "value": "Panel táctil"}]'),
        (3, 'Cecotec Cecofry Full Inox 5,5 L', 'Más barata',
         'Mucha capacidad por muy poco dinero. Es algo más ruidosa y el antiadherente dura menos, pero por este precio no hay nada con 5,5 litros y ventana.',
         array['[CORCHETES]'],
         array['[CORCHETES]'],
         '[{"label": "Capacidad", "value": "5,5 L"}, {"label": "Potencia", "value": "1.700 W"}, {"label": "Material", "value": "Acero inoxidable"}, {"label": "Extra", "value": "Ventana"}]'),
        (4, 'Ufesa Delicious 5,5 L', 'También buena',
         '[CORCHETES]',
         array['[CORCHETES]'],
         array['[CORCHETES]'],
         '[{"label": "Capacidad", "value": "5,5 L"}, {"label": "Potencia", "value": "1.500 W"}, {"label": "[CORCHETES]", "value": "[CORCHETES]"}, {"label": "[CORCHETES]", "value": "[CORCHETES]"}]')
    ) as v (position, name, award, summary_md, pros, cons, specs)
    returning id, position
)
insert into guide_item_stores (guide_item_id, store, external_id, url, note, position)
select items.id, s.store, s.external_id, s.url, s.note, s.position
from items
join (values
    (1, 'amazon',        '[ASIN]',                '[URL]', null,           0),
    (1, 'pccomponentes', '[SLUG_PCCOMPONENTES]',  '[URL]', null,           1),
    (1, 'mediamarkt',    '[SLUG_MEDIAMARKT]',     '[URL]', null,           2),
    (1, 'aliexpress',    '[ID_ALIEXPRESS]',       '[URL]', 'desde España', 3),
    (2, 'amazon',        '[ASIN]',                '[URL]', null,           0),
    (2, 'elcorteingles', '[SLUG_ELCORTEINGLES]',  '[URL]', null,           1),
    (2, 'aliexpress',    '[ID_ALIEXPRESS]',       '[URL]', 'Choice',       2),
    (3, 'mediamarkt',    '[SLUG_MEDIAMARKT]',     '[URL]', null,           0),
    (3, 'amazon',        '[ASIN]',                '[URL]', null,           1),
    (4, 'amazon',        '[ASIN]',                '[URL]', null,           0)
) as s (item_position, store, external_id, url, note, position) on s.item_position = items.position;
