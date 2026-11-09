import { describe, expect, it } from 'vitest'
import cases from '../../../shared/post-format-cases.json'
import { telegramCaption, type PostInput } from './telegram-format'
import { discountPercent, formatPrice } from './money'

type Case = {
  name: string
  input: {
    title: string
    price: string
    previous_price: string | null
    coupon: string | null
    hashtags: string[]
    link: string
    store_name: string
    price_before_coupon: boolean
    ended: boolean
  }
  expected: string
}

function toPost(i: Case['input']): PostInput {
  return {
    title: i.title,
    price: Number(i.price),
    previousPrice: i.previous_price ? Number(i.previous_price) : null,
    coupon: i.coupon,
    hashtags: i.hashtags,
    link: i.link,
    storeName: i.store_name,
    priceBeforeCoupon: i.price_before_coupon,
    ended: i.ended,
  }
}

describe('telegramCaption', () => {
  it('has golden cases to check', () => {
    expect((cases as Case[]).length).toBeGreaterThanOrEqual(15)
  })

  it.each((cases as Case[]).map((c) => [c.name, c] as const))('matches golden case: %s', (_name, c) => {
    expect(telegramCaption(toPost(c.input))).toBe(c.expected)
  })

  it('never exceeds 1024 code points', () => {
    for (const c of cases as Case[]) {
      expect([...telegramCaption(toPost(c.input))].length).toBeLessThanOrEqual(1024)
    }
  })
})

describe('money', () => {
  it('formats prices like Python format_price', () => {
    expect(formatPrice(1299.9)).toBe('1.299,90')
    expect(formatPrice(249.99)).toBe('249,99')
    expect(formatPrice(1.005)).toBe('1,01')
    expect(formatPrice(1234567.5)).toBe('1.234.567,50')
    expect(formatPrice(0)).toBe('0,00')
  })

  it('rounds the discount half up', () => {
    expect(discountPercent(149, 199)).toBe(25)
    expect(discountPercent(199, 200)).toBe(1)
    expect(discountPercent(50, 200)).toBe(75)
  })
})
