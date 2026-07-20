import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    // Keep globals false for explicit imports; our tests use import { describe, it, expect }
    globals: false,
    // Increase timeout slightly for attribution storage/cookie tests if needed
    testTimeout: 10000,
  },
})
