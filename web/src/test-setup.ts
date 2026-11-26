import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'
import { FLAGS } from './lib/flags'

// Tests describe the full site (after the Amazon review); the tests of the review mode switch flags off.
beforeEach(() => {
  FLAGS.amazonPrices = true
  FLAGS.telegram = true
})

afterEach(cleanup)
