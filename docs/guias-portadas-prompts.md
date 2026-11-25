# Portadas de las guías: prompts para Gemini

Un prompt por guía. Pega primero el bloque de estilo y adjunta como referencia `web/public/og.png` (o `pato-heroe.svg` exportado a PNG) para que Gemini copie al pato; después, en el mismo chat, pide cada imagen con su prompt. Si en algún caso Gemini cambia al pato (color, capa, antifaz), recuérdale «same character as the reference image» y repite.

Formato: 16:9, 1200 × 630 o mayor (sirve de imagen Open Graph). Sin texto dentro de la imagen: el título lo pone la web. Guarda cada PNG como `web/public/guias/<slug>.png` con el slug indicado.

## Bloque de estilo (pégalo una vez al principio)

```
You are illustrating covers for a Spanish deals website. The main character is the mascot from the reference image: a cheerful cartoon yellow duck superhero with an orange beak and feet, a red backwards baseball cap with a white lightning bolt, a black domino mask, a flowing red cape, and a red circular badge with a white percent sign on its chest. Keep the character exactly consistent in every image: same proportions, same colours, same bold clean outlines, flat cel shading with soft highlights, friendly confident expression. Style: polished 2D cartoon mascot illustration, vector-like, thick dark outlines, vibrant but limited palette (yellow, red, orange, black, white, plus the product's own colours), warm cream background with a soft pale-yellow circular glow behind the scene, no text, no logos, no watermark, no brand names on the products. Composition: landscape 16:9, the duck and the product fill the frame, the product is clearly recognisable and realistic in shape but drawn in the same cartoon style.
```

## Prompts

### Afeitadoras y recortadoras de barba

Fichero: `web/public/guias/afeitadoras-y-recortadoras-de-barba.png`

```
Same duck superhero character as the reference image, same style. Scene: the duck admiring itself in a small mirror while trimming an imaginary beard with the trimmer. Product: an electric shaver and a beard trimmer. Landscape 16:9, warm cream background with a pale-yellow glow, no text, no logos.
```

### Aspiradores escoba sin cable por menos de 200 €

Fichero: `web/public/guias/aspiradores-escoba-sin-cable-menos-200.png`

```
Same duck superhero character as the reference image, same style. Scene: the duck vacuuming with the stick vacuum, a few feathers flying into it. Product: a cordless stick vacuum cleaner. Landscape 16:9, warm cream background with a pale-yellow glow, no text, no logos.
```

### Auriculares inalámbricos por menos de 50 €

Fichero: `web/public/guias/auriculares-inalambricos-menos-50.png`

```
Same duck superhero character as the reference image, same style. Scene: the duck wearing the headphones over its red cap, eyes closed, bobbing to music. Product: a pair of wireless over-ear headphones in matte black. Landscape 16:9, warm cream background with a pale-yellow glow, no text, no logos.
```

### Barbacoas y planchas eléctricas

Fichero: `web/public/guias/barbacoas-y-planchas-electricas.png`

```
Same duck superhero character as the reference image, same style. Scene: the duck in a chef apron flipping a skewer with tongs. Product: an electric tabletop barbecue grill with vegetables and skewers sizzling. Landscape 16:9, warm cream background with a pale-yellow glow, no text, no logos.
```

### Cafeteras de cápsulas y espresso por menos de 150 €

Fichero: `web/public/guias/cafeteras-capsulas-y-espresso-menos-150.png`

```
Same duck superhero character as the reference image, same style. Scene: the duck holding a small espresso cup, delighted, eyes sparkling. Product: a compact espresso capsule machine pouring a cup of coffee. Landscape 16:9, warm cream background with a pale-yellow glow, no text, no logos.
```

### Calefactores y radiadores de bajo consumo

Fichero: `web/public/guias/calefactores-bajo-consumo.png`

```
Same duck superhero character as the reference image, same style. Scene: the duck warming its wings next to the heater, cosy and smiling, with a scarf. Product: a slim white tower heater glowing warmly. Landscape 16:9, warm cream background with a pale-yellow glow, no text, no logos.
```

### Cámaras de seguridad y timbres inteligentes

Fichero: `web/public/guias/camaras-de-seguridad-y-timbres-inteligentes.png`

```
Same duck superhero character as the reference image, same style. Scene: the duck peeking into the camera lens, very close, like a detective with a magnifying glass. Product: a small white outdoor security camera and a video doorbell. Landscape 16:9, warm cream background with a pale-yellow glow, no text, no logos.
```

### Cortacéspedes y robots cortacésped

Fichero: `web/public/guias/cortacespedes-y-robots-cortacesped.png`

```
Same duck superhero character as the reference image, same style. Scene: the duck pushing the lawn mower across the lawn, grass clippings flying. Product: an electric lawn mower on a neatly cut green lawn. Landscape 16:9, warm cream background with a pale-yellow glow, no text, no logos.
```

### Depiladoras IPL y cuidado facial

Fichero: `web/public/guias/depiladoras-ipl-y-cuidado-facial.png`

```
Same duck superhero character as the reference image, same style. Scene: the duck relaxing in a bathrobe with a towel on its head, holding the facial brush. Product: an IPL hair-removal device and a facial cleansing brush. Landscape 16:9, warm cream background with a pale-yellow glow, no text, no logos.
```

### Equipo de senderismo: botas, mochila y bastones

Fichero: `web/public/guias/equipo-senderismo-para-empezar.png`

```
Same duck superhero character as the reference image, same style. Scene: the duck with the backpack on and a trekking pole in one wing, on a mountain trail, looking at the view. Product: hiking boots, a backpack and trekking poles. Landscape 16:9, warm cream background with a pale-yellow glow, no text, no logos.
```

