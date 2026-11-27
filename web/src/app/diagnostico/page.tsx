import type { Metadata } from 'next'
import { ViewportProbe } from '../../components/diag/ViewportProbe'

// Temporary: viewport diagnostics for in-app browsers. Not indexed, not linked.
export const metadata: Metadata = { title: 'Diagnóstico · PatoBarato', robots: { index: false, follow: false } }

export default function DiagnosticoPage() {
  return <ViewportProbe cover={false} />
}
