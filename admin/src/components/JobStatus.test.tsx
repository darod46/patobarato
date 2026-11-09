import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

const job = vi.hoisted(() => ({ value: { status: 'pending', error: null, result: null, stuck: false } as Record<string, unknown> }))
vi.mock('../lib/jobs', () => ({ useJob: () => job.value }))

import { JobStatus } from './JobStatus'

describe('JobStatus', () => {
  it('shows progress while pending', () => {
    job.value = { status: 'pending', error: null, result: null, stuck: false }
    render(<JobStatus jobId={1} onRetry={() => {}} />)
    expect(screen.getByText('Enviando…')).toBeInTheDocument()
    expect(screen.queryByText('El bot no responde')).not.toBeInTheDocument()
  })

  it('warns when the bot does not answer', () => {
    job.value = { status: 'pending', error: null, result: null, stuck: true }
    render(<JobStatus jobId={1} onRetry={() => {}} />)
    expect(screen.getByText('El bot no responde')).toBeInTheDocument()
  })

  it('shows done', () => {
    job.value = { status: 'done', error: null, result: null, stuck: false }
    render(<JobStatus jobId={1} onRetry={() => {}} />)
    expect(screen.getByText('Hecho')).toBeInTheDocument()
  })

  it('shows the error with a retry button', async () => {
    job.value = { status: 'error', error: 'boom', result: null, stuck: false }
    const onRetry = vi.fn()
    render(<JobStatus jobId={1} onRetry={onRetry} />)
    expect(screen.getByText('Error: boom')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('renders nothing without a job', () => {
    job.value = { status: null, error: null, result: null, stuck: false }
    const { container } = render(<JobStatus jobId={null} onRetry={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })
})
