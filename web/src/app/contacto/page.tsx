import { LegalLayout, legalMetadata } from '../../components/LegalLayout'

export const metadata = legalMetadata('Contacto', '/contacto', 'Cómo contactar con PatoBarato.')

export default function ContactoPage() {
  return (
    <LegalLayout title="Contacto" updated="6 de noviembre de 2026">
      <p>
        La forma más rápida de hablar con nosotros es el canal de Telegram:{' '}
        <a href="https://t.me/patobarato" target="_blank" rel="noopener noreferrer">
          t.me/patobarato
        </a>
        .
      </p>
      <p>
        Para consultas sobre un chollo, un cupón, una tienda o un asunto legal, escribe a [EMAIL].
        Solemos responder en un plazo de [PLAZO] días laborables.
      </p>
      <p>Si has visto un chollo que deberíamos publicar, mándanos el enlace y el precio que has visto.</p>
      <p>Titular: [TITULAR].</p>
    </LegalLayout>
  )
}
