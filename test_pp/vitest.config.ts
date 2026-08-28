import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  // Vite's esbuild plugin auto-discovers the nearest tsconfig.json walking up from each
  // source file. For files under mobile/src/, it finds mobile/tsconfig.json which extends
  // 'expo/tsconfig.base' — a package not installed in the root workspace. Pointing vite at
  // the root tsconfig.json explicitly prevents that walk. Mobile-specific compiler options
  // (jsx: react-native, bundler moduleResolution) are only needed by the Expo build toolchain
  // and the Metro bundler; they are irrelevant for unit-testing the pure-logic functions in
  // mobile/src/api.ts under Node.
  root: resolve(import.meta.dirname),
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Point tsx/esbuild at the root tsconfig so it never walks into mobile/tsconfig.json
    server: { deps: { inline: ['expo-secure-store'] } }
  }
});
