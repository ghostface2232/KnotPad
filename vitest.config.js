import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // jsdom gives us document/template/URL/location for DOM-touching helpers.
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
  },
});
