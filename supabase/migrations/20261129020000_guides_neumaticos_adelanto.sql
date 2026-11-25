-- Las seis guías de neumáticos se adelantan una semana: empiezan el viernes 27 nov 2026 y
-- terminan el 1 ene 2027 (content/guides-neumaticos/_calendar.json ya refleja las fechas nuevas;
-- 20261129010000 conserva las originales porque ya estaba aplicada).
update guides
   set published_at = published_at - interval '7 days', updated_at = now()
 where widget = 'neumaticos'
   and slug in ('como-elegir-neumaticos', 'neumaticos-turismo-205-55-r16', 'neumaticos-suv-235-55-r18',
                'neumaticos-invierno', 'neumaticos-all-season', 'neumaticos-furgoneta-215-65-r16c')
   and published_at >= '2026-12-04T06:00:00Z';
