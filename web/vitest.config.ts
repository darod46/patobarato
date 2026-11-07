import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    // `server-only` throws outside the react-server condition; tests are not a client bundle.
    alias: {
      'server-only': new URL('./node_modules/server-only/empty.js', import.meta.url).pathname,
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
})
