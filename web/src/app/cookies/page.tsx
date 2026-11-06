import { LegalLayout, legalMetadata } from '../../components/LegalLayout'

export const metadata = legalMetadata('Política de cookies', '/cookies', 'Las cookies que utiliza patobarato.com y cómo gestionarlas.')

export default function CookiesPage() {
  return (
    <LegalLayout title="Política de cookies" updated="6 de noviembre de 2026">
      <h2>Qué cookies usamos</h2>
      <p>
        patobarato.com solo utiliza cookies y almacenamiento técnicos, imprescindibles para que el sitio
        funcione (por ejemplo, para servir las páginas desde la caché del alojamiento). No utilizamos cookies
        de analítica ni de publicidad propias, por lo que no se muestra ningún aviso de consentimiento.
      </p>
      <h2>Cookies de terceros</h2>
      <p>
        Al pulsar un enlace hacia una tienda o hacia Telegram, esos sitios pueden instalar sus propias cookies
        bajo sus condiciones. Los enlaces de afiliado permiten a la tienda atribuir la visita a PatoBarato;
        consulta la <a href="/afiliados">política de afiliación</a>.
      </p>
      <h2>Cómo gestionarlas</h2>
      <p>
        Puedes bloquear o eliminar las cookies desde la configuración de tu navegador. Hacerlo no afecta a la
        navegación por patobarato.com.
      </p>
      <p>Responsable: [TITULAR], [EMAIL].</p>
    </LegalLayout>
  )
}