### Freidoras de aire por menos de 100 €

Fichero: `web/public/guias/freidoras-de-aire-menos-100.png`

```
Same duck superhero character as the reference image, same style. Scene: the duck proudly presenting the air fryer with one wing, like a chef. Product: a modern black air fryer with its basket pulled open, golden crispy fries steaming inside. Landscape 16:9, warm cream background with a pale-yellow glow, no text, no logos.
```

### Gimnasio en casa: lo esencial para empezar

Fichero: `web/public/guias/gimnasio-en-casa-para-empezar.png`

```
Same duck superhero character as the reference image, same style. Scene: the duck flexing with a dumbbell in each wing, cape flowing. Product: adjustable dumbbells and a rolled yoga mat. Landscape 16:9, warm cream background with a pale-yellow glow, no text, no logos.
```

### Juegos de mesa para toda la familia

Fichero: `web/public/guias/juegos-de-mesa-familiares.png`

```
Same duck superhero character as the reference image, same style. Scene: the duck leaning over the board, placing a tile with a cheeky grin. Product: a family board game open on a table with tiles, meeples and dice. Landscape 16:9, warm cream background with a pale-yellow glow, no text, no logos.
```

### Monitores de 27" para teletrabajo y estudio

Fichero: `web/public/guias/monitores-27-teletrabajo.png`

```
Same duck superhero character as the reference image, same style. Scene: the duck sitting at the desk working, one wing on the keyboard, focused. Product: a 27-inch computer monitor on a tidy desk with a keyboard. Landscape 16:9, warm cream background with a pale-yellow glow, no text, no logos.
```

### Móviles por menos de 300 €

Fichero: `web/public/guias/moviles-menos-300.png`

```
Same duck superhero character as the reference image, same style. Scene: the duck taking a selfie with the smartphone, wing stretched out, winking. Product: a modern smartphone with a bright screen. Landscape 16:9, warm cream background with a pale-yellow glow, no text, no logos.
```

### Piscinas desmontables y depuradoras

Fichero: `web/public/guias/piscinas-desmontables-y-depuradoras.png`

```
Same duck superhero character as the reference image, same style. Scene: the duck floating in the pool on an inflatable ring with sunglasses and a cocktail. Product: a round above-ground frame pool with a small filter pump. Landscape 16:9, warm cream background with a pale-yellow glow, no text, no logos.
```

### Relojes y pulseras de actividad por menos de 100 €

Fichero: `web/public/guias/relojes-y-pulseras-de-actividad-menos-100.png`

```
Same duck superhero character as the reference image, same style. Scene: the duck checking the smartwatch on its wing while jogging in place. Product: a smartwatch with a colourful fitness-ring screen. Landscape 16:9, warm cream background with a pale-yellow glow, no text, no logos.
```

### Robots aspiradores por menos de 300 €

Fichero: `web/public/guias/robots-aspiradores-menos-300.png`

```
Same duck superhero character as the reference image, same style. Scene: the duck riding on top of the robot vacuum like a surfer. Product: a round robot vacuum cleaner gliding across a wooden floor. Landscape 16:9, warm cream background with a pale-yellow glow, no text, no logos.
```

### Secadores y planchas de pelo por menos de 80 €

Fichero: `web/public/guias/secadores-y-planchas-de-pelo-menos-80.png`

```
Same duck superhero character as the reference image, same style. Scene: the duck pointing the hair dryer at its own head feathers, which are blown back dramatically. Product: a hair dryer and a hair straightener. Landscape 16:9, warm cream background with a pale-yellow glow, no text, no logos.
```

### SSD NVMe y discos externos de 1 y 2 TB

Fichero: `web/public/guias/ssd-nvme-y-discos-externos.png`

```
Same duck superhero character as the reference image, same style. Scene: the duck holding the tiny SSD up to the light like a treasure, with speed lines behind. Product: an NVMe SSD stick and a small portable external drive. Landscape 16:9, warm cream background with a pale-yellow glow, no text, no logos.
```

### Tablets por menos de 200 €

Fichero: `web/public/guias/tablets-menos-200.png`

```
Same duck superhero character as the reference image, same style. Scene: the duck holding the tablet with both wings, watching something and laughing. Product: a slim tablet showing a colourful home screen. Landscape 16:9, warm cream background with a pale-yellow glow, no text, no logos.
```

### Taladros atornilladores a batería

Fichero: `web/public/guias/taladros-atornilladores-bateria.png`

```
Same duck superhero character as the reference image, same style. Scene: the duck wearing a yellow hard hat, holding the drill up like a hero pose. Product: a cordless drill driver with its battery and a few screws. Landscape 16:9, warm cream background with a pale-yellow glow, no text, no logos.
```

### Ventiladores silenciosos para el verano

Fichero: `web/public/guias/ventiladores-silenciosos-verano.png`

```
Same duck superhero character as the reference image, same style. Scene: the duck in front of the fan enjoying the breeze, feathers and cape blown back, sunglasses on. Product: a white pedestal fan. Landscape 16:9, warm cream background with a pale-yellow glow, no text, no logos.
```

### Zapatillas de running para empezar a correr

Fichero: `web/public/guias/zapatillas-running-empezar-a-correr.png`

```
Same duck superhero character as the reference image, same style. Scene: the duck wearing the running shoes, mid-stride, cape streaming behind. Product: a pair of colourful running shoes. Landscape 16:9, warm cream background with a pale-yellow glow, no text, no logos.
```
