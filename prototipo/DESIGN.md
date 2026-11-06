---
name: PatoBarato v3
colors:
  ink: '#14161a'
  muted: '#5b6470'
  line: '#e6e8ec'
  surface: '#f6f7f9'
  primary: '#1f4fd1'
  primary-hover: '#163ea8'
  primary-soft: '#e8eefc'
  accent: '#ffd24d'
  accent-ink: '#3d2e00'
  danger: '#b42318'
  success: '#14633a'
  success-soft: '#e3f6ea'
  warm: '#fffbe8'
  warm-line: '#f3e4a6'
  white: '#ffffff'
typography:
  display-hero:
    fontFamily: Space Grotesk
    fontSize: 60px
    fontWeight: '700'
    lineHeight: 1.05
    letterSpacing: -0.03em
  display-hero-mobile:
    fontFamily: Space Grotesk
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 1.08
    letterSpacing: -0.03em
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 1.15
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 1.15
    letterSpacing: -0.02em
  headline-sm:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 1.3
  body-lg:
    fontFamily: Inter
    fontSize: 17px
    fontWeight: '400'
    lineHeight: 1.55
  body-md:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 1.5
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 1.5
  eyebrow:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '600'
    letterSpacing: 0.06em
  price-card:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '700'
    letterSpacing: -0.02em
  price-product:
    fontFamily: Space Grotesk
    fontSize: 36px
    fontWeight: '700'
    letterSpacing: -0.02em
rounded:
  sm: 0.5rem
  DEFAULT: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  container: 1200px
  margin: 1rem
  margin-md: 2rem
  gap-card: 1.5rem
  section: 4.5rem
---

## Marca y estilo

Limpio y de confianza. Fondo blanco, mucho aire y tarjetas nítidas; el pato superhéroe del logo es el protagonista del hero y narra las secciones de confianza («Hola, soy el Pato»). Nada de degradados llamativos, cuentas atrás agresivas ni cifras inventadas: la web afirma solo lo que los datos respaldan.

## Colores

- **ink** `#14161a`: texto principal; fondos de las bandas oscuras (eventos, Telegram).
- **muted** `#5b6470`: texto secundario. Cumple 4.5:1 sobre blanco y sobre `surface`, también a 11–12 px.
- **line** `#e6e8ec` y **surface** `#f6f7f9`: bordes y fondos de sección.
- **primary** `#1f4fd1` (hover `#163ea8`): botones, enlaces, selector de orden activo, Telegram. **primary-soft** `#e8eefc` para fondos de icono y el pie de las tarjetas.
- **accent** `#ffd24d` (texto `#3d2e00`): el amarillo del pato. Chip «Cupón», halo del hero, acentos de marca. Nunca como texto sobre blanco.
- **danger** `#b42318`: solo el badge de descuento («-42 %»), texto blanco.
- **success** `#14633a` sobre **success-soft** `#e3f6ea`: «Mínimo histórico» y las garantías del hero.
- **warm** `#fffbe8` con borde **warm-line** `#f3e4a6`: fondo del hero y de «Hola, soy el Pato».
- Logo: rojo `#d9342b`, amarillo `#ffd24d`, contorno `#0e0e0e` (`recursos/patobarato-logo-vector.svg`).

## Tipografía

- **Inter** para el cuerpo, etiquetas y navegación.
- **Space Grotesk** para H1/H2 y para los precios (tabular-nums vía la utilidad `price`).
- Títulos de producto en tarjeta: Inter 15 px / 500, dos líneas máximo (`line-clamp-2`).

## Layout

Contenedor de 1200 px con márgenes de 16 px (móvil) y 32 px (escritorio). Rejilla de chollos 1 / 2 / 3 / 4 columnas con hueco de 24 px. Secciones separadas por 72 px en escritorio y 40 px en móvil. Cabecera fija de 72 px (60 px en móvil) con fondo blanco y borde `line`.

## Formas y profundidad

Tarjetas con radio 16 px, borde `line` de 1 px y sin sombra en reposo; al pasar el ratón, `0 8px 24px rgba(20,22,26,.08)`. Botones y campos con radio 12 px y altura 48 px (44 px en la cabecera). Chips y badges en píldora. Bandas oscuras con radio 24 px.

## Componentes

- **Botón primario:** `primary`, texto blanco, 600. **Secundario:** blanco con borde `#d7dae0`, texto `ink`. **Botón de tarjeta:** `primary-soft` con texto `primary`, 40 px.
- **Tarjeta de chollo:** imagen cuadrada sobre blanco; badge `danger` arriba a la izquierda; chip `accent` «Cupón» arriba a la derecha; etiqueta `success` «Mínimo histórico» abajo a la izquierda; «Amazon · hace X» en `muted` 12 px; precio `price-card`; anterior tachado en `#8a919c`.
- **Chips de hashtag:** activo `ink`/blanco; resto `surface`/`ink`. Altura ≥ 44 px.
- **Selector de orden:** grupo segmentado sobre `surface`; opción activa blanca con sombra suave.
- **Tarjeta de cupón:** tienda y caducidad en 12 px; valor en Space Grotesk 30 px `primary`; código en monoespaciada con borde discontinuo y botón «Copiar» `primary`.
- **Buscador:** 44 px, fondo `surface`, borde `#d7dae0`, icono de lupa `muted`.
