// Renders scripts/og.html to public/og.png (1200×630) with Playwright. Run from `web/`:
//   node scripts/render-og.mjs
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'

const page = await (await chromium.launch()).newPage({ viewport: { width: 1200, height: 630 } })
await page.goto(`file://${fileURLToPath(new URL('./og.html', import.meta.url))}`)
await page.waitForTimeout(1500)
await page.screenshot({ path: fileURLToPath(new URL('../public/og.png', import.meta.url)), type: 'png' })
await page.context().browser().close()
console.log('public/og.png written')
