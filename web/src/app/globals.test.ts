import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'globals.css'), 'utf8')

describe('design tokens', () => {
  it.each([
    ['--color-ink', '#14161a'],
    ['--color-muted', '#5b6470'],
    ['--color-primary', '#1f4fd1'],
    ['--color-accent', '#ffd24d'],
    ['--color-danger', '#b42318'],
    ['--color-success', '#14633a'],
  ])('defines %s = %s', (name, value) => {
    expect(css.toLowerCase()).toContain(`${name}: ${value}`)
  })

  it('uses Inter and Space Grotesk', () => {
    expect(css).toMatch(/--font-sans:\s*"Inter"/)
    expect(css).toMatch(/--font-display:\s*"Space Grotesk"/)
    expect(css).not.toContain('plus-jakarta-sans')
  })
})
