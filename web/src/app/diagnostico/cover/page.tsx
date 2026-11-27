import type { Metadata, Viewport } from 'next'
import { ViewportProbe } from '../../../components/diag/ViewportProbe'

// Temporary: the same diagnostics with viewport-fit=cover. Not indexed, not linked.
export const metadata: Metadata = { title: 'Diagnóstico (cover) · PatoBarato', robots: { index: false, follow: false } }
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' }

export default function DiagnosticoCoverPage() {
  return <ViewportProbe cover />
}
