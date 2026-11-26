import { describe, expect, it } from 'vitest'
import { PLACEHOLDER_ART, categoryArt, categoryKey, displayImage, guideArtKey, isAmazonImage } from './category-art'

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

  it('uses the placeholder duck while a category has no illustration yet', () => {
    expect(categoryArt('moda')).toBe(PLACEHOLDER_ART)
  })
})
