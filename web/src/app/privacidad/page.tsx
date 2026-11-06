import { LegalLayout, legalMetadata } from '../../components/LegalLayout'

export const metadata = legalMetadata('Política de privacidad', '/privacidad', 'Qué datos trata patobarato.com y con qué finalidad.')

export default function PrivacidadPage() {
  return (
    <LegalLayout title="Política de privacidad" updated="6 de noviembre de 2026">
      <h2>Responsable</h2>
      <p>El responsable del tratamiento es [TITULAR], NIF [NIF], [DIRECCIÓN], correo [EMAIL].</p>
      <h2>Qué datos tratamos</h2>
      <p>
        Navegar por patobarato.com no requiere registro ni facilitar datos personales. El sitio no tiene
        formularios ni cuentas de usuario. El proveedor de alojamiento (Vercel) registra de forma automática
        datos técnicos de las conexiones (dirección IP, navegador, páginas visitadas) con la única finalidad
        de prestar el servicio, garantizar su seguridad y obtener estadísticas agregadas.
      </p>
      <h2>Telegram</h2>
      <p>
        El canal de Telegram de PatoBarato es un servicio de Telegram. Al unirte, tus datos los trata Telegram
        conforme a su propia política de privacidad; PatoBarato no recibe datos personales de los miembros del canal.
      </p>
      <h2>Tiendas y enlaces de afiliado</h2>
      <p>
        Al pulsar un enlace a una tienda, la tienda y su programa de afiliados pueden registrar que la visita
        procede de PatoBarato mediante cookies propias de esos sitios. PatoBarato no recibe datos que te
        identifiquen, solo información agregada sobre comisiones.
      </p>
      <h2>Tus derechos</h2>
      <p>
        Puedes ejercer tus derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad
        escribiendo a [EMAIL]. También puedes reclamar ante la Agencia Española de Protección de Datos
        (aepd.es).
      </p>
    </LegalLayout>
  )
}
