import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const clip = vi.hoisted(() => ({
  loadPng: vi.fn(),
  copyImage: vi.fn(),
  copyText: vi.fn(),
}))
vi.mock('../lib/clipboard', () => clip)

import { WhatsAppActions } from './WhatsAppActions'

const png = new Blob(['x'], { type: 'image/png' })

function setShare(canShare: boolean) {
  const share = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'share', { configurable: true, value: share })
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => canShare })
  return share
}

describe('WhatsAppActions', () => {
  beforeEach(() => {
    clip.loadPng.mockReset().mockResolvedValue(png)
    clip.copyImage.mockReset().mockResolvedValue(undefined)
    clip.copyText.mockReset().mockResolvedValue(undefined)
  })

  it('shows Compartir only when canShare files', () => {
    setShare(false)
    const { unmount } = render(<WhatsAppActions text="hola" imageUrl="https://x.es/a.png" />)
    expect(screen.queryByRole('button', { name: 'Compartir' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copiar imagen' })).toBeInTheDocument()
    unmount()
    setShare(true)
    render(<WhatsAppActions text="hola" imageUrl="https://x.es/a.png" />)
    expect(screen.getByRole('button', { name: 'Compartir' })).toBeInTheDocument()
  })

  it('Compartir copies text before sharing', async () => {
    const share = setShare(true)
    const order: string[] = []
    clip.copyText.mockImplementation(async () => void order.push('copy'))
    share.mockImplementation(async () => void order.push('share'))
    render(<WhatsAppActions text="oferta" imageUrl="https://x.es/a.png" />)
    await userEvent.click(screen.getByRole('button', { name: 'Compartir' }))
    await waitFor(() => expect(share).toHaveBeenCalled())
    expect(order).toEqual(['copy', 'share'])
    const arg = share.mock.calls[0][0]
    expect(arg.text).toBe('oferta')
    expect(arg.files[0]).toBeInstanceOf(File)
    expect(arg.files[0].name).toBe('patobarato.png')
  })

  it('Copiar texto copies the edited textarea content', async () => {
    setShare(false)
    render(<WhatsAppActions text="original" imageUrl={null} />)
    const box = screen.getByRole('textbox')
    await userEvent.clear(box)
    await userEvent.type(box, 'editado')
    await userEvent.click(screen.getByRole('button', { name: 'Copiar texto' }))
    expect(clip.copyText).toHaveBeenCalledWith('editado')
    expect(await screen.findByText('Copiado')).toBeInTheDocument()
  })

  it('hides image buttons without an image', () => {
    setShare(true)
    render(<WhatsAppActions text="t" imageUrl={null} />)
    expect(screen.queryByRole('button', { name: 'Copiar imagen' })).not.toBeInTheDocument()
  })

  it('resets the textarea when text changes', () => {
    setShare(false)
    const { rerender } = render(<WhatsAppActions text="uno" imageUrl={null} />)
    rerender(<WhatsAppActions text="dos" imageUrl={null} />)
    expect(screen.getByRole('textbox')).toHaveValue('dos')
  })

  it('shows an error when copying the image fails', async () => {
    setShare(false)
    clip.copyImage.mockRejectedValue(new Error('denied'))
    render(<WhatsAppActions text="t" imageUrl="https://x.es/a.png" />)
    await userEvent.click(screen.getByRole('button', { name: 'Copiar imagen' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo')
  })
})
