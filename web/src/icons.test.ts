import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(__dirname)
/** The Telegram preview reproduces the channel message, emojis included. */
const EMOJI_ALLOWED = new Set(['components/TelegramPreview.tsx'])
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{25CF}\u{2022}\u{2713}\u{2714}]/u

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

const files = walk(SRC).filter((f) => f.endsWith('.tsx') && !f.includes('.test.'))

describe('icons', () => {
  it('uses Lucide only: no hand-written <svg> in components or pages', () => {
    const offenders = files.filter((f) => readFileSync(f, 'utf8').includes('<svg'))
    expect(offenders.map((f) => f.slice(SRC.length + 1))).toEqual([])
  })

  it('uses no emojis or typographic icons outside the Telegram preview', () => {
    const offenders = files
      .filter((f) => !EMOJI_ALLOWED.has(f.slice(SRC.length + 1).replace(/\\/g, '/')))
      .filter((f) => EMOJI.test(readFileSync(f, 'utf8')))
    expect(offenders.map((f) => f.slice(SRC.length + 1))).toEqual([])
  })
})
