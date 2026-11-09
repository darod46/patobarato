/** Fetches the image through the authenticated same-origin proxy and converts it to PNG via a canvas. */
export async function loadPng(imageUrl: string): Promise<Blob> {
  const res = await fetch(`/api/imagen?url=${encodeURIComponent(imageUrl)}`)
  if (!res.ok) throw new Error(`Imagen no disponible (${res.status})`)
  const source = await res.blob()

  let drawable: CanvasImageSource
  let width: number
  let height: number
  let cleanup = () => {}
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(source)
    drawable = bitmap
    width = bitmap.width
    height = bitmap.height
    cleanup = () => bitmap.close()
  } else {
    const objectUrl = URL.createObjectURL(source)
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('No se pudo leer la imagen'))
      img.src = objectUrl
    })
    drawable = img
    width = img.naturalWidth
    height = img.naturalHeight
    cleanup = () => URL.revokeObjectURL(objectUrl)
  }

  try {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas no disponible')
    ctx.drawImage(drawable, 0, 0)
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo convertir a PNG'))), 'image/png')
    })
  } finally {
    cleanup()
  }
}

/** Must be called synchronously from a user gesture (the click handler). */
export async function copyImage(blob: Blob | Promise<Blob>): Promise<void> {
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
}

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text)
}
