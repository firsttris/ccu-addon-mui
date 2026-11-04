import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.mts';

export default defineConfig((env) =>
  mergeConfig(viteConfig(env), {
    // The tests run on the app's runtime (TanStack Redact, vite.config.mts):
    // its redirect of 'react' only reaches dependencies that Vite transforms.
    // Testing Library, TanStack Query and Radix import React themselves, so
    // they are inlined, in their ESM build (a CommonJS require() would load
    // React next to Redact)
    resolve: { mainFields: ['module', 'jsnext:main', 'jsnext', 'main'] },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}'],
      setupFiles: ['./src/test/setup.ts'],
      server: { deps: { inline: true } },
    },
  }),
);
