import { LegalLayout, legalMetadata } from '../../components/LegalLayout'

export const metadata = legalMetadata('Aviso legal', '/aviso-legal', 'Datos del titular de patobarato.com y condiciones de uso del sitio.')

export default function AvisoLegalPage() {
  return (
    <LegalLayout title="Aviso legal" updated="6 de noviembre de 2026">
      <h2>Titular del sitio</h2>
      <p>
        En cumplimiento de la Ley 34/2002, de Servicios de la Sociedad de la Información y de Comercio
        Electrónico (LSSI-CE), se informa de que el titular de patobarato.com es [TITULAR], con NIF [NIF],
        domicilio en [DIRECCIÓN] y correo electrónico de contacto [EMAIL].
      </p>
      <h2>Objeto</h2>
      <p>
        PatoBarato es un sitio informativo que recopila y publica ofertas y códigos de descuento de tiendas
        en línea. PatoBarato no vende productos ni interviene en la compra: cualquier compra se realiza en la
        tienda correspondiente y se rige por sus condiciones.
      </p>
      <h2>Precios y disponibilidad</h2>
      <p>
        Los precios, descuentos y cupones se muestran tal y como se detectaron en el momento de su
        publicación y pueden cambiar o agotarse en cualquier momento. PatoBarato hace lo posible por
        comprobarlos, pero no garantiza que sigan vigentes cuando el usuario accede a la tienda.
      </p>
      <h2>Propiedad intelectual</h2>
      <p>
        El diseño, los textos y la mascota de PatoBarato son propiedad de [TITULAR]. Las imágenes, nombres y
        marcas de los productos pertenecen a sus respectivos titulares y se muestran únicamente con fines
        identificativos.
      </p>
      <h2>Enlaces externos</h2>
      <p>
        Los enlaces a tiendas y a Telegram conducen a sitios ajenos a PatoBarato, sobre cuyo contenido y
        funcionamiento no tenemos control ni responsabilidad. Parte de esos enlaces son enlaces de afiliado;
        consulta la <a href="/afiliados">política de afiliación</a>.
      </p>
      <h2>Legislación aplicable</h2>
      <p>Este aviso se rige por la legislación española. Para cualquier controversia serán competentes los juzgados y tribunales de [CIUDAD].</p>
    </LegalLayout>
  )
}
