/** Guides with an illustrated cover in `public/guias/<slug>.jpeg` (the duck with the product). */
export const GUIDE_COVER_SLUGS: ReadonlySet<string> = new Set([
  'afeitadoras-y-recortadoras-de-barba',
  'aspiradores-escoba-sin-cable-menos-200',
  'auriculares-inalambricos-menos-50',
  'barbacoas-y-planchas-electricas',
  'cafeteras-capsulas-y-espresso-menos-150',
  'calefactores-bajo-consumo',
  'camaras-de-seguridad-y-timbres-inteligentes',
  'cortacespedes-y-robots-cortacesped',
  'depiladoras-ipl-y-cuidado-facial',
  'equipo-senderismo-para-empezar',
  'freidoras-de-aire-menos-100',
  'gimnasio-en-casa-para-empezar',
  'juegos-de-mesa-familiares',
  'monitores-27-teletrabajo',
  'moviles-menos-300',
  'piscinas-desmontables-y-depuradoras',
  'relojes-y-pulseras-de-actividad-menos-100',
  'robots-aspiradores-menos-300',
  'secadores-y-planchas-de-pelo-menos-80',
  'ssd-nvme-y-discos-externos',
  'tablets-menos-200',
  'taladros-atornilladores-bateria',
  'ventiladores-silenciosos-verano',
  'zapatillas-running-empezar-a-correr',
])

export const GUIDE_COVER_WIDTH = 1376
export const GUIDE_COVER_HEIGHT = 768

export type GuideCover = { url: string; width: number; height: number; alt: string }

/** The cover of a guide, or null when it has none (new guides get one when the image lands in `public/guias`). */
export function guideCover(slug: string, title: string): GuideCover | null {
  if (!GUIDE_COVER_SLUGS.has(slug)) return null
  return {
    url: `/guias/${slug}.jpeg`,
    width: GUIDE_COVER_WIDTH,
    height: GUIDE_COVER_HEIGHT,
    alt: `El pato de PatoBarato con el producto de la guía: ${title}`,
  }
}
