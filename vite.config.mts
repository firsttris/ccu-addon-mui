import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import fs from 'fs';

// WebSocket target of the go-server, selected via `vite --mode <name>`
const proxyTargets: Record<string, string> = {
  development: 'ws://localhost:8088',
  ccu3: 'ws://192.168.178.26',
};

export default defineConfig(({ command, mode, isPreview }) => ({
  base: command === 'build' || isPreview ? '/addons/mui/' : '/',

  server: {
    port: 4200,
    host: '0.0.0.0',
    proxy: {
      '/ws/mui': {
        target: proxyTargets[mode] ?? proxyTargets.development,
        ws: true,
        changeOrigin: true,
      },
    },
  },

  preview: {
    port: 4300,
    host: 'localhost',
  },

  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'ccu-addon-mui',
        short_name: 'ccu-addon-mui',
        icons: [
          {
            src: 'android-chrome-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
        ],
      },
    }),
    {
      name: 'load-tcl',
      transform(src, id) {
        if (id.endsWith('.tcl')) {
          return `export default ${JSON.stringify(src)}`;
        }
      },
      load(id) {
        if (id.endsWith('.tcl')) {
          return fs.readFileSync(id, 'utf-8');
        }
      },
    },
  ],

  build: {
    outDir: './dist/ccu-addon-mui',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
}));
