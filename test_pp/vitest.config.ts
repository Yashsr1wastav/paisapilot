import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      // expo-secure-store is a native Expo package only installed in mobile/node_modules.
      // Rollup cannot parse its native format, and the test mocks it via vi.mock() anyway.
      // Alias it to a plain stub so Rollup never touches the real package.
      'expo-secure-store': resolve(__dirname, 'tests/__stubs__/expo-secure-store.js'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
