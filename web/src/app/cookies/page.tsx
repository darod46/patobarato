import { LegalLayout } from '../../components/LegalLayout'
import { legalMetadata } from '../../lib/seo'
import { FLAGS } from '../../lib/flags'

/** Static page: the year is fixed at build time, which is also when the texts were last reviewed. */
const YEAR = new Date().getUTCFullYear()

export const metadata = legalMetadata('Política de cookies', '/cookies', 'Las cookies que utiliza patobarato.com y cómo gestionarlas.')

export default function CookiesPage() {
  return (
    <LegalLayout title="Política de cookies" updated="25 de noviembre de 2026" year={YEAR}>
      <h2>Qué cookies usamos</h2>
      <p>
        patobarato.com solo utiliza cookies y almacenamiento técnicos, imprescindibles para que el sitio
        funcione (por ejemplo, para servir las páginas desde la caché del alojamiento). No utilizamos cookies
        de analítica ni de publicidad propias, por lo que no se muestra ningún aviso de consentimiento.
      </p>
      <h2>Cookies de terceros</h2>
      <p>
        {FLAGS.telegram ? 'Al pulsar un enlace hacia una tienda o hacia Telegram' : 'Al pulsar un enlace hacia una tienda'}, esos sitios pueden instalar sus propias cookies
        bajo sus condiciones. Los enlaces de afiliado permiten a la tienda atribuir la visita a PatoBarato;
        consulta la <a href="/afiliados">política de afiliación</a>.
      </p>
      <p>
        Las guías de neumáticos incluyen el buscador de Neumaticos.es a través de Awin, que usa cookies de
        seguimiento de afiliado en su propio dominio. Solo se carga si lo aceptas en la propia guía; recordamos
        tu elección en tu navegador y puedes retirarla con «Retirar consentimiento», debajo del buscador.
      </p>
      <h2>Cómo gestionarlas</h2>
      <p>
        Puedes bloquear o eliminar las cookies desde la configuración de tu navegador. Hacerlo no afecta a la
        navegación por patobarato.com.
      </p>
      <p>Responsable: David Rodríguez, <a href="mailto:hola@patobarato.com">hola@patobarato.com</a>.</p>
    </LegalLayout>
  )
}
