import { LegalLayout, legalMetadata } from '../../components/LegalLayout'

export const metadata = legalMetadata('Política de afiliación', '/afiliados', 'Cómo se financia PatoBarato y cómo afecta (y cómo no) a los chollos que publica.')

export default function AfiliadosPage() {
  return (
    <LegalLayout title="Política de afiliación" updated="6 de noviembre de 2026">
      <h2>Cómo nos financiamos</h2>
      <p>
        PatoBarato es gratuito y no tiene publicidad. Se financia con enlaces de afiliado: cuando compras
        a través de uno de nuestros enlaces, la tienda nos paga una pequeña comisión. El precio que pagas es
        el mismo que pagarías entrando en la tienda directamente.
      </p>
      <h2>Amazon</h2>
      <p>
        En calidad de Afiliado de Amazon, PatoBarato obtiene ingresos por las compras adscritas que cumplen
        los requisitos aplicables. Los enlaces a Amazon pasan por la dirección /go/ de este sitio, que añade
        nuestro identificador de afiliado.
      </p>
      <h2>Otras tiendas</h2>
      <p>
        Cuando publicamos cupones o chollos de otras tiendas, sus enlaces también pueden ser de afiliado.
        Lo indicamos en el pie de cada página en la que aparezcan.
      </p>
      <h2>Independencia</h2>
      <p>
        Las ofertas se seleccionan por su precio y su descuento real, no por la comisión que generen.
        Ninguna tienda paga por aparecer en PatoBarato ni revisa lo que publicamos.
      </p>
      <p>Dudas: [EMAIL].</p>
    </LegalLayout>
  )
}
