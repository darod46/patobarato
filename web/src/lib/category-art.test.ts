import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ART_KEYS, CATEGORY_ART_KEYS, categoryArt, categoryKey, displayImage, guideArtKey, isAmazonImage } from './category-art'

describe('category art', () => {
  it('takes the first known category hashtag, or general', () => {
    expect(categoryKey(['#oferta', '#Hogar', '#belleza'])).toBe('hogar')
    expect(categoryKey(['tecnologia'])).toBe('tecnologia')
    expect(categoryKey(['#lego'])).toBe('general')
    expect(categoryKey([])).toBe('general')
  })

  it('maps guide categories with accents, and categories without art to general', () => {
    expect(guideArtKey('Tecnología')).toBe('tecnologia')
    expect(guideArtKey('Hogar')).toBe('hogar')
    expect(guideArtKey('Motor')).toBe('general')
  })

  it('recognises Amazon-hosted images only', () => {
    expect(isAmazonImage('https://m.media-amazon.com/images/I/71abc.jpg')).toBe(true)
    expect(isAmazonImage('https://images-eu.ssl-images-amazon.com/images/I/x.jpg')).toBe(true)
    expect(isAmazonImage('https://ae-pic-a1.aliexpress-media.com/kf/x.jpg')).toBe(false)
    expect(isAmazonImage('https://evil.com/m.media-amazon.com.jpg')).toBe(false)
    expect(isAmazonImage('no es una url')).toBe(false)
  })

  it('replaces Amazon images with the category art and keeps the rest', () => {
    expect(displayImage('https://m.media-amazon.com/images/I/71abc.jpg', 'hogar')).toBe(categoryArt('hogar'))
    expect(displayImage('https://ae-pic-a1.aliexpress-media.com/kf/x.jpg', 'hogar')).toBe('https://ae-pic-a1.aliexpress-media.com/kf/x.jpg')
    expect(displayImage(null, 'hogar')).toBeNull()
  })

  it('has an illustration on disk for every category, general included', () => {
    const onDisk = readdirSync(join(__dirname, '../../public/categorias')).map((f) => f.replace(/\.jpeg$/, '')).sort()
    expect([...CATEGORY_ART_KEYS].sort()).toEqual(onDisk)
    expect(onDisk).toEqual([...ART_KEYS].sort())
    expect(categoryArt('moda')).toBe('/categorias/moda.jpeg')
  })
})
